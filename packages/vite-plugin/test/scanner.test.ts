import { describe, it, expect } from 'vitest'
import {
  tokenize,
  hasGenBlocks,
  findGenBlocks,
  transformBlockContent
} from '../src/scanner.js'

describe('tokenize', () => {
  it('tokenizes simple code', () => {
    const tokens = tokenize('const x = 1')
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0].type).toBe('IdentifierName')
    expect(tokens[0].value).toBe('const')
  })

  it('includes position information', () => {
    const tokens = tokenize('ab cd')
    expect(tokens[0].start).toBe(0)
    expect(tokens[0].end).toBe(2)
  })
})

describe('hasGenBlocks', () => {
  it('returns true for source with gen blocks', () => {
    expect(hasGenBlocks('const x = gen { return 1 }')).toBe(true)
  })

  it('returns false for source without gen blocks', () => {
    expect(hasGenBlocks('const x = 1')).toBe(false)
  })

  it('returns false for "gen" not followed by brace', () => {
    expect(hasGenBlocks('const gen = 1')).toBe(false)
    expect(hasGenBlocks('generator()')).toBe(false)
  })
})

describe('findGenBlocks', () => {
  it('finds a simple gen block', () => {
    const source = 'const x = gen { return 1 }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].start).toBe(10)
    expect(blocks[0].content).toBe(' return 1 ')
  })

  it('finds multiple gen blocks', () => {
    const source = `
const a = gen { return 1 }
const b = gen { return 2 }
`
    const blocks = findGenBlocks(source)
    expect(blocks).toHaveLength(2)
  })

  it('handles nested braces correctly', () => {
    const source = 'gen { x <- Effect.succeed({ a: 1, b: { c: 2 } }) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toBe(' x <- Effect.succeed({ a: 1, b: { c: 2 } }) ')
  })

  it('handles strings with braces', () => {
    const source = 'gen { x <- Effect.succeed("{not a block}") }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toContain('{not a block}')
  })

  it('handles template literals with braces', () => {
    const source = 'gen { x <- Effect.succeed(`template ${value} with {braces}`) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
  })

  it('handles single-line comments', () => {
    const source = `gen {
  // This is a comment with { braces }
  x <- getValue()
  return x
}`
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toContain('// This is a comment')
  })

  it('handles multi-line comments', () => {
    const source = `gen {
  /* This is a comment
     with { braces } on multiple lines */
  x <- getValue()
  return x
}`
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
  })

  describe('regex literal handling (critical)', () => {
    it('handles simple regex', () => {
      const source = `gen {
  x <- getValue()
  const cleaned = x.replace(/test/g, '')
  return cleaned
}`
      const blocks = findGenBlocks(source)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toContain('/test/g')
    })

    it('handles regex with braces in character class', () => {
      const source = `gen {
  x <- getValue()
  const cleaned = x.replace(/[{}]/g, '')
  return cleaned
}`
      const blocks = findGenBlocks(source)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toContain('/[{}]/g')
    })

    it('handles regex like /\\$\\{([^}]+)\\}/g (the bug that started this)', () => {
      const source = `gen {
  result <- Effect.try({
    try: () => {
      const text = str.replace(/\\$\\{([^}]+)\\}/g, (match) => match)
      return text
    }
  })
  return result
}`
      const blocks = findGenBlocks(source)

      expect(blocks).toHaveLength(1)
      // Critical: return must be INSIDE the block
      expect(blocks[0].content).toContain('return result')
    })

    it('handles multiple regex in same block', () => {
      const source = `gen {
  x <- getValue()
  const a = x.replace(/\\{/g, '[')
  const b = a.replace(/\\}/g, ']')
  return b
}`
      const blocks = findGenBlocks(source)

      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toContain('return b')
    })
  })
})

describe('transformBlockContent', () => {
  it('transforms bind statements', () => {
    const input = '  user <- getUser(id)'
    const output = transformBlockContent(input)

    expect(output).toBe('  const user = yield* getUser(id)')
  })

  it('transforms bind statements with semicolons', () => {
    const input = '  user <- getUser(id);'
    const output = transformBlockContent(input)

    expect(output).toBe('  const user = yield* getUser(id);')
  })

  it('preserves let statements (not transformed to const)', () => {
    const input = '  let name = user.name'
    const output = transformBlockContent(input)

    expect(output).toBe('  let name = user.name')
  })

  it('preserves const statements', () => {
    const input = '  const name = user.name'
    const output = transformBlockContent(input)

    expect(output).toBe('  const name = user.name')
  })

  it('preserves return statements', () => {
    const input = '  return { user, name }'
    const output = transformBlockContent(input)

    expect(output).toBe('  return { user, name }')
  })

  it('preserves comments', () => {
    const input = `  // Get the user
  user <- getUser(id)`
    const output = transformBlockContent(input)

    expect(output).toBe(`  // Get the user
  const user = yield* getUser(id)`)
  })

  it('handles complex multiline content', () => {
    const input = `
  user <- getUser(id)
  profile <- getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
`
    const output = transformBlockContent(input)

    expect(output).toBe(`
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
`)
  })

  describe('scope-aware transformation', () => {
    it('transforms <- at top level', () => {
      const input = `  result <- Effect.try({
    try: () => 'test'
  })`
      const output = transformBlockContent(input)

      expect(output).toContain('const result = yield* Effect.try')
    })

    it('preserves let inside nested functions', () => {
      const input = `  result <- Effect.try({
    try: () => {
      let x = 1
      x = 2
      return x
    }
  })
  return result`
      const output = transformBlockContent(input)

      // let inside nested function is preserved (not transformed)
      expect(output).toContain('let x = 1')
      expect(output).toContain('x = 2')
      // Top-level bind IS transformed
      expect(output).toContain('const result = yield* Effect.try')
    })
  })
})

describe('edge cases', () => {
  it('handles escaped quotes in strings', () => {
    const source = 'gen { x <- Effect.succeed("test \\"quoted\\" value") }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
  })

  it('handles nested template literals', () => {
    const source = 'gen { x <- Effect.succeed(`outer ${`inner`}`) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
  })

  it('handles empty gen block', () => {
    const source = 'gen {}'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toBe('')
  })

  it('handles gen block with only whitespace', () => {
    const source = 'gen {   \n   }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
  })

  it('does not match "gen" as part of larger identifier', () => {
    const source = 'const generator = { x: 1 }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(0)
  })
})
