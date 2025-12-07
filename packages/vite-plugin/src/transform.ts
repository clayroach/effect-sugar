/**
 * Core transformation module for Effect-TS gen block syntax
 *
 * Uses js-tokens based scanner for robust parsing.
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
import {
  hasGenBlocks as scannerHasGenBlocks,
  findGenBlocks as scannerFindGenBlocks,
  transformBlockContent as scannerTransformBlockContent
} from 'effect-sugar-core'

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

// Re-export scanner functions for backwards compatibility
export const hasGenBlocks = scannerHasGenBlocks
export const findGenBlocks = scannerFindGenBlocks
export const transformBlockContent = scannerTransformBlockContent

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
    if (!block) continue

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
