/**
 * TypeScript Language Service Plugin for Effect Sugar
 *
 * Provides full IntelliSense support for gen { } blocks
 */

import * as ts from 'typescript/lib/tsserverlibrary'
import {
  createWrappedLanguageServiceHost,
  type WrappedHostResult
} from './language-service-host-wrapper.js'
import { getOriginalSource, getTransformedSource, getPositionMapper } from './position-mapper.js'
import { findGenBlocks } from './transformer.js'

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

  // Wrap the language service host for gen-block transformation
  let genBlockHostResult: WrappedHostResult | undefined
  try {
    genBlockHostResult = createWrappedLanguageServiceHost({
      typescript: ts,
      host: info.languageServiceHost,
      log: (msg) => console.log(`[effect-sugar] ${msg}`)
    })

    // Replace the host's getScriptSnapshot with our wrapped version
    ;(info.languageServiceHost as any).getScriptSnapshot = (fileName: string) => {
      return genBlockHostResult!.wrappedHost.getScriptSnapshot?.(fileName)
    }

    console.log('[effect-sugar] Gen-block transformation enabled')
  } catch (e) {
    console.log('[effect-sugar] Gen-block transformation disabled:', e)
  }

  const ls = info.languageService

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
      if (!genBlockHostResult) {
        const value = target[prop as keyof ts.LanguageService]
        if (typeof value === 'function') {
          return (value as Function).bind(target)
        }
        return value
      }

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
          // Map position for gen-block files (original → transformed)
          let mappedPosition = position
          const isGenBlock = genBlockHostResult.isTransformed(fileName)

          if (isGenBlock) {
            mappedPosition = genBlockHostResult.mapToTransformed(fileName, position)
          }

          const applicableDefinition = target.getDefinitionAndBoundSpan(fileName, mappedPosition)

          // Map textSpan (highlight at click location) back to original coordinates
          // This is used for underlining during hover, which happens in the original source display
          if (isGenBlock && applicableDefinition?.textSpan) {
            applicableDefinition.textSpan = genBlockHostResult.mapSpanToOriginal(
              fileName,
              applicableDefinition.textSpan
            )
          }

          // Map definition textSpans using a hybrid approach:
          // - Get the ORIGINAL line/column for correct line AND column navigation
          // - Then find the transformed position for that original line/column
          // This ensures TypeScript's position→line/column conversion gives the right result
          // (TypeScript's sourceFile contains transformed source, so we need positions that
          // when converted to line/column give the original source coordinates)
          if (applicableDefinition?.definitions) {
            applicableDefinition.definitions = applicableDefinition.definitions.map((def) => {
              if (!genBlockHostResult.isTransformed(def.fileName)) {
                return def
              }

              const transformedSpan = def.textSpan
              const origSrc = genBlockHostResult.getOriginalSource(def.fileName)
              const transSrc = genBlockHostResult.getTransformedSource(def.fileName)

              if (!origSrc || !transSrc) {
                return def
              }

              // Step 1: Map transformed position to original position
              const originalPos = genBlockHostResult.mapToOriginal(def.fileName, transformedSpan.start)

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

          return applicableDefinition
        }
      }

      // Go-to-definition (alternative API)
      if (prop === 'getDefinitionAtPosition') {
        return (fileName: string, position: number): readonly ts.DefinitionInfo[] | undefined => {
          // Map position for gen-block files (original → transformed)
          let mappedPosition = position
          const isGenBlock = genBlockHostResult.isTransformed(fileName)

          if (isGenBlock) {
            mappedPosition = genBlockHostResult.mapToTransformed(fileName, position)
          }

          const definitions = target.getDefinitionAtPosition(fileName, mappedPosition)

          if (!definitions) {
            return undefined
          }

          // Apply hybrid approach to map definition positions
          return definitions.map((def) => {
            if (!genBlockHostResult.isTransformed(def.fileName)) {
              return def
            }

            const transformedSpan = def.textSpan
            const origSrc = genBlockHostResult.getOriginalSource(def.fileName)
            const transSrc = genBlockHostResult.getTransformedSource(def.fileName)

            if (!origSrc || !transSrc) {
              return def
            }

            // Step 1: Map transformed position to original position
            const originalPos = genBlockHostResult.mapToOriginal(def.fileName, transformedSpan.start)

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
          // Map position for gen-block files (original → transformed)
          let mappedPosition = position
          const isGenBlock = genBlockHostResult.isTransformed(fileName)

          if (isGenBlock) {
            mappedPosition = genBlockHostResult.mapToTransformed(fileName, position)
          }

          const typeDefs = target.getTypeDefinitionAtPosition(fileName, mappedPosition)

          if (!typeDefs) {
            return undefined
          }

          // Apply hybrid approach to map definition positions
          return typeDefs.map((def) => {
            if (!genBlockHostResult.isTransformed(def.fileName)) {
              return def
            }

            const transformedSpan = def.textSpan
            const origSrc = genBlockHostResult.getOriginalSource(def.fileName)
            const transSrc = genBlockHostResult.getTransformedSource(def.fileName)

            if (!origSrc || !transSrc) {
              return def
            }

            // Step 1: Map transformed position to original position
            const originalPos = genBlockHostResult.mapToOriginal(def.fileName, transformedSpan.start)

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

      // Semantic classification for syntax highlighting
      if (prop === 'getEncodedSemanticClassifications') {
        return (
          fileName: string,
          span: ts.TextSpan,
          format?: ts.SemanticClassificationFormat
        ) => {
          // Map span for gen-block files (original → transformed)
          let mappedSpan = span
          const isGenBlock = genBlockHostResult?.isTransformed(fileName)

          if (isGenBlock) {
            const transformedStart = genBlockHostResult!.mapToTransformed(fileName, span.start)
            const transformedEnd = genBlockHostResult!.mapToTransformed(
              fileName,
              span.start + span.length
            )
            mappedSpan = {
              start: transformedStart,
              length: transformedEnd - transformedStart
            }
          }

          const classifications =
            format !== undefined
              ? target.getEncodedSemanticClassifications(fileName, mappedSpan, format)
              : target.getEncodedSemanticClassifications(fileName, mappedSpan)

          // Map classification spans back to original coordinates
          if (isGenBlock && classifications.spans) {
            const mappedSpans: number[] = []
            // Encoded format: [start, length, classification] triplets
            for (let i = 0; i < classifications.spans.length; i += 3) {
              const start = classifications.spans[i]
              const length = classifications.spans[i + 1]
              const classification = classifications.spans[i + 2]

              if (start === undefined || length === undefined || classification === undefined) {
                continue
              }

              // Map the span back to original coordinates
              const originalStart = genBlockHostResult.mapToOriginal(fileName, start)
              const originalEnd = genBlockHostResult.mapToOriginal(fileName, start + length)

              mappedSpans.push(originalStart, originalEnd - originalStart, classification)
            }

            return {
              ...classifications,
              spans: mappedSpans
            }
          }

          return classifications
        }
      }

      if (prop === 'getSemanticClassifications') {
        // Return a function that handles both overloads
        function getSemanticClassificationsProxy(
          fileName: string,
          span: ts.TextSpan
        ): ts.ClassifiedSpan[]
        function getSemanticClassificationsProxy(
          fileName: string,
          span: ts.TextSpan,
          format: ts.SemanticClassificationFormat
        ): ts.ClassifiedSpan[] | ts.ClassifiedSpan2020[]
        function getSemanticClassificationsProxy(
          fileName: string,
          span: ts.TextSpan,
          format?: ts.SemanticClassificationFormat
        ): ts.ClassifiedSpan[] | ts.ClassifiedSpan2020[] {
          // Helper to map a single classification span
          const mapClassificationSpan = <T extends { textSpan: ts.TextSpan }>(
            classification: T
          ): T => {
            const originalStart = genBlockHostResult!.mapToOriginal(
              fileName,
              classification.textSpan.start
            )
            const originalEnd = genBlockHostResult!.mapToOriginal(
              fileName,
              classification.textSpan.start + classification.textSpan.length
            )
            return {
              ...classification,
              textSpan: {
                start: originalStart,
                length: originalEnd - originalStart
              }
            }
          }

          // Map span for gen-block files (original → transformed)
          let mappedSpan = span
          const isGenBlock = genBlockHostResult?.isTransformed(fileName)

          if (isGenBlock) {
            const transformedStart = genBlockHostResult!.mapToTransformed(fileName, span.start)
            const transformedEnd = genBlockHostResult!.mapToTransformed(
              fileName,
              span.start + span.length
            )
            mappedSpan = {
              start: transformedStart,
              length: transformedEnd - transformedStart
            }
          }

          if (format !== undefined) {
            const classifications = target.getSemanticClassifications(fileName, mappedSpan, format)

            if (isGenBlock) {
              // Check if it's ClassifiedSpan2020[] by checking classificationType type
              const first = classifications[0]
              if (first && typeof first.classificationType === 'number') {
                return (classifications as ts.ClassifiedSpan2020[]).map(mapClassificationSpan)
              }
              return (classifications as ts.ClassifiedSpan[]).map(mapClassificationSpan)
            }

            return classifications
          }

          // Without format parameter, always returns ClassifiedSpan[]
          const classifications = target.getSemanticClassifications(fileName, mappedSpan)

          if (isGenBlock) {
            return classifications.map(mapClassificationSpan)
          }

          return classifications
        }

        return getSemanticClassificationsProxy
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
