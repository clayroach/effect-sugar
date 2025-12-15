/**
 * Prettier wrapper for files with gen {} syntax
 *
 * Transforms gen blocks to valid TypeScript for formatting, then transforms back.
 */

import { transformSource, hasGenBlocks, findGenBlocks } from 'effect-sugar-core'

/**
 * Marker comment to identify transformed gen blocks
 * This must match the marker used in effect-sugar-core
 */
const GEN_MARKER = '/* __EFFECT_SUGAR__ */'

/**
 * Normalize multi-line bind statements to single lines
 *
 * Transforms:
 *   result <-
 *   Effect.try({
 *
 * To:
 *   result <- Effect.try({
 *
 * This ensures the scanner can properly detect bind statements.
 */
export function normalizeBindStatements(source: string): string {
  // Pattern: identifier/pattern followed by <- on one line, then whitespace, then expression
  // We want to join these into a single line
  const multiLineBindPattern = /^(\s*)(\w+|\[[\w\s,.\[\]{}:]+\]|\{[\w\s,.:]+\})\s*<-\s*\n\s*/gm

  return source.replace(multiLineBindPattern, '$1$2 <- ')
}

export interface FormatOptions {
  /**
   * Whether to write formatted content back to files
   * @default true
   */
  write?: boolean

  /**
   * Prettier options to pass through
   */
  prettierOptions?: Record<string, any>
}

export interface FormatResult {
  filePath: string
  hasGenBlocks: boolean
  formatted: boolean
  /** Whether the content changed from the original (only set when write: false) */
  changed?: boolean
  content?: string
  error?: Error
}

/**
 * Get the indentation of the line containing a given position
 */
function getLineIndent(code: string, pos: number): string {
  // Find the start of the line
  let lineStart = pos
  while (lineStart > 0 && code[lineStart - 1] !== '\n') {
    lineStart--
  }

  // Extract leading whitespace
  let indent = ''
  while (lineStart < pos && (code[lineStart] === ' ' || code[lineStart] === '\t')) {
    indent += code[lineStart]
    lineStart++
  }

  return indent
}

/**
 * Find minimum indentation of non-empty lines in code
 */
function findMinIndent(code: string): number {
  const lines = code.split('\n')
  let minIndent = Infinity

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue

    // Count leading spaces
    const leadingSpaces = line.match(/^[ \t]*/)?.[0] || ''
    const indent = leadingSpaces.length
    if (indent < minIndent) {
      minIndent = indent
    }
  }

  return minIndent === Infinity ? 0 : minIndent
}

/**
 * Remove a fixed number of leading spaces/tabs from each line
 */
function dedent(code: string, amount: number): string {
  if (amount <= 0) return code

  const lines = code.split('\n')
  return lines
    .map((line) => {
      // Don't modify truly empty lines (no characters at all)
      if (line === '') return line

      // Remove up to `amount` characters of leading whitespace
      let removed = 0
      let i = 0
      while (i < line.length && removed < amount && (line[i] === ' ' || line[i] === '\t')) {
        removed++
        i++
      }
      return line.slice(i)
    })
    .join('\n')
}

/**
 * Transform gen block content back to gen syntax after formatting
 *
 * This reverses the transformation done by effect-sugar-core.
 * It looks for Effect.gen(/* __EFFECT_SUGAR__ *\/ function* () { ... })
 * and converts it back to gen { ... }
 */
export function transformBack(formattedCode: string): string {
  // Pattern to match Effect.gen(/* __EFFECT_SUGAR__ */ function* () { ... })
  const genPattern = new RegExp(
    `Effect\\.gen\\s*\\(\\s*\\/\\*\\s*__EFFECT_SUGAR__\\s*\\*\\/\\s*function\\s*\\*\\s*\\(\\s*\\)\\s*\\{`,
    'g'
  )

  if (!genPattern.test(formattedCode)) {
    return formattedCode
  }

  // Reset regex for actual transformation
  genPattern.lastIndex = 0

  let result = formattedCode
  const replacements: Array<{ start: number; end: number; replacement: string }> = []

  let match: RegExpExecArray | null
  while ((match = genPattern.exec(formattedCode)) !== null) {
    const startPos = match.index

    // Get the base indentation of the Effect.gen line
    const baseIndent = getLineIndent(formattedCode, startPos)

    // Find the opening brace of the function body
    const openBracePos = formattedCode.indexOf('{', startPos + match[0].length - 1)

    // Find matching closing brace
    let depth = 1
    let pos = openBracePos + 1
    let inString: string | null = null
    let inComment = false
    let inLineComment = false
    let inRegex = false

    while (pos < formattedCode.length && depth > 0) {
      const char = formattedCode[pos]
      const nextChar = formattedCode[pos + 1]

      // Handle line comments
      if (!inString && !inComment && !inRegex && char === '/' && nextChar === '/') {
        inLineComment = true
        pos += 2
        continue
      }

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false
        }
        pos++
        continue
      }

      // Handle block comments
      if (!inString && !inLineComment && !inRegex && char === '/' && nextChar === '*') {
        inComment = true
        pos += 2
        continue
      }

      if (inComment) {
        if (char === '*' && nextChar === '/') {
          inComment = false
          pos += 2
          continue
        }
        pos++
        continue
      }

      // Handle regex literals
      // A '/' starts a regex if preceded by certain tokens (simplified heuristic)
      if (!inString && !inComment && !inLineComment && !inRegex && char === '/') {
        // Look back to see if this could be a regex start
        // Common patterns: after (, [, {, ,, =, :, ;, !, &, |, ?, newline, or start
        let lookBack = pos - 1
        while (lookBack >= 0 && /\s/.test(formattedCode[lookBack]!)) {
          lookBack--
        }
        const prevChar = lookBack >= 0 ? formattedCode[lookBack] : ''
        // These characters typically precede a regex literal
        if (
          prevChar === '' ||
          prevChar === '(' ||
          prevChar === '[' ||
          prevChar === '{' ||
          prevChar === ',' ||
          prevChar === '=' ||
          prevChar === ':' ||
          prevChar === ';' ||
          prevChar === '!' ||
          prevChar === '&' ||
          prevChar === '|' ||
          prevChar === '?' ||
          prevChar === '\n' ||
          prevChar === 'n' // 'return', 'in', etc. - simplified
        ) {
          inRegex = true
          pos++
          continue
        }
      }

      if (inRegex) {
        // Handle escape sequences in regex
        if (char === '\\' && pos + 1 < formattedCode.length) {
          pos += 2
          continue
        }
        // End of regex
        if (char === '/') {
          inRegex = false
          // Skip regex flags
          pos++
          while (pos < formattedCode.length && /[gimsuy]/.test(formattedCode[pos]!)) {
            pos++
          }
          continue
        }
        pos++
        continue
      }

      // Handle strings
      if (inString) {
        // Handle escape sequences
        if (char === '\\' && pos + 1 < formattedCode.length) {
          pos += 2
          continue
        }
        if (char === inString) {
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

      // Track brace depth
      if (char === '{') depth++
      if (char === '}') depth--
      pos++
    }

    if (depth !== 0) continue

    const closeBracePos = pos - 1
    const closeParenPos = formattedCode.indexOf(')', closeBracePos)

    if (closeParenPos === -1) continue

    // Extract the function body
    const bodyContent = formattedCode.slice(openBracePos + 1, closeBracePos)

    // Transform statements back to gen syntax
    let transformedBody = bodyContent
      // const x = yield* expr → x <- expr
      // Handles simple identifiers, array destructuring, and object destructuring
      .replace(/const\s+(\w+|\[[^\]]+\]|\{[^}]+\})\s*=\s*yield\s*\*\s*/g, '$1 <- ')
      // yield* expr (without assignment) → _ <- expr
      .replace(/yield\s*\*\s+/g, '_ <- ')

    // Normalize indentation
    // The body content has extra indentation from being inside function* () { }
    // We want content indented at baseIndent + 2 (one level inside gen {})
    const currentMinIndent = findMinIndent(transformedBody)
    const targetIndent = baseIndent.length + 2

    if (currentMinIndent > targetIndent) {
      // Remove excess indentation
      const excessIndent = currentMinIndent - targetIndent
      transformedBody = dedent(transformedBody, excessIndent)
    }

    // The body typically ends with "\n  " where the whitespace is for the closing brace
    // After dedenting, this trailing whitespace becomes the correct indent for the closing }
    // We need to ensure the closing brace is at baseIndent level
    // Strip any trailing whitespace from body and add correct indent for closing brace
    const trimmedBody = transformedBody.replace(/\s+$/, '')
    const closingBraceIndent = trimmedBody.endsWith('\n') ? baseIndent : '\n' + baseIndent

    // Build the replacement
    const replacement = `gen {${trimmedBody}${closingBraceIndent}}`

    replacements.push({
      start: startPos,
      end: closeParenPos + 1,
      replacement
    })
  }

  // Apply replacements from end to start to preserve positions
  for (let i = replacements.length - 1; i >= 0; i--) {
    const repl = replacements[i]!
    result = result.slice(0, repl.start) + repl.replacement + result.slice(repl.end)
  }

  return result
}

/**
 * Format a single file with gen block support
 *
 * @param filePath Path to the file to format
 * @param options Format options
 * @returns Format result
 */
export async function formatFile(
  filePath: string,
  options: FormatOptions = {}
): Promise<FormatResult> {
  const fs = await import('fs/promises')
  const path = await import('path')

  try {
    // Ensure we have an absolute path for Prettier
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)

    // Load Prettier and let it discover config/ignore files automatically
    const prettier = await import('prettier')

    // Prettier will search for config starting from the file's directory
    const config = (await prettier.resolveConfig(absolutePath)) || {}

    // Debug: log config on first file
    if (process.env.DEBUG_PRETTIER_CONFIG) {
      console.log(`[DEBUG] File (original): ${filePath}`)
      console.log(`[DEBUG] File (absolute): ${absolutePath}`)
      console.log(`[DEBUG] Config:`, JSON.stringify(config, null, 2))
    }

    // Check if file should be ignored
    // Find .prettierignore file
    const prettierIgnorePath = path.join(process.cwd(), '.prettierignore')
    let prettierIgnoreExists = false
    try {
      await fs.access(prettierIgnorePath)
      prettierIgnoreExists = true
    } catch {
      // No .prettierignore file
    }

    if (process.env.DEBUG_PRETTIER_CONFIG) {
      console.log(`[DEBUG] CWD: ${process.cwd()}`)
      console.log(`[DEBUG] .prettierignore exists: ${prettierIgnoreExists}`)
      if (prettierIgnoreExists) {
        console.log(`[DEBUG] .prettierignore path: ${prettierIgnorePath}`)
      }
    }

    const fileInfo = await prettier.getFileInfo(absolutePath, {
      ignorePath: prettierIgnoreExists ? prettierIgnorePath : undefined,
      withNodeModules: false
    })

    if (process.env.DEBUG_PRETTIER_CONFIG) {
      console.log(`[DEBUG] File ignored: ${fileInfo.ignored}`)
      console.log(`[DEBUG] File inferred parser: ${fileInfo.inferredParser}`)
    }

    if (fileInfo.ignored) {
      return {
        filePath,
        hasGenBlocks: false,
        formatted: false
      }
    }

    // Read file
    const originalSource = await fs.readFile(absolutePath, 'utf-8')

    // Normalize multi-line bind statements before processing
    let source = normalizeBindStatements(originalSource)

    // Check if file has gen blocks
    if (!hasGenBlocks(source)) {
      // No gen blocks, format normally with prettier
      try {
        const formatted = await prettier.format(source, {
          filepath: absolutePath,
          ...config,
          ...options.prettierOptions
        })

        if (options.write !== false) {
          await fs.writeFile(absolutePath, formatted)
        }

        return {
          filePath,
          hasGenBlocks: false,
          formatted: true,
          changed: options.write === false ? originalSource !== formatted : undefined,
          content: options.write === false ? formatted : undefined
        }
      } catch (error) {
        return {
          filePath,
          hasGenBlocks: false,
          formatted: false,
          error: error instanceof Error ? error : new Error(String(error))
        }
      }
    }

    // Transform gen blocks to Effect.gen()
    const transformed = transformSource(source, filePath)

    if (!transformed.hasChanges) {
      // No transformations needed (shouldn't happen if hasGenBlocks is true, but safety check)
      return {
        filePath,
        hasGenBlocks: true,
        formatted: false,
        content: source
      }
    }

    // Format with Prettier
    const formatted = await prettier.format(transformed.code, {
      filepath: absolutePath,
      ...config,
      ...options.prettierOptions
    })

    // Transform back to gen syntax
    const restored = transformBack(formatted)

    // Write back to file
    if (options.write !== false) {
      await fs.writeFile(absolutePath, restored)
    }

    return {
      filePath,
      hasGenBlocks: true,
      formatted: true,
      changed: options.write === false ? originalSource !== restored : undefined,
      content: options.write === false ? restored : undefined
    }
  } catch (error) {
    return {
      filePath,
      hasGenBlocks: false,
      formatted: false,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

/**
 * Recursively find all .ts files in a directory
 */
export async function findTsFiles(dir: string): Promise<string[]> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const files: string[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (
          entry.name !== 'node_modules' &&
          entry.name !== 'target' &&
          entry.name !== 'dist' &&
          entry.name !== '.git'
        ) {
          files.push(...(await findTsFiles(fullPath)))
        }
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    // Directory doesn't exist or not accessible
    console.error(`Error reading directory ${dir}:`, error)
  }

  return files
}

/**
 * Format multiple files with gen block support
 */
export async function formatFiles(
  paths: string[],
  options: FormatOptions = {}
): Promise<FormatResult[]> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const results: FormatResult[] = []

  for (const p of paths) {
    const stat = await fs.stat(p)

    if (stat.isDirectory()) {
      const files = await findTsFiles(p)
      for (const file of files) {
        results.push(await formatFile(file, options))
      }
    } else {
      results.push(await formatFile(p, options))
    }
  }

  return results
}
