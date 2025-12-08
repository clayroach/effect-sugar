import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PositionMapper,
  cacheTransformation,
  getCachedTransformation,
  getPositionMapper,
  clearCachedTransformation,
  clearAllCachedTransformations,
  mapTransformedToOriginal,
  mapOriginalToTransformed,
  mapTextSpan,
  mapTextSpanToTransformed,
  isTransformedFile,
  getOriginalSource,
  getTransformedSource,
  type SourceMapData
} from '../src/position-mapper.js'
import { transformSource } from '../src/transformer.js'

describe('PositionMapper', () => {
  const simpleSource = `const result = gen {
  user <- getUser()
  return user
}`

  let mapper: PositionMapper

  beforeEach(() => {
    const transformed = transformSource(simpleSource, 'test.ts')
    expect(transformed.map).not.toBeNull()
    mapper = new PositionMapper(
      transformed.map as SourceMapData,
      'test.ts',
      simpleSource,
      transformed.code
    )
  })

  describe('positionToLineColumn', () => {
    it('converts position 0 to line 1, column 0', () => {
      const pos = 0
      // Access private method via type assertion for testing
      const result = (mapper as any).positionToLineColumn(simpleSource, pos)
      expect(result).toEqual({ line: 1, column: 0 })
    })

    it('converts position at end of first line', () => {
      const pos = simpleSource.indexOf('\n')
      const result = (mapper as any).positionToLineColumn(simpleSource, pos)
      expect(result.line).toBe(1)
    })

    it('handles position in middle of line', () => {
      const pos = simpleSource.indexOf('gen')
      const result = (mapper as any).positionToLineColumn(simpleSource, pos)
      expect(result.line).toBe(1)
      expect(result.column).toBeGreaterThan(0)
    })

    it('handles multi-line positions', () => {
      const pos = simpleSource.indexOf('user <-')
      const result = (mapper as any).positionToLineColumn(simpleSource, pos)
      expect(result.line).toBe(2)
    })
  })

  describe('lineColumnToPosition', () => {
    it('converts line 1, column 0 to position 0', () => {
      const result = (mapper as any).lineColumnToPosition(simpleSource, 1, 0)
      expect(result).toBe(0)
    })

    it('converts line/column to correct position', () => {
      const line = 2 // Second line (1-indexed)
      const column = 2 // "  user" - after indent
      const result = (mapper as any).lineColumnToPosition(simpleSource, line, column)

      // Verify by converting back
      const lineCol = (mapper as any).positionToLineColumn(simpleSource, result)
      expect(lineCol.line).toBe(line)
      expect(lineCol.column).toBe(column)
    })

    it('handles last line', () => {
      const lines = simpleSource.split('\n')
      const lastLine = lines.length
      const result = (mapper as any).lineColumnToPosition(simpleSource, lastLine, 0)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(simpleSource.length)
    })
  })

  describe('originalToTransformed', () => {
    it('maps position in original source', () => {
      const originalPos = simpleSource.indexOf('user')
      const transformedPos = mapper.originalToTransformed(originalPos)

      expect(transformedPos).toBeGreaterThanOrEqual(0)
      expect(transformedPos).toBeLessThanOrEqual(mapper.getTransformedSource().length)
    })

    it('returns same position when no mapping found', () => {
      const pos = 0
      const result = mapper.originalToTransformed(pos)
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })

  describe('transformedToOriginal', () => {
    it('maps position in transformed source back to original', () => {
      const transformed = mapper.getTransformedSource()
      const transformedPos = transformed.indexOf('yield*')
      const originalPos = mapper.transformedToOriginal(transformedPos)

      expect(originalPos).toBeGreaterThanOrEqual(0)
      expect(originalPos).toBeLessThanOrEqual(simpleSource.length)
    })

    it('returns same position when no mapping found', () => {
      const pos = 0
      const result = mapper.transformedToOriginal(pos)
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })

  describe('round-trip mapping', () => {
    it('original -> transformed -> original preserves position approximately', () => {
      const originalPos = simpleSource.indexOf('return')
      const transformedPos = mapper.originalToTransformed(originalPos)
      const backToOriginal = mapper.transformedToOriginal(transformedPos)

      // Should be close (source maps are not always exact)
      expect(Math.abs(backToOriginal - originalPos)).toBeLessThan(10)
    })
  })
})

describe('transformation cache', () => {
  const testFile = 'test.ts'
  const source = `const x = gen {
  a <- getA()
  return a
}`

  afterEach(() => {
    clearAllCachedTransformations()
  })

  it('caches transformation', () => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)

    expect(isTransformedFile(testFile)).toBe(true)
  })

  it('retrieves cached transformation', () => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)

    const cached = getCachedTransformation(testFile)
    expect(cached).toBeDefined()
    expect(cached?.originalSource).toBe(source)
    expect(cached?.transformedSource).toBe(transformed.code)
  })

  it('returns position mapper for cached file', () => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)

    const mapper = getPositionMapper(testFile)
    expect(mapper).toBeDefined()
    expect(mapper?.getOriginalSource()).toBe(source)
  })

  it('clears cached transformation', () => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)
    expect(isTransformedFile(testFile)).toBe(true)

    clearCachedTransformation(testFile)
    expect(isTransformedFile(testFile)).toBe(false)
  })

  it('clears all cached transformations', () => {
    const file1 = 'test1.ts'
    const file2 = 'test2.ts'

    const transformed = transformSource(source, file1)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(file1, source, transformed.code, transformed.map as SourceMapData)
    cacheTransformation(file2, source, transformed.code, transformed.map as SourceMapData)

    expect(isTransformedFile(file1)).toBe(true)
    expect(isTransformedFile(file2)).toBe(true)

    clearAllCachedTransformations()

    expect(isTransformedFile(file1)).toBe(false)
    expect(isTransformedFile(file2)).toBe(false)
  })

  it('gets original source from cache', () => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)

    const original = getOriginalSource(testFile)
    expect(original).toBe(source)
  })

  it('gets transformed source from cache', () => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()

    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)

    const transformedCode = getTransformedSource(testFile)
    expect(transformedCode).toBe(transformed.code)
  })

  it('returns undefined for non-cached file', () => {
    expect(getCachedTransformation('nonexistent.ts')).toBeUndefined()
    expect(getPositionMapper('nonexistent.ts')).toBeUndefined()
    expect(getOriginalSource('nonexistent.ts')).toBeUndefined()
    expect(getTransformedSource('nonexistent.ts')).toBeUndefined()
  })
})

describe('utility functions', () => {
  const testFile = 'test.ts'
  const source = `const x = gen {
  a <- getA()
  return a
}`

  beforeEach(() => {
    const transformed = transformSource(source, testFile)
    expect(transformed.map).not.toBeNull()
    cacheTransformation(testFile, source, transformed.code, transformed.map as SourceMapData)
  })

  afterEach(() => {
    clearAllCachedTransformations()
  })

  describe('mapTransformedToOriginal', () => {
    it('maps position from transformed to original', () => {
      const transformed = getTransformedSource(testFile)!
      const pos = transformed.indexOf('yield*')
      const originalPos = mapTransformedToOriginal(testFile, pos)

      expect(originalPos).toBeGreaterThanOrEqual(0)
      expect(originalPos).toBeLessThanOrEqual(source.length)
    })

    it('returns same position when file not cached', () => {
      const pos = 10
      const result = mapTransformedToOriginal('nonexistent.ts', pos)
      expect(result).toBe(pos)
    })
  })

  describe('mapOriginalToTransformed', () => {
    it('maps position from original to transformed', () => {
      const pos = source.indexOf('<-')
      const transformedPos = mapOriginalToTransformed(testFile, pos)

      const transformed = getTransformedSource(testFile)!
      expect(transformedPos).toBeGreaterThanOrEqual(0)
      expect(transformedPos).toBeLessThanOrEqual(transformed.length)
    })

    it('returns same position when file not cached', () => {
      const pos = 10
      const result = mapOriginalToTransformed('nonexistent.ts', pos)
      expect(result).toBe(pos)
    })
  })

  describe('mapTextSpan', () => {
    it('maps text span from transformed to original', () => {
      const span = { start: 10, length: 5 }
      const mapped = mapTextSpan(testFile, span)

      expect(mapped.start).toBeGreaterThanOrEqual(0)
      expect(mapped.length).toBeGreaterThanOrEqual(0)
      expect(mapped.start).toBeLessThanOrEqual(source.length)
    })

    it('returns same span when file not cached', () => {
      const span = { start: 10, length: 5 }
      const result = mapTextSpan('nonexistent.ts', span)
      expect(result).toEqual(span)
    })

    it('ensures non-negative length', () => {
      const transformed = getTransformedSource(testFile)!
      const span = { start: 0, length: transformed.length }
      const mapped = mapTextSpan(testFile, span)

      expect(mapped.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('mapTextSpanToTransformed', () => {
    it('maps text span from original to transformed', () => {
      const span = { start: 10, length: 5 }
      const mapped = mapTextSpanToTransformed(testFile, span)

      const transformed = getTransformedSource(testFile)!
      expect(mapped.start).toBeGreaterThanOrEqual(0)
      expect(mapped.length).toBeGreaterThanOrEqual(0)
      expect(mapped.start).toBeLessThanOrEqual(transformed.length)
    })

    it('returns same span when file not cached', () => {
      const span = { start: 10, length: 5 }
      const result = mapTextSpanToTransformed('nonexistent.ts', span)
      expect(result).toEqual(span)
    })

    it('ensures non-negative length', () => {
      const span = { start: 0, length: source.length }
      const mapped = mapTextSpanToTransformed(testFile, span)

      expect(mapped.length).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('edge cases', () => {
  afterEach(() => {
    clearAllCachedTransformations()
  })

  it('handles empty source', () => {
    const source = ''
    const transformed = transformSource(source)

    if (transformed.map) {
      const mapper = new PositionMapper(
        transformed.map as SourceMapData,
        'empty.ts',
        source,
        transformed.code
      )

      const pos = mapper.originalToTransformed(0)
      expect(pos).toBe(0)
    }
  })

  it('handles source with only gen block', () => {
    const source = 'gen { return 1 }'
    const transformed = transformSource(source, 'simple.ts')

    expect(transformed.hasChanges).toBe(true)
    expect(transformed.map).not.toBeNull()
  })

  it('handles position at exact source length', () => {
    const source = `const x = gen {
  a <- getA()
  return a
}`
    const transformed = transformSource(source, 'test.ts')
    expect(transformed.map).not.toBeNull()

    const mapper = new PositionMapper(
      transformed.map as SourceMapData,
      'test.ts',
      source,
      transformed.code
    )

    const pos = mapper.originalToTransformed(source.length)
    expect(pos).toBeGreaterThanOrEqual(0)
  })

  it('handles position beyond source length gracefully', () => {
    const source = `const x = gen {
  a <- getA()
  return a
}`
    const transformed = transformSource(source, 'test.ts')
    expect(transformed.map).not.toBeNull()

    const mapper = new PositionMapper(
      transformed.map as SourceMapData,
      'test.ts',
      source,
      transformed.code
    )

    // Position beyond source - should still return a value (fallback behavior)
    const pos = mapper.originalToTransformed(source.length + 100)
    expect(pos).toBeGreaterThanOrEqual(0)
  })
})