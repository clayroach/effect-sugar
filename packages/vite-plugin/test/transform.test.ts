import { describe, it, expect } from 'vitest'
import {
  hasGenBlocks,
  findGenBlocks,
  transformBlockContent,
  transformSource
} from '../src/transform.js'

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
    expect(blocks[0].end).toBe(26)
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

  it('handles nested braces in expressions', () => {
    const source = 'gen { x <- Effect.succeed({ a: 1 }) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toBe(' x <- Effect.succeed({ a: 1 }) ')
  })

  it('handles strings with braces', () => {
    const source = 'gen { x <- Effect.succeed("{not a block}") }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toBe(' x <- Effect.succeed("{not a block}") ')
  })

  it('handles template literals', () => {
    const source = 'gen { x <- Effect.succeed(`template ${value}`) }'
    const blocks = findGenBlocks(source)

    expect(blocks).toHaveLength(1)
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

    // let is preserved to avoid breaking nested callbacks
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

    // Note: let is preserved, only bind arrows are transformed
    expect(output).toBe(`
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
`)
  })
})

// Marker comment added by transformation to identify gen {} blocks
const MARKER = '/* __EFFECT_SUGAR__ */ '

describe('transformSource', () => {
  it('transforms a simple gen block', () => {
    const source = 'const x = gen { return 1 }'
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toBe(`const x = Effect.gen(${MARKER}function* () { return 1 })`)
  })

  it('transforms bind statements', () => {
    const source = `const program = gen {
  user <- getUser(id)
  return user
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toBe(`const program = Effect.gen(${MARKER}function* () {
  const user = yield* getUser(id)
  return user
})`)
  })

  it('preserves let statements (only bind arrows are transformed)', () => {
    const source = `const program = gen {
  let x = 1
  return x
}`
    const result = transformSource(source)

    // let is preserved - only bind arrows are transformed to const
    expect(result.code).toBe(`const program = Effect.gen(${MARKER}function* () {
  let x = 1
  return x
})`)
  })

  it('transforms multiple gen blocks', () => {
    const source = `
const a = gen { return 1 }
const b = gen { return 2 }
`
    const result = transformSource(source)

    expect(result.code).toBe(`
const a = Effect.gen(${MARKER}function* () { return 1 })
const b = Effect.gen(${MARKER}function* () { return 2 })
`)
  })

  it('preserves code outside gen blocks', () => {
    const source = `import { Effect } from 'effect'

const helper = (x: number) => x * 2

const program = gen {
  return helper(21)
}

export { program }
`
    const result = transformSource(source)

    expect(result.code).toContain("import { Effect } from 'effect'")
    expect(result.code).toContain('const helper = (x: number) => x * 2')
    expect(result.code).toContain(`Effect.gen(${MARKER}function* () {`)
    expect(result.code).toContain('export { program }')
  })

  it('returns unchanged source when no gen blocks', () => {
    const source = 'const x = 1'
    const result = transformSource(source)

    expect(result.hasChanges).toBe(false)
    expect(result.code).toBe(source)
    expect(result.map).toBeNull()
  })

  it('generates source map when changes are made', () => {
    const source = 'const x = gen { return 1 }'
    const result = transformSource(source, 'test.ts')

    expect(result.hasChanges).toBe(true)
    expect(result.map).not.toBeNull()
    expect(result.map?.sources).toContain('test.ts')
  })

  it('handles nested objects in expressions', () => {
    const source = `gen {
  config <- Effect.succeed({
    api: { url: "https://api.example.com", timeout: 5000 },
    auth: { token: "secret" }
  })
  return config
}`
    const result = transformSource(source)

    expect(result.code).toContain('const config = yield* Effect.succeed({')
    expect(result.code).toContain('api: { url: "https://api.example.com", timeout: 5000 }')
  })

  it('handles if/else blocks', () => {
    const source = `gen {
  x <- getValue()
  if (x > 5) {
    return "large"
  } else {
    return "small"
  }
}`
    const result = transformSource(source)

    expect(result.code).toContain('if (x > 5) {')
    expect(result.code).toContain('} else {')
  })
})

describe('edge cases', () => {
  it('correctly ignores gen keyword in strings (fixed with js-tokens)', () => {
    // With js-tokens scanner, gen {} inside strings is correctly ignored
    // This was a limitation of the old regex-based approach
    const source = 'const msg = "use gen { } for effects"'
    const result = transformSource(source)

    // js-tokens correctly identifies this as a string, not a gen block
    expect(result.hasChanges).toBe(false)
  })

  it('handles arrow functions in let statements', () => {
    const source = `gen {
  let doubled = [1,2,3].map(x => x * 2)
  return doubled
}`
    const result = transformSource(source)

    // let is preserved (no longer transformed to const)
    expect(result.code).toContain('let doubled = [1,2,3].map(x => x * 2)')
  })

  it('handles method chains', () => {
    const source = `gen {
  result <- api
    .get("/users")
    .pipe(Effect.timeout("5 seconds"))
  return result
}`
    const result = transformSource(source)

    expect(result.code).toContain('const result = yield* api')
  })

  it('preserves let in nested callbacks (critical bug fix)', () => {
    // Regression test for: tmp/2025-11-25/NESTED_CALLBACK_LET_BUG.md
    // let declarations inside nested functions must NOT be transformed to const
    const source = `gen {
  result <- Effect.try({
    try: () => {
      let x = 1
      x = 2
      return x
    }
  })
  return result
}`
    const result = transformSource(source)

    // The nested let MUST be preserved - transforming to const would break the reassignment
    expect(result.code).toContain('let x = 1')
    expect(result.code).toContain('x = 2')
  })

  it('handles regex literals with braces (critical bug fix)', () => {
    // Regression test: regex like /\$\{([^}]+)\}/g has braces that must not affect depth counting
    const source = `gen {
  result <- Effect.try({
    try: () => {
      const text = str.replace(/\\$\\{([^}]+)\\}/g, (match) => match)
      return text
    }
  })
  return result
}`
    const result = transformSource(source)

    // The return statement must be INSIDE Effect.gen, not outside
    // Before fix: })) appeared, and return was outside
    expect(result.code).not.toContain('}))') // No double closing
    expect(result.code).toMatch(/return result\s*\n\s*\}\)$/) // return inside gen
  })

  it('handles regex character classes with special chars', () => {
    // Character class [^}] should not count } as closing brace
    const source = `gen {
  x <- getValue()
  const cleaned = x.replace(/[{}]/g, '')
  return cleaned
}`
    const result = transformSource(source)

    expect(result.code).toContain('const x = yield* getValue()')
    expect(result.code).toContain("const cleaned = x.replace(/[{}]/g, '')")
  })
})
