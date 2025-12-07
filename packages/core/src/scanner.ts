/**
 * Token-based scanner for gen {} blocks using js-tokens
 *
 * Uses the battle-tested js-tokens package to properly handle:
 * - String literals (all types including template literals)
 * - Comments (single-line, multi-line, hashbang)
 * - Regex literals (correctly distinguished from division)
 * - All ECMAScript 2025 syntax
 */

import jsTokens, { type Token } from 'js-tokens'

export interface GenBlock {
  /** Start position of 'gen' keyword */
  start: number
  /** End position (after closing brace) */
  end: number
  /** Content between braces (excluding braces) */
  content: string
  /** Position of opening brace */
  braceStart: number
}

export type TokenWithPosition = Token & {
  start: number
  end: number
}

/**
 * Tokenize source and add position information
 */
export function tokenize(source: string): TokenWithPosition[] {
  const tokens: TokenWithPosition[] = []
  let pos = 0

  for (const token of jsTokens(source)) {
    tokens.push({
      ...token,
      start: pos,
      end: pos + token.value.length
    } as TokenWithPosition)
    pos += token.value.length
  }

  return tokens
}

/**
 * Quick check if source contains gen blocks (fast path)
 */
export function hasGenBlocks(source: string): boolean {
  return /\bgen\s*\{/.test(source)
}

/**
 * Find all gen {} blocks in source using token-based parsing
 */
export function findGenBlocks(source: string): GenBlock[] {
  if (!hasGenBlocks(source)) {
    return []
  }

  const tokens = tokenize(source)
  const blocks: GenBlock[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue

    // Look for 'gen' identifier
    if (token.type !== 'IdentifierName' || token.value !== 'gen') {
      continue
    }

    // Find the next non-whitespace/comment token
    let j = i + 1
    while (j < tokens.length) {
      const nextToken = tokens[j]
      if (!nextToken) break
      if (
        nextToken.type !== 'WhiteSpace' &&
        nextToken.type !== 'LineTerminatorSequence' &&
        nextToken.type !== 'SingleLineComment' &&
        nextToken.type !== 'MultiLineComment'
      ) {
        break
      }
      j++
    }

    // Check if it's followed by '{'
    if (j >= tokens.length) continue
    const braceToken = tokens[j]
    if (!braceToken || braceToken.type !== 'Punctuator' || braceToken.value !== '{') {
      continue
    }

    // Found 'gen {', now find the matching '}'
    const genStart = token.start
    const braceStart = braceToken.start
    let depth = 1
    let k = j + 1

    while (k < tokens.length && depth > 0) {
      const t = tokens[k]
      if (!t) break
      if (t.type === 'Punctuator') {
        if (t.value === '{') depth++
        if (t.value === '}') depth--
      }
      k++
    }

    if (depth === 0) {
      const endToken = tokens[k - 1]
      if (!endToken) continue
      const end = endToken.end
      const content = source.slice(braceStart + 1, end - 1)

      blocks.push({
        start: genStart,
        end,
        content,
        braceStart
      })
    }
  }

  return blocks
}

/**
 * Check if a position is inside a nested function/callback
 * We want to transform binds inside control flow (if/else/try/catch)
 * but NOT inside nested functions/callbacks (different scope)
 */
function isInsideNestedFunction(tokens: TokenWithPosition[], upToIndex: number): boolean {
  // Look for function or arrow function patterns before the current position
  // Track depth to find if we're inside a function body
  let functionDepth = 0

  for (let i = 0; i < upToIndex; i++) {
    const t = tokens[i]
    if (!t) continue

    // Check for function keyword or arrow
    if (t.type === 'IdentifierName' && t.value === 'function') {
      // Found 'function', next '{' starts a function body
      for (let j = i + 1; j < upToIndex; j++) {
        const tok = tokens[j]
        if (tok && tok.type === 'Punctuator' && tok.value === '{') {
          functionDepth++
          break
        }
      }
    }

    // Check for arrow function: ) => {
    if (t.type === 'Punctuator' && t.value === '=>') {
      // Look ahead for {
      for (let j = i + 1; j < upToIndex; j++) {
        const next = tokens[j]
        if (!next) break
        if (next.type === 'Punctuator' && next.value === '{') {
          functionDepth++
          break
        }
        // If we hit something other than whitespace before {, it's expression arrow
        if (next.type !== 'WhiteSpace' && next.type !== 'LineTerminatorSequence') {
          break
        }
      }
    }

    // Track closing braces
    if (t.type === 'Punctuator' && t.value === '}' && functionDepth > 0) {
      functionDepth--
    }
  }

  return functionDepth > 0
}

/**
 * Extract a binding pattern from the start of a trimmed line.
 * Supports simple identifiers, array destructuring, and object destructuring.
 * Also supports 'return' prefix for divergent effects.
 *
 * Returns the pattern, expression, and whether it has a return prefix, or null if not a bind statement.
 */
export function extractBindPattern(trimmed: string): { pattern: string; expression: string; hasReturn: boolean } | null {
  // Check for 'return' prefix
  const returnMatch = trimmed.match(/^return\s+(.+)$/)
  const hasReturn = !!returnMatch
  const withoutReturn = hasReturn ? returnMatch![1]! : trimmed

  let pattern: string
  let rest: string

  if (withoutReturn.startsWith('[')) {
    // Array destructuring - find matching ]
    let depth = 0
    let i = 0
    for (; i < withoutReturn.length; i++) {
      const char = withoutReturn[i]
      if (char === '[') depth++
      else if (char === ']') {
        depth--
        if (depth === 0) {
          i++ // include the ]
          break
        }
      }
    }
    if (depth !== 0) return null
    pattern = withoutReturn.slice(0, i)
    rest = withoutReturn.slice(i)
  } else if (withoutReturn.startsWith('{')) {
    // Object destructuring - find matching }
    let depth = 0
    let i = 0
    for (; i < withoutReturn.length; i++) {
      const char = withoutReturn[i]
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          i++ // include the }
          break
        }
      }
    }
    if (depth !== 0) return null
    pattern = withoutReturn.slice(0, i)
    rest = withoutReturn.slice(i)
  } else {
    // Simple identifier
    const match = withoutReturn.match(/^(\w+)(.*)$/)
    if (!match) return null
    pattern = match[1]!
    rest = match[2]!
  }

  // Check if rest starts with <- (with optional whitespace)
  const arrowMatch = rest.match(/^\s*<-\s*(.+)$/)
  if (!arrowMatch) return null

  return { pattern, expression: arrowMatch[1]!, hasReturn }
}

/**
 * Transform gen block content to Effect.gen body
 *
 * Transforms:
 * - `x <- expr` → `const x = yield* expr` (anywhere except inside nested functions)
 * - `[a, b] <- expr` → `const [a, b] = yield* expr` (array destructuring)
 * - `{ x, y } <- expr` → `const { x, y } = yield* expr` (object destructuring)
 *
 * Does NOT transform:
 * - let/const declarations (preserves them as-is)
 * - Binds inside nested functions/callbacks (they're a different scope)
 */
export function transformBlockContent(content: string): string {
  const tokens = tokenize(content)
  const lines = content.split('\n')
  const outputLines: string[] = []

  let lineStart = 0

  for (const line of lines) {
    const lineEnd = lineStart + line.length
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) {
      outputLines.push(line)
      lineStart = lineEnd + 1 // +1 for newline
      continue
    }

    // Check if this line is inside a nested function/callback
    const firstTokenIndex = tokens.findIndex(t => t.start >= lineStart && t.start < lineEnd)
    const insideNestedFunction = firstTokenIndex >= 0 ? isInsideNestedFunction(tokens, firstTokenIndex) : false

    // Transform bind statements unless inside a nested function
    if (!insideNestedFunction) {
      const bindResult = extractBindPattern(trimmed)

      if (bindResult) {
        const { pattern, expression: exprWithSemi, hasReturn } = bindResult
        const indent = line.match(/^\s*/)?.[0] || ''
        const hasSemicolon = exprWithSemi.trimEnd().endsWith(';')
        const expression = exprWithSemi.replace(/;?\s*$/, '')

        // For return binds (divergent effects), we only output 'return yield* EXPR'
        // For regular binds, output 'const PATTERN = yield* EXPR'
        if (hasReturn) {
          outputLines.push(
            `${indent}return yield* ${expression}${hasSemicolon ? ';' : ''}`
          )
        } else {
          outputLines.push(
            `${indent}const ${pattern} = yield* ${expression}${hasSemicolon ? ';' : ''}`
          )
        }
        lineStart = lineEnd + 1
        continue
      }
    }

    // Pass through unchanged
    outputLines.push(line)
    lineStart = lineEnd + 1
  }

  return outputLines.join('\n')
}
