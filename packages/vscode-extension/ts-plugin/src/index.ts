/**
 * TypeScript Language Service Plugin for Effect Sugar
 *
 * Provides full IntelliSense support for gen { } blocks
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

  function getPositionMapper(fileName: string) {
    const state = getTransformState(fileName)
    if (!state) {
      return null
    }

    const result = transformSourceSafe(state.original, fileName)
    if (!result.hasChanges) {
      return null
    }

    return result.positionMapper
  }

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
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return target.getQuickInfoAtPosition(fileName, position)
          }

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
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return target.getCompletionsAtPosition(fileName, position, options)
          }

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
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return target.getDefinitionAndBoundSpan(fileName, position)
          }

          const mappedPosition = positionMapper.originalToTransformed(position)
          const result = target.getDefinitionAndBoundSpan(fileName, mappedPosition)

          if (!result) {
            return undefined
          }

          // Map the textSpan back to original coordinates
          const originalTextSpanStart = positionMapper.transformedToOriginal(result.textSpan.start)
          const originalTextSpanEnd = positionMapper.transformedToOriginal(
            result.textSpan.start + result.textSpan.length
          )

          // Map definitions if they're in the same file
          const mappedDefinitions = result.definitions?.map((def) => {
            if (def.fileName === fileName) {
              const origStart = positionMapper.transformedToOriginal(def.textSpan.start)
              const origEnd = positionMapper.transformedToOriginal(
                def.textSpan.start + def.textSpan.length
              )
              return {
                ...def,
                textSpan: {
                  start: origStart,
                  length: origEnd - origStart
                }
              }
            }
            return def
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
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return target.getDefinitionAtPosition(fileName, position)
          }

          const mappedPosition = positionMapper.originalToTransformed(position)
          const definitions = target.getDefinitionAtPosition(fileName, mappedPosition)

          if (!definitions) {
            return undefined
          }

          return definitions.map((def) => {
            if (def.fileName === fileName) {
              const originalStart = positionMapper.transformedToOriginal(def.textSpan.start)
              const originalEnd = positionMapper.transformedToOriginal(
                def.textSpan.start + def.textSpan.length
              )
              return {
                ...def,
                textSpan: {
                  start: originalStart,
                  length: originalEnd - originalStart
                }
              }
            }
            return def
          })
        }
      }

      // Type definition
      if (prop === 'getTypeDefinitionAtPosition') {
        return (fileName: string, position: number): readonly ts.DefinitionInfo[] | undefined => {
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return target.getTypeDefinitionAtPosition(fileName, position)
          }

          const mappedPosition = positionMapper.originalToTransformed(position)
          const typeDefs = target.getTypeDefinitionAtPosition(fileName, mappedPosition)

          if (!typeDefs) {
            return undefined
          }

          return typeDefs.map((def) => {
            if (def.fileName === fileName) {
              const originalStart = positionMapper.transformedToOriginal(def.textSpan.start)
              const originalEnd = positionMapper.transformedToOriginal(
                def.textSpan.start + def.textSpan.length
              )
              return {
                ...def,
                textSpan: {
                  start: originalStart,
                  length: originalEnd - originalStart
                }
              }
            }
            return def
          })
        }
      }

      // Semantic classification (encoded triplet format)
      if (prop === 'getEncodedSemanticClassifications') {
        return (
          fileName: string,
          span: ts.TextSpan,
          format: ts.SemanticClassificationFormat
        ) => {
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return target.getEncodedSemanticClassifications(fileName, span, format)
          }

          // Map span to transformed coordinates
          const transformedStart = positionMapper.originalToTransformed(span.start)
          const transformedEnd = positionMapper.originalToTransformed(span.start + span.length)
          const mappedSpan = {
            start: transformedStart,
            length: transformedEnd - transformedStart
          }

          const classifications = target.getEncodedSemanticClassifications(
            fileName,
            mappedSpan,
            format
          )

          // Map classification spans back to original
          if (classifications.spans) {
            const mappedSpans: number[] = []
            // Encoded format: [start, length, classification] triplets
            for (let i = 0; i < classifications.spans.length; i += 3) {
              const start = classifications.spans[i] ?? 0
              const length = classifications.spans[i + 1] ?? 0
              const classification = classifications.spans[i + 2] ?? 0

              const originalStart = positionMapper.transformedToOriginal(start)
              const originalEnd = positionMapper.transformedToOriginal(start + length)

              mappedSpans.push(originalStart, originalEnd - originalStart, classification)
            }

            return { ...classifications, spans: mappedSpans }
          }

          return classifications
        }
      }

      // Semantic classification (object array format)
      if (prop === 'getSemanticClassifications') {
        return (
          fileName: string,
          span: ts.TextSpan,
          format?: ts.SemanticClassificationFormat
        ) => {
          const positionMapper = getPositionMapper(fileName)

          if (!positionMapper) {
            return format !== undefined
              ? target.getSemanticClassifications(fileName, span, format)
              : target.getSemanticClassifications(fileName, span)
          }

          // Map span to transformed
          const transformedStart = positionMapper.originalToTransformed(span.start)
          const transformedEnd = positionMapper.originalToTransformed(span.start + span.length)
          const mappedSpan = {
            start: transformedStart,
            length: transformedEnd - transformedStart
          }

          const classifications = format !== undefined
            ? target.getSemanticClassifications(fileName, mappedSpan, format)
            : target.getSemanticClassifications(fileName, mappedSpan)

          // Map spans back to original
          if (Array.isArray(classifications)) {
            return classifications.map((c: any) => {
              const originalStart = positionMapper.transformedToOriginal(c.textSpan.start)
              const originalEnd = positionMapper.transformedToOriginal(c.textSpan.start + c.textSpan.length)

              return {
                ...c,
                textSpan: { start: originalStart, length: originalEnd - originalStart }
              }
            })
          }

          return classifications
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

function init(modules: { typescript: typeof ts }) {
  return { create }
}

export = init
