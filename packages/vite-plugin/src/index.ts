/**
 * Vite plugin for Effect-TS gen block syntax
 *
 * Usage:
 *   import effectSugar from 'effect-sugar-vite'
 *
 *   export default defineConfig({
 *     plugins: [effectSugar()]
 *   })
 */

import type { Plugin, TransformResult as ViteTransformResult } from 'vite'
import { hasGenBlocks, transformSource } from './transform.js'

export interface EffectSugarOptions {
  /**
   * File extensions to process
   * @default ['.ts', '.tsx', '.mts', '.cts']
   */
  include?: string[]

  /**
   * Patterns to exclude from processing
   * @default [/node_modules/]
   */
  exclude?: (string | RegExp)[]

  /**
   * Enable source map generation
   * @default true
   */
  sourcemap?: boolean
}

const DEFAULT_INCLUDE = ['.ts', '.tsx', '.mts', '.cts']
const DEFAULT_EXCLUDE = [/node_modules/]

function shouldProcess(
  id: string,
  include: string[],
  exclude: (string | RegExp)[]
): boolean {
  // Check exclusions first
  for (const pattern of exclude) {
    if (typeof pattern === 'string') {
      if (id.includes(pattern)) return false
    } else {
      if (pattern.test(id)) return false
    }
  }

  // Check inclusions
  for (const ext of include) {
    if (id.endsWith(ext)) return true
  }

  return false
}

export default function effectSugarPlugin(
  options: EffectSugarOptions = {}
): Plugin {
  const {
    include = DEFAULT_INCLUDE,
    exclude = DEFAULT_EXCLUDE,
    sourcemap = true
  } = options

  return {
    name: 'effect-sugar',

    // Run before other plugins (especially before esbuild transforms TypeScript)
    enforce: 'pre',

    transform(code: string, id: string): ViteTransformResult | null {
      // Skip if not a processable file
      if (!shouldProcess(id, include, exclude)) {
        return null
      }

      // Quick check for gen blocks
      if (!hasGenBlocks(code)) {
        return null
      }

      // Transform the source
      const result = transformSource(code, id)

      if (!result.hasChanges) {
        return null
      }

      return {
        code: result.code,
        map: sourcemap ? result.map as any : null
      }
    }
  }
}

// Re-export transformation utilities for testing and advanced usage
export { hasGenBlocks, findGenBlocks, transformSource, transformBlockContent } from './transform.js'
export type { GenBlock, TransformResult } from './transform.js'
