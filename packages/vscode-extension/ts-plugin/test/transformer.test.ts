import { describe, it, expect } from 'vitest'
import { transformSource } from '../src/transformer.js'

describe('transformSource - basic transformations', () => {
  it('transforms simple gen block', () => {
    const source = `const result = gen {
  user <- getUser()
  return user
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('Effect.gen')
    expect(result.code).toContain('function* ()')
    expect(result.code).toContain('const user = yield* getUser()')
  })

  it('returns unchanged code when no gen blocks', () => {
    const source = `const x = 1`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(false)
    expect(result.code).toBe(source)
    expect(result.map).toBeNull()
  })

  it('transforms multiple binds', () => {
    const source = `const result = gen {
  a <- getA()
  b <- getB()
  c <- getC()
  return { a, b, c }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const a = yield* getA()')
    expect(result.code).toContain('const b = yield* getB()')
    expect(result.code).toContain('const c = yield* getC()')
  })

  it('preserves let bindings as-is', () => {
    const source = `const result = gen {
  user <- getUser()
  let name = user.name
  return name
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const user = yield* getUser()')
    expect(result.code).toContain('let name = user.name')
  })
})

describe('transformSource - line ending variations', () => {
  it('handles Unix line endings (\\n)', () => {
    const source = "const x = gen {\n  user <- getUser()\n  return user\n}"
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const user = yield* getUser()')
  })

  it('handles Windows line endings (\\r\\n)', () => {
    const source = "const x = gen {\r\n  user <- getUser()\r\n  return user\r\n}"
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const user = yield* getUser()')
  })

  it('handles mixed line endings', () => {
    const source = "const x = gen {\n  user <- getUser()\r\n  return user\n}"
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const user = yield* getUser()')
  })

  it('handles Mac Classic line endings (\\r) - edge case', () => {
    // Mac Classic (\r only) is extremely rare (pre-OS X)
    // Test that it doesn't crash, but transformation may not work perfectly
    const source = "const x = gen {\r  user <- getUser()\r  return user\r}"
    const result = transformSource(source)

    // Should at least detect and attempt transformation
    expect(result.hasChanges).toBe(true)
    // Content may not transform perfectly due to line splitting on \n
    // But it should not crash
    expect(result.code).toBeTruthy()
  })
})

describe('transformSource - edge cases', () => {
  it('handles empty gen blocks', () => {
    const source = "const x = gen {}"
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('Effect.gen')
  })

  it('handles gen blocks with only whitespace', () => {
    const source = "const x = gen {\n  \n  \n}"
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('Effect.gen')
  })

  it('handles gen blocks with only comments', () => {
    const source = `const x = gen {
  // Just a comment
  // Another comment
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('// Just a comment')
  })

  it('handles extremely long lines', () => {
    const longExpr = 'x'.repeat(10000)
    const source = `const x = gen {
  result <- Effect.succeed(${longExpr})
  return result
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const result = yield* Effect.succeed(')
  })

  it('handles deeply nested braces in expressions', () => {
    const source = `const x = gen {
  obj <- getObject()
  nested = { a: { b: { c: { d: { e: 1 } } } } }
  return { obj, nested }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const obj = yield* getObject()')
    expect(result.code).toContain('nested = { a: { b: { c: { d: { e: 1 } } } } }')
  })

  it('handles special characters in bind expressions', () => {
    const source = `const x = gen {
  data <- Effect.succeed({ "key": "value", 'single': true })
  return data
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const data = yield*')
  })
})

describe('transformSource - destructuring', () => {
  it('transforms array destructuring bind', () => {
    const source = `const result = gen {
  [a, b] <- Effect.all([getA(), getB()])
  return { a, b }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const [a, b] = yield* Effect.all([getA(), getB()])')
  })

  it('transforms object destructuring bind', () => {
    const source = `const result = gen {
  { name, age } <- getUser()
  return { name, age }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const { name, age } = yield* getUser()')
  })

  it('transforms nested destructuring', () => {
    const source = `const result = gen {
  [{ a }, b] <- getComplex()
  return { a, b }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const [{ a }, b] = yield* getComplex()')
  })

  it('transforms destructuring with rest spread', () => {
    const source = `const result = gen {
  [first, ...rest] <- getItems()
  return { first, rest }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const [first, ...rest] = yield* getItems()')
  })

  it('transforms object destructuring with renaming', () => {
    const source = `const result = gen {
  { name: userName, age: userAge } <- getUser()
  return { userName, userAge }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const { name: userName, age: userAge } = yield* getUser()')
  })
})

describe('transformSource - semicolons', () => {
  it('preserves semicolons in bind statements', () => {
    const source = `const result = gen {
  user <- getUser();
  return user;
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const user = yield* getUser();')
    expect(result.code).toContain('return user;')
  })

  it('handles mix of semicolon and no-semicolon', () => {
    const source = `const result = gen {
  a <- getA();
  b <- getB()
  return { a, b };
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const a = yield* getA();')
    expect(result.code).toContain('const b = yield* getB()')
  })
})

describe('transformSource - nested functions', () => {
  it('does NOT transform binds inside arrow functions', () => {
    const source = `const result = gen {
  items <- getItems()
  const processed = items.map((item) => {
    x <- transform(item)
    return x
  })
  return processed
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const items = yield* getItems()')
    // Bind inside arrow function should NOT be transformed
    expect(result.code).toContain('x <- transform(item)')
  })

  it('does NOT transform binds inside regular functions', () => {
    const source = `const result = gen {
  items <- getItems()
  function processItem(item) {
    x <- transform(item)
    return x
  }
  return items.map(processItem)
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const items = yield* getItems()')
    // Bind inside function should NOT be transformed
    expect(result.code).toContain('x <- transform(item)')
  })
})

describe('transformSource - control flow', () => {
  it('transforms binds inside if blocks', () => {
    const source = `const result = gen {
  config <- loadConfig()
  if (!config) {
    _ <- Effect.fail(new Error("Not found"))
  }
  return config
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const config = yield* loadConfig()')
    expect(result.code).toContain('const _ = yield* Effect.fail(new Error("Not found"))')
  })

  it('transforms binds inside else blocks', () => {
    const source = `const result = gen {
  value <- getValue()
  if (value > 0) {
    pos <- processPositive(value)
    return pos
  } else {
    neg <- processNegative(value)
    return neg
  }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const pos = yield* processPositive(value)')
    expect(result.code).toContain('const neg = yield* processNegative(value)')
  })

  it('transforms binds inside try/catch', () => {
    const source = `const result = gen {
  config <- loadConfig()
  try {
    data <- fetchData(config)
    return data
  } catch (e) {
    fallback <- getFallback()
    return fallback
  }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('const config = yield* loadConfig()')
    expect(result.code).toContain('const data = yield* fetchData(config)')
    expect(result.code).toContain('const fallback = yield* getFallback()')
  })
})

describe('transformSource - source maps', () => {
  it('generates source map', () => {
    const source = `const result = gen {
  user <- getUser()
  return user
}`
    const result = transformSource(source, 'test.ts')

    expect(result.map).not.toBeNull()
    expect(result.map?.sources).toContain('test.ts')
    expect(result.map?.mappings).toBeTruthy()
  })

  it('includes source content in map', () => {
    const source = `const result = gen {
  user <- getUser()
  return user
}`
    const result = transformSource(source, 'test.ts')

    expect(result.map?.sourcesContent).toBeTruthy()
    expect(result.map?.sourcesContent?.[0]).toBe(source)
  })

  it('preserves MagicString instance', () => {
    const source = `const result = gen {
  user <- getUser()
  return user
}`
    const result = transformSource(source)

    expect(result.magicString).not.toBeNull()
  })
})

describe('transformSource - multiple blocks', () => {
  it('transforms multiple gen blocks in same file', () => {
    const source = `
const first = gen {
  a <- getA()
  return a
}

const second = gen {
  b <- getB()
  return b
}
`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code.match(/Effect\.gen/g)?.length).toBe(2)
    expect(result.code).toContain('const a = yield* getA()')
    expect(result.code).toContain('const b = yield* getB()')
  })

  it('handles nested gen blocks', () => {
    const source = `const outer = gen {
  x <- getX()
  const inner = gen {
    y <- getY()
    return y
  }
  return { x, inner }
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code.match(/Effect\.gen/g)?.length).toBe(2)
  })
})

describe('transformSource - whitespace preservation', () => {
  it('preserves indentation', () => {
    const source = `const result = gen {
    user <- getUser()
      profile <- getProfile(user.id)
        data <- getData(profile.id)
    return data
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('    const user = yield* getUser()')
    expect(result.code).toContain('      const profile = yield* getProfile(user.id)')
    expect(result.code).toContain('        const data = yield* getData(profile.id)')
  })

  it('preserves tabs', () => {
    const source = `const result = gen {
\tuser <- getUser()
\t\tprofile <- getProfile(user.id)
\treturn profile
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    expect(result.code).toContain('\tconst user = yield* getUser()')
    expect(result.code).toContain('\t\tconst profile = yield* getProfile(user.id)')
  })

  it('preserves empty lines', () => {
    const source = `const result = gen {
  user <- getUser()

  profile <- getProfile(user.id)

  return profile
}`
    const result = transformSource(source)

    expect(result.hasChanges).toBe(true)
    const lines = result.code.split('\n')
    expect(lines.some(line => line.trim() === '')).toBe(true)
  })
})
