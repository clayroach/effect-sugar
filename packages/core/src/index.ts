/**
 * @effect-sugar/core
 *
 * Core scanner and transformer for Effect-TS gen block syntax.
 * Used by both vite-plugin and ts-plugin.
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
