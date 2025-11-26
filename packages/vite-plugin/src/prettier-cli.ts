#!/usr/bin/env node
/**
 * CLI for formatting TypeScript files with effect-sugar gen {} syntax
 *
 * Usage:
 *   effect-sugar-prettier [files...]
 *   effect-sugar-prettier --write [files...]
 *   effect-sugar-prettier --check [files...]
 */

import { Effect, Console, Array as Arr } from 'effect'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { globSync } from 'glob'
import { formatWithEffectSugar } from './prettier.js'

interface CLIOptions {
  write: boolean
  check: boolean
  patterns: string[]
}

const parseArgs = (args: string[]): CLIOptions => {
  const options: CLIOptions = {
    write: false,
    check: false,
    patterns: []
  }

  for (const arg of args) {
    if (arg === '--write' || arg === '-w') {
      options.write = true
    } else if (arg === '--check' || arg === '-c') {
      options.check = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (!arg.startsWith('-')) {
      options.patterns.push(arg)
    }
  }

  return options
}

const printHelp = (): void => {
  console.log(`
effect-sugar-prettier - Format TypeScript with gen {} syntax

Usage:
  effect-sugar-prettier [options] [files/patterns...]

Options:
  --write, -w   Write formatted output back to files
  --check, -c   Check if files are formatted (exit 1 if not)
  --help, -h    Show this help message

Examples:
  # Format and print to stdout
  effect-sugar-prettier src/index.ts

  # Format and write back to file
  effect-sugar-prettier --write src/index.ts

  # Format all TS files with glob pattern
  effect-sugar-prettier --write 'src/**/*.ts'

  # Check formatting (for CI)
  effect-sugar-prettier --check 'src/**/*.ts'

  # With lint-staged
  "lint-staged": {
    "*.ts": "effect-sugar-prettier --write"
  }
`)
}

const expandGlobs = (patterns: string[]): string[] => {
  const files: string[] = []

  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
      const matches = globSync(pattern, { cwd: process.cwd() })
      files.push(...matches)
    } else if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
      files.push(pattern)
    }
  }

  return files
}

const formatFile = (filepath: string, options: CLIOptions): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    const absolutePath = path.resolve(filepath)
    const source = fs.readFileSync(absolutePath, 'utf-8')

    const formatted = yield* formatWithEffectSugar(source, { filepath: absolutePath }).pipe(
      Effect.mapError((e) => new Error(`Format failed: ${e.message}`))
    )

    if (options.check) {
      if (source !== formatted) {
        yield* Console.error(`File not formatted: ${filepath}`)
        return false
      }
      return true
    }

    if (options.write) {
      if (source !== formatted) {
        fs.writeFileSync(absolutePath, formatted, 'utf-8')
        yield* Console.log(`Formatted: ${filepath}`)
      }
    } else {
      process.stdout.write(formatted)
    }

    return true
  })

const main = Effect.gen(function* () {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    printHelp()
    return yield* Effect.fail(new Error('No arguments'))
  }

  const options = parseArgs(args)

  if (options.patterns.length === 0) {
    yield* Console.error('No files specified')
    return yield* Effect.fail(new Error('No files specified'))
  }

  const files = expandGlobs(options.patterns)

  if (files.length === 0) {
    yield* Console.error('No matching files found')
    return yield* Effect.fail(new Error('No matching files found'))
  }

  const results = yield* Effect.forEach(files, (file) => formatFile(file, options), {
    concurrency: 'unbounded'
  })

  const allPassed = Arr.every(results, (r) => r === true)

  if (!allPassed) {
    return yield* Effect.fail(new Error('Some files failed'))
  }
})

Effect.runPromise(main).catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
