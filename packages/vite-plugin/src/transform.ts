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
 *     const name = user.name
 *     return { user, name }
 *   })
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

    while (pos < source.length && depth > 0) {
      const char = source[pos]

      // Handle string literals
      if (inString) {
        if (char === inString && source[pos - 1] !== '\\') {
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

    // Bind statement: x <- expression
    const bindMatch = trimmed.match(/^(\w+)\s*<-\s*(.+)$/)
    if (bindMatch) {
      const [, varName, expr] = bindMatch
      const cleanExpr = expr.replace(/;?\s*$/, '')
      const hasSemicolon = expr.trimEnd().endsWith(';')
      outputLines.push(`${indent}const ${varName} = yield* ${cleanExpr}${hasSemicolon ? ';' : ''}`)
      continue
    }

    // Let statement: let x = expression
    const letMatch = trimmed.match(/^let\s+(\w+)\s*=\s*(.+)$/)
    if (letMatch) {
      const [, varName, expr] = letMatch
      const cleanExpr = expr.replace(/;?\s*$/, '')
      const hasSemicolon = expr.trimEnd().endsWith(';')
      outputLines.push(`${indent}const ${varName} = ${cleanExpr}${hasSemicolon ? ';' : ''}`)
      continue
    }

    // Everything else passes through unchanged (return, if/else, etc.)
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

    // Build the replacement: Effect.gen(function* () { ... })
    const replacement = `Effect.gen(function* () {${transformedContent}})`

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
