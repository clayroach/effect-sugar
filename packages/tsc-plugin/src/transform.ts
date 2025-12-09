/**
 * ts-patch Program Transformer for effect-sugar gen {} blocks.
 *
 * This transformer intercepts TypeScript's file reading to transform
 * gen {} blocks BEFORE TypeScript parses the source code.
 *
 * This is necessary because gen {} is not valid TypeScript syntax,
 * so a standard Source Transformer (which receives already-parsed AST)
 * would fail - TypeScript's parser would error before our transformer runs.
 *
 * Configuration in tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "plugins": [{
 *       "name": "effect-sugar-tsc",
 *       "transform": "effect-sugar-tsc/transform",
 *       "transformProgram": true
 *     }]
 *   }
 * }
 */

import type {
  ProgramTransformer,
  PluginConfig,
  ProgramTransformerExtras
} from 'ts-patch'
import type ts from 'typescript'
import { transformSource, hasGenBlocks } from 'effect-sugar-core'

/**
 * Detect if we're running in TypeScript Language Service context vs compilation
 *
 * When both ts-plugin and tsc-plugin are enabled, we need to detect which context
 * we're in to avoid conflicts:
 * - Language Service: Let ts-plugin handle transformation (IDE features)
 * - Compilation: Use tsc-plugin for actual build
 */
function detectLanguageServiceContext(
  program: ts.Program,
  host?: ts.CompilerHost
): boolean {
  // Method 1: Check for Language Service-specific methods on host
  // The Language Service host has getScriptSnapshot, regular CompilerHost doesn't
  if (host && (host as any).getScriptSnapshot) {
    return true
  }

  // Method 2: Check for Language Service program flag (internal TypeScript flag)
  if ((program as any).isLanguageServiceProgram) {
    return true
  }

  // Method 3: Check for TSServer environment variable
  // When VSCode's TypeScript server runs, it sets this
  if (process.env.TSSERVER_LOG_FILE !== undefined) {
    return true
  }

  return false
}

/**
 * Simple hash function for generating file versions.
 * Used by TypeScript's incremental builder to detect file changes.
 */
function computeVersion(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0 // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Ensures a source file has a version set for incremental compilation.
 * TypeScript's BuilderProgram requires all source files to have version information.
 */
function ensureVersion<T extends { version?: string; text?: string }>(
  sourceFile: T | undefined
): T | undefined {
  if (sourceFile && !sourceFile.version) {
    ;(sourceFile as { version: string }).version = computeVersion(
      sourceFile.text ?? ''
    )
  }
  return sourceFile
}

const transformer: ProgramTransformer = (
  program: ts.Program,
  host: ts.CompilerHost | undefined,
  _config: PluginConfig,
  { ts: typescript }: ProgramTransformerExtras
): ts.Program => {
  // CRITICAL: The tsc-plugin's transformProgram is fundamentally incompatible
  // with TypeScript's Language Service due to how it creates new Programs.
  //
  // When used in Language Service context, it corrupts TypeScript's internal
  // module resolution cache, causing crashes.
  //
  // Solution: ALWAYS skip transformation during Language Service.
  // The ts-plugin (effect-sugar-ts-plugin) handles IDE features instead.

  // Quick check: If we're being called during Language Service initialization,
  // just return the program unchanged. The mere act of creating a new Program
  // breaks the Language Service's incremental state.

  // The presence of getScriptSnapshot is the most reliable indicator
  if (host && (host as any).getScriptSnapshot) {
    // Definitely Language Service - has LS-specific methods
    return program
  }

  // Check for TS Server environment
  if (process.env.TSSERVER_LOG_FILE) {
    // Running in TS Server (Language Service)
    return program
  }

  // If we reach here, we're likely in actual compilation context
  console.log('[effect-sugar-tsc] Compilation context - transforming gen blocks')

  const compilerOptions = program.getCompilerOptions()
  const rootNames = program.getRootFileNames()

  // Get the original host or create a default one
  const originalHost = host ?? typescript.createCompilerHost(compilerOptions)

  // Wrap the host to intercept getSourceFile
  const wrappedHost: ts.CompilerHost = {
    ...originalHost,

    getSourceFile(
      fileName: string,
      languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
      onError?: (message: string) => void,
      shouldCreateNewSourceFile?: boolean
    ): ts.SourceFile | undefined {
      // Helper to get source file from original host with version ensured
      const getOriginalSourceFile = () =>
        ensureVersion(
          originalHost.getSourceFile(
            fileName,
            languageVersionOrOptions,
            onError,
            shouldCreateNewSourceFile
          )
        )

      // Only process .ts/.tsx files
      if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) {
        return getOriginalSourceFile()
      }

      // Skip node_modules and declaration files
      if (fileName.includes('node_modules') || fileName.endsWith('.d.ts')) {
        return getOriginalSourceFile()
      }

      // Read the raw source
      const sourceText = originalHost.readFile?.(fileName)
      if (!sourceText) {
        return getOriginalSourceFile()
      }

      // Quick check for gen blocks
      if (!hasGenBlocks(sourceText)) {
        return getOriginalSourceFile()
      }

      // Transform gen {} blocks to Effect.gen()
      const result = transformSource(sourceText, fileName)

      // Determine language version
      const languageVersion =
        typeof languageVersionOrOptions === 'number'
          ? languageVersionOrOptions
          : languageVersionOrOptions.languageVersion

      // Create SourceFile from transformed code
      const sourceFile = typescript.createSourceFile(
        fileName,
        result.code,
        languageVersion,
        true // setParentNodes
      )

      // CRITICAL: Set version for incremental compilation support.
      // TypeScript's BuilderProgram requires source files to have version information.
      // Without this, incremental compilation fails with:
      // "Debug Failure. Program intended to be used with Builder should have source files with versions set"
      ;(sourceFile as unknown as { version: string }).version = computeVersion(
        result.code
      )

      return sourceFile
    }
  }

  // Create a new program with the wrapped host
  // NOTE: We do NOT pass the old program here because it breaks TypeScript's
  // incremental compilation cache when running in Language Service context.
  // This means no incremental compilation, but it's safer and avoids crashes.
  return typescript.createProgram(
    rootNames,
    compilerOptions,
    wrappedHost
    // Intentionally NOT passing old program - causes cache corruption in Language Service
  )
}

export default transformer
