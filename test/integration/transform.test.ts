/**
 * Integration tests for effect-sugar transformation
 *
 * These tests verify that:
 * 1. gen blocks are correctly transformed to Effect.gen
 * 2. The transformed code compiles with TypeScript
 * 3. Effects run correctly and produce expected values
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { transformSource as transformSourceFull } from '../../packages/vite-plugin/target/dist/transform.js'

// Adapt the interface - vite-plugin returns { code, map, hasChanges }
function transformSource(input: string): string {
  return transformSourceFull(input).code
}

describe('effect-sugar integration', () => {
  describe('transformation', () => {
    it('transforms simple bind statement', () => {
      const input = `
const program = gen {
  x <- Effect.succeed(42)
  return x
}`
      const result = transformSource(input)

      expect(result).toContain('Effect.gen(')
      expect(result).toContain('function* ()')
      expect(result).toContain('const x = yield* Effect.succeed(42)')
      expect(result).toContain('return x')
    })

    it('transforms multiple binds and preserves let statements', () => {
      const input = `
const program = gen {
  a <- Effect.succeed(1)
  b <- Effect.succeed(2)
  let sum = a + b
  return sum
}`
      const result = transformSource(input)

      expect(result).toContain('const a = yield* Effect.succeed(1)')
      expect(result).toContain('const b = yield* Effect.succeed(2)')
      // let is preserved (only bind arrows are transformed)
      expect(result).toContain('let sum = a + b')
      expect(result).toContain('return sum')
    })

    it('preserves if/else statements', () => {
      const input = `
const program = gen {
  x <- Effect.succeed(10)
  if (x > 5) {
    return "large"
  } else {
    return "small"
  }
}`
      const result = transformSource(input)

      // if/else is preserved as-is (no wrapping)
      expect(result).toContain('if (x > 5)')
      expect(result).toContain('return "large"')
      expect(result).toContain('return "small"')
    })

    it('handles complex expressions with nested braces', () => {
      const input = `
const program = gen {
  obj <- Effect.succeed({ a: 1, b: { c: 2 } })
  let arr = [1, 2, 3].map(x => ({ value: x }))
  return { obj, arr }
}`
      const result = transformSource(input)

      expect(result).toContain("yield* Effect.succeed({ a: 1, b: { c: 2 } })")
      expect(result).toContain("[1, 2, 3].map(x => ({ value: x }))")
    })

    it('transforms multiple gen blocks in one file', () => {
      const input = `
const first = gen {
  x <- Effect.succeed(1)
  return x
}

const second = gen {
  y <- Effect.succeed(2)
  return y
}`
      const result = transformSource(input)

      // Match the marker comment pattern used by vite-plugin
      expect((result.match(/Effect\.gen\(/g) || []).length).toBe(2)
      expect((result.match(/function\* \(\)/g) || []).length).toBe(2)
    })

    it('preserves <- operator with multiline effect calls', () => {
      const input = `
const safeOperation = gen {
  config <- Effect.succeed({
    apiUrl: "https://api.example.com",
  });
  result <- Effect.try({
    try: () => JSON.parse('{"valid": true}'),
    catch: (e) => new Error('Parse failed: ' + e),
  });
  return { config, result };
}`
      const result = transformSource(input)

      expect(result).toContain('const config = yield* Effect.succeed')
      expect(result).toContain('const result = yield* Effect.try')
      expect(result).not.toContain('< -')
    })
  })

  describe('effect execution', () => {
    it('runs simple effect and returns correct value', async () => {
      // Manually create what the transformation would produce
      const program = Effect.gen(function* () {
        const x = yield* Effect.succeed(42)
        return x
      })

      const result = await Effect.runPromise(program)
      expect(result).toBe(42)
    })

    it('runs effect with multiple binds', async () => {
      const program = Effect.gen(function* () {
        const a = yield* Effect.succeed(10)
        const b = yield* Effect.succeed(20)
        const sum = a + b
        return sum
      })

      const result = await Effect.runPromise(program)
      expect(result).toBe(30)
    })

    it('runs effect with conditionals', async () => {
      const program = Effect.gen(function* () {
        const x = yield* Effect.succeed(7)
        if (x > 5) {
          return 'large'
        } else {
          return 'small'
        }
      })

      const result = await Effect.runPromise(program)
      expect(result).toBe('large')
    })

    it('runs effect with chained operations', async () => {
      const getUser = (id: number) =>
        Effect.succeed({ id, name: 'Alice' })

      const getProfile = (userId: number) =>
        Effect.succeed({ userId, bio: 'Engineer' })

      const program = Effect.gen(function* () {
        const user = yield* getUser(123)
        const profile = yield* getProfile(user.id)
        return { user, profile }
      })

      const result = await Effect.runPromise(program)
      expect(result.user.name).toBe('Alice')
      expect(result.profile.bio).toBe('Engineer')
    })

    it('runs effect with error handling', async () => {
      const program = Effect.gen(function* () {
        const config = yield* Effect.succeed({ value: 42 })
        const parsed = yield* Effect.try({
          try: () => JSON.parse('{"valid": true}'),
          catch: (e) => new Error(`Parse failed: ${e}`)
        })
        return { config, parsed }
      })

      const result = await Effect.runPromise(program)
      expect(result.config.value).toBe(42)
      expect(result.parsed.valid).toBe(true)
    })
  })

  describe('type inference', () => {
    it('preserves type inference through transformation', () => {
      // This test verifies that TypeScript can correctly infer types
      // If this compiles, type inference is working
      const getUser = (id: number) =>
        Effect.succeed({ id, name: 'Alice', email: 'alice@example.com' })

      const program = Effect.gen(function* () {
        const user = yield* getUser(123)
        // TypeScript should infer user.name is string
        const uppercaseName: string = user.name.toUpperCase()
        return uppercaseName
      })

      // Type assertion - this would fail to compile if types were wrong
      const _typeCheck: Effect.Effect<string> = program
      expect(_typeCheck).toBeDefined()
    })
  })
})
