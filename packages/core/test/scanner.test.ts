import { describe, it, expect } from 'vitest'
import {
  hasGenBlocks,
  findGenBlocks,
  extractBindPattern,
  transformBlockContent
} from '../src/scanner.js'

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
    expect(blocks[0]!.start).toBe(10)
    expect(blocks[0]!.end).toBe(26)
    expect(blocks[0]!.content).toBe(' return 1 ')
  })

  it('finds multiple gen blocks', () => {
    const source = `
const a = gen { return 1 }
const b = gen { return 2 }
`
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(2)
  })

  it('handles nested braces in expressions', () => {
    const source = 'gen { x <- Effect.succeed({ a: 1 }) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.content).toBe(' x <- Effect.succeed({ a: 1 }) ')
  })

  it('handles strings with braces', () => {
    const source = 'gen { x <- Effect.succeed("{not a block}") }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.content).toBe(' x <- Effect.succeed("{not a block}") ')
  })

  it('handles template literals', () => {
    const source = 'gen { x <- Effect.succeed(`template ${value}`) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
  })
})

describe('extractBindPattern', () => {
  it('extracts simple identifier', () => {
    const result = extractBindPattern('user <- getUser(id)')
    expect(result).toEqual({ pattern: 'user', expression: 'getUser(id)' })
  })

  it('extracts array destructuring', () => {
    const result = extractBindPattern('[a, b] <- Effect.all([getA(), getB()])')
    expect(result).toEqual({ pattern: '[a, b]', expression: 'Effect.all([getA(), getB()])' })
  })

  it('extracts object destructuring', () => {
    const result = extractBindPattern('{ name, age } <- getUser(id)')
    expect(result).toEqual({ pattern: '{ name, age }', expression: 'getUser(id)' })
  })

  it('extracts nested destructuring', () => {
    const result = extractBindPattern('[{ a }, b] <- getComplex()')
    expect(result).toEqual({ pattern: '[{ a }, b]', expression: 'getComplex()' })
  })

  it('extracts destructuring with rest spread', () => {
    const result = extractBindPattern('[first, ...rest] <- getItems()')
    expect(result).toEqual({ pattern: '[first, ...rest]', expression: 'getItems()' })
  })

  it('extracts object destructuring with renaming', () => {
    const result = extractBindPattern('{ name: userName, age: userAge } <- getUser(id)')
    expect(result).toEqual({ pattern: '{ name: userName, age: userAge }', expression: 'getUser(id)' })
  })

  it('returns null for non-bind statements', () => {
    expect(extractBindPattern('const x = 1')).toBeNull()
    expect(extractBindPattern('return value')).toBeNull()
    expect(extractBindPattern('let y = 2')).toBeNull()
  })

  it('returns null for comparison operators', () => {
    // x < -y should NOT be treated as bind
    expect(extractBindPattern('x < -y')).toBeNull()
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

  it('preserves let statements as-is', () => {
    const input = '  let name = user.name'
    const output = transformBlockContent(input)

    expect(output).toBe('  let name = user.name')
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

  it('preserves empty lines', () => {
    const input = `  user <- getUser(id)

  return user`
    const output = transformBlockContent(input)

    expect(output).toBe(`  const user = yield* getUser(id)

  return user`)
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

  it('transforms array destructuring bind', () => {
    const input = '  [a, b] <- Effect.all([getA(), getB()])'
    const output = transformBlockContent(input)

    expect(output).toBe('  const [a, b] = yield* Effect.all([getA(), getB()])')
  })

  it('transforms object destructuring bind', () => {
    const input = '  { name, age } <- getUser(id)'
    const output = transformBlockContent(input)

    expect(output).toBe('  const { name, age } = yield* getUser(id)')
  })

  it('transforms nested destructuring bind', () => {
    const input = '  [{ a }, b] <- getComplex()'
    const output = transformBlockContent(input)

    expect(output).toBe('  const [{ a }, b] = yield* getComplex()')
  })

  it('transforms destructuring with rest spread', () => {
    const input = '  [first, ...rest] <- getItems()'
    const output = transformBlockContent(input)

    expect(output).toBe('  const [first, ...rest] = yield* getItems()')
  })

  it('transforms object destructuring with renaming', () => {
    const input = '  { name: userName, age: userAge } <- getUser(id)'
    const output = transformBlockContent(input)

    expect(output).toBe('  const { name: userName, age: userAge } = yield* getUser(id)')
  })

  it('does NOT transform binds inside nested arrow functions', () => {
    const input = `  items <- getItems()
  const processed = items.map((item) => {
    x <- transform(item)
    return x
  })
  return processed`
    const output = transformBlockContent(input)

    expect(output).toContain('const items = yield* getItems()')
    expect(output).toContain('x <- transform(item)')
  })

  it('transforms binds inside if/else blocks', () => {
    const input = `  config <- loadConfig()
  if (!config) {
    _ <- Effect.fail(new Error("Not found"))
  }
  return config`
    const output = transformBlockContent(input)

    expect(output).toContain('const config = yield* loadConfig()')
    expect(output).toContain('const _ = yield* Effect.fail(new Error("Not found"))')
  })
})

describe('regression tests', () => {
  it('handles regex literals with braces', () => {
    // Regex like /\{([^}]+)\}/g has braces that must not affect depth counting
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
    expect(blocks[0]!.content).toContain('return result')
  })

  it('handles regex character classes with special chars', () => {
    const source = `gen {
  x <- getValue()
  const cleaned = x.replace(/[{}]/g, '')
  return cleaned
}`
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.content).toContain('return cleaned')
  })

  it('correctly ignores gen keyword in strings', () => {
    const source = 'const msg = "use gen { } for effects"'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(0)
  })
})
