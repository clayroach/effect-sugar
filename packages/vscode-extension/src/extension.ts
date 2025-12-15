import * as vscode from 'vscode'
import { transformSource, hasGenBlocks } from 'effect-sugar-core'

/**
 * Dynamically load prettier from the workspace or extension
 */
async function loadPrettier(documentPath: string): Promise<typeof import('prettier')> {
  // Try to find prettier in the workspace first
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(documentPath))

  if (workspaceFolder) {
    try {
      // Try to require prettier from the workspace
      const workspacePrettierPath = require.resolve('prettier', {
        paths: [workspaceFolder.uri.fsPath]
      })
      return require(workspacePrettierPath)
    } catch {
      // Workspace doesn't have prettier, fall back
    }
  }

  // Fall back to bundled prettier (requires prettier in node_modules)
  return require('prettier')
}

interface GenBlockRange {
  start: number
  end: number
}

/**
 * Get the indentation of the line containing a given position
 */
function getLineIndent(code: string, pos: number): string {
  let lineStart = pos
  while (lineStart > 0 && code[lineStart - 1] !== '\n') {
    lineStart--
  }

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
    if (line.trim() === '') continue
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
      if (line === '') return line
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
function transformBack(formattedCode: string): string {
  const genPattern = new RegExp(
    `Effect\\.gen\\s*\\(\\s*\\/\\*\\s*__EFFECT_SUGAR__\\s*\\*\\/\\s*function\\s*\\*\\s*\\(\\s*\\)\\s*\\{`,
    'g'
  )

  if (!genPattern.test(formattedCode)) {
    return formattedCode
  }

  genPattern.lastIndex = 0

  let result = formattedCode
  const replacements: Array<{ start: number; end: number; replacement: string }> = []

  let match: RegExpExecArray | null
  while ((match = genPattern.exec(formattedCode)) !== null) {
    const startPos = match.index
    const baseIndent = getLineIndent(formattedCode, startPos)
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
      if (!inString && !inComment && !inLineComment && !inRegex && char === '/') {
        let lookBack = pos - 1
        while (lookBack >= 0 && /\s/.test(formattedCode[lookBack]!)) {
          lookBack--
        }
        const prevChar = lookBack >= 0 ? formattedCode[lookBack] : ''
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
          prevChar === 'n'
        ) {
          inRegex = true
          pos++
          continue
        }
      }

      if (inRegex) {
        if (char === '\\' && pos + 1 < formattedCode.length) {
          pos += 2
          continue
        }
        if (char === '/') {
          inRegex = false
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

    const bodyContent = formattedCode.slice(openBracePos + 1, closeBracePos)

    // Transform statements back to gen syntax
    // Handles simple identifiers, array destructuring, and object destructuring
    let transformedBody = bodyContent
      .replace(/const\s+(\w+|\[[^\]]+\]|\{[^}]+\})\s*=\s*yield\s*\*\s*/g, '$1 <- ')
      .replace(/yield\s*\*\s+/g, '_ <- ')

    // Normalize indentation
    const currentMinIndent = findMinIndent(transformedBody)
    const targetIndent = baseIndent.length + 2

    if (currentMinIndent > targetIndent) {
      const excessIndent = currentMinIndent - targetIndent
      transformedBody = dedent(transformedBody, excessIndent)
    }

    const trimmedBody = transformedBody.replace(/\s+$/, '')
    const closingBraceIndent = trimmedBody.endsWith('\n') ? baseIndent : '\n' + baseIndent

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
 * Normalize multi-line bind statements to single lines
 */
function normalizeBindStatements(source: string): string {
  const multiLineBindPattern = /^(\s*)(\w+|\[[\w\s,.\[\]{}:]+\]|\{[\w\s,.:]+\})\s*<-\s*\n\s*/gm
  return source.replace(multiLineBindPattern, '$1$2 <- ')
}

/**
 * Find all gen { } blocks in the document
 */
function findGenBlocks(text: string): GenBlockRange[] {
  const blocks: GenBlockRange[] = []
  const pattern = /\bgen\s*\{/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index
    const braceStart = text.indexOf('{', start)

    let depth = 1
    let pos = braceStart + 1
    let inString: string | null = null

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

    if (depth === 0) {
      blocks.push({ start, end: pos })
    }
  }

  return blocks
}

/**
 * Check if a position falls within any gen block
 */
function isInGenBlock(offset: number, blocks: GenBlockRange[]): boolean {
  return blocks.some((block) => offset >= block.start && offset <= block.end)
}

/**
 * Filter diagnostics to remove those inside gen blocks
 */
function filterDiagnostics(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[]
): vscode.Diagnostic[] {
  const text = document.getText()
  const genBlocks = findGenBlocks(text)

  if (genBlocks.length === 0) {
    return [...diagnostics]
  }

  return diagnostics.filter((diagnostic) => {
    const startOffset = document.offsetAt(diagnostic.range.start)
    const endOffset = document.offsetAt(diagnostic.range.end)
    return !isInGenBlock(startOffset, genBlocks) && !isInGenBlock(endOffset, genBlocks)
  })
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Effect Sugar extension activated')

  const config = vscode.workspace.getConfiguration('effectSugar')
  const suppressDiagnostics = config.get<boolean>('suppressDiagnostics', true)

  if (suppressDiagnostics) {
    // Create our own diagnostic collection
    const filteredDiagnostics = vscode.languages.createDiagnosticCollection('effect-sugar-filtered')
    context.subscriptions.push(filteredDiagnostics)

    const tsDiagnosticSources = ['ts', 'typescript']

    const disposable = vscode.languages.onDidChangeDiagnostics((event) => {
      for (const uri of event.uris) {
        const document = vscode.workspace.textDocuments.find(
          (doc) => doc.uri.toString() === uri.toString()
        )

        if (!document) continue

        if (!['typescript', 'typescriptreact'].includes(document.languageId)) {
          continue
        }

        const allDiagnostics = vscode.languages.getDiagnostics(uri)

        const tsDiagnostics = allDiagnostics.filter(
          (d) => d.source && tsDiagnosticSources.includes(d.source.toLowerCase())
        )

        if (tsDiagnostics.length > 0) {
          const filtered = filterDiagnostics(document, tsDiagnostics)

          if (filtered.length < tsDiagnostics.length) {
            console.log(
              `Effect Sugar: Suppressed ${tsDiagnostics.length - filtered.length} diagnostics in gen blocks`
            )
          }
        }
      }
    })

    context.subscriptions.push(disposable)

    // Register a code action provider
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
      ['typescript', 'typescriptreact'],
      {
        provideCodeActions(document, range, context) {
          const text = document.getText()
          const genBlocks = findGenBlocks(text)
          const offset = document.offsetAt(range.start)

          if (isInGenBlock(offset, genBlocks)) {
            const action = new vscode.CodeAction(
              'This code is inside a gen block - errors are expected until transformation',
              vscode.CodeActionKind.QuickFix
            )
            action.diagnostics = [...context.diagnostics]
            action.isPreferred = false
            return [action]
          }

          return []
        }
      }
    )

    context.subscriptions.push(codeActionProvider)
  }

  // Register document formatting provider for gen block support
  const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
    ['typescript', 'typescriptreact'],
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): Promise<vscode.TextEdit[]> {
        console.log('Effect Sugar: formatting', document.fileName)
        let text = document.getText()
        const originalText = text

        try {
          // Load prettier from workspace
          const prettier = await loadPrettier(document.fileName)

          // Resolve Prettier config for this file
          const prettierConfig = (await prettier.resolveConfig(document.fileName)) || {}

          let formatted: string

          // Check if file has gen blocks using effect-sugar-core
          if (hasGenBlocks(text)) {
            // Normalize multi-line bind statements
            text = normalizeBindStatements(text)

            // Transform gen blocks to Effect.gen() using effect-sugar-core
            const transformed = transformSource(text, document.fileName)

            // Format with Prettier
            const prettierFormatted = await prettier.format(transformed.code, {
              ...prettierConfig,
              filepath: document.fileName
            })

            // Transform back to gen syntax
            formatted = transformBack(prettierFormatted)
          } else {
            // No gen blocks - just format with Prettier directly
            formatted = await prettier.format(text, {
              ...prettierConfig,
              filepath: document.fileName
            })
          }

          // Only return edit if content changed
          if (formatted === originalText) {
            return []
          }

          // Return edit replacing entire document
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(originalText.length)
          )

          return [vscode.TextEdit.replace(fullRange, formatted)]
        } catch (error) {
          console.error('Effect Sugar formatting error:', error)
          vscode.window.showErrorMessage(`Effect Sugar formatting failed: ${error}`)
          return []
        }
      }
    }
  )

  context.subscriptions.push(formattingProvider)

  // Show info message about formatter
  const hasShownInfo = context.globalState.get<boolean>('effectSugar.formatterInfoShown')
  if (!hasShownInfo) {
    vscode.window
      .showInformationMessage(
        'Effect Sugar: To use gen block formatting, set "Effect Sugar" as your default TypeScript formatter.',
        'Open Settings'
      )
      .then((selection) => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'editor.defaultFormatter'
          )
        }
      })
    context.globalState.update('effectSugar.formatterInfoShown', true)
  }
}

export function deactivate() {
  console.log('Effect Sugar extension deactivated')
}
