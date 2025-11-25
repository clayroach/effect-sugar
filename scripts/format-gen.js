#!/usr/bin/env node
/**
 * Prettier wrapper for files with gen { } syntax
 *
 * Transforms gen blocks to valid JS for formatting, then transforms back.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

/**
 * Find matching closing brace for a gen block
 */
function findGenBlockEnd(text, startBrace) {
  let depth = 1
  let pos = startBrace + 1
  let inString = null

  while (pos < text.length && depth > 0) {
    const char = text[pos]

    if (inString) {
      if (char === inString && text[pos - 1] !== '\\') {
        inString = null
      }
      pos++
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char
      pos++
      continue
    }

    if (char === '{') depth++
    if (char === '}') depth--
    pos++
  }

  return depth === 0 ? pos : -1
}

/**
 * Transform gen block content to valid JS
 */
function genToJs(genBlockContent) {
  // Extract the content inside { }
  const braceStart = genBlockContent.indexOf('{')
  const content = genBlockContent.slice(braceStart + 1, -1)

  // Transform statements
  let transformed = content
    // x <- expr → const x = /*BIND*/yield* expr
    .replace(/^(\s*)(\w+)\s*<-\s*/gm, '$1const $2 = /*BIND*/yield* ')
    // let x = expr → const x = /*LET*/expr
    .replace(/^(\s*)let\s+(\w+)\s*=\s*/gm, '$1const $2 = /*LET*/')

  return `Effect.gen(function* () {${transformed}})`
}

/**
 * Transform formatted JS back to gen block syntax
 */
function jsToGen(jsContent) {
  // Extract content from Effect.gen(function* () { ... })
  const match = jsContent.match(/Effect\.gen\(function\*\s*\(\)\s*\{([\s\S]*)\}\)/)
  if (!match) return jsContent

  let content = match[1]

  // Transform back
  content = content
    // const x = /*BIND*/ yield* expr → x <- expr
    .replace(/const\s+(\w+)\s*=\s*\/\*BIND\*\/\s*yield\*\s*/g, '$1 <- ')
    // const x = /*LET*/ expr → let x = expr
    .replace(/const\s+(\w+)\s*=\s*\/\*LET\*\/\s*/g, 'let $1 = ')

  return `gen {${content}}`
}

/**
 * Transform all gen blocks in a file to valid JS
 */
function transformGenBlocksToJs(text) {
  const pattern = /\bgen\s*\{/g
  let result = text
  let offset = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    const genStart = match.index
    const braceStart = text.indexOf('{', genStart)
    const blockEnd = findGenBlockEnd(text, braceStart)

    if (blockEnd === -1) continue

    const genBlock = text.slice(genStart, blockEnd)
    const jsBlock = genToJs(genBlock)

    // Replace in result
    const adjustedStart = genStart + offset
    const adjustedEnd = blockEnd + offset
    result = result.slice(0, adjustedStart) + jsBlock + result.slice(adjustedEnd)

    offset += jsBlock.length - (blockEnd - genStart)
  }

  return result
}

/**
 * Transform all Effect.gen blocks back to gen syntax
 */
function transformJsToGenBlocks(text) {
  // Match Effect.gen(function* () { ... })
  const pattern = /Effect\.gen\(function\*\s*\(\)\s*\{/g
  let result = text
  let offset = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    const genStart = match.index
    const braceStart = text.indexOf('{', genStart + 20) // Skip past "Effect.gen(function* () "
    const blockEnd = findGenBlockEnd(text, braceStart)

    if (blockEnd === -1) continue

    // Find the closing ) for Effect.gen(...)
    const fullEnd = blockEnd + 1 // Skip the )

    const jsBlock = text.slice(genStart, fullEnd)
    const genBlock = jsToGen(jsBlock)

    // Replace in result
    const adjustedStart = genStart + offset
    const adjustedEnd = fullEnd + offset
    result = result.slice(0, adjustedStart) + genBlock + result.slice(adjustedEnd)

    offset += genBlock.length - (fullEnd - genStart)
  }

  return result
}

/**
 * Recursively find all .ts files
 */
function findTsFiles(dir, files = []) {
  if (!existsSync(dir)) return files

  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
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
 * Format a single file
 */
function formatFile(filePath) {
  const source = readFileSync(filePath, 'utf-8')

  // Check if file has gen blocks
  if (!/\bgen\s*\{/.test(source)) {
    // No gen blocks, format normally
    execSync(`npx prettier --write "${filePath}"`, { stdio: 'inherit' })
    return
  }

  // Transform gen blocks to valid JS
  const jsCode = transformGenBlocksToJs(source)

  // Write to temp file
  const tempFile = join(tmpdir(), `gen-format-${Date.now()}.ts`)
  writeFileSync(tempFile, jsCode)

  try {
    // Format with Prettier
    execSync(`npx prettier --write "${tempFile}"`, { stdio: 'pipe' })

    // Read formatted content
    const formatted = readFileSync(tempFile, 'utf-8')

    // Transform back to gen syntax
    const restored = transformJsToGenBlocks(formatted)

    // Write back to original file
    writeFileSync(filePath, restored)
    console.log(`Formatted: ${filePath}`)
  } finally {
    // Clean up temp file
    if (existsSync(tempFile)) {
      execSync(`rm "${tempFile}"`)
    }
  }
}

// Main
const args = process.argv.slice(2)
const dirs = args.length > 0 ? args : ['examples']

for (const dir of dirs) {
  const files = findTsFiles(dir)
  for (const file of files) {
    formatFile(file)
  }
}
