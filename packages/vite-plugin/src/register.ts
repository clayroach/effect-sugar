/**
 * Node.js loader hook for Effect-TS gen block syntax
 *
 * Usage with tsx:
 *   tsx --import effect-sugar-vite/register src/index.ts
 *
 * Usage with node (ESM):
 *   node --import effect-sugar-vite/register src/index.ts
 *
 * This module registers a Node.js loader that transforms gen blocks
 * before the TypeScript compiler sees them.
 */

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Register our loader hooks
register('./loader-hooks.js', pathToFileURL(import.meta.url))
