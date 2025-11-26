/**
 * Core transformation module for Effect-TS gen block syntax
 *
 * Transforms:
 *   gen {
 *     user <- getUser(id)
 *     let name = user.name
 *     return { user, name }
 *   }
 *
 * Into:
 *   Effect.gen(function* () {
 *     const user = yield* getUser(id)
 *     let name = user.name
 *     return { user, name }
 *   })
 *
 * Note: Only bind arrows (x <- expr) are transformed to const.
 * Regular let/const declarations are preserved as-is to avoid
 * breaking nested callbacks that need reassignable variables.
 */

import MagicString from 'magic-string'

export interface GenBlock {
  start: number
  end: number
  content: string
}

export interface TransformResult {
  code: string
  map: ReturnType<MagicString['generateMap']> | null
  hasChanges: boolean
}

/**
 * Quick check if source contains gen blocks
 */
export function hasGenBlocks(source: string): boolean {
  return /\bgen\s*\{/.test(source)
}

/**
 * Check if a '/' at position could start a regex literal
 * (vs being a division operator)
 */
function couldBeRegexStart(source: string, pos: number): boolean {
  // Look backwards for the previous non-whitespace character
  let i = pos - 1
  while (i >= 0 && /\s/.test(source[i])) {
    i--
  }
  if (i < 0) return true // Start of string, assume regex

  const prevChar = source[i]

  // After these characters, '/' starts a regex
  // These are: operators, punctuation that can't end an expression
  const regexPreceding = '(,;:=![&|?{}<>+-*%^~'
  if (regexPreceding.includes(prevChar)) {
    return true
  }

  // Check for keywords that precede regex: return, typeof, void, delete, in, instanceof, new, throw
  const keywords = ['return', 'typeof', 'void', 'delete', 'in', 'instanceof', 'new', 'throw', 'case']
  for (const kw of keywords) {
    const kwStart = i - kw.length + 1
    if (kwStart >= 0) {
      const slice = source.slice(kwStart, i + 1)
      if (slice === kw) {
        // Make sure it's not part of a larger identifier
        if (kwStart === 0 || !/\w/.test(source[kwStart - 1])) {
          return true
        }
      }
    }
  }

  // After identifiers, ), ], it's division
  return false
}

/**
 * Find all gen blocks in source code
 */
export function findGenBlocks(source: string): GenBlock[] {
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
    let inRegex = false
    let inCharClass = false // For [...] inside regex

    while (pos < source.length && depth > 0) {
      const char = source[pos]
      const prevChar = pos > 0 ? source[pos - 1] : ''

      // Handle string literals
      if (inString) {
        if (char === inString && prevChar !== '\\') {
          inString = null
        }
        pos++
        continue
      }

      // Handle regex literals
      if (inRegex) {
        if (inCharClass) {
          // Inside [...], only ] ends the class (unless escaped)
          if (char === ']' && prevChar !== '\\') {
            inCharClass = false
          }
        } else {
          if (char === '[' && prevChar !== '\\') {
            inCharClass = true
          } else if (char === '/' && prevChar !== '\\') {
            // End of regex, skip flags
            inRegex = false
            pos++
            while (pos < source.length && /[gimsuy]/.test(source[pos])) {
              pos++
            }
            continue
          }
        }
        pos++
        continue
      }

      // Check for string start
      if (char === '"' || char === "'" || char === '`') {
        inString = char
        pos++
        continue
      }

      // Check for regex start
      if (char === '/' && couldBeRegexStart(source, pos)) {
        // Make sure it's not a comment
        const nextChar = pos + 1 < source.length ? source[pos + 1] : ''
        if (nextChar !== '/' && nextChar !== '*') {
          inRegex = true
          pos++
          continue
        }
      }

      // Handle single-line comments
      if (char === '/' && pos + 1 < source.length && source[pos + 1] === '/') {
        // Skip to end of line
        while (pos < source.length && source[pos] !== '\n') {
          pos++
        }
        continue
      }

      // Handle multi-line comments
      if (char === '/' && pos + 1 < source.length && source[pos + 1] === '*') {
        pos += 2
        while (pos < source.length - 1 && !(source[pos] === '*' && source[pos + 1] === '/')) {
          pos++
        }
        pos += 2 // Skip */
        continue
      }

      if (char === '{') depth++
      if (char === '}') depth--
      pos++
    }

    if (depth === 0) {
      const content = source.slice(braceStart + 1, pos - 1)
      blocks.push({ start, end: pos, content })
    }
  }

  return blocks
}

/**
 * Transform a single gen block's content into Effect.gen body
 */
export function transformBlockContent(content: string): string {
  const lines = content.split('\n')
  const outputLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines
    if (!trimmed) {
      outputLines.push(line)
      continue
    }

    // Skip comments
    if (trimmed.startsWith('//')) {
      outputLines.push(line)
      continue
    }

    const indent = line.match(/^\s*/)?.[0] || ''

    // Bind statement: x <- expression → const x = yield* expression
    const bindMatch = trimmed.match(/^(\w+)\s*<-\s*(.+)$/)
    if (bindMatch) {
      const [, varName, expr] = bindMatch
      const cleanExpr = expr.replace(/;?\s*$/, '')
      const hasSemicolon = expr.trimEnd().endsWith(';')
      outputLines.push(`${indent}const ${varName} = yield* ${cleanExpr}${hasSemicolon ? ';' : ''}`)
      continue
    }

    // Note: let/const declarations are NOT transformed.
    // They pass through unchanged to avoid breaking nested callbacks
    // that legitimately need reassignable variables.
    // See: tmp/2025-11-25/NESTED_CALLBACK_LET_BUG.md

    // Everything else passes through unchanged (let, const, return, if/else, etc.)
    outputLines.push(line)
  }

  return outputLines.join('\n')
}

/**
 * Transform source code containing gen blocks
 */
export function transformSource(
  source: string,
  filename?: string
): TransformResult {
  if (!hasGenBlocks(source)) {
    return { code: source, map: null, hasChanges: false }
  }

  const blocks = findGenBlocks(source)
  if (blocks.length === 0) {
    return { code: source, map: null, hasChanges: false }
  }

  const s = new MagicString(source)

  // Process blocks from end to start to preserve positions
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]

    // Transform the block content
    const transformedContent = transformBlockContent(block.content)

    // Build the replacement: Effect.gen(/* __EFFECT_SUGAR__ */ function* () { ... })
    // The marker comment identifies blocks that came from gen {} syntax
    const replacement = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {${transformedContent}})`

    // Replace the entire gen block
    s.overwrite(block.start, block.end, replacement)
  }

  return {
    code: s.toString(),
    map: s.generateMap({
      source: filename,
      file: filename ? `${filename}.map` : undefined,
      includeContent: true,
      hires: true
    }),
    hasChanges: true
  }
}
