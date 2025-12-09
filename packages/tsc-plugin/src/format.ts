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
  content?: string
  error?: Error
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

    // Find the opening brace of the function body
    const openBracePos = formattedCode.indexOf('{', startPos + match[0].length - 1)

    // Find matching closing brace
    let depth = 1
    let pos = openBracePos + 1
    let inString: string | null = null
    let inComment = false
    let inLineComment = false

    while (pos < formattedCode.length && depth > 0) {
      const char = formattedCode[pos]
      const nextChar = formattedCode[pos + 1]

      // Handle line comments
      if (!inString && !inComment && char === '/' && nextChar === '/') {
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
      if (!inString && !inLineComment && char === '/' && nextChar === '*') {
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

      // Handle strings
      if (inString) {
        if (char === inString && formattedCode[pos - 1] !== '\\') {
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
      .replace(/const\s+(\w+)\s*=\s*yield\s*\*\s*/g, '$1 <- ')
      // yield* expr (without assignment) → _ <- expr
      .replace(/yield\s*\*\s+/g, '_ <- ')

    const replacement = `gen {${transformedBody}}`

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
    const source = await fs.readFile(absolutePath, 'utf-8')

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
