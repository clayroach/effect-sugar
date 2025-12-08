/**
 * Core transformation module for Effect-TS gen block syntax
 *
 * Uses fine-grained MagicString operations to preserve source map positions
 * for expression parts that don't change.
 *
 * Transforms:
 *   gen {
 *     user <- getUser(id)
 *     let name = user.name
 *     return { user, name }
 *   }
 *
 * Into:
 *   Effect.gen(function* () {
 *     const user = yield* getUser(id)
 *     let name = user.name
 *     return { user, name }
 *   })
 *
 * Note: Only bind arrows (x <- expr) are transformed to const.
 * Regular let/const declarations are preserved as-is to avoid
 * breaking nested callbacks that need reassignable variables.
 *
 * Position mapping strategy:
 * - Only modify the parts that change (gen keyword, bind arrows)
 * - Keep expression parts in place so their positions are preserved in source maps
 */

import MagicString from "magic-string"
import { findGenBlocks, type GenBlock, hasGenBlocks, transformBlockContent, extractBindPattern } from "effect-sugar-core"

export { findGenBlocks, type GenBlock, hasGenBlocks, transformBlockContent }

export interface TransformResult {
  code: string
  map: ReturnType<MagicString["generateMap"]> | null
  hasChanges: boolean
  /** The MagicString instance for source map generation */
  magicString: MagicString | null
}

/**
 * Parse a bind statement and return its parts with positions
 */
interface BindStatement {
  /** Start of variable name (relative to content start) */
  varStart: number
  /** End of variable name (relative to content start) */
  varEnd: number
  /** The variable name or pattern */
  varName: string
  /** Start of arrow (relative to content start) */
  arrowStart: number
  /** End of arrow (relative to content start) */
  arrowEnd: number
  /** Start of expression (relative to content start) */
  exprStart: number
  /** End of expression (relative to content start) */
  exprEnd: number
  /** Whether there's a trailing semicolon */
  hasSemicolon: boolean
  /** Whether this is a return bind (divergent effect) */
  hasReturn: boolean
  /** Start of 'return' keyword if present */
  returnStart?: number
  /** End of 'return' keyword if present */
  returnEnd?: number
}

/**
 * Find bind statements in content with their positions
 * Uses extractBindPattern from core for consistent destructuring support
 */
function findBindStatements(content: string): Array<BindStatement> {
  const statements: Array<BindStatement> = []
  const lines = content.split("\n")
  let pos = 0
  const contentLength = content.length

  for (const line of lines) {
    const trimmed = line.trim()

    // Use core's extractBindPattern for consistent destructuring support
    const bindResult = extractBindPattern(trimmed)

    if (bindResult) {
      const indent = line.match(/^\s*/)?.[0] || ""
      const { pattern: varName, expression: expr, hasReturn } = bindResult

      // Handle return prefix positions
      let returnStart: number | undefined
      let returnEnd: number | undefined
      let varStart: number

      if (hasReturn) {
        // Line has "return" prefix
        returnStart = pos + indent.length
        const returnMatch = trimmed.match(/^return\s+/)
        if (returnMatch) {
          returnEnd = returnStart + returnMatch[0].length
          varStart = returnEnd
        } else {
          // Fallback if regex doesn't match (shouldn't happen)
          varStart = pos + indent.length
        }
      } else {
        // No return prefix
        varStart = pos + indent.length
      }

      const varEnd = varStart + varName.length

      // Find arrow position
      const arrowIdx = line.indexOf("<-")
      const arrowStart = pos + arrowIdx
      const arrowEnd = arrowStart + 2

      // Find expression start (after arrow and any whitespace)
      const afterArrow = line.slice(arrowIdx + 2)
      const exprStartOffset = afterArrow.length - afterArrow.trimStart().length
      const exprStart = arrowEnd + exprStartOffset

      // Expression end (handle semicolon)
      const hasSemicolon = expr.trimEnd().endsWith(";")
      const exprEnd = pos + line.trimEnd().length - (hasSemicolon ? 1 : 0)

      // CRITICAL: Validate all calculated positions are within bounds
      console.assert(varStart >= 0 && varStart <= contentLength,
        `[findBindStatements] varStart ${varStart} out of bounds [0, ${contentLength}]`)
      console.assert(varEnd >= varStart && varEnd <= contentLength,
        `[findBindStatements] varEnd ${varEnd} out of bounds [${varStart}, ${contentLength}]`)
      console.assert(arrowStart >= 0 && arrowStart <= contentLength,
        `[findBindStatements] arrowStart ${arrowStart} out of bounds [0, ${contentLength}]`)
      console.assert(arrowEnd >= arrowStart && arrowEnd <= contentLength,
        `[findBindStatements] arrowEnd ${arrowEnd} out of bounds [${arrowStart}, ${contentLength}]`)
      console.assert(exprStart >= arrowEnd && exprStart <= contentLength,
        `[findBindStatements] exprStart ${exprStart} out of bounds [${arrowEnd}, ${contentLength}]`)
      console.assert(exprEnd >= exprStart && exprEnd <= contentLength,
        `[findBindStatements] exprEnd ${exprEnd} out of bounds [${exprStart}, ${contentLength}]`)

      statements.push({
        varStart,
        varEnd,
        varName,
        arrowStart,
        arrowEnd,
        exprStart,
        exprEnd,
        hasSemicolon,
        hasReturn,
        returnStart,
        returnEnd
      })
    }

    pos += line.length + 1 // +1 for newline
  }

  return statements
}

/**
 * Check if a position in the content is inside a nested function/callback
 */
function isPositionInsideNestedFunction(content: string, position: number): boolean {
  const before = content.slice(0, position)
  let functionDepth = 0
  let i = 0

  while (i < before.length) {
    // Check for 'function' keyword
    if (before.slice(i).startsWith("function")) {
      const braceIdx = before.indexOf("{", i)
      if (braceIdx !== -1 && braceIdx < position) {
        functionDepth++
      }
      i += 8
      continue
    }

    // Check for arrow function =>
    if (before.slice(i).startsWith("=>")) {
      const afterArrow = before.slice(i + 2)
      const braceMatch = afterArrow.match(/^\s*\{/)
      if (braceMatch) {
        functionDepth++
      }
      i += 2
      continue
    }

    // Track closing braces
    if (before[i] === "}" && functionDepth > 0) {
      functionDepth--
    }

    i++
  }

  return functionDepth > 0
}

/**
 * Transform source code containing gen blocks
 *
 * Uses fine-grained MagicString operations to preserve source map positions
 * for expressions that don't change.
 */
export function transformSource(
  source: string,
  filename?: string
): TransformResult {
  if (!hasGenBlocks(source)) {
    return { code: source, map: null, hasChanges: false, magicString: null }
  }

  const blocks = findGenBlocks(source)
  if (blocks.length === 0) {
    return { code: source, map: null, hasChanges: false, magicString: null }
  }

  const s = new MagicString(source)

  // Process blocks from end to start to preserve positions
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (!block) continue
    transformBlock(s, source, block)
  }

  const mapOptions: Parameters<MagicString["generateMap"]>[0] = {
    includeContent: true,
    hires: true
  }
  if (filename) {
    mapOptions.source = filename
    mapOptions.file = `${filename}.map`
  }

  return {
    code: s.toString(),
    map: s.generateMap(mapOptions),
    hasChanges: true,
    magicString: s
  }
}

/**
 * Transform a single gen block using fine-grained operations
 */
function transformBlock(s: MagicString, source: string, block: GenBlock): void {
  // Validate block boundaries
  console.assert(block.start >= 0 && block.start < source.length,
    `[transformBlock] block.start ${block.start} out of bounds [0, ${source.length})`)
  console.assert(block.braceStart >= block.start && block.braceStart < source.length,
    `[transformBlock] block.braceStart ${block.braceStart} out of bounds [${block.start}, ${source.length})`)
  console.assert(block.end > block.braceStart && block.end <= source.length,
    `[transformBlock] block.end ${block.end} out of bounds (${block.braceStart}, ${source.length}]`)

  // 1. Replace "gen " (with trailing space) or "gen{" with the wrapper
  //    "Effect.gen(/* __EFFECT_SUGAR__ */ function* () "
  //    The opening brace { stays in place
  s.overwrite(block.start, block.braceStart, "Effect.gen(/* __EFFECT_SUGAR__ */ function* () ")

  // 2. Transform bind statements inside the block
  //    Only modify the parts that change, keeping expressions in place
  const contentStart = block.braceStart + 1
  const contentEnd = block.end - 1

  // Validate content boundaries
  console.assert(contentStart >= 0 && contentStart <= source.length,
    `[transformBlock] contentStart ${contentStart} out of bounds [0, ${source.length}]`)
  console.assert(contentEnd >= contentStart && contentEnd <= source.length,
    `[transformBlock] contentEnd ${contentEnd} out of bounds [${contentStart}, ${source.length}]`)

  const content = source.slice(contentStart, contentEnd)

  const bindStatements = findBindStatements(content)

  // Process bind statements from end to start (to preserve positions)
  for (let i = bindStatements.length - 1; i >= 0; i--) {
    const bind = bindStatements[i]
    if (!bind) continue

    // Skip if inside a nested function
    if (isPositionInsideNestedFunction(content, bind.varStart)) {
      continue
    }

    // Convert positions to absolute (in source)
    const absExprStart = contentStart + bind.exprStart

    if (bind.hasReturn && bind.returnStart !== undefined && bind.returnEnd !== undefined) {
      // Return bind: transform "return PATTERN <- EXPR" to "return yield* EXPR"
      // Replace everything from "return" to start of expression with "return yield* "
      const absReturnStart = contentStart + bind.returnStart

      // Validate absolute positions for return bind
      console.assert(absReturnStart >= contentStart && absReturnStart < source.length,
        `[transformBlock] absReturnStart ${absReturnStart} out of bounds [${contentStart}, ${source.length})`)
      console.assert(absExprStart >= absReturnStart && absExprStart < source.length,
        `[transformBlock] absExprStart ${absExprStart} out of bounds [${absReturnStart}, ${source.length})`)

      s.overwrite(absReturnStart, absExprStart, "return yield* ")
    } else {
      // Regular bind: transform "PATTERN <- EXPR" to "const PATTERN = yield* EXPR"
      const absVarStart = contentStart + bind.varStart
      const absVarEnd = contentStart + bind.varEnd

      // Validate absolute positions for regular bind
      console.assert(absVarStart >= contentStart && absVarStart < source.length,
        `[transformBlock] absVarStart ${absVarStart} out of bounds [${contentStart}, ${source.length})`)
      console.assert(absVarEnd > absVarStart && absVarEnd <= source.length,
        `[transformBlock] absVarEnd ${absVarEnd} out of bounds (${absVarStart}, ${source.length}]`)
      console.assert(absExprStart >= absVarEnd && absExprStart < source.length,
        `[transformBlock] absExprStart ${absExprStart} out of bounds [${absVarEnd}, ${source.length})`)

      // Insert "const " before variable name
      s.appendLeft(absVarStart, "const ")

      // Replace from after variable to start of expression with " = yield* "
      // This preserves the variable name and expression in their original positions
      s.overwrite(absVarEnd, absExprStart, " = yield* ")
    }
  }

  // 3. Add closing paren after the block's closing brace
  s.appendRight(block.end, ")")
}
