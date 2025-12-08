import { describe, it, expect } from 'vitest'
import { transformSource, hasGenBlocks } from 'effect-sugar-core'

describe('transformSource', () => {
  it('returns unchanged code when no gen blocks', () => {
    const input = `const x = 1`
    const result = transformSource(input)

    expect(result.hasChanges).toBe(false)
    expect(result.code).toBe(input)
  })

  it('transforms simple gen block', () => {
    const input = `const result = gen {
  x <- Effect.succeed(1)
  return x
}`
    const result = transformSource(input)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('Effect.gen')
    expect(result.code).toContain('function* ()')
    expect(result.code).toContain('yield* Effect.succeed(1)')
    expect(result.code).toContain('return x')
  })

  it('transforms multiple gen blocks', () => {
    const input = `
const a = gen {
  x <- Effect.succeed(1)
  return x
}

const b = gen {
  y <- Effect.succeed(2)
  return y
}
`
    const result = transformSource(input)

    expect(result.hasChanges).toBe(true)
    expect(result.code.match(/Effect\.gen/g)?.length).toBe(2)
  })

  it('transforms destructuring bind patterns', () => {
    const input = `const result = gen {
  { name, age } <- getUser()
  [first, second] <- getItems()
  return { name, first }
}`
    const result = transformSource(input)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const { name, age } = yield* getUser()')
    expect(result.code).toContain('const [first, second] = yield* getItems()')
  })

  it('preserves let/const declarations', () => {
    const input = `const result = gen {
  x <- Effect.succeed(1)
  let doubled = x * 2
  const tripled = x * 3
  return doubled + tripled
}`
    const result = transformSource(input)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('let doubled = x * 2')
    expect(result.code).toContain('const tripled = x * 3')
  })

  it('includes __EFFECT_SUGAR__ marker comment', () => {
    const input = `const x = gen { return 1 }`
    const result = transformSource(input)

    expect(result.code).toContain('/* __EFFECT_SUGAR__ */')
  })
})

describe('hasGenBlocks', () => {
  it('returns true when gen { is present', () => {
    expect(hasGenBlocks('const x = gen { return 1 }')).toBe(true)
    expect(hasGenBlocks('gen {')).toBe(true)
  })

  it('returns false when gen { is not present', () => {
    expect(hasGenBlocks('const x = 1')).toBe(false)
    expect(hasGenBlocks('function gen() {}')).toBe(false) // gen() not gen {
  })
})
