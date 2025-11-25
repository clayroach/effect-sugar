/**
 * Prettier plugin for effect-sugar gen {} syntax
 *
 * Transforms gen {} blocks to Effect.gen() before formatting,
 * then transforms back after Prettier formats the code.
 *
 * Usage:
 *
 * Option 1: As Prettier plugin (prettier.config.js)
 * ```javascript
 * export default {
 *   plugins: ['effect-sugar-vite/prettier']
 * }
 * ```
 *
 * Option 2: Programmatic API
 * ```typescript
 * import { formatWithEffectSugar } from 'effect-sugar-vite/prettier'
 * const formatted = await formatWithEffectSugar(source, { filepath: 'file.ts' })
 * ```
 *
 * Option 3: Use with lint-staged (package.json)
 * ```json
 * {
 *   "lint-staged": {
 *     "*.ts": "effect-sugar-prettier"
 *   }
 * }
 * ```
 */

import { transformSource, hasGenBlocks, findGenBlocks } from './transform.js'

// ============================================================================
// Reverse Transformation: Effect.gen() → gen {}
// ============================================================================

interface EffectGenBlock {
  start: number
  end: number
  bodyContent: string
}

/**
 * Check if source contains Effect.gen patterns
 */
export function hasEffectGen(source: string): boolean {
  return /Effect\.gen\s*\(\s*function\s*\*\s*\(\)\s*\{/.test(source)
}

/**
 * Find all Effect.gen(function* () { ... }) blocks
 */
export function findEffectGenBlocks(source: string): EffectGenBlock[] {
  const blocks: EffectGenBlock[] = []
  // Match Effect.gen(function* () {
  const pattern = /Effect\.gen\s*\(\s*function\s*\*\s*\(\)\s*\{/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const start = match.index
    // Find the opening brace of the generator function body
    const braceStart = source.indexOf('{', start + match[0].length - 1)

    // Find matching closing brace
    let depth = 1
    let pos = braceStart + 1
    let inString: string | null = null
    let inTemplate = false
    let templateDepth = 0

    while (pos < source.length && depth > 0) {
      const char = source[pos]
      const prevChar = source[pos - 1]

      // Handle template literals with expressions
      if (inTemplate) {
        if (char === '`' && prevChar !== '\\') {
          inTemplate = false
          pos++
          continue
        }
        if (char === '$' && source[pos + 1] === '{') {
          templateDepth++
          pos += 2
          continue
        }
        if (templateDepth > 0) {
          if (char === '{') templateDepth++
          if (char === '}') templateDepth--
        }
        pos++
        continue
      }

      // Handle string literals
      if (inString) {
        if (char === inString && prevChar !== '\\') {
          inString = null
        }
        pos++
        continue
      }

      if (char === '"' || char === "'") {
        inString = char
        pos++
        continue
      }

      if (char === '`') {
        inTemplate = true
        pos++
        continue
      }

      if (char === '{') depth++
      if (char === '}') depth--
      pos++
    }

    if (depth === 0) {
      // pos is now after the closing brace of the generator body
      // We need to find the closing paren of Effect.gen(...)
      const closingParen = source.indexOf(')', pos)
      if (closingParen !== -1) {
        const bodyContent = source.slice(braceStart + 1, pos - 1)
        blocks.push({
          start,
          end: closingParen + 1,
          bodyContent
        })
      }
    }
  }

  return blocks
}

/**
 * Transform Effect.gen body content back to gen {} syntax
 */
export function reverseTransformContent(content: string): string {
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

    // yield* statement: const x = yield* expression
    const yieldMatch = trimmed.match(/^const\s+(\w+)\s*=\s*yield\s*\*\s*(.+)$/)
    if (yieldMatch) {
      const [, varName, expr] = yieldMatch
      const cleanExpr = expr.replace(/;?\s*$/, '')
      const hasSemicolon = expr.trimEnd().endsWith(';')
      outputLines.push(`${indent}${varName} <- ${cleanExpr}${hasSemicolon ? ';' : ''}`)
      continue
    }

    // Regular const (non-yield): const x = expression → let x = expression
    // But only if it's a simple const, not destructuring or complex patterns
    const constMatch = trimmed.match(/^const\s+(\w+)\s*=\s*(.+)$/)
    if (constMatch) {
      const [, varName, expr] = constMatch
      // Check if this looks like it was a let statement (no yield*)
      if (!expr.includes('yield')) {
        const cleanExpr = expr.replace(/;?\s*$/, '')
        const hasSemicolon = expr.trimEnd().endsWith(';')
        outputLines.push(`${indent}let ${varName} = ${cleanExpr}${hasSemicolon ? ';' : ''}`)
        continue
      }
    }

    // Everything else passes through unchanged
    outputLines.push(line)
  }

  return outputLines.join('\n')
}

/**
 * Transform Effect.gen(function* () { ... }) back to gen { ... }
 */
export function reverseTransformSource(source: string): string {
  if (!hasEffectGen(source)) {
    return source
  }

  const blocks = findEffectGenBlocks(source)
  if (blocks.length === 0) {
    return source
  }

  let result = source

  // Process from end to start to preserve positions
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    const reversedContent = reverseTransformContent(block.bodyContent)
    const replacement = `gen {${reversedContent}}`
    result = result.slice(0, block.start) + replacement + result.slice(block.end)
  }

  return result
}

// ============================================================================
// Prettier Plugin
// ============================================================================

export interface PrettierOptions {
  filepath?: string
  parser?: string
  [key: string]: unknown
}

/**
 * Format source code with effect-sugar support
 *
 * This function:
 * 1. Transforms gen {} to Effect.gen()
 * 2. Formats with Prettier
 * 3. Transforms Effect.gen() back to gen {}
 */
export async function formatWithEffectSugar(
  source: string,
  options: PrettierOptions = {}
): Promise<string> {
  // Dynamic import to make prettier optional
  const prettier = await import('prettier')

  // If no gen blocks, just format normally
  if (!hasGenBlocks(source)) {
    return prettier.format(source, {
      ...options,
      parser: options.parser || 'typescript'
    })
  }

  // Transform gen {} → Effect.gen()
  const transformed = transformSource(source, options.filepath)

  // Format with Prettier
  const formatted = await prettier.format(transformed.code, {
    ...options,
    parser: options.parser || 'typescript'
  })

  // Transform Effect.gen() → gen {}
  return reverseTransformSource(formatted)
}

/**
 * Synchronous version for use cases that don't support async
 */
export function formatWithEffectSugarSync(
  source: string,
  prettierFormat: (source: string, options: PrettierOptions) => string,
  options: PrettierOptions = {}
): string {
  // If no gen blocks, just format normally
  if (!hasGenBlocks(source)) {
    return prettierFormat(source, {
      ...options,
      parser: options.parser || 'typescript'
    })
  }

  // Transform gen {} → Effect.gen()
  const transformed = transformSource(source, options.filepath)

  // Format with Prettier
  const formatted = prettierFormat(transformed.code, {
    ...options,
    parser: options.parser || 'typescript'
  })

  // Transform Effect.gen() → gen {}
  return reverseTransformSource(formatted)
}

// ============================================================================
// Prettier Plugin Exports
// ============================================================================

/**
 * Prettier plugin that handles gen {} syntax
 *
 * Note: This plugin uses a two-phase approach:
 * 1. Preprocess: Transform gen {} to Effect.gen()
 * 2. The standard TypeScript parser/printer handles formatting
 *
 * After formatting, use reverseTransformSource() to convert back.
 * For automatic round-trip formatting, use formatWithEffectSugar().
 */
export const parsers = {
  'effect-sugar-typescript': {
    ...({} as any), // Will be populated at runtime
    astFormat: 'estree',
    preprocess(text: string, options: PrettierOptions): string {
      if (!hasGenBlocks(text)) {
        return text
      }
      const result = transformSource(text, options.filepath)
      return result.code
    }
  }
}

// Plugin metadata
export const name = 'effect-sugar-prettier'

export default {
  name,
  parsers,
  formatWithEffectSugar,
  formatWithEffectSugarSync,
  reverseTransformSource,
  hasGenBlocks
}
