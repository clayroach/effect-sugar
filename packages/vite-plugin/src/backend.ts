/**
 * Backend preset for Effect-Sugar Vite builds
 *
 * Provides plug-and-play configuration for Node.js backend builds
 * with automatic entry point discovery and path alias generation.
 */

import type { UserConfig } from 'vite'
import { resolve } from 'path'
import { readdirSync, statSync } from 'fs'
import effectSugar from './index.js'

export interface BackendPresetOptions {
  /**
   * Source directory to scan for entry points
   * @default 'src'
   */
  srcDir?: string

  /**
   * Output directory for built files
   * @default 'dist'
   */
  outDir?: string

  /**
   * Node.js target version
   * @default 'node20'
   */
  target?: string

  /**
   * Enable source maps
   * @default true
   */
  sourcemap?: boolean

  /**
   * Additional path aliases (merged with auto-discovered)
   */
  aliases?: Record<string, string>

  /**
   * Directories to exclude from entry point discovery
   * @default ['test', '__tests__', 'node_modules']
   */
  excludeDirs?: string[]

  /**
   * File patterns to exclude from entry points
   * @default ['.test.ts', '.spec.ts', '.d.ts']
   */
  excludePatterns?: string[]

  /**
   * Auto-discover @/ aliases from src subdirectories
   * @default true
   */
  autoDiscoverAliases?: boolean

  /**
   * Effect-sugar plugin options
   */
  effectSugarOptions?: Parameters<typeof effectSugar>[0]
}

/**
 * Recursively discover all TypeScript entry points in a directory
 */
export function getEntryPoints(
  dir: string,
  options: {
    base?: string
    excludeDirs?: string[]
    excludePatterns?: string[]
  } = {}
): Record<string, string> {
  const {
    base = '',
    excludeDirs = ['test', '__tests__', 'node_modules'],
    excludePatterns = ['.test.ts', '.spec.ts', '.d.ts']
  } = options

  const entries: Record<string, string> = {}

  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return entries
  }

  for (const file of files) {
    const fullPath = resolve(dir, file)
    const relativePath = base ? `${base}/${file}` : file

    let stats
    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }

    if (stats.isDirectory()) {
      if (excludeDirs.includes(file)) continue
      Object.assign(entries, getEntryPoints(fullPath, {
        base: relativePath,
        excludeDirs,
        excludePatterns
      }))
    } else if (file.endsWith('.ts')) {
      // Check exclude patterns
      const shouldExclude = excludePatterns.some(pattern => file.endsWith(pattern))
      if (shouldExclude) continue

      const name = relativePath.replace(/\.ts$/, '')
      entries[name] = fullPath
    }
  }

  return entries
}

/**
 * Auto-discover path aliases from src subdirectories
 * Creates @/package-name aliases for each top-level directory
 */
export function discoverAliases(
  srcDir: string,
  rootDir: string = process.cwd()
): Record<string, string> {
  const aliases: Record<string, string> = {
    '@': resolve(rootDir, srcDir)
  }

  let entries: string[]
  try {
    entries = readdirSync(resolve(rootDir, srcDir))
  } catch {
    return aliases
  }

  for (const entry of entries) {
    const fullPath = resolve(rootDir, srcDir, entry)
    try {
      if (statSync(fullPath).isDirectory()) {
        aliases[`@/${entry}`] = fullPath
      }
    } catch {
      continue
    }
  }

  return aliases
}

/**
 * Check if a module ID should be externalized for Node.js builds
 */
export function isExternal(id: string): boolean {
  // Externalize node: builtins
  if (id.startsWith('node:')) return true
  // Externalize anything in node_modules
  if (id.includes('node_modules')) return true
  // Externalize bare imports (packages) - but not local aliases
  if (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('@/')) return true
  return false
}

/**
 * Create a complete Vite config for Node.js backend builds with effect-sugar
 */
export function effectSugarBackend(options: BackendPresetOptions = {}): UserConfig {
  const {
    srcDir = 'src',
    outDir = 'dist',
    target = 'node20',
    sourcemap = true,
    aliases = {},
    excludeDirs = ['test', '__tests__', 'node_modules'],
    excludePatterns = ['.test.ts', '.spec.ts', '.d.ts'],
    autoDiscoverAliases = true,
    effectSugarOptions = {}
  } = options

  const rootDir = process.cwd()
  const srcPath = resolve(rootDir, srcDir)

  // Discover entry points
  const entryPoints = getEntryPoints(srcPath, { excludeDirs, excludePatterns })

  // Build aliases
  const resolvedAliases = autoDiscoverAliases
    ? { ...discoverAliases(srcDir, rootDir), ...aliases }
    : { '@': srcPath, ...aliases }

  return {
    plugins: [effectSugar(effectSugarOptions)],

    build: {
      target,
      outDir,
      sourcemap,

      lib: {
        entry: entryPoints,
        formats: ['es']
      },

      rollupOptions: {
        external: isExternal,
        output: {
          preserveModules: true,
          preserveModulesRoot: srcDir,
          entryFileNames: '[name].js'
        }
      },

      // Don't minify for Node.js
      minify: false
    },

    resolve: {
      alias: resolvedAliases
    }
  }
}

// Default export for convenience
export default effectSugarBackend
