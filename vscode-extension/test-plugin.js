/**
 * Simple test script to verify the TypeScript plugin works
 */

const ts = require('typescript')
const path = require('path')
const fs = require('fs')

// Load our plugin from node_modules (where it's installed for VSCode)
const pluginPath = path.join(__dirname, 'node_modules', 'effect-sugar-ts-plugin')
const plugin = require(pluginPath)

// Test file content
const testContent = `
import { Effect } from "effect";

interface User {
  id: number;
  name: string;
}

const getUser = (id: number): Effect.Effect<User, never, never> =>
  Effect.succeed({ id, name: "Alice" });

const test = gen {
  user <- getUser(1);
  let name = user.name;
  return { user, name };
};
`

console.log('[Test] Testing TypeScript Language Service Plugin\n')
console.log('='.repeat(60))

// Create a simple language service host
const files = { 'test.ts': testContent }
const host = {
  getScriptFileNames: () => ['test.ts'],
  getScriptVersion: () => '1',
  getScriptSnapshot: (fileName) => {
    const content = files[fileName]
    if (content) {
      return ts.ScriptSnapshot.fromString(content)
    }
    return undefined
  },
  getCurrentDirectory: () => __dirname,
  getCompilationSettings: () => ({
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }),
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: (fileName) => files[fileName] !== undefined,
  readFile: (fileName) => files[fileName]
}

console.log('\n[Test] Creating language service...')
const languageService = ts.createLanguageService(host, ts.createDocumentRegistry())

console.log('[Test] Initializing plugin...')
const pluginModule = plugin({ typescript: ts })
const wrappedService = pluginModule.create({
  languageService,
  languageServiceHost: host,
  project: { getScriptInfo: () => ({ getLatestVersion: () => '1' }) }
})

console.log('[Test] Getting program...')
const program = wrappedService.getProgram()
const sourceFile = program.getSourceFile('test.ts')

if (!sourceFile) {
  console.error('[Test] ERROR: Could not get source file')
  process.exit(1)
}

console.log('[Test] Source file loaded successfully')
console.log(`[Test] Content length: ${sourceFile.getFullText().length} characters`)

// Test if transformation happened
const sourceText = sourceFile.getFullText()
const hasGenBlocks = /\bgen\s*\{/.test(testContent)
const hasEffectGen = /Effect\.gen/.test(sourceText)

console.log('\n' + '='.repeat(60))
console.log('[Test] Transformation Check:')
console.log(`  Original has 'gen {': ${hasGenBlocks}`)
console.log(`  Transformed has 'Effect.gen': ${hasEffectGen}`)

if (hasGenBlocks && hasEffectGen) {
  console.log('  ✅ Transformation working!')
} else if (hasGenBlocks && !hasEffectGen) {
  console.log('  ⚠️  Transformation may not be working')
} else {
  console.log('  ℹ️  No gen blocks to transform')
}

// Test diagnostics
console.log('\n' + '='.repeat(60))
console.log('[Test] Checking diagnostics...')
const semanticDiagnostics = wrappedService.getSemanticDiagnostics('test.ts')
const syntacticDiagnostics = wrappedService.getSyntacticDiagnostics('test.ts')

console.log(`  Semantic diagnostics: ${semanticDiagnostics.length}`)
console.log(`  Syntactic diagnostics: ${syntacticDiagnostics.length}`)

if (semanticDiagnostics.length > 0) {
  console.log('\n  Semantic issues:')
  semanticDiagnostics.slice(0, 3).forEach((d, i) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    console.log(`    ${i + 1}. ${message}`)
  })
}

if (syntacticDiagnostics.length > 0) {
  console.log('\n  Syntactic issues:')
  syntacticDiagnostics.slice(0, 3).forEach((d, i) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    console.log(`    ${i + 1}. ${message}`)
  })
}

// Test hover at the 'user' identifier position
console.log('\n' + '='.repeat(60))
console.log('[Test] Testing hover information...')

// Find position of 'user' after the '<-' in "user <- getUser(1)"
const userPos = testContent.indexOf('user <-') + 0 // Position of 'u' in 'user'

console.log(`  Looking for hover info at position ${userPos}`)
const quickInfo = wrappedService.getQuickInfoAtPosition('test.ts', userPos)

if (quickInfo) {
  console.log('  ✅ Hover information available!')
  console.log(
    `     Text: "${sourceText.substring(quickInfo.textSpan.start, quickInfo.textSpan.start + quickInfo.textSpan.length)}"`
  )
  if (quickInfo.displayParts) {
    const displayText = quickInfo.displayParts.map((p) => p.text).join('')
    console.log(`     Type: ${displayText.substring(0, 100)}`)
  }
} else {
  console.log('  ⚠️  No hover information available')
  console.log('     This might be expected if the position mapping needs adjustment')
}

console.log('\n' + '='.repeat(60))
console.log('[Test] Test complete!\n')
