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
import {
  createSegmentMapper,
  createIdentityMapper,
  Segment,
  SegmentMapper
} from './segment-mapper.js'

export interface TransformResult {
  transformed: string
  original: string
  positionMapper: SegmentMapper
  hasChanges: boolean
  genBlocks: Array<{ start: number; end: number }>
}

// Re-export for backwards compatibility
export type PositionMapping = SegmentMapper

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

export function transformSource(source: string): TransformResult {
  if (!hasGenBlocks(source)) {
    return {
      transformed: source,
      original: source,
      positionMapper: createIdentityMapper(source),
      hasChanges: false,
      genBlocks: []
    }
  }

  const genBlocks = findGenBlocks(source)
  const segments: Segment[] = []

  // Build transformed source manually to track exact positions
  let result = ''
  let lastEnd = 0
  let cumulativeOffset = 0 // How much the generated position differs from original

  for (const block of genBlocks) {
    // Copy content before this block
    result += source.slice(lastEnd, block.start)

    const openBracePos = source.indexOf('{', block.start)

    // 1. Transform "gen {" -> "Effect.gen(function* () {"
    const genWrapperOrig = source.slice(block.start, openBracePos + 1)
    const genWrapperNew = 'Effect.gen(function* () {'

    const genWrapperOrigStart = block.start
    const genWrapperOrigEnd = openBracePos + 1
    const genWrapperGenStart = result.length

    result += genWrapperNew

    const genWrapperGenEnd = result.length

    segments.push({
      originalStart: genWrapperOrigStart,
      originalEnd: genWrapperOrigEnd,
      generatedStart: genWrapperGenStart,
      generatedEnd: genWrapperGenEnd,
      type: 'gen-wrapper'
    })

    cumulativeOffset = genWrapperGenEnd - genWrapperOrigEnd

    // 2. Process content inside the block line by line
    const contentStart = openBracePos + 1
    const contentEnd = block.end - 1
    const blockContent = source.slice(contentStart, contentEnd)
    const lines = blockContent.split('\n')

    let lineOffset = contentStart // Position in original source

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const lineOrigStart = lineOffset

      // Try to parse as bind statement
      const bindParsed = parseBindStatement(line)
      if (bindParsed) {
        // Transform: "  user <- getUser(1);" -> "  const user = yield* getUser(1);"
        const newLine = `${bindParsed.indent}const ${bindParsed.varName} = yield* ${bindParsed.expression}${bindParsed.hasSemicolon ? ';' : ''}`

        const lineGenStart = result.length
        result += newLine

        // Track variable name segment
        // Original: indent + varName
        // Generated: indent + "const " + varName
        const origVarStart = lineOrigStart + bindParsed.varStart
        const origVarEnd = lineOrigStart + bindParsed.varEnd
        const genVarStart = lineGenStart + bindParsed.indent.length + 6 // "const "
        const genVarEnd = genVarStart + bindParsed.varName.length

        segments.push({
          originalStart: origVarStart,
          originalEnd: origVarEnd,
          generatedStart: genVarStart,
          generatedEnd: genVarEnd,
          type: 'bind-var'
        })

        // Track expression segment
        // Original: after "<- "
        // Generated: after "= yield* "
        const origExprStart = lineOrigStart + bindParsed.exprStart
        const origExprEnd = origExprStart + bindParsed.expression.length
        const genExprStart = genVarEnd + 10 // " = yield* "
        const genExprEnd = genExprStart + bindParsed.expression.length

        segments.push({
          originalStart: origExprStart,
          originalEnd: origExprEnd,
          generatedStart: genExprStart,
          generatedEnd: genExprEnd,
          type: 'bind-expr'
        })

        lineOffset += line.length
        if (i < lines.length - 1) {
          result += '\n'
          lineOffset += 1 // for newline
        }
        continue
      }

      // Try to parse as let statement
      const letParsed = parseLetStatement(line)
      if (letParsed) {
        // Transform: "  let name = expr;" -> "  const name = expr;"
        const newLine = `${letParsed.indent}const ${letParsed.varName} = ${letParsed.expression}${letParsed.hasSemicolon ? ';' : ''}`

        const lineGenStart = result.length
        result += newLine

        // Track variable name segment
        // Original: indent + "let " + varName
        // Generated: indent + "const " + varName
        const origVarStart = lineOrigStart + letParsed.varStart
        const origVarEnd = lineOrigStart + letParsed.varEnd
        const genVarStart = lineGenStart + letParsed.indent.length + 6 // "const "
        const genVarEnd = genVarStart + letParsed.varName.length

        segments.push({
          originalStart: origVarStart,
          originalEnd: origVarEnd,
          generatedStart: genVarStart,
          generatedEnd: genVarEnd,
          type: 'let'
        })

        lineOffset += line.length
        if (i < lines.length - 1) {
          result += '\n'
          lineOffset += 1
        }
        continue
      }

      // Unchanged line - copy as-is
      result += line
      lineOffset += line.length
      if (i < lines.length - 1) {
        result += '\n'
        lineOffset += 1
      }
    }

    // 3. Transform closing "}" -> "})"
    const closeBraceOrigStart = block.end - 1
    const closeBraceOrigEnd = block.end
    const closeBraceGenStart = result.length

    result += '})'

    const closeBraceGenEnd = result.length

    segments.push({
      originalStart: closeBraceOrigStart,
      originalEnd: closeBraceOrigEnd,
      generatedStart: closeBraceGenStart,
      generatedEnd: closeBraceGenEnd,
      type: 'close-brace'
    })

    lastEnd = block.end
  }

  // Copy any remaining content after the last block
  result += source.slice(lastEnd)

  return {
    transformed: result,
    original: source,
    positionMapper: createSegmentMapper(source, result, segments),
    hasChanges: result !== source,
    genBlocks
  }
}

export function transformSourceSafe(source: string): TransformResult {
  try {
    return transformSource(source)
  } catch (error) {
    const err = error as Error
    console.error('[effect-sugar] Transformation failed:', err.message)

    return {
      transformed: source,
      original: source,
      positionMapper: createIdentityMapper(source),
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
