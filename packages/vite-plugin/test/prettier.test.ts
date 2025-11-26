import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  hasEffectGen,
  findEffectGenBlocks,
  reverseTransformContent,
  reverseTransformSource,
  formatWithEffectSugar
} from '../src/prettier.js'

// Marker used by transformation to identify gen {} blocks
const MARKER = '/* __EFFECT_SUGAR__ */'

describe('hasEffectGen', () => {
  it('returns true for marked Effect.gen', () => {
    expect(hasEffectGen(`const x = Effect.gen(${MARKER} function* () { return 1 })`)).toBe(true)
  })

  it('returns false for unmarked Effect.gen', () => {
    // Standard Effect.gen should NOT be detected (no marker)
    expect(hasEffectGen('const x = Effect.gen(function* () { return 1 })')).toBe(false)
  })

  it('returns false for source without Effect.gen', () => {
    expect(hasEffectGen('const x = 1')).toBe(false)
  })

  it('returns false for partial matches', () => {
    expect(hasEffectGen('Effect.generate()')).toBe(false)
    expect(hasEffectGen('MyEffect.gen()')).toBe(false)
  })
})

describe('findEffectGenBlocks', () => {
  it('finds a marked Effect.gen block', () => {
    const source = `const x = Effect.gen(${MARKER} function* () { return 1 })`
    const blocks = findEffectGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].bodyContent).toBe(' return 1 ')
  })

  it('ignores unmarked Effect.gen blocks', () => {
    // Standard Effect.gen without marker should NOT be found
    const source = 'const x = Effect.gen(function* () { return 1 })'
    const blocks = findEffectGenBlocks(source)

    expect(blocks).toHaveLength(0)
  })

  it('finds multiple marked Effect.gen blocks', () => {
    const source = `
const a = Effect.gen(${MARKER} function* () { return 1 })
const b = Effect.gen(${MARKER} function* () { return 2 })
`
    const blocks = findEffectGenBlocks(source)

    expect(blocks).toHaveLength(2)
  })

  it('handles nested braces in expressions', () => {
    const source = `Effect.gen(${MARKER} function* () { const x = yield* Effect.succeed({ a: 1 }) })`
    const blocks = findEffectGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].bodyContent).toContain('yield* Effect.succeed({ a: 1 })')
  })

  it('handles strings with braces', () => {
    const source = `Effect.gen(${MARKER} function* () { const x = yield* Effect.succeed("{not a block}") })`
    const blocks = findEffectGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].bodyContent).toContain('"{not a block}"')
  })

  it('handles multiline marked Effect.gen', () => {
    const source = `const program = Effect.gen(${MARKER} function* () {
  const user = yield* getUser(id)
  return user
})`
    const blocks = findEffectGenBlocks(source)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].bodyContent).toContain('const user = yield* getUser(id)')
  })
})

describe('reverseTransformContent', () => {
  it('transforms yield* back to bind arrow', () => {
    const input = '  const user = yield* getUser(id)'
    const output = reverseTransformContent(input)

    expect(output).toBe('  user <- getUser(id)')
  })

  it('transforms yield* with semicolons', () => {
    const input = '  const user = yield* getUser(id);'
    const output = reverseTransformContent(input)

    expect(output).toBe('  user <- getUser(id);')
  })

  it('preserves const for non-yield expressions', () => {
    const input = '  const name = user.name'
    const output = reverseTransformContent(input)

    // We intentionally keep const as-is to avoid breaking nested functions/callbacks
    expect(output).toBe('  const name = user.name')
  })

  it('preserves return statements', () => {
    const input = '  return { user, name }'
    const output = reverseTransformContent(input)

    expect(output).toBe('  return { user, name }')
  })

  it('preserves comments', () => {
    const input = `  // Get the user
  const user = yield* getUser(id)`
    const output = reverseTransformContent(input)

    expect(output).toBe(`  // Get the user
  user <- getUser(id)`)
  })

  it('preserves empty lines', () => {
    const input = `  const user = yield* getUser(id)

  return user`
    const output = reverseTransformContent(input)

    expect(output).toBe(`  user <- getUser(id)

  return user`)
  })

  it('handles complex multiline content', () => {
    const input = `
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
`
    const output = reverseTransformContent(input)

    expect(output).toBe(`
  user <- getUser(id)
  profile <- getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
`)
  })
})

describe('reverseTransformSource', () => {
  it('transforms marked Effect.gen back to gen block', () => {
    const source = `const x = Effect.gen(${MARKER} function* () { return 1 })`
    const result = reverseTransformSource(source)

    expect(result).toBe('const x = gen { return 1 }')
  })

  it('ignores unmarked Effect.gen', () => {
    // Standard Effect.gen should NOT be reverse-transformed
    const source = 'const x = Effect.gen(function* () { return 1 })'
    const result = reverseTransformSource(source)

    // Should be unchanged
    expect(result).toBe(source)
  })

  it('transforms yield* back to bind arrow', () => {
    const source = `const program = Effect.gen(${MARKER} function* () {
  const user = yield* getUser(id)
  return user
})`
    const result = reverseTransformSource(source)

    expect(result).toBe(`const program = gen {
  user <- getUser(id)
  return user
}`)
  })

  it('preserves const in body', () => {
    const source = `const program = Effect.gen(${MARKER} function* () {
  const x = 1
  return x
})`
    const result = reverseTransformSource(source)

    expect(result).toBe(`const program = gen {
  const x = 1
  return x
}`)
  })

  it('transforms multiple marked Effect.gen blocks', () => {
    const source = `
const a = Effect.gen(${MARKER} function* () { return 1 })
const b = Effect.gen(${MARKER} function* () { return 2 })
`
    const result = reverseTransformSource(source)

    expect(result).toBe(`
const a = gen { return 1 }
const b = gen { return 2 }
`)
  })

  it('preserves code outside marked Effect.gen blocks', () => {
    const source = `import { Effect } from 'effect'

const helper = (x: number) => x * 2

const program = Effect.gen(${MARKER} function* () {
  return helper(21)
})

export { program }
`
    const result = reverseTransformSource(source)

    expect(result).toContain("import { Effect } from 'effect'")
    expect(result).toContain('const helper = (x: number) => x * 2')
    expect(result).toContain('gen {')
    expect(result).toContain('export { program }')
  })

  it('returns unchanged source when no marked Effect.gen blocks', () => {
    const source = 'const x = 1'
    const result = reverseTransformSource(source)

    expect(result).toBe(source)
  })
})

describe('round-trip transformation', () => {
  it('maintains code structure through transform and reverse', async () => {
    const original = `const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
}`

    // This test verifies the round-trip without actually calling Prettier
    // (which would change formatting)
    // Note: `let` statements become `const` after transformation, which is intentional
    const { transformSource } = await import('../src/transform.js')

    const transformed = transformSource(original)
    expect(transformed.hasChanges).toBe(true)

    const reversed = reverseTransformSource(transformed.code)
    expect(reversed).toBe(original)
  })

  it('preserves let declarations (not converted to const)', async () => {
    // let declarations are now preserved to avoid breaking nested callbacks
    // See: tmp/2025-11-25/NESTED_CALLBACK_LET_BUG.md
    const original = `const program = gen {
  let name = user.name
  return name
}`
    const expected = `const program = gen {
  let name = user.name
  return name
}`

    const { transformSource } = await import('../src/transform.js')

    const transformed = transformSource(original)
    const reversed = reverseTransformSource(transformed.code)
    expect(reversed).toBe(expected)
  })
})

describe('formatWithEffectSugar', () => {
  it('formats gen blocks and converts back', async () => {
    // Simple case - formatting should add semicolons and proper spacing
    const source = `const x = gen {
  user <- getUser(id)
  return user
}`

    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript',
        semi: true
      })
    )

    // Should contain gen {} syntax (not Effect.gen)
    expect(formatted).toContain('gen {')
    expect(formatted).toContain('<-')
    expect(formatted).not.toContain('Effect.gen')
    expect(formatted).not.toContain('yield*')
  })

  it('handles files without gen blocks', async () => {
    const source = 'const x = 1'

    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    // Should just format normally
    expect(formatted).toContain('const x = 1')
  })

  it('handles complex gen blocks with nested objects', async () => {
    const source = `const program = gen {
  config <- Effect.succeed({
    api: { url: "https://api.example.com" },
    timeout: 5000
  })
  return config
}`

    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('gen {')
    expect(formatted).toContain('<-')
    expect(formatted).toContain('api: { url:')
  })
})

// ============================================================================
// CRITICAL: Tests for files that should NOT be modified (except formatting)
// ============================================================================

describe('files without gen {} syntax should be preserved', () => {
  it('preserves standard Effect.gen syntax unchanged', async () => {
    const source = `import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  return user
})

export { program }
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    // Should still have Effect.gen (NOT converted to gen {})
    expect(formatted).toContain('Effect.gen(function* ()')
    expect(formatted).toContain('yield*')
    // Should NOT have gen {} syntax
    expect(formatted).not.toMatch(/\bgen\s*\{/)
    expect(formatted).not.toContain('<-')
  })

  it('preserves complex TypeScript with generics', async () => {
    const source = `interface Result<T, E> {
  data: T
  error: E | null
}

const process = <T extends Record<string, unknown>>(input: T): Result<T, Error> => {
  return { data: input, error: null }
}
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('interface Result<T, E>')
    expect(formatted).toContain('<T extends Record<string, unknown>>')
  })

  it('preserves arrow functions and callbacks', async () => {
    const source = `const items = [1, 2, 3]
const doubled = items.map((x) => x * 2)
const filtered = items.filter((x) => {
  return x > 1
})
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('map((x) => x * 2)')
    expect(formatted).toContain('filter((x) =>')
  })

  it('preserves object destructuring', async () => {
    const source = `const { a, b } = obj
const [x, y] = arr
const { nested: { deep } } = complex
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('const { a, b }')
    expect(formatted).toContain('const [x, y]')
    expect(formatted).toContain('nested: { deep }')
  })

  it('preserves type annotations and interfaces', async () => {
    const source = `type Handler = (req: Request) => Response

interface Config {
  url: string
  timeout: number
}

const config: Config = {
  url: 'https://api.example.com',
  timeout: 5000
}
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('type Handler = (req: Request) => Response')
    expect(formatted).toContain('interface Config')
    expect(formatted).toContain('const config: Config')
  })

  it('preserves async/await syntax', async () => {
    const source = `async function fetchData() {
  const response = await fetch('/api')
  const data = await response.json()
  return data
}
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('async function fetchData()')
    expect(formatted).toContain('await fetch')
    expect(formatted).toContain('await response.json()')
  })

  it('preserves class syntax', async () => {
    const source = `class UserService {
  private cache: Map<string, User> = new Map()

  async getUser(id: string): Promise<User> {
    return this.cache.get(id) ?? await this.fetchUser(id)
  }
}
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('class UserService')
    expect(formatted).toContain('private cache: Map<string, User>')
    expect(formatted).toContain('async getUser(id: string): Promise<User>')
  })
})

// ============================================================================
// Edge cases that could cause issues
// ============================================================================

describe('edge cases', () => {
  it('handles files with "gen" in variable names', async () => {
    const source = `const generator = () => 1
const general = 'test'
const generateId = () => Math.random()
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('const generator')
    expect(formatted).toContain('const general')
    expect(formatted).toContain('const generateId')
    // Should not be converted to gen {} syntax
    expect(formatted).not.toMatch(/\bgen\s*\{/)
  })

  it('handles "gen" in strings', async () => {
    const source = `const msg = "use gen { } for effects"
const template = \`gen { x <- foo() }\`
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    // String content should be preserved (Prettier may adjust whitespace)
    expect(formatted).toContain('gen { }')
    // Template literal - Prettier may remove trailing space before }
    expect(formatted).toContain('gen { x <- foo()}')
  })

  it('handles nested Effect operations without gen {}', async () => {
    const source = `const program = Effect.all([
  Effect.succeed(1),
  Effect.succeed(2)
]).pipe(
  Effect.map(([a, b]) => a + b)
)
`
    const formatted = await Effect.runPromise(
      formatWithEffectSugar(source, {
        filepath: 'test.ts',
        parser: 'typescript'
      })
    )

    expect(formatted).toContain('Effect.all')
    expect(formatted).toContain('Effect.succeed')
    expect(formatted).toContain('Effect.map')
    expect(formatted).not.toMatch(/\bgen\s*\{/)
  })

  it('handles destructuring in yield* (should preserve as-is)', async () => {
    const source = `const program = gen {
  const [a, b] = yield* Effect.all([getA(), getB()])
  return a + b
}`
    // Note: Our current regex doesn't handle destructuring, so this passes through
    const { transformSource } = await import('../src/transform.js')
    const transformed = transformSource(source)
    const reversed = reverseTransformSource(transformed.code)

    // Destructuring patterns are preserved (not converted to <-)
    expect(reversed).toContain('const [a, b] = yield*')
  })

  it('handles arrow functions inside gen blocks', async () => {
    const source = `const program = gen {
  items <- getItems()
  const doubled = items.map(x => x * 2)
  return doubled
}`
    const { transformSource } = await import('../src/transform.js')
    const transformed = transformSource(source)
    const reversed = reverseTransformSource(transformed.code)

    expect(reversed).toContain('items <- getItems()')
    expect(reversed).toContain('items.map(x => x * 2)')
  })

  it('handles try/catch inside gen blocks', async () => {
    const source = `const program = gen {
  result <- Effect.try({
    try: () => JSON.parse(input),
    catch: (e) => new ParseError(e)
  })
  return result
}`
    const { transformSource } = await import('../src/transform.js')
    const transformed = transformSource(source)
    const reversed = reverseTransformSource(transformed.code)

    expect(reversed).toContain('result <- Effect.try')
    expect(reversed).toContain('try: () => JSON.parse')
    expect(reversed).toContain('catch: (e) => new ParseError')
  })

  it('handles multiline arrow functions in Effect.tryPromise', async () => {
    const source = `const program = gen {
  data <- Effect.tryPromise({
    try: async () => {
      const response = await fetch('/api')
      return response.json()
    },
    catch: (error) => new NetworkError(String(error))
  })
  return data
}`
    const { transformSource } = await import('../src/transform.js')
    const transformed = transformSource(source)
    const reversed = reverseTransformSource(transformed.code)

    expect(reversed).toContain('data <- Effect.tryPromise')
    expect(reversed).toContain('try: async () => {')
    expect(reversed).toContain('await fetch')
    expect(reversed).toContain('catch: (error) => new NetworkError')
  })
})
