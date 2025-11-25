/**
 * Code generator that transforms Effect-TS sugar AST into Effect.gen code
 */

import type { EffBlock, Statement, IfStatement } from './parser.js'

interface GeneratorOptions {
  indent?: string
  effectImport?: string
}

function generateStatements(
  statements: Statement[],
  options: GeneratorOptions,
  depth: number
): string {
  const indent = options.indent || '  '
  const baseIndent = indent.repeat(depth)

  const lines: string[] = []

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]

    switch (stmt.type) {
      case 'bind':
        lines.push(`${baseIndent}const ${stmt.variable} = yield* ${stmt.expression}`)
        break

      case 'let':
        lines.push(`${baseIndent}const ${stmt.variable} = ${stmt.expression}`)
        break

      case 'return':
        lines.push(`${baseIndent}return ${stmt.expression}`)
        break

      case 'if':
        lines.push(generateIfStatement(stmt, options, depth))
        break
    }
  }

  return lines.join('\n')
}

function generateIfStatement(stmt: IfStatement, options: GeneratorOptions, depth: number): string {
  const indent = options.indent || '  '
  const baseIndent = indent.repeat(depth)

  let code = `${baseIndent}if (${stmt.condition}) {\n`
  code += generateStatements(stmt.thenBlock, options, depth + 1)
  code += `\n${baseIndent}}`

  if (stmt.elseBlock) {
    code += ` else {\n`
    code += generateStatements(stmt.elseBlock, options, depth + 1)
    code += `\n${baseIndent}}`
  }

  return code
}

export function generateEffectGen(block: EffBlock, options: GeneratorOptions = {}): string {
  const effectImport = options.effectImport || 'Effect'
  const indent = options.indent || '  '

  const body = generateStatements(block.statements, options, 1)

  return `${effectImport}.gen(function* () {\n${body}\n})`
}

/**
 * Generate code with type annotations for better inference
 */
export function generateEffectGenTyped(block: EffBlock, options: GeneratorOptions = {}): string {
  const effectImport = options.effectImport || 'Effect'
  const indent = options.indent || '  '

  const body = generateStatements(block.statements, options, 1)

  // Use Effect.gen with explicit generator function for better type inference
  return `${effectImport}.gen(function* () {\n${body}\n})`
}
