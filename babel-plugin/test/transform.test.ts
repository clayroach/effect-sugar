import { describe, it, expect } from 'vitest'
import { parseEffBlock } from '../src/parser'
import { generateEffectGen } from '../src/generator'
import { transformSource } from '../src/index'

describe('parseEffBlock', () => {
  it('should parse simple bind statement', () => {
    const result = parseEffBlock('x <- getUser(id)')
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0]).toEqual({
      type: 'bind',
      variable: 'x',
      expression: 'getUser(id)'
    })
  })

  it('should parse multiple bind statements', () => {
    const result = parseEffBlock(`
      x <- getUser(id)
      y <- getProfile(x)
    `)
    expect(result.statements).toHaveLength(2)
    expect(result.statements[0].type).toBe('bind')
    expect(result.statements[1].type).toBe('bind')
  })

  it('should parse return statement', () => {
    const result = parseEffBlock(`
      x <- getUser(id)
      return x.name
    `)
    expect(result.statements).toHaveLength(2)
    expect(result.statements[1]).toEqual({
      type: 'return',
      expression: 'x.name'
    })
  })

  it('should parse let statement', () => {
    const result = parseEffBlock(`
      x <- getUser(id)
      let name = x.name
      return name
    `)
    expect(result.statements).toHaveLength(3)
    expect(result.statements[1]).toEqual({
      type: 'let',
      variable: 'name',
      expression: 'x.name'
    })
  })

  it('should handle complex expressions', () => {
    const result = parseEffBlock(`
      result <- api.get({ url: "/users", params: { id } })
    `)
    expect(result.statements[0]).toEqual({
      type: 'bind',
      variable: 'result',
      expression: 'api.get({ url: "/users", params: { id } })'
    })
  })

  it('should parse if statements', () => {
    const result = parseEffBlock(`
      x <- getValue()
      if (x > 0) {
        return x
      } else {
        return 0
      }
    `)
    expect(result.statements).toHaveLength(2)
    expect(result.statements[1].type).toBe('if')
  })
})

describe('generateEffectGen', () => {
  it('should generate Effect.gen for simple bind', () => {
    const ast = parseEffBlock('x <- getUser(id)')
    const code = generateEffectGen(ast)
    expect(code).toContain('Effect.gen(function* ()')
    expect(code).toContain('const x = yield* getUser(id)')
  })

  it('should generate complete program', () => {
    const ast = parseEffBlock(`
      x <- getUser(id)
      y <- getProfile(x)
      return { user: x, profile: y }
    `)
    const code = generateEffectGen(ast)
    expect(code).toBe(`Effect.gen(function* () {
  const x = yield* getUser(id)
  const y = yield* getProfile(x)
  return { user: x, profile: y }
})`)
  })

  it('should handle let statements', () => {
    const ast = parseEffBlock(`
      x <- getUser(id)
      let name = x.name.toUpperCase()
      return name
    `)
    const code = generateEffectGen(ast)
    expect(code).toContain('const name = x.name.toUpperCase()')
  })

  it('should use custom effect import', () => {
    const ast = parseEffBlock('x <- getUser(id)')
    const code = generateEffectGen(ast, { effectImport: 'E' })
    expect(code).toContain('E.gen(function* ()')
  })
})

describe('transformSource', () => {
  it('should transform eff block in source', () => {
    const source = `
      const program = gen {
        x <- getUser(id)
        return x.name
      }
    `
    const result = transformSource(source)
    expect(result).toContain('Effect.gen(function* ()')
    expect(result).toContain('const x = yield* getUser(id)')
    expect(result).not.toContain('gen {')
    expect(result).not.toContain('<-')
  })

  it('should transform multiple gen blocks', () => {
    const source = `
      const a = gen {
        x <- effect1()
        return x
      }

      const b = gen {
        y <- effect2()
        return y
      }
    `
    const result = transformSource(source)
    expect(result.match(/Effect\.gen/g)).toHaveLength(2)
  })

  it('should preserve surrounding code', () => {
    const source = `
      import { Effect } from 'effect'

      const id = 123

      const program = gen {
        x <- getUser(id)
        return x
      }

      console.log(program)
    `
    const result = transformSource(source)
    expect(result).toContain("import { Effect } from 'effect'")
    expect(result).toContain('const id = 123')
    expect(result).toContain('console.log(program)')
  })

  it('should handle nested braces in expressions', () => {
    const source = `
      const program = gen {
        x <- api.get({ url: "/users", params: { id: 1 } })
        return x
      }
    `
    const result = transformSource(source)
    expect(result).toContain('api.get({ url: "/users", params: { id: 1 } })')
  })

  it('should return unchanged source if no gen blocks', () => {
    const source = `const x = 1 + 2`
    const result = transformSource(source)
    expect(result).toBe(source)
  })
})
