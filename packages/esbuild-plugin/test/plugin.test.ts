import { describe, it, expect } from 'vitest'
import * as esbuild from 'esbuild'
import { effectSugarPlugin } from '../src/index.js'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const TEST_DIR = join(process.cwd(), 'test', 'tmp')

describe('effectSugarPlugin', () => {
  // Setup and teardown for test files
  async function setupTestFile(filename: string, content: string): Promise<string> {
    await mkdir(TEST_DIR, { recursive: true })
    const filepath = join(TEST_DIR, filename)
    await writeFile(filepath, content, 'utf-8')
    return filepath
  }

  async function cleanup() {
    await rm(TEST_DIR, { recursive: true, force: true })
  }

  it('transforms gen blocks in TypeScript files', async () => {
    const filepath = await setupTestFile(
      'test.ts',
      `
      import { Effect } from 'effect'

      const program = gen {
        x <- Effect.succeed(1)
        return x
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: false,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        target: 'esnext'
      })

      const output = result.outputFiles?.[0]?.text ?? ''
      expect(output).toContain('Effect.gen')
      expect(output).toContain('function*')
      expect(output).toContain('yield*')
    } finally {
      await cleanup()
    }
  })

  it('transforms gen blocks in TSX files', async () => {
    const filepath = await setupTestFile(
      'test.tsx',
      `
      import { Effect } from 'effect'

      const Component = () => {
        const data = gen {
          result <- Effect.succeed("hello")
          return result
        }
        return <div>{data}</div>
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: false,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        target: 'esnext',
        jsx: 'transform'
      })

      const output = result.outputFiles?.[0]?.text ?? ''
      expect(output).toContain('Effect.gen')
      expect(output).toContain('yield*')
    } finally {
      await cleanup()
    }
  })

  it('skips files without gen blocks', async () => {
    const filepath = await setupTestFile(
      'no-gen.ts',
      `
      import { Effect } from 'effect'

      const program = Effect.succeed(1)
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: false,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        target: 'esnext'
      })

      const output = result.outputFiles?.[0]?.text ?? ''
      expect(output).not.toContain('function*')
      expect(output).toContain('Effect.succeed(1)')
    } finally {
      await cleanup()
    }
  })

  it('respects custom filter pattern', async () => {
    const filepath = await setupTestFile(
      'custom.custom',
      `
      const program = gen {
        x <- Effect.succeed(1)
        return x
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: false,
        write: false,
        plugins: [effectSugarPlugin({ filter: /\.custom$/ })],
        format: 'esm',
        target: 'esnext',
        loader: { '.custom': 'ts' }
      })

      const output = result.outputFiles?.[0]?.text ?? ''
      expect(output).toContain('Effect.gen')
      expect(output).toContain('yield*')
    } finally {
      await cleanup()
    }
  })

  it('handles multiple gen blocks in single file', async () => {
    const filepath = await setupTestFile(
      'multiple.ts',
      `
      import { Effect } from 'effect'

      const program1 = gen {
        x <- Effect.succeed(1)
        return x
      }

      const program2 = gen {
        y <- Effect.succeed(2)
        return y
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: false,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        target: 'esnext'
      })

      const output = result.outputFiles?.[0]?.text ?? ''
      const genMatches = output.match(/Effect\.gen/g)
      expect(genMatches).toBeTruthy()
      expect(genMatches?.length).toBe(2)
    } finally {
      await cleanup()
    }
  })

  it('preserves correct syntax transformation', async () => {
    const filepath = await setupTestFile(
      'syntax.ts',
      `
      import { Effect } from 'effect'

      const program = gen {
        x <- Effect.succeed(1)
        let doubled = x * 2
        y <- Effect.succeed(doubled)
        return y
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: false,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        target: 'esnext'
      })

      const output = result.outputFiles?.[0]?.text ?? ''
      expect(output).toContain('yield* Effect.succeed(1)')
      expect(output).toContain('let doubled = x * 2')
      expect(output).toContain('yield* Effect.succeed(doubled)')
      expect(output).toContain('return y')
    } finally {
      await cleanup()
    }
  })
})
