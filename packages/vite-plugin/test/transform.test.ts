import { describe, it, expect } from 'vitest'
import { transformSource } from '../src/transform.js'

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

  it('transforms array destructuring bind', () => {
    const source = `const program = gen {
  [config, llmConfig] <- Effect.all([loadConfig(), loadLLMConfig()])
  return { config, llmConfig }
}`
    const result = transformSource(source)

    expect(result.code).toContain('const [config, llmConfig] = yield* Effect.all([loadConfig(), loadLLMConfig()])')
  })

  it('transforms object destructuring bind', () => {
    const source = `const program = gen {
  { name, age } <- getUser(id)
  return { name, age }
}`
    const result = transformSource(source)

    expect(result.code).toContain('const { name, age } = yield* getUser(id)')
  })

  it('transforms return bind for divergent effects', () => {
    const source = `const program = gen {
  user <- getUser(id)
  if (!user.name) {
    return _ <- Effect.fail(new Error("User has no name"))
  }
  return user.name
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const user = yield* getUser(id)')
    expect(result.code).toContain('return yield* Effect.fail(new Error("User has no name"))')
    expect(result.code).toContain('return user.name')
  })

  it('transforms return bind with simple pattern', () => {
    const source = 'const program = gen { return _ <- Effect.die("fatal") }'
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toBe(`const program = Effect.gen(${MARKER}function* () { return yield* Effect.die("fatal")})`)
  })
})

describe('edge cases', () => {
  it('correctly ignores gen keyword in strings', () => {
    const source = 'const msg = "use gen { } for effects"'
    const result = transformSource(source)

    expect(result.hasChanges).toBe(false)
  })

  it('handles arrow functions in let statements', () => {
    const source = `gen {
  let doubled = [1,2,3].map(x => x * 2)
  return doubled
}`
    const result = transformSource(source)

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

  it('preserves let in nested callbacks', () => {
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

    expect(result.code).toContain('let x = 1')
    expect(result.code).toContain('x = 2')
  })

  it('handles regex literals with braces', () => {
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

    expect(result.code).not.toContain('}})')
    expect(result.code).toMatch(/return result\s*\n\s*\}\)$/)
  })

  it('transforms binds inside if/else blocks', () => {
    const source = `gen {
  config <- loadConfig()
  if (!config) {
    _ <- Effect.fail(new Error("Not found"))
  }
  return config
}`
    const result = transformSource(source)

    expect(result.code).toContain('const config = yield* loadConfig()')
    expect(result.code).toContain('const _ = yield* Effect.fail(new Error("Not found"))')
  })

  it('does NOT transform binds inside nested arrow functions', () => {
    const source = `gen {
  items <- getItems()
  const processed = items.map((item) => {
    x <- transform(item)
    return x
  })
  return processed
}`
    const result = transformSource(source)

    expect(result.code).toContain('const items = yield* getItems()')
    expect(result.code).toContain('x <- transform(item)')
  })
})
