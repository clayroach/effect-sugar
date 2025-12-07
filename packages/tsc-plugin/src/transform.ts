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
  return typescript.createProgram(
    rootNames,
    compilerOptions,
    wrappedHost,
    program // oldProgram for incremental compilation
  )
}

export default transformer
