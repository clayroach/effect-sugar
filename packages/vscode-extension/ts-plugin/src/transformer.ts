/**
 * Source Transformation Module
 *
 * Handles transformation of gen { } blocks to Effect.gen() with precise position tracking.
 * Builds segment mappings incrementally as transformations are applied.
 */

import MagicString from 'magic-string'
import {
  hasGenBlocks as scannerHasGenBlocks,
  findGenBlocks as scannerFindGenBlocks,
  transformBlockContent as scannerTransformBlockContent
} from './scanner.js'
import { PositionMapper, type SourceMapData } from './position-mapper.js'

export interface TransformResult {
  transformed: string
  original: string
  positionMapper: PositionMapper
  hasChanges: boolean
  genBlocks: Array<{ start: number; end: number }>
}

// Re-export for backwards compatibility
export type PositionMapping = PositionMapper

// Re-export scanner functions (with adapter for ts-plugin interface)
export const hasGenBlocks = scannerHasGenBlocks

export function findGenBlocks(
  source: string
): Array<{ start: number; end: number; blockContent: string }> {
  // Use scanner's findGenBlocks and adapt to ts-plugin interface
  const blocks = scannerFindGenBlocks(source)
  return blocks.map(block => ({
    start: block.start,
    end: block.end,
    blockContent: block.content
  }))
}

/**
 * Parse bind statement: "  user <- getUser(1);"
 * Returns positions relative to the statement start.
 */
interface ParsedBind {
  type: 'bind'
  varName: string
  expression: string
  indent: string
  // Positions relative to statement start
  varStart: number
  varEnd: number
  arrowStart: number
  arrowEnd: number
  exprStart: number
  exprEnd: number
  hasSemicolon: boolean
  fullLength: number
}

/**
 * Parse let statement: "  let name = expr;"
 */
interface ParsedLet {
  type: 'let'
  varName: string
  expression: string
  indent: string
  varStart: number
  varEnd: number
  hasSemicolon: boolean
  fullLength: number
}

type ParsedStatement = ParsedBind | ParsedLet | { type: 'other'; content: string }

function parseBindStatement(line: string): ParsedBind | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^(\w+)\s*(<-)\s*(.+)$/)
  if (!match) return null

  const varName = match[1]
  const exprWithSemi = match[3]
  if (!varName || !exprWithSemi) return null

  const indent = line.match(/^\s*/)?.[0] || ''
  const hasSemicolon = exprWithSemi.trimEnd().endsWith(';')
  const expression = exprWithSemi.replace(/;?\s*$/, '')

  const varStart = indent.length
  const varEnd = varStart + varName.length
  const arrowStart = line.indexOf('<-')
  const arrowEnd = arrowStart + 2

  // Find expression start (after arrow and whitespace)
  let exprStart = arrowEnd
  while (exprStart < line.length) {
    const char = line[exprStart]
    if (!char || !/\s/.test(char)) break
    exprStart++
  }
  const exprEnd = hasSemicolon ? line.length - 1 : line.length

  return {
    type: 'bind',
    varName,
    expression,
    indent,
    varStart,
    varEnd,
    arrowStart,
    arrowEnd,
    exprStart,
    exprEnd,
    hasSemicolon,
    fullLength: line.length
  }
}

function parseLetStatement(line: string): ParsedLet | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^let\s+(\w+)\s*=\s*(.+)$/)
  if (!match) return null

  const varName = match[1]
  const exprWithSemi = match[2]
  if (!varName || !exprWithSemi) return null

  const indent = line.match(/^\s*/)?.[0] || ''
  const hasSemicolon = exprWithSemi.trimEnd().endsWith(';')
  const expression = exprWithSemi.replace(/;?\s*$/, '')

  // "let " is 4 chars
  const varStart = indent.length + 4
  const varEnd = varStart + varName.length

  return {
    type: 'let',
    varName,
    expression,
    indent,
    varStart,
    varEnd,
    hasSemicolon,
    fullLength: line.length
  }
}

export function transformSource(source: string, filename: string = 'unknown.ts'): TransformResult {
  if (!hasGenBlocks(source)) {
    // Create identity mapper for unchanged source
    const identityMap: SourceMapData = {
      version: 3,
      sources: [filename],
      names: [],
      mappings: ''
    }
    return {
      transformed: source,
      original: source,
      positionMapper: new PositionMapper(identityMap, filename, source, source),
      hasChanges: false,
      genBlocks: []
    }
  }

  const genBlocks = findGenBlocks(source)
  const s = new MagicString(source)

  // Process each gen block using MagicString overwrite
  for (const block of genBlocks.reverse()) {
    const openBracePos = source.indexOf('{', block.start)

    // 1. Transform "gen {" -> "Effect.gen(function* () {"
    s.overwrite(block.start, openBracePos + 1, 'Effect.gen(function* () {')

    // 2. Process content inside the block line by line
    const contentStart = openBracePos + 1
    const contentEnd = block.end - 1
    const blockContent = source.slice(contentStart, contentEnd)
    const lines = blockContent.split('\n')

    let lineOffset = contentStart

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const lineStart = lineOffset
      const lineEnd = lineOffset + line.length

      // Try to parse as bind statement
      const bindParsed = parseBindStatement(line)
      if (bindParsed) {
        // Transform: "  user <- getUser(1);" -> "  const user = yield* getUser(1);"
        const newLine = `${bindParsed.indent}const ${bindParsed.varName} = yield* ${bindParsed.expression}${bindParsed.hasSemicolon ? ';' : ''}`
        s.overwrite(lineStart, lineEnd, newLine)

        lineOffset = lineEnd
        if (i < lines.length - 1) {
          lineOffset += 1 // for newline
        }
        continue
      }

      // Try to parse as let statement
      const letParsed = parseLetStatement(line)
      if (letParsed) {
        // Transform: "  let name = expr;" -> "  const name = expr;"
        const newLine = `${letParsed.indent}const ${letParsed.varName} = ${letParsed.expression}${letParsed.hasSemicolon ? ';' : ''}`
        s.overwrite(lineStart, lineEnd, newLine)

        lineOffset = lineEnd
        if (i < lines.length - 1) {
          lineOffset += 1
        }
        continue
      }

      // Unchanged line - no overwrite needed
      lineOffset = lineEnd
      if (i < lines.length - 1) {
        lineOffset += 1
      }
    }

    // 3. Transform closing "}" -> "})"
    s.overwrite(block.end - 1, block.end, '})')
  }

  const transformed = s.toString()
  const sourceMap = s.generateMap({
    source: filename,
    includeContent: true,
    hires: true
  }) as SourceMapData

  return {
    transformed,
    original: source,
    positionMapper: new PositionMapper(sourceMap, filename, source, transformed),
    hasChanges: true,
    genBlocks
  }
}

export function transformSourceSafe(source: string, filename: string = 'unknown.ts'): TransformResult {
  try {
    return transformSource(source, filename)
  } catch (error) {
    const err = error as Error
    console.error('[effect-sugar] Transformation failed:', err.message)

    const identityMap: SourceMapData = {
      version: 3,
      sources: [filename],
      names: [],
      mappings: ''
    }

    return {
      transformed: source,
      original: source,
      positionMapper: new PositionMapper(identityMap, filename, source, source),
      hasChanges: false,
      genBlocks: []
    }
  }
}

export function getTransformInfo(source: string): {
  hasGenBlocks: boolean
  genBlockCount: number
  genBlocks: Array<{ start: number; end: number }>
} {
  const genBlocks = hasGenBlocks(source) ? findGenBlocks(source) : []

  return {
    hasGenBlocks: genBlocks.length > 0,
    genBlockCount: genBlocks.length,
    genBlocks
  }
}
