/**
 * Node.js loader hook registration for tsx runtime support
 *
 * Usage with tsx:
 *   tsx --import effect-sugar-esbuild/register src/index.ts
 *
 * Usage with node (ESM):
 *   node --import effect-sugar-esbuild/register src/index.ts
 *
 * This module registers a Node.js loader that transforms gen blocks
 * before the TypeScript compiler sees them.
 */

import { register } from 'node:module'

// Register our loader hooks
// Note: import.meta.url is already a file:// URL, so we pass it directly
register('./loader-hooks.js', import.meta.url)
