import { describe, it, expect } from 'vitest'
import { transformBack, formatFile, findTsFiles } from '../src/format.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('format', () => {
  describe('transformBack', () => {
    it('should transform Effect.gen back to gen syntax', () => {
      const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  return { user, profile }
})`

      const expected = `gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  return { user, profile }
}`

      expect(transformBack(input)).toBe(expected)
    })

    it('should handle discard pattern (_)', () => {
      const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  yield* logMessage("Starting")
  const result = yield* compute()
  return result
})`

      const expected = `gen {
  _ <- logMessage("Starting")
  result <- compute()
  return result
}`

      expect(transformBack(input)).toBe(expected)
    })

    it('should handle multiple gen blocks', () => {
      const input = `const a = Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const x = yield* foo()
  return x
})

const b = Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const y = yield* bar()
  return y
})`

      const expected = `const a = gen {
  x <- foo()
  return x
}

const b = gen {
  y <- bar()
  return y
}`

      expect(transformBack(input)).toBe(expected)
    })

    it('should preserve code without gen marker', () => {
      const input = `Effect.gen(function* () {
  const x = yield* foo()
  return x
})`

      expect(transformBack(input)).toBe(input)
    })

    it('should handle nested braces', () => {
      const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const data = yield* fetch()
  if (data) {
    const result = yield* process(data)
    return { success: true, result }
  }
  return { success: false }
})`

      const expected = `gen {
  data <- fetch()
  if (data) {
    result <- process(data)
    return { success: true, result }
  }
  return { success: false }
}`

      expect(transformBack(input)).toBe(expected)
    })

    it('should handle strings with braces', () => {
      const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const msg = "Hello {world}"
  const result = yield* sendMessage(msg)
  return result
})`

      const expected = `gen {
  const msg = "Hello {world}"
  result <- sendMessage(msg)
  return result
}`

      expect(transformBack(input)).toBe(expected)
    })

    describe('edge cases', () => {
      it('should handle single statement gen block', () => {
        const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  return yield* getValue()
})`

        const expected = `gen {
  return _ <- getValue()
}`

        expect(transformBack(input)).toBe(expected)
      })

      it('should handle gen block with only return statement (no bindings)', () => {
        const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  return { status: "ok" }
})`

        const expected = `gen {
  return { status: "ok" }
}`

        expect(transformBack(input)).toBe(expected)
      })

      it('should handle comments inside gen blocks', () => {
        const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  // Fetch user data
  const user = yield* getUser(id)
  /* Process the user */
  const result = yield* process(user)
  return result
})`

        const expected = `gen {
  // Fetch user data
  user <- getUser(id)
  /* Process the user */
  result <- process(user)
  return result
}`

        expect(transformBack(input)).toBe(expected)
      })

      it('should handle gen blocks with unusual whitespace', () => {
        const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {


  const x = yield* foo()


  return x
})`

        const expected = `gen {


  x <- foo()


  return x
}`

        expect(transformBack(input)).toBe(expected)
      })

      it('should handle complex nested control flow', () => {
        const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const data = yield* fetch()
  for (const item of data) {
    const processed = yield* processItem(item)
    if (processed.valid) {
      yield* save(processed)
    }
  }
  return data.length
})`

        const expected = `gen {
  data <- fetch()
  for (const item of data) {
    processed <- processItem(item)
    if (processed.valid) {
      _ <- save(processed)
    }
  }
  return data.length
}`

        expect(transformBack(input)).toBe(expected)
      })

      it('should handle template literals with expressions', () => {
        const input = `Effect.gen(/* __EFFECT_SUGAR__ */ function* () {
  const name = yield* getName()
  const msg = \`Hello \${name}!\`
  const result = yield* sendMessage(msg)
  return result
})`

        const expected = `gen {
  name <- getName()
  const msg = \`Hello \${name}!\`
  result <- sendMessage(msg)
  return result
}`

        expect(transformBack(input)).toBe(expected)
      })
    })
  })

  describe('formatFile', () => {
    it('should format a file with gen blocks', async () => {
      const tmpFile = join(tmpdir(), `test-${Date.now()}.ts`)

      const content = `const program = gen {
user<-getUser(id)
profile<-getProfile(user.id)
return {user,profile}
}`

      await fs.writeFile(tmpFile, content)

      try {
        const result = await formatFile(tmpFile, { write: false })

        expect(result.hasGenBlocks).toBe(true)
        expect(result.formatted).toBe(true)
        expect(result.content).toBeTruthy()
        expect(result.content).toContain('gen {')
        expect(result.content).not.toContain('Effect.gen')
      } finally {
        await fs.unlink(tmpFile).catch(() => {})
      }
    })

    it('should format a file without gen blocks normally', async () => {
      const tmpFile = join(tmpdir(), `test-${Date.now()}.ts`)

      const content = `const x=1+2
const y=x*3`

      await fs.writeFile(tmpFile, content)

      try {
        const result = await formatFile(tmpFile, { write: false })

        expect(result.hasGenBlocks).toBe(false)
        expect(result.formatted).toBe(true)
        expect(result.content).toBeTruthy()
      } finally {
        await fs.unlink(tmpFile).catch(() => {})
      }
    })
  })

  describe('findTsFiles', () => {
    it('should find TypeScript files recursively', async () => {
      const tmpDir = join(tmpdir(), `test-dir-${Date.now()}`)
      await fs.mkdir(tmpDir, { recursive: true })
      await fs.mkdir(join(tmpDir, 'src'), { recursive: true })

      await fs.writeFile(join(tmpDir, 'file1.ts'), '')
      await fs.writeFile(join(tmpDir, 'src', 'file2.ts'), '')
      await fs.writeFile(join(tmpDir, 'src', 'file3.tsx'), '')
      await fs.writeFile(join(tmpDir, 'file.d.ts'), '')
      await fs.writeFile(join(tmpDir, 'file.js'), '')

      try {
        const files = await findTsFiles(tmpDir)

        expect(files).toHaveLength(3)
        expect(files.some((f) => f.endsWith('file1.ts'))).toBe(true)
        expect(files.some((f) => f.endsWith('file2.ts'))).toBe(true)
        expect(files.some((f) => f.endsWith('file3.tsx'))).toBe(true)
        expect(files.some((f) => f.endsWith('file.d.ts'))).toBe(false)
        expect(files.some((f) => f.endsWith('file.js'))).toBe(false)
      } finally {
        await fs.rm(tmpDir, { recursive: true }).catch(() => {})
      }
    })

    it('should exclude node_modules, target, and dist directories', async () => {
      const tmpDir = join(tmpdir(), `test-dir-${Date.now()}`)
      await fs.mkdir(join(tmpDir, 'node_modules'), { recursive: true })
      await fs.mkdir(join(tmpDir, 'target'), { recursive: true })
      await fs.mkdir(join(tmpDir, 'dist'), { recursive: true })
      await fs.mkdir(join(tmpDir, 'src'), { recursive: true })

      await fs.writeFile(join(tmpDir, 'node_modules', 'file.ts'), '')
      await fs.writeFile(join(tmpDir, 'target', 'file.ts'), '')
      await fs.writeFile(join(tmpDir, 'dist', 'file.ts'), '')
      await fs.writeFile(join(tmpDir, 'src', 'file.ts'), '')

      try {
        const files = await findTsFiles(tmpDir)

        expect(files).toHaveLength(1)
        expect(files[0]).toContain('src')
      } finally {
        await fs.rm(tmpDir, { recursive: true }).catch(() => {})
      }
    })
  })
})
