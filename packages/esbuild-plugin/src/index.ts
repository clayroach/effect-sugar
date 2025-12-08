/**
 * @effect-sugar/esbuild
 *
 * esbuild plugin for Effect-TS gen block syntax transformation.
 */

import type { Plugin } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { hasGenBlocks, transformSource } from 'effect-sugar-core'

export interface EffectSugarPluginOptions {
  /**
   * Filter pattern for files to transform.
   * Defaults to /\.tsx?$/ (all TypeScript files)
   */
  filter?: RegExp

  /**
   * Whether to skip node_modules.
   * Defaults to true.
   */
  skipNodeModules?: boolean
}

/**
 * esbuild plugin that transforms gen {} blocks to Effect.gen() calls.
 *
 * @example
 * ```typescript
 * import * as esbuild from 'esbuild'
 * import { effectSugarPlugin } from 'effect-sugar-esbuild'
 *
 * await esbuild.build({
 *   entryPoints: ['src/index.ts'],
 *   bundle: true,
 *   plugins: [effectSugarPlugin()],
 *   outfile: 'dist/bundle.js'
 * })
 * ```
 */
export function effectSugarPlugin(options: EffectSugarPluginOptions = {}): Plugin {
  const {
    filter = /\.tsx?$/,
    skipNodeModules = true
  } = options

  return {
    name: 'effect-sugar',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        // Skip node_modules if configured
        if (skipNodeModules && args.path.includes('node_modules')) {
          return null
        }

        // Read the source file
        let source: string
        try {
          source = await readFile(args.path, 'utf-8')
        } catch {
          // If we can't read the file, let esbuild handle it
          return null
        }

        // Quick check for gen blocks
        if (!hasGenBlocks(source)) {
          return null
        }

        // Transform gen {} to Effect.gen()
        const result = transformSource(source, args.path)

        if (!result.hasChanges) {
          return null
        }

        // Return transformed code with appropriate loader
        return {
          contents: result.code,
          loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts'
        }
      })
    }
  }
}

export default effectSugarPlugin
