import { describe, it, expect } from 'vitest'
import effectSugarPreprocessor from '../src/eslint.js'

describe('ESLint Preprocessor', () => {
  describe('preprocess', () => {
    it('transforms gen blocks in .ts files', () => {
      const source = `const program = gen {
  user <- getUser(id)
  return user
}`
      const result = effectSugarPreprocessor.preprocess(source, 'test.ts')

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Effect.gen(')
      expect(result[0]).toContain('function* ()')
      expect(result[0]).toContain('const user = yield* getUser(id)')
    })

    it('transforms gen blocks in .tsx files', () => {
      const source = `const program = gen {
  data <- fetchData()
  return <div>{data}</div>
}`
      const result = effectSugarPreprocessor.preprocess(source, 'Component.tsx')

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Effect.gen(')
    })

    it('passes through .js files unchanged', () => {
      const source = `const x = gen { return 1 }`
      const result = effectSugarPreprocessor.preprocess(source, 'test.js')

      // .js files are not processed
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(source)
    })

    it('passes through files without gen blocks unchanged', () => {
      const source = `const x = 1
const y = 2
export { x, y }
`
      const result = effectSugarPreprocessor.preprocess(source, 'test.ts')

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(source)
    })

    it('transforms nested gen blocks in objects', () => {
      const source = `const config = {
  run: gen {
    result <- doSomething()
    return result
  }
}`
      const result = effectSugarPreprocessor.preprocess(source, 'config.ts')

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('Effect.gen(')
      expect(result[0]).toContain('const result = yield* doSomething()')
    })

    it('handles complex expression that would cause ESLint errors', () => {
      // This is the pattern that causes @typescript-eslint/no-unused-expressions
      // ESLint sees `gen { }` as an identifier followed by an object literal
      const source = `export const myEffect = gen {
  result <- someEffect()
  return result
}`
      const result = effectSugarPreprocessor.preprocess(source, 'effects.ts')

      expect(result).toHaveLength(1)
      // After transformation, it's a valid function call expression
      expect(result[0]).toContain('Effect.gen(/* __EFFECT_SUGAR__ */ function* ()')
      expect(result[0]).not.toMatch(/\bgen\s*\{/)
    })

    it('transforms discard pattern without creating binding', () => {
      const source = `const program = gen {
  _ <- logStart()
  result <- compute()
  _ <- logEnd()
  return result
}`
      const result = effectSugarPreprocessor.preprocess(source, 'test.ts')

      expect(result).toHaveLength(1)
      expect(result[0]).toContain('yield* logStart()')
      expect(result[0]).toContain('const result = yield* compute()')
      expect(result[0]).toContain('yield* logEnd()')
      expect(result[0]).not.toContain('const _ = yield*')
    })
  })

  describe('postprocess', () => {
    it('flattens messages from all code blocks', () => {
      const messages: Array<Array<object>> = [
        [{ ruleId: 'no-console', line: 1 }],
        [{ ruleId: 'semi', line: 2 }]
      ]
      const result = effectSugarPreprocessor.postprocess(messages, 'test.ts')

      expect(result).toHaveLength(2)
    })

    it('passes through empty messages', () => {
      const messages: Array<Array<object>> = [[]]
      const result = effectSugarPreprocessor.postprocess(messages, 'test.ts')

      expect(result).toHaveLength(0)
    })
  })

  describe('supportsAutofix', () => {
    it('is true', () => {
      expect(effectSugarPreprocessor.supportsAutofix).toBe(true)
    })
  })
})
