/**
 * Node.js loader hooks for transforming gen blocks
 *
 * This module implements the Node.js module loader hooks API
 * to transform gen blocks before TypeScript compilation.
 *
 * For files with gen blocks, we:
 * 1. Read the raw source ourselves (bypassing tsx)
 * 2. Transform gen { } to Effect.gen()
 * 3. Use esbuild to compile TypeScript to JavaScript
 * 4. Return the compiled JavaScript
 *
 * @see https://nodejs.org/api/module.html#customization-hooks
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { hasGenBlocks, transformSource } from './transform.js'

interface LoadContext {
  conditions: string[]
  format?: string
  importAttributes: Record<string, string>
}

type NextLoad = (
  url: string,
  context?: LoadContext
) => Promise<{ format: string; source: string | ArrayBuffer; shortCircuit?: boolean }>

// Lazy-load esbuild to avoid issues if not installed
let esbuildTransform: typeof import('esbuild').transform | null = null

async function getEsbuildTransform() {
  if (esbuildTransform === null) {
    try {
      const esbuild = await import('esbuild')
      esbuildTransform = esbuild.transform
    } catch {
      throw new Error(
        'effect-sugar-vite/register requires esbuild for tsx loader support. ' +
        'Install it with: pnpm add -D esbuild'
      )
    }
  }
  return esbuildTransform
}

/**
 * Load hook - transforms TypeScript files containing gen blocks
 */
export async function load(
  url: string,
  context: LoadContext,
  nextLoad: NextLoad
): Promise<{ format: string; source: string | ArrayBuffer; shortCircuit?: boolean }> {
  // Only process file:// URLs for TypeScript files
  if (!url.startsWith('file://')) {
    return nextLoad(url, context)
  }

  const isTsx = url.endsWith('.tsx')
  const isTs = url.endsWith('.ts') || url.endsWith('.mts')

  // Only process TypeScript files
  if (!isTs && !isTsx) {
    return nextLoad(url, context)
  }

  // Skip node_modules
  if (url.includes('node_modules')) {
    return nextLoad(url, context)
  }

  // Read the raw source directly
  const filePath = fileURLToPath(url)
  let source: string
  try {
    source = await readFile(filePath, 'utf-8')
  } catch {
    // If we can't read the file, let the next loader handle it
    return nextLoad(url, context)
  }

  // Quick check for gen blocks
  if (!hasGenBlocks(source)) {
    // No gen blocks - let tsx handle it normally
    return nextLoad(url, context)
  }

  // Transform gen { } to Effect.gen()
  const transformed = transformSource(source, url)

  if (!transformed.hasChanges) {
    return nextLoad(url, context)
  }

  // Use esbuild to compile TypeScript to JavaScript
  // This is necessary because we've bypassed tsx's transformation
  const transform = await getEsbuildTransform()
  const result = await transform(transformed.code, {
    loader: isTsx ? 'tsx' : 'ts',
    format: 'esm',
    sourcefile: filePath,
    sourcemap: 'inline',
    target: 'node18'
  })

  return {
    format: 'module',
    source: result.code,
    shortCircuit: true
  }
}
