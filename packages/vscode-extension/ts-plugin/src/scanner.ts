/**
 * Lightweight scanner for gen {} blocks
 *
 * Uses regex-based approach compatible with CommonJS (no ESM-only dependencies).
 * Handles:
 * - String literals (single, double, template)
 * - Nested braces
 * - Basic edge cases
 */

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

/**
 * Quick check if source contains gen blocks (fast path)
 */
export function hasGenBlocks(source: string): boolean {
  return /\bgen\s*\{/.test(source)
}

/**
 * Find all gen {} blocks in source
 */
export function findGenBlocks(source: string): GenBlock[] {
  if (!hasGenBlocks(source)) {
    return []
  }

  const blocks: GenBlock[] = []
  const pattern = /\bgen\s*\{/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const start = match.index
    const braceStart = source.indexOf('{', start)

    // Find matching closing brace
    let depth = 1
    let pos = braceStart + 1
    let inString: string | null = null
    let inLineComment = false
    let inBlockComment = false

    while (pos < source.length && depth > 0) {
      const char = source[pos]
      const nextChar = source[pos + 1]
      const prevChar = source[pos - 1]

      // Handle line comments
      if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
        inLineComment = true
        pos += 2
        continue
      }

      // End of line comment
      if (inLineComment && (char === '\n' || char === '\r')) {
        inLineComment = false
        pos++
        continue
      }

      if (inLineComment) {
        pos++
        continue
      }

      // Handle block comments
      if (!inString && !inLineComment && char === '/' && nextChar === '*') {
        inBlockComment = true
        pos += 2
        continue
      }

      // End of block comment
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false
        pos += 2
        continue
      }

      if (inBlockComment) {
        pos++
        continue
      }

      // Handle strings
      if (inString) {
        if (char === inString && prevChar !== '\\') {
          inString = null
        }
        pos++
        continue
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = char
        pos++
        continue
      }

      // Track braces
      if (char === '{') depth++
      if (char === '}') depth--
      pos++
    }

    if (depth === 0) {
      const end = pos
      const content = source.slice(braceStart + 1, end - 1)

      blocks.push({
        start,
        end,
        content,
        braceStart
      })
    }
  }

  return blocks
}

/**
 * Transform gen block content to Effect.gen body
 *
 * Only transforms:
 * - `x <- expr` → `const x = yield* expr` (at top level only)
 *
 * Does NOT transform:
 * - let/const declarations (preserves them as-is)
 * - Anything inside nested functions/callbacks
 */
export function transformBlockContent(content: string): string {
  const lines = content.split('\n')
  const outputLines: string[] = []

  // Track nesting depth to only transform at top level
  let depth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) {
      outputLines.push(line)
      continue
    }

    // Update depth based on braces in this line (simplified tracking)
    // This is a heuristic - works for most common patterns
    const openBraces = (line.match(/[{(\[]/g) || []).length
    const closeBraces = (line.match(/[})\]]/g) || []).length

    // Only transform at top level
    if (depth === 0) {
      // Look for pattern: identifier <- expression
      const bindMatch = trimmed.match(/^(\w+)\s*<-\s*(.+)$/)

      if (bindMatch) {
        const [, varName, exprWithSemi] = bindMatch
        const indent = line.match(/^\s*/)?.[0] || ''
        const hasSemicolon = exprWithSemi.trimEnd().endsWith(';')
        const expression = exprWithSemi.replace(/;?\s*$/, '')

        outputLines.push(
          `${indent}const ${varName} = yield* ${expression}${hasSemicolon ? ';' : ''}`
        )
        depth += openBraces - closeBraces
        continue
      }
    }

    // Pass through unchanged
    outputLines.push(line)
    depth += openBraces - closeBraces
  }

  return outputLines.join('\n')
}
