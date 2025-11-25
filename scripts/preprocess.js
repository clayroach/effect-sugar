#!/usr/bin/env node
/**
 * Preprocessor for effect-sugar gen blocks
 *
 * Transforms gen { } blocks to Effect.gen before TypeScript compiles.
 * Scans all .ts files and outputs transformed files to target/src_managed/.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
import { transformSource } from '../babel-plugin/dist/index.js'

const args = process.argv.slice(2)

// Default source directories if none provided
const sourceDirs = args.length > 0 ? args : ['examples']
const outputBase = 'target/src_managed'

// Pattern to detect gen blocks
const GEN_PATTERN = /\bgen\s*\{/

/**
 * Recursively find all .ts files in a directory
 */
function findTsFiles(dir, files = []) {
  if (!existsSync(dir)) return files

  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      // Skip node_modules and output directories
      if (entry !== 'node_modules' && entry !== 'target' && entry !== 'dist') {
        findTsFiles(fullPath, files)
      }
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Process a single file if it contains gen blocks
 */
function processFile(inputFile, sourceDir) {
  const source = readFileSync(inputFile, 'utf-8')

  // Only process files that contain gen blocks
  if (!GEN_PATTERN.test(source)) {
    return false
  }

  // Transform gen blocks
  const transformed = transformSource(source)

  // Calculate output path preserving relative structure
  const relativePath = relative(sourceDir, inputFile)
  const outputPath = join(outputBase, relativePath)
  const outputDir = dirname(outputPath)

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  writeFileSync(outputPath, transformed)
  console.log(`Transformed: ${inputFile} -> ${outputPath}`)
  return true
}

// Process all source directories
let totalProcessed = 0

for (const sourceDir of sourceDirs) {
  const files = findTsFiles(sourceDir)

  for (const file of files) {
    if (processFile(file, sourceDir)) {
      totalProcessed++
    }
  }
}

if (totalProcessed === 0) {
  console.log('No files with gen blocks found to process')
} else {
  console.log(`\nProcessed ${totalProcessed} file(s) to ${outputBase}/`)
}
