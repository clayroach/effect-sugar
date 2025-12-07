/**
 * effect-sugar-tsc
 *
 * ts-patch transformer for Effect-TS gen block syntax.
 *
 * Enables compiling gen {} blocks with standard tsc (via ts-patch).
 *
 * Setup:
 * 1. pnpm add -D effect-sugar-tsc ts-patch
 * 2. Add to package.json scripts: "prepare": "ts-patch install -s"
 * 3. Add to tsconfig.json compilerOptions.plugins:
 *    {
 *      "name": "effect-sugar-tsc",
 *      "transform": "effect-sugar-tsc/transform",
 *      "transformProgram": true
 *    }
 * 4. Run: tsc
 */

// Re-export transformer as default
export { default } from './transform.js'

// Re-export core utilities for convenience
export {
  hasGenBlocks,
  findGenBlocks,
  transformBlockContent,
  transformSource,
  type TransformResult,
  type GenBlock
} from 'effect-sugar-core'
