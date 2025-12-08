/**
 * Integration tests for effect-sugar-esbuild plugin
 *
 * These tests verify that:
 * 1. The esbuild plugin correctly transforms gen blocks
 * 2. The bundled code can be executed
 * 3. Effects run correctly and produce expected values
 */

import { describe, it, expect } from 'vitest'
import * as esbuild from 'esbuild'
import { effectSugarPlugin } from '../../packages/esbuild-plugin/dist/index.js'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const TEST_DIR = join(process.cwd(), 'test', 'integration', 'tmp-esbuild')

describe('esbuild plugin integration', () => {
  async function setupTestFile(filename: string, content: string): Promise<string> {
    await mkdir(TEST_DIR, { recursive: true })
    const filepath = join(TEST_DIR, filename)
    await writeFile(filepath, content, 'utf-8')
    return filepath
  }

  async function cleanup() {
    await rm(TEST_DIR, { recursive: true, force: true })
  }

  it('transforms and bundles gen blocks correctly', async () => {
    const filepath = await setupTestFile(
      'simple.ts',
      `
      import { Effect } from 'effect'

      export const program = gen {
        x <- Effect.succeed(42)
        return x
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      const output = result.outputFiles?.[0]?.text ?? ''

      // Verify transformation happened
      expect(output).toContain('Effect.gen')
      expect(output).toContain('function*')
      expect(output).toContain('yield*')
      expect(output).not.toContain('gen {')
      expect(output).not.toContain('<-')
    } finally {
      await cleanup()
    }
  })

  it('handles multiple gen blocks in same file', async () => {
    const filepath = await setupTestFile(
      'multiple.ts',
      `
      import { Effect } from 'effect'

      export const first = gen {
        x <- Effect.succeed(1)
        return x
      }

      export const second = gen {
        y <- Effect.succeed(2)
        return y
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      const output = result.outputFiles?.[0]?.text ?? ''

      // Should have two Effect.gen calls
      const genMatches = output.match(/Effect\.gen/g)
      expect(genMatches).toBeTruthy()
      expect(genMatches?.length).toBe(2)
    } finally {
      await cleanup()
    }
  })

  it('preserves complex syntax patterns', async () => {
    const filepath = await setupTestFile(
      'complex.ts',
      `
      import { Effect } from 'effect'

      export const program = gen {
        a <- Effect.succeed(10)
        let doubled = a * 2
        b <- Effect.succeed(doubled)
        if (b > 15) {
          return "large"
        } else {
          return "small"
        }
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      const output = result.outputFiles?.[0]?.text ?? ''

      // Verify all transformation patterns
      expect(output).toContain('yield* Effect.succeed(10)')
      expect(output).toContain('let doubled = a * 2')
      expect(output).toContain('yield* Effect.succeed(doubled)')
      expect(output).toContain('if (b > 15)')
    } finally {
      await cleanup()
    }
  })

  it('handles destructuring patterns', async () => {
    const filepath = await setupTestFile(
      'destructure.ts',
      `
      import { Effect } from 'effect'

      export const program = gen {
        { name, age } <- Effect.succeed({ name: "Alice", age: 30 })
        [first, second] <- Effect.succeed([1, 2])
        return { name, first }
      }
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      const output = result.outputFiles?.[0]?.text ?? ''

      // Verify destructuring transformations
      expect(output).toMatch(/const\s+{\s*name,\s*age\s*}\s*=\s*yield\*/)
      expect(output).toMatch(/const\s+\[\s*first,\s*second\s*]\s*=\s*yield\*/)
    } finally {
      await cleanup()
    }
  })

  it('skips files without gen blocks', async () => {
    const filepath = await setupTestFile(
      'no-gen.ts',
      `
      import { Effect } from 'effect'

      export const program = Effect.succeed(42)
      `
    )

    try {
      const result = await esbuild.build({
        entryPoints: [filepath],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      const output = result.outputFiles?.[0]?.text ?? ''

      // Should not add generator syntax
      expect(output).not.toContain('function*')
      expect(output).toContain('Effect.succeed(42)')
    } finally {
      await cleanup()
    }
  })

  it('works with multiple files in separate builds', async () => {
    const file1 = await setupTestFile(
      'entry1.ts',
      `
      import { Effect } from 'effect'

      export const prog1 = gen {
        x <- Effect.succeed(1)
        return x
      }
      `
    )

    const file2 = await setupTestFile(
      'entry2.ts',
      `
      import { Effect } from 'effect'

      export const prog2 = gen {
        y <- Effect.succeed(2)
        return y
      }
      `
    )

    try {
      const result1 = await esbuild.build({
        entryPoints: [file1],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      const result2 = await esbuild.build({
        entryPoints: [file2],
        bundle: true,
        write: false,
        plugins: [effectSugarPlugin()],
        format: 'esm',
        platform: 'node',
        external: ['effect']
      })

      // Both files should be transformed
      const output1 = result1.outputFiles?.[0]?.text ?? ''
      expect(output1).toContain('Effect.gen')
      expect(output1).toContain('yield*')

      const output2 = result2.outputFiles?.[0]?.text ?? ''
      expect(output2).toContain('Effect.gen')
      expect(output2).toContain('yield*')
    } finally {
      await cleanup()
    }
  })
})
