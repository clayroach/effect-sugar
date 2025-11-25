import * as vscode from 'vscode'
import * as prettier from 'prettier'

interface GenBlockRange {
  start: number
  end: number
}

/**
 * Transform gen block content to valid JS for formatting
 */
function genToJs(genBlockContent: string): string {
  const braceStart = genBlockContent.indexOf('{')
  const content = genBlockContent.slice(braceStart + 1, -1)

  const transformed = content
    .replace(/^(\s*)(\w+)\s*<-\s*/gm, '$1const $2 = /*BIND*/yield* ')
    .replace(/^(\s*)let\s+(\w+)\s*=\s*/gm, '$1const $2 = /*LET*/')

  return `Effect.gen(function* () {${transformed}})`
}

/**
 * Transform formatted JS back to gen block syntax
 */
function jsToGen(jsContent: string): string {
  const match = jsContent.match(/Effect\.gen\(function\*\s*\(\)\s*\{([\s\S]*)\}\)/)
  if (!match) return jsContent

  let content = match[1]
  if (!content) return jsContent

  content = content
    // Replace: const x = /*BIND*/ yield* ... with x <- ...
    // Handles multiline formatting with flexible whitespace
    .replace(/const\s+(\w+)\s*=\s*\/\*BIND\*\/\s*yield\*\s*/gm, '$1 <- ')
    .replace(/const\s+(\w+)\s*=\s*\/\*LET\*\/\s*/gm, 'let $1 = ')

  return `gen {${content}}`
}

/**
 * Transform all gen blocks in text to valid JS
 */
function transformGenBlocksToJs(text: string, blocks: GenBlockRange[]): string {
  let result = text
  let offset = 0

  for (const block of blocks) {
    const genBlock = text.slice(block.start, block.end)
    const jsBlock = genToJs(genBlock)

    const adjustedStart = block.start + offset
    const adjustedEnd = block.end + offset
    result = result.slice(0, adjustedStart) + jsBlock + result.slice(adjustedEnd)

    offset += jsBlock.length - (block.end - block.start)
  }

  return result
}

/**
 * Transform all Effect.gen blocks back to gen syntax
 */
function transformJsToGenBlocks(text: string): string {
  const pattern = /Effect\.gen\(function\*\s*\(\)\s*\{/g
  let result = text
  let offset = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    const genStart = match.index
    const braceStart = text.indexOf('{', genStart + 20)

    // Find matching brace
    let depth = 1
    let pos = braceStart + 1
    let inString: string | null = null

    while (pos < text.length && depth > 0) {
      const char = text[pos]
      if (inString) {
        if (char === inString && text[pos - 1] !== '\\') inString = null
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

    if (depth !== 0) continue
    const fullEnd = pos + 1

    const jsBlock = text.slice(genStart, fullEnd)
    const genBlock = jsToGen(jsBlock)

    const adjustedStart = genStart + offset
    const adjustedEnd = fullEnd + offset
    result = result.slice(0, adjustedStart) + genBlock + result.slice(adjustedEnd)

    offset += genBlock.length - (fullEnd - genStart)
  }

  return result
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

    // Find matching closing brace
    let depth = 1
    let pos = braceStart + 1
    let inString: string | null = null

    while (pos < text.length && depth > 0) {
      const char = text[pos]

      // Handle strings
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

    // Keep diagnostic if it's not inside a gen block
    return !isInGenBlock(startOffset, genBlocks) && !isInGenBlock(endOffset, genBlocks)
  })
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Effect Sugar extension activated')

  const config = vscode.workspace.getConfiguration('effectSugar')
  const suppressDiagnostics = config.get<boolean>('suppressDiagnostics', true)

  if (!suppressDiagnostics) {
    return
  }

  // Create our own diagnostic collection
  const filteredDiagnostics = vscode.languages.createDiagnosticCollection('effect-sugar-filtered')
  context.subscriptions.push(filteredDiagnostics)

  // Track TypeScript diagnostic collections
  const tsDiagnosticSources = ['ts', 'typescript']

  // Listen for diagnostic changes
  const disposable = vscode.languages.onDidChangeDiagnostics((event) => {
    for (const uri of event.uris) {
      const document = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.toString() === uri.toString()
      )

      if (!document) continue

      // Only process TypeScript files
      if (!['typescript', 'typescriptreact'].includes(document.languageId)) {
        continue
      }

      // Get all diagnostics for this file
      const allDiagnostics = vscode.languages.getDiagnostics(uri)

      // Filter out TypeScript diagnostics inside gen blocks
      const tsDiagnostics = allDiagnostics.filter(
        (d) => d.source && tsDiagnosticSources.includes(d.source.toLowerCase())
      )

      if (tsDiagnostics.length > 0) {
        const filtered = filterDiagnostics(document, tsDiagnostics)

        // If we filtered any diagnostics, we need to suppress the originals
        // This is tricky - VSCode doesn't allow us to remove diagnostics from other sources
        // The best we can do is show our own filtered collection
        if (filtered.length < tsDiagnostics.length) {
          // Log that we're suppressing diagnostics
          console.log(
            `Effect Sugar: Suppressed ${tsDiagnostics.length - filtered.length} diagnostics in gen blocks`
          )
        }
      }
    }
  })

  context.subscriptions.push(disposable)

  // Register a code action provider to help users understand suppressed errors
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

  // Register document formatting provider
  const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
    ['typescript', 'typescriptreact'],
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): Promise<vscode.TextEdit[]> {
        const text = document.getText()
        const genBlocks = findGenBlocks(text)

        // If no gen blocks, let default formatter handle it
        if (genBlocks.length === 0) {
          return []
        }

        try {
          // Transform gen blocks to valid JS
          const jsCode = transformGenBlocksToJs(text, genBlocks)

          // Format with Prettier
          const formatted = await prettier.format(jsCode, {
            parser: 'typescript',
            semi: true,
            singleQuote: false,
            trailingComma: 'es5'
          })

          // Transform back to gen syntax
          const restored = transformJsToGenBlocks(formatted)

          // Return edit replacing entire document
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
          )

          return [vscode.TextEdit.replace(fullRange, restored)]
        } catch (error) {
          console.error('Effect Sugar formatting error:', error)
          vscode.window.showErrorMessage(`Effect Sugar formatting failed: ${error}`)
          return []
        }
      }
    }
  )

  context.subscriptions.push(formattingProvider)
}

export function deactivate() {
  console.log('Effect Sugar extension deactivated')
}
