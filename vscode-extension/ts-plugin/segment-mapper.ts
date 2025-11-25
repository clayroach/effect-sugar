/**
 * Segment-Based Position Mapper
 *
 * Provides precise character-level position mapping between original and transformed source.
 * Uses segments to track where each piece of original code maps to in the transformed output.
 */

/**
 * A segment represents a contiguous range that maps between original and generated source.
 * Segments can represent:
 * - Unchanged text (same length, but potentially different positions)
 * - Transformed text (different lengths, e.g., "gen {" → "Effect.gen(function* () {")
 */
export interface Segment {
  /** Start position in original source (inclusive) */
  originalStart: number
  /** End position in original source (exclusive) */
  originalEnd: number
  /** Start position in generated source (inclusive) */
  generatedStart: number
  /** End position in generated source (exclusive) */
  generatedEnd: number
  /** Type of segment for debugging */
  type?:
    | 'gen-wrapper'
    | 'bind-var'
    | 'bind-arrow'
    | 'bind-expr'
    | 'let'
    | 'close-brace'
    | 'unchanged'
}

/**
 * Position mapper interface for bidirectional mapping between original and transformed positions.
 */
export interface SegmentMapper {
  /** Map a position from original source to transformed source */
  originalToTransformed(position: number): number
  /** Map a position from transformed source back to original source */
  transformedToOriginal(position: number): number
  /** Get all segments for debugging */
  getSegments(): readonly Segment[]
}

/**
 * Create a segment-based position mapper from original source, transformed source, and tracked segments.
 */
export function createSegmentMapper(
  original: string,
  transformed: string,
  segments: Segment[]
): SegmentMapper {
  // Sort segments by original position for efficient lookup
  const sortedByOrig = [...segments].sort((a, b) => a.originalStart - b.originalStart)
  // Sort segments by generated position for reverse lookup
  const sortedByGen = [...segments].sort((a, b) => a.generatedStart - b.generatedStart)

  /**
   * Binary search to find segment containing an original position.
   * Returns null if position is not within any segment.
   */
  function findSegmentByOrigPos(pos: number): Segment | null {
    let left = 0
    let right = sortedByOrig.length - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const seg = sortedByOrig[mid]

      if (seg) {
        if (pos >= seg.originalStart && pos < seg.originalEnd) {
          return seg
        } else if (pos < seg.originalStart) {
          right = mid - 1
        } else {
          left = mid + 1
        }
      } else {
        break
      }
    }

    return null
  }

  /**
   * Binary search to find segment containing a generated position.
   * Returns null if position is not within any segment.
   */
  function findSegmentByGenPos(pos: number): Segment | null {
    let left = 0
    let right = sortedByGen.length - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const seg = sortedByGen[mid]

      if (seg) {
        if (pos >= seg.generatedStart && pos < seg.generatedEnd) {
          return seg
        } else if (pos < seg.generatedStart) {
          right = mid - 1
        } else {
          left = mid + 1
        }
      } else {
        break
      }
    }

    return null
  }

  /**
   * Find the segment that ends at or before the given original position.
   * Used for calculating cumulative offset for positions between segments.
   */
  function findPrecedingSegmentByOrigPos(pos: number): Segment | null {
    let preceding: Segment | null = null

    for (const seg of sortedByOrig) {
      if (seg.originalEnd <= pos) {
        preceding = seg
      } else {
        break
      }
    }

    return preceding
  }

  /**
   * Find the segment that ends at or before the given generated position.
   * Used for calculating cumulative offset for positions between segments.
   */
  function findPrecedingSegmentByGenPos(pos: number): Segment | null {
    let preceding: Segment | null = null

    for (const seg of sortedByGen) {
      if (seg.generatedEnd <= pos) {
        preceding = seg
      } else {
        break
      }
    }

    return preceding
  }

  return {
    originalToTransformed(pos: number): number {
      // Edge case: position at or beyond end of original
      if (pos >= original.length) {
        const lastSeg = sortedByOrig[sortedByOrig.length - 1]
        if (lastSeg) {
          const offset = lastSeg.generatedEnd - lastSeg.originalEnd
          return pos + offset
        }
        return pos
      }

      // Try to find segment containing this position
      const seg = findSegmentByOrigPos(pos)
      if (seg) {
        // Position is within a tracked segment
        const originalLength = seg.originalEnd - seg.originalStart
        const generatedLength = seg.generatedEnd - seg.generatedStart

        if (originalLength === 0) {
          // Zero-length original segment (insertion) - map to start
          return seg.generatedStart
        }

        // Linear interpolation within segment
        const relativePos = pos - seg.originalStart
        const ratio = generatedLength / originalLength
        return seg.generatedStart + Math.round(relativePos * ratio)
      }

      // Position is between segments - calculate offset from preceding segment
      const preceding = findPrecedingSegmentByOrigPos(pos)
      if (preceding) {
        // Calculate the cumulative offset at the end of the preceding segment
        const offset = preceding.generatedEnd - preceding.originalEnd
        return pos + offset
      }

      // Before any segment - no offset
      return pos
    },

    transformedToOriginal(pos: number): number {
      // Edge case: position at or beyond end of transformed
      if (pos >= transformed.length) {
        const lastSeg = sortedByGen[sortedByGen.length - 1]
        if (lastSeg) {
          const offset = lastSeg.generatedEnd - lastSeg.originalEnd
          return pos - offset
        }
        return pos
      }

      // Try to find segment containing this position
      const seg = findSegmentByGenPos(pos)
      if (seg) {
        // Position is within a tracked segment
        const originalLength = seg.originalEnd - seg.originalStart
        const generatedLength = seg.generatedEnd - seg.generatedStart

        if (generatedLength === 0) {
          // Zero-length generated segment (deletion) - map to start
          return seg.originalStart
        }

        // Linear interpolation within segment
        const relativePos = pos - seg.generatedStart
        const ratio = originalLength / generatedLength
        return seg.originalStart + Math.round(relativePos * ratio)
      }

      // Position is between segments - calculate offset from preceding segment
      const preceding = findPrecedingSegmentByGenPos(pos)
      if (preceding) {
        // Calculate the cumulative offset at the end of the preceding segment
        const offset = preceding.generatedEnd - preceding.originalEnd
        return pos - offset
      }

      // Before any segment - no offset
      return pos
    },

    getSegments(): readonly Segment[] {
      return sortedByOrig
    }
  }
}

/**
 * Create an identity mapper (no transformation).
 * Used when source has no gen blocks.
 */
export function createIdentityMapper(source: string): SegmentMapper {
  return {
    originalToTransformed(pos: number): number {
      return pos
    },
    transformedToOriginal(pos: number): number {
      return pos
    },
    getSegments(): readonly Segment[] {
      return []
    }
  }
}
