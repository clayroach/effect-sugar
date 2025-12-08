/**
 * @effect-sugar/core
 *
 * Core scanner and transformer for Effect-TS gen block syntax.
 * Used by both vite-plugin, ts-plugin, and tsc-plugin.
 */

export {
  type GenBlock,
  type TokenWithPosition,
  tokenize,
  hasGenBlocks,
  findGenBlocks,
  extractBindPattern,
  transformBlockContent
} from './scanner.js'

import {
  hasGenBlocks,
  findGenBlocks,
  transformBlockContent
} from './scanner.js'

export interface TransformResult {
  code: string
  hasChanges: boolean
}

/**
 * Transform source code containing gen {} blocks to Effect.gen() calls.
 *
 * This is a simple transformation without source maps.
 * For source map support, use the transform from effect-sugar-vite.
 */
export function transformSource(source: string, _filename?: string): TransformResult {
  if (!hasGenBlocks(source)) {
    return { code: source, hasChanges: false }
  }

  const blocks = findGenBlocks(source)
  if (blocks.length === 0) {
    return { code: source, hasChanges: false }
  }

  let result = source

  // Process blocks from end to start to preserve positions
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (!block) continue

    const transformed = transformBlockContent(block.content)
    const replacement = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {${transformed}})`
    result = result.slice(0, block.start) + replacement + result.slice(block.end)
  }

  return { code: result, hasChanges: true }
}
