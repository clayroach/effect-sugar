/**
 * Position Mapper using @jridgewell/trace-mapping
 *
 * Provides bidirectional position mapping between original and transformed source
 * using industry-standard source maps instead of custom segment-based tracking.
 */

import { TraceMap, originalPositionFor, generatedPositionFor } from '@jridgewell/trace-mapping'

export interface SourceMapData {
  version: number
  file?: string
  sources: string[]
  sourcesContent?: Array<string | null>
  names: string[]
  mappings: string
}

/**
 * Position mapper using TraceMap for accurate bidirectional position mapping.
 * Converts between absolute character positions and line/column coordinates.
 */
export class PositionMapper {
  private readonly tracer: TraceMap
  private readonly filename: string
  private readonly originalSource: string
  private readonly transformedSource: string

  constructor(
    sourceMap: SourceMapData,
    filename: string,
    originalSource: string,
    transformedSource: string
  ) {
    this.tracer = new TraceMap(sourceMap as any)
    this.filename = filename
    this.originalSource = originalSource
    this.transformedSource = transformedSource
  }

  /**
   * Convert absolute character position to line/column coordinates.
   * Line numbers are 1-based, columns are 0-based (TraceMap convention).
   */
  private positionToLineColumn(source: string, pos: number): { line: number; column: number } {
    const lines = source.slice(0, pos).split('\n')
    return {
      line: lines.length,
      column: lines[lines.length - 1]?.length ?? 0
    }
  }

  /**
   * Convert line/column coordinates to absolute character position.
   * Line numbers are 1-based, columns are 0-based.
   */
  private lineColumnToPosition(source: string, line: number, column: number): number {
    const lines = source.split('\n')
    let pos = 0

    // Accumulate length of all lines before target line
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      pos += (lines[i]?.length ?? 0) + 1 // +1 for newline
    }

    // Add column offset
    return pos + column
  }

  /**
   * Map position from original source to transformed source.
   */
  originalToTransformed(pos: number): number {
    const { line, column } = this.positionToLineColumn(this.originalSource, pos)

    const generated = generatedPositionFor(this.tracer, {
      source: this.filename,
      line,
      column
    })

    if (generated.line === null || generated.column === null) {
      // Fallback: return position as-is if mapping fails
      return pos
    }

    return this.lineColumnToPosition(this.transformedSource, generated.line, generated.column)
  }

  /**
   * Map position from transformed source back to original source.
   */
  transformedToOriginal(pos: number): number {
    const { line, column } = this.positionToLineColumn(this.transformedSource, pos)

    const original = originalPositionFor(this.tracer, { line, column })

    if (original.line === null || original.column === null) {
      // Fallback: return position as-is if mapping fails
      return pos
    }

    return this.lineColumnToPosition(this.originalSource, original.line, original.column)
  }

  /**
   * Get the original source text.
   */
  getOriginalSource(): string {
    return this.originalSource
  }

  /**
   * Get the transformed source text.
   */
  getTransformedSource(): string {
    return this.transformedSource
  }

  /**
   * Get segments for debugging (compatibility method).
   * Returns empty array since we use source maps instead of segments.
   */
  getSegments(): readonly any[] {
    return []
  }
}
