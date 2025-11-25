/**
 * Babel plugin for Effect-TS syntactic sugar
 *
 * Transforms:
 *   gen {
 *     x <- getUser(id)
 *     y <- getProfile(x)
 *     return { user: x, profile: y }
 *   }
 *
 * Into:
 *   Effect.gen(function* () {
 *     const x = yield* getUser(id)
 *     const y = yield* getProfile(x)
 *     return { user: x, profile: y }
 *   })
 */

import type { PluginObj, PluginPass } from '@babel/core'
import type * as BabelTypes from '@babel/types'
import { parseEffBlock } from './parser.js'
import { generateEffectGen } from './generator.js'

interface PluginOptions {
  effectImport?: string
}

interface SourceLocation {
  start: number
  end: number
  blockContent: string
}

/**
 * Find all gen { ... } blocks in source code
 */
function findEffBlocks(source: string): SourceLocation[] {
  const locations: SourceLocation[] = []
  const effPattern = /\bgen\s*\{/g

  let match: RegExpExecArray | null
  while ((match = effPattern.exec(source)) !== null) {
    const start = match.index
    const braceStart = source.indexOf('{', start)

    // Find matching closing brace
    let depth = 1
    let pos = braceStart + 1
    let inString: string | null = null

    while (pos < source.length && depth > 0) {
      const char = source[pos]

      // Handle strings
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
      const blockContent = source.slice(braceStart + 1, pos - 1)
      locations.push({
        start,
        end: pos,
        blockContent
      })
    }
  }

  return locations
}

/**
 * Transform source code by replacing gen blocks with Effect.gen
 */
export function transformSource(source: string, options: PluginOptions = {}): string {
  const locations = findEffBlocks(source)

  if (locations.length === 0) {
    return source
  }

  // Process blocks from end to start to preserve positions
  let result = source
  for (let i = locations.length - 1; i >= 0; i--) {
    const loc = locations[i]

    try {
      const ast = parseEffBlock(loc.blockContent)
      const generated = generateEffectGen(ast, {
        effectImport: options.effectImport
      })

      result = result.slice(0, loc.start) + generated + result.slice(loc.end)
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to parse eff block at position ${loc.start}: ${err.message}`)
    }
  }

  return result
}

/**
 * Babel plugin that transforms gen blocks
 *
 * Note: This plugin uses a pre-parse approach since Babel's parser
 * cannot handle custom syntax like `<-`. The transformation happens
 * in the 'pre' phase before Babel parses the code.
 */
export default function effectSugarPlugin(
  { types: t }: { types: typeof BabelTypes },
  options: PluginOptions = {}
): PluginObj<PluginPass> {
  return {
    name: 'effect-sugar',

    // Transform before Babel parses
    pre(file) {
      const code = file.code
      if (code.includes('gen')) {
        const transformed = transformSource(code, options)
        if (transformed !== code) {
          // Update the file's code
          ;(file as any).code = transformed
        }
      }
    },

    visitor: {
      // The visitor is empty because transformation happens in pre()
      // But we could add additional transforms here if needed
    }
  }
}

// Export utilities for direct use
export { parseEffBlock } from './parser.js'
export { generateEffectGen } from './generator.js'
export type { EffBlock, Statement } from './parser.js'
