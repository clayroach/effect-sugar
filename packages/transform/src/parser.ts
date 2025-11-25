/**
 * Custom parser for Effect-TS sugar syntax
 *
 * Parses:
 *   eff {
 *     x <- effect1
 *     y <- effect2(x)
 *     return expr
 *   }
 *
 * Into an AST that can be transformed to Effect.gen
 */

export interface BindStatement {
  type: 'bind'
  variable: string
  expression: string
}

export interface LetStatement {
  type: 'let'
  variable: string
  expression: string
}

export interface ReturnStatement {
  type: 'return'
  expression: string
}

export interface IfStatement {
  type: 'if'
  condition: string
  thenBlock: Statement[]
  elseBlock?: Statement[]
}

export type Statement = BindStatement | LetStatement | ReturnStatement | IfStatement

export interface EffBlock {
  statements: Statement[]
}

interface ParseContext {
  input: string
  pos: number
  line: number
  column: number
}

class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number
  ) {
    super(`${message} at line ${line}, column ${column}`)
    this.name = 'ParseError'
  }
}

function skipWhitespace(ctx: ParseContext): void {
  while (ctx.pos < ctx.input.length) {
    const char = ctx.input[ctx.pos]
    if (char === ' ' || char === '\t') {
      ctx.pos++
      ctx.column++
    } else if (char === '\n') {
      ctx.pos++
      ctx.line++
      ctx.column = 1
    } else if (char === '\r') {
      ctx.pos++
      if (ctx.input[ctx.pos] === '\n') ctx.pos++
      ctx.line++
      ctx.column = 1
    } else {
      break
    }
  }
}

function skipLineComment(ctx: ParseContext): boolean {
  if (ctx.input.slice(ctx.pos, ctx.pos + 2) === '//') {
    while (ctx.pos < ctx.input.length && ctx.input[ctx.pos] !== '\n') {
      ctx.pos++
    }
    return true
  }
  return false
}

function skipWhitespaceAndComments(ctx: ParseContext): void {
  while (ctx.pos < ctx.input.length) {
    skipWhitespace(ctx)
    if (!skipLineComment(ctx)) break
  }
}

function isIdentifierStart(char: string): boolean {
  return /[a-zA-Z_$]/.test(char)
}

function isIdentifierChar(char: string): boolean {
  return /[a-zA-Z0-9_$]/.test(char)
}

function parseIdentifier(ctx: ParseContext): string {
  const start = ctx.pos
  if (!isIdentifierStart(ctx.input[ctx.pos])) {
    throw new ParseError(`Expected identifier`, ctx.line, ctx.column)
  }
  while (ctx.pos < ctx.input.length && isIdentifierChar(ctx.input[ctx.pos])) {
    ctx.pos++
    ctx.column++
  }
  return ctx.input.slice(start, ctx.pos)
}

function parseExpression(ctx: ParseContext): string {
  // Parse until end of statement (newline, semicolon, or closing brace)
  const start = ctx.pos
  let depth = 0
  let inString: string | null = null

  while (ctx.pos < ctx.input.length) {
    const char = ctx.input[ctx.pos]

    // Handle strings
    if (inString) {
      if (char === inString && ctx.input[ctx.pos - 1] !== '\\') {
        inString = null
      }
      ctx.pos++
      ctx.column++
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char
      ctx.pos++
      ctx.column++
      continue
    }

    // Track nesting
    if (char === '(' || char === '[' || char === '{') {
      depth++
      ctx.pos++
      ctx.column++
      continue
    }

    if (char === ')' || char === ']') {
      depth--
      ctx.pos++
      ctx.column++
      continue
    }

    if (char === '}') {
      if (depth === 0) break
      depth--
      ctx.pos++
      ctx.column++
      continue
    }

    // End of statement
    if (depth === 0 && (char === '\n' || char === ';')) {
      break
    }

    ctx.pos++
    ctx.column++
  }

  return ctx.input.slice(start, ctx.pos).trim()
}

function parseStatement(ctx: ParseContext): Statement | null {
  skipWhitespaceAndComments(ctx)

  if (ctx.pos >= ctx.input.length || ctx.input[ctx.pos] === '}') {
    return null
  }

  const startLine = ctx.line
  const startColumn = ctx.column

  // Check for 'return'
  if (ctx.input.slice(ctx.pos, ctx.pos + 6) === 'return') {
    ctx.pos += 6
    ctx.column += 6
    skipWhitespace(ctx)
    const expression = parseExpression(ctx)
    return { type: 'return', expression }
  }

  // Check for 'if'
  if (ctx.input.slice(ctx.pos, ctx.pos + 2) === 'if') {
    return parseIfStatement(ctx)
  }

  // Check for 'let'
  if (ctx.input.slice(ctx.pos, ctx.pos + 3) === 'let') {
    ctx.pos += 3
    ctx.column += 3
    skipWhitespace(ctx)
    const variable = parseIdentifier(ctx)
    skipWhitespace(ctx)

    if (ctx.input[ctx.pos] !== '=') {
      throw new ParseError(`Expected '=' after variable name`, ctx.line, ctx.column)
    }
    ctx.pos++
    ctx.column++
    skipWhitespace(ctx)

    const expression = parseExpression(ctx)
    return { type: 'let', variable, expression }
  }

  // Parse as bind statement: x <- expression
  const variable = parseIdentifier(ctx)
  skipWhitespace(ctx)

  // Check for <- operator
  if (ctx.input.slice(ctx.pos, ctx.pos + 2) === '<-') {
    ctx.pos += 2
    ctx.column += 2
    skipWhitespace(ctx)
    const expression = parseExpression(ctx)
    return { type: 'bind', variable, expression }
  }

  throw new ParseError(`Expected '<-' or '=' after identifier '${variable}'`, ctx.line, ctx.column)
}

function parseIfStatement(ctx: ParseContext): IfStatement {
  ctx.pos += 2 // skip 'if'
  ctx.column += 2
  skipWhitespace(ctx)

  // Parse condition (everything until '{')
  const condStart = ctx.pos
  let depth = 0
  while (ctx.pos < ctx.input.length) {
    const char = ctx.input[ctx.pos]
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === '{' && depth === 0) break
    ctx.pos++
    ctx.column++
  }
  const condition = ctx.input.slice(condStart, ctx.pos).trim()

  if (ctx.input[ctx.pos] !== '{') {
    throw new ParseError(`Expected '{' after if condition`, ctx.line, ctx.column)
  }
  ctx.pos++
  ctx.column++

  // Parse then block
  const thenBlock = parseStatements(ctx)

  if (ctx.input[ctx.pos] !== '}') {
    throw new ParseError(`Expected '}' to close if block`, ctx.line, ctx.column)
  }
  ctx.pos++
  ctx.column++

  skipWhitespaceAndComments(ctx)

  // Check for else
  let elseBlock: Statement[] | undefined
  if (ctx.input.slice(ctx.pos, ctx.pos + 4) === 'else') {
    ctx.pos += 4
    ctx.column += 4
    skipWhitespace(ctx)

    if (ctx.input[ctx.pos] !== '{') {
      throw new ParseError(`Expected '{' after else`, ctx.line, ctx.column)
    }
    ctx.pos++
    ctx.column++

    elseBlock = parseStatements(ctx)

    if (ctx.input[ctx.pos] !== '}') {
      throw new ParseError(`Expected '}' to close else block`, ctx.line, ctx.column)
    }
    ctx.pos++
    ctx.column++
  }

  return { type: 'if', condition, thenBlock, elseBlock }
}

function parseStatements(ctx: ParseContext): Statement[] {
  const statements: Statement[] = []

  while (true) {
    const stmt = parseStatement(ctx)
    if (!stmt) break
    statements.push(stmt)

    // Skip semicolons and newlines
    skipWhitespaceAndComments(ctx)
    if (ctx.input[ctx.pos] === ';') {
      ctx.pos++
      ctx.column++
    }
  }

  return statements
}

export function parseEffBlock(source: string): EffBlock {
  const ctx: ParseContext = {
    input: source,
    pos: 0,
    line: 1,
    column: 1
  }

  skipWhitespaceAndComments(ctx)

  const statements = parseStatements(ctx)

  skipWhitespaceAndComments(ctx)

  if (ctx.pos < ctx.input.length) {
    throw new ParseError(`Unexpected character '${ctx.input[ctx.pos]}'`, ctx.line, ctx.column)
  }

  return { statements }
}
