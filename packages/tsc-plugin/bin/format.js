#!/usr/bin/env node

/**
 * CLI tool for formatting TypeScript files with gen {} syntax
 *
 * Usage:
 *   effect-sugar-format <files or directories...>
 *   effect-sugar-format src/**\/*.ts
 *   effect-sugar-format src/ test/
 */

import { formatFiles } from '../dist/format.js'

const args = process.argv.slice(2)
const verbose = args.includes('--verbose') || args.includes('-v')
const check = args.includes('--check') || args.includes('-c')
const paths = args.filter(arg => !arg.startsWith('-'))

if (paths.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
effect-sugar-format - Format TypeScript files with gen {} syntax

Usage:
  effect-sugar-format <files or directories...>

Examples:
  effect-sugar-format src/**/*.ts
  effect-sugar-format src/ test/
  effect-sugar-format examples/basic.ts

Options:
  --check, -c      Check if files are formatted (exit 1 if not)
  --verbose, -v    Show ignored files
  --help, -h       Show this help message

This tool wraps Prettier and handles gen {} block syntax:
1. Transforms gen {} to Effect.gen() before formatting
2. Runs Prettier
3. Transforms back to gen {} syntax
`)
  process.exit(0)
}

;(async () => {
  try {
    console.log(`${check ? 'Checking' : 'Formatting'} ${paths.length} path(s)...`)

    const results = await formatFiles(paths, { write: !check })

    let formatted = 0
    let skipped = 0
    let errors = 0
    let needsFormatting = 0

    for (const result of results) {
      if (result.error) {
        console.error(`❌ ${result.filePath}: ${result.error.message}`)
        errors++
      } else if (check && result.changed) {
        console.log(`✗ ${result.filePath} (needs formatting)`)
        needsFormatting++
      } else if (check && result.formatted && !result.changed) {
        console.log(`✓ ${result.filePath}`)
        formatted++
      } else if (!check && result.formatted) {
        console.log(`✓ ${result.filePath}`)
        formatted++
      } else {
        if (verbose) {
          console.log(`⊘ ${result.filePath} (ignored)`)
        }
        skipped++
      }
    }

    if (check) {
      if (needsFormatting > 0) {
        console.log(`\n${needsFormatting} file(s) need formatting`)
        process.exit(1)
      }
      console.log(`\nAll files are formatted! ${formatted} checked, ${skipped} skipped, ${errors} errors`)
    } else {
      console.log(`\nDone! ${formatted} formatted, ${skipped} skipped, ${errors} errors`)
    }

    if (errors > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
})()
