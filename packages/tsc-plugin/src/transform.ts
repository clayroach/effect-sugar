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
      // Only process .ts/.tsx files
      if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) {
        return originalHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile
        )
      }

      // Skip node_modules and declaration files
      if (fileName.includes('node_modules') || fileName.endsWith('.d.ts')) {
        return originalHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile
        )
      }

      // Read the raw source
      const sourceText = originalHost.readFile?.(fileName)
      if (!sourceText) {
        return originalHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile
        )
      }

      // Quick check for gen blocks
      if (!hasGenBlocks(sourceText)) {
        return originalHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile
        )
      }

      // Transform gen {} blocks to Effect.gen()
      const result = transformSource(sourceText, fileName)

      // Determine language version
      const languageVersion =
        typeof languageVersionOrOptions === 'number'
          ? languageVersionOrOptions
          : languageVersionOrOptions.languageVersion

      // Create SourceFile from transformed code
      return typescript.createSourceFile(
        fileName,
        result.code,
        languageVersion,
        true // setParentNodes
      )
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
