/**
 * TypeScript Language Service Plugin for Effect Sugar
 *
 * Provides full IntelliSense support for gen { } blocks by:
 * 1. Transforming gen {} syntax to Effect.gen() before TypeScript parses it
 * 2. Mapping positions bidirectionally between original and transformed source
 * 3. Intercepting language service calls to provide correct positions
 *
 * ## Position Mapping Problem
 *
 * When we transform `gen { user <- getUser(id) }` to
 * `Effect.gen(function* () { const user = yield* getUser(id) })`,
 * the character positions change significantly:
 *
 * ```
 * Original:    gen { user <- getUser(id) }
 *                    ^--- position 6
 *
 * Transformed: Effect.gen(function* () { const user = yield* getUser(id) })
 *                                              ^--- position 38
 * ```
 *
 * ## The Hybrid Mapping Solution
 *
 * Simple position mapping (just converting positions) doesn't work correctly
 * for go-to-definition because TypeScript's internal sourceFile contains the
 * TRANSFORMED source. When VSCode asks "go to definition at position X":
 *
 * 1. We map X from original → transformed position
 * 2. TypeScript finds the definition and returns a position in transformed source
 * 3. We need to map that position back to original source
 *
 * BUT: TypeScript internally converts positions to line/column using the
 * transformed source's line lengths. So if we just map the position back,
 * TypeScript's line/column calculation will be wrong.
 *
 * The HYBRID approach fixes this:
 * 1. Map transformed position → original position (to get original location)
 * 2. Calculate original line/column from original source
 * 3. Find a transformed position that, when TypeScript converts it to line/column
 *    using transformed source, gives us the ORIGINAL line/column
 *
 * This ensures the cursor lands on the correct line AND column in the editor.
 *
 * ## Example
 *
 * ```typescript
 * // Original source (displayed in editor):
 * const program = gen {
 *   user <- getUser(id)    // line 2, user at column 2
 *   return user
 * }
 *
 * // Transformed source (what TypeScript sees):
 * const program = Effect.gen(function* () {
 *   const user = yield* getUser(id)    // line 2, user at column 8
 *   return user
 * })
 * ```
 *
 * When clicking on `user` in the return statement:
 * - TypeScript returns definition at transformed position (column 8 on line 2)
 * - We calculate: that maps to original position → line 2, column 2
 * - We find: what transformed position gives line 2, column 2? → adjusted position
 * - Result: cursor correctly lands at column 2 in the original source
 */

import * as ts from 'typescript/lib/tsserverlibrary'
import { createWrappedLanguageServiceHost } from './language-service-host-wrapper.js'
import { transformSourceSafe, findGenBlocks } from './transformer.js'

interface PluginCreateInfo {
  languageService: ts.LanguageService
  languageServiceHost: ts.LanguageServiceHost
  project: ts.server.Project
  serverHost?: ts.server.ServerHost
  config?: any
}

function isInGenBlock(
  start: number,
  length: number | undefined,
  blocks: Array<{ start: number; end: number }>
): boolean {
  const end = start + (length || 1)
  return blocks.some((block) => start < block.end && end > block.start)
}

function create(info: PluginCreateInfo): ts.LanguageService {
  console.log('[effect-sugar] Plugin initialized with IntelliSense support')

  const originalHost = info.languageServiceHost

  const { wrappedHost, getTransformState } = createWrappedLanguageServiceHost(
    originalHost,
    (fileName) => {
      const scriptInfo = (info.project as any).getScriptInfo?.(fileName)
      return scriptInfo?.getLatestVersion?.() ?? '0'
    }
  )

  const ls = ts.createLanguageService(wrappedHost, ts.createDocumentRegistry())

  function filterDiagnostics(
    fileName: string,
    diagnostics: ts.Diagnostic[],
    label: string
  ): ts.Diagnostic[] {
    const program = ls.getProgram()
    if (!program) return diagnostics

    const sourceFile = program.getSourceFile(fileName)
    if (!sourceFile) return diagnostics

    const text = sourceFile.getFullText()
    const genBlocks = findGenBlocks(text)

    if (genBlocks.length === 0) {
      return diagnostics
    }

    const filtered = diagnostics.filter((diagnostic) => {
      if (diagnostic.start === undefined) return true
      return !isInGenBlock(diagnostic.start, diagnostic.length, genBlocks)
    })

    if (diagnostics.length !== filtered.length) {
      console.log(
        `[effect-sugar] ${label}: ${diagnostics.length} -> ${filtered.length} (filtered ${
          diagnostics.length - filtered.length
        })`
      )
    }

    return filtered
  }

  const proxy = new Proxy(ls, {
    get(target, prop: string) {
      // Diagnostic filtering
      if (prop === 'getSemanticDiagnostics') {
        return (fileName: string) => {
          const diagnostics = target.getSemanticDiagnostics(fileName)
          return filterDiagnostics(fileName, diagnostics, 'Semantic')
        }
      }

      if (prop === 'getSyntacticDiagnostics') {
        return (fileName: string) => {
          const diagnostics = target.getSyntacticDiagnostics(fileName)
          return filterDiagnostics(fileName, diagnostics, 'Syntactic')
        }
      }

      if (prop === 'getSuggestionDiagnostics') {
        return (fileName: string) => {
          const diagnostics = target.getSuggestionDiagnostics(fileName)
          return filterDiagnostics(fileName, diagnostics, 'Suggestion')
        }
      }

      // Hover information
      if (prop === 'getQuickInfoAtPosition') {
        return (fileName: string, position: number): ts.QuickInfo | undefined => {
          const state = getTransformState(fileName)

          if (!state) {
            return target.getQuickInfoAtPosition(fileName, position)
          }

          const result = transformSourceSafe(state.original)
          if (!result.hasChanges) {
            return target.getQuickInfoAtPosition(fileName, position)
          }

          const positionMapper = result.positionMapper
          const mappedPosition = positionMapper.originalToTransformed(position)
          const info = target.getQuickInfoAtPosition(fileName, mappedPosition)

          if (!info) {
            return undefined
          }

          const originalStart = positionMapper.transformedToOriginal(info.textSpan.start)
          const originalEnd = positionMapper.transformedToOriginal(
            info.textSpan.start + info.textSpan.length
          )

          return {
            ...info,
            textSpan: {
              start: originalStart,
              length: originalEnd - originalStart
            }
          }
        }
      }

      // Auto-complete
      if (prop === 'getCompletionsAtPosition') {
        return (
          fileName: string,
          position: number,
          options?: ts.GetCompletionsAtPositionOptions
        ): ts.CompletionInfo | undefined => {
          const state = getTransformState(fileName)

          if (!state) {
            return target.getCompletionsAtPosition(fileName, position, options)
          }

          const result = transformSourceSafe(state.original)
          if (!result.hasChanges) {
            return target.getCompletionsAtPosition(fileName, position, options)
          }

          const positionMapper = result.positionMapper
          const mappedPosition = positionMapper.originalToTransformed(position)
          const completions = target.getCompletionsAtPosition(fileName, mappedPosition, options)

          if (!completions) {
            return undefined
          }

          return {
            ...completions,
            entries: completions.entries.map((entry) => {
              if (entry.replacementSpan) {
                const originalStart = positionMapper.transformedToOriginal(
                  entry.replacementSpan.start
                )
                const originalEnd = positionMapper.transformedToOriginal(
                  entry.replacementSpan.start + entry.replacementSpan.length
                )
                return {
                  ...entry,
                  replacementSpan: {
                    start: originalStart,
                    length: originalEnd - originalStart
                  }
                }
              }
              return entry
            })
          }
        }
      }

      // Go-to-definition (used by Cmd+Click)
      if (prop === 'getDefinitionAndBoundSpan') {
        return (fileName: string, position: number): ts.DefinitionInfoAndBoundSpan | undefined => {
          const state = getTransformState(fileName)

          if (!state) {
            return target.getDefinitionAndBoundSpan(fileName, position)
          }

          const result = transformSourceSafe(state.original)
          if (!result.hasChanges) {
            return target.getDefinitionAndBoundSpan(fileName, position)
          }

          const positionMapper = result.positionMapper

          const mappedPosition = positionMapper.originalToTransformed(position)
          const defResult = target.getDefinitionAndBoundSpan(fileName, mappedPosition)

          if (!defResult) {
            return undefined
          }

          // Map the textSpan (the highlighted text at click location) back to original coordinates
          const originalTextSpanStart = positionMapper.transformedToOriginal(defResult.textSpan.start)
          const originalTextSpanEnd = positionMapper.transformedToOriginal(
            defResult.textSpan.start + defResult.textSpan.length
          )

          // Map definition textSpans using a hybrid approach:
          // TypeScript's sourceFile contains transformed source, so when it converts
          // position→line/column, it uses transformed line lengths. To navigate correctly
          // in the original source displayed in the editor, we need to:
          // 1. Map transformed position → original position
          // 2. Calculate original line/column
          // 3. Find transformed position at that same line/column
          // This ensures TypeScript's position→line/column gives the correct result.
          const mappedDefinitions = defResult.definitions?.map((def) => {
            // Only apply hybrid mapping to files we've transformed
            const defState = getTransformState(def.fileName)
            if (!defState) {
              return def
            }

            const defResult = transformSourceSafe(defState.original)
            if (!defResult.hasChanges) {
              return def
            }

            const defMapper = defResult.positionMapper
            const origSrc = defState.original
            const transSrc = defState.transformed

            const transformedSpan = def.textSpan

            // Step 1: Map transformed position to original position
            const originalPos = defMapper.transformedToOriginal(transformedSpan.start)

            // Step 2: Calculate original line/column
            const origLines = origSrc.slice(0, originalPos).split('\n')
            const origLine = origLines.length
            const origCol = origLines[origLines.length - 1]?.length ?? 0

            // Step 3: Find the transformed position for that original line/column
            const transLines = transSrc.split('\n')
            let transPos = 0
            for (let i = 0; i < origLine - 1 && i < transLines.length; i++) {
              transPos += (transLines[i]?.length ?? 0) + 1 // +1 for newline
            }
            transPos += Math.min(origCol, transLines[origLine - 1]?.length ?? 0)

            return {
              ...def,
              textSpan: { start: transPos, length: transformedSpan.length }
            }
          })

          // Build result object conditionally to satisfy exactOptionalPropertyTypes
          const resultObject: ts.DefinitionInfoAndBoundSpan = {
            textSpan: {
              start: originalTextSpanStart,
              length: originalTextSpanEnd - originalTextSpanStart
            }
          }

          if (mappedDefinitions) {
            resultObject.definitions = mappedDefinitions
          }

          return resultObject
        }
      }

      // Go-to-definition (alternative API)
      if (prop === 'getDefinitionAtPosition') {
        return (fileName: string, position: number): readonly ts.DefinitionInfo[] | undefined => {
          const state = getTransformState(fileName)

          if (!state) {
            return target.getDefinitionAtPosition(fileName, position)
          }

          const result = transformSourceSafe(state.original)
          if (!result.hasChanges) {
            return target.getDefinitionAtPosition(fileName, position)
          }

          const positionMapper = result.positionMapper
          const mappedPosition = positionMapper.originalToTransformed(position)
          const definitions = target.getDefinitionAtPosition(fileName, mappedPosition)

          if (!definitions) {
            return undefined
          }

          // Use the same hybrid mapping approach as getDefinitionAndBoundSpan
          return definitions.map((def) => {
            const defState = getTransformState(def.fileName)
            if (!defState) {
              return def
            }

            const defResult = transformSourceSafe(defState.original)
            if (!defResult.hasChanges) {
              return def
            }

            const defMapper = defResult.positionMapper
            const origSrc = defState.original
            const transSrc = defState.transformed

            const transformedSpan = def.textSpan

            // Step 1: Map transformed position to original position
            const originalPos = defMapper.transformedToOriginal(transformedSpan.start)

            // Step 2: Calculate original line/column
            const origLines = origSrc.slice(0, originalPos).split('\n')
            const origLine = origLines.length
            const origCol = origLines[origLines.length - 1]?.length ?? 0

            // Step 3: Find the transformed position for that original line/column
            const transLines = transSrc.split('\n')
            let transPos = 0
            for (let i = 0; i < origLine - 1 && i < transLines.length; i++) {
              transPos += (transLines[i]?.length ?? 0) + 1 // +1 for newline
            }
            transPos += Math.min(origCol, transLines[origLine - 1]?.length ?? 0)

            return {
              ...def,
              textSpan: { start: transPos, length: transformedSpan.length }
            }
          })
        }
      }

      // Type definition
      if (prop === 'getTypeDefinitionAtPosition') {
        return (fileName: string, position: number): readonly ts.DefinitionInfo[] | undefined => {
          const state = getTransformState(fileName)

          if (!state) {
            return target.getTypeDefinitionAtPosition(fileName, position)
          }

          const result = transformSourceSafe(state.original)
          if (!result.hasChanges) {
            return target.getTypeDefinitionAtPosition(fileName, position)
          }

          const positionMapper = result.positionMapper
          const mappedPosition = positionMapper.originalToTransformed(position)
          const typeDefs = target.getTypeDefinitionAtPosition(fileName, mappedPosition)

          if (!typeDefs) {
            return undefined
          }

          // Use the same hybrid mapping approach
          return typeDefs.map((def) => {
            const defState = getTransformState(def.fileName)
            if (!defState) {
              return def
            }

            const defResult = transformSourceSafe(defState.original)
            if (!defResult.hasChanges) {
              return def
            }

            const defMapper = defResult.positionMapper
            const origSrc = defState.original
            const transSrc = defState.transformed

            const transformedSpan = def.textSpan

            // Step 1: Map transformed position to original position
            const originalPos = defMapper.transformedToOriginal(transformedSpan.start)

            // Step 2: Calculate original line/column
            const origLines = origSrc.slice(0, originalPos).split('\n')
            const origLine = origLines.length
            const origCol = origLines[origLines.length - 1]?.length ?? 0

            // Step 3: Find the transformed position for that original line/column
            const transLines = transSrc.split('\n')
            let transPos = 0
            for (let i = 0; i < origLine - 1 && i < transLines.length; i++) {
              transPos += (transLines[i]?.length ?? 0) + 1 // +1 for newline
            }
            transPos += Math.min(origCol, transLines[origLine - 1]?.length ?? 0)

            return {
              ...def,
              textSpan: { start: transPos, length: transformedSpan.length }
            }
          })
        }
      }

      const value = target[prop as keyof ts.LanguageService]
      if (typeof value === 'function') {
        return (value as Function).bind(target)
      }
      return value
    }
  })

  console.log('[effect-sugar] Proxy language service created with IntelliSense support')
  return proxy as ts.LanguageService
}

function init(_modules: { typescript: typeof ts }) {
  return { create }
}

export = init
