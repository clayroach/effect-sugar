/**
 * ESLint preprocessor for effect-sugar gen {} syntax
 *
 * Transforms gen {} blocks to Effect.gen() before ESLint parses the code,
 * allowing linting of source files that use the custom syntax.
 *
 * Usage in eslint.config.mjs:
 *
 * ```javascript
 * import effectSugarPreprocessor from 'effect-sugar-vite/eslint'
 *
 * export default [
 *   {
 *     files: ['src/**\/*.ts'],
 *     processor: effectSugarPreprocessor
 *   }
 * ]
 * ```
 */
import { transformSource, hasGenBlocks } from './transform.js'

export interface ESLintPreprocessor {
  preprocess(text: string, filename: string): string[]
  postprocess(messages: Array<Array<object>>, filename: string): object[]
  supportsAutofix: boolean
}

const effectSugarPreprocessor: ESLintPreprocessor = {
  /**
   * Preprocess source code before ESLint parses it
   */
  preprocess(text: string, filename: string): string[] {
    // Only transform .ts/.tsx files that contain gen blocks
    if ((filename.endsWith('.ts') || filename.endsWith('.tsx')) && hasGenBlocks(text)) {
      const result = transformSource(text, filename)
      return [result.code]
    }
    return [text]
  },

  /**
   * Postprocess ESLint messages after linting
   */
  postprocess(messages: Array<Array<object>>, filename: string): object[] {
    // Return messages as-is - the transformation preserves line structure
    // so line numbers should still be accurate
    return messages.flat()
  },

  supportsAutofix: true
}

export default effectSugarPreprocessor
