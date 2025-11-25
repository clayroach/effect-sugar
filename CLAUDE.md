# effect-sugar - AI Context

Babel plugin providing syntactic sugar for Effect-TS with for-comprehension style `gen` blocks.

## Quick Commands

**IMPORTANT: Always use pnpm, never npm**

```bash
# Build everything
pnpm run build

# Run unit tests (babel-plugin)
pnpm run test:plugin

# Run integration tests
pnpm run test:integration

# Clean build artifacts
pnpm run clean

# Build vite-plugin
cd packages/vite-plugin && pnpm run build

# Test vite-plugin
cd packages/vite-plugin && pnpm test
```

## Package Structure

```
effect-sugar/
├── packages/
│   └── vite-plugin/        # Vite plugin + tsx loader (effect-sugar-vite)
│       ├── src/
│       │   ├── index.ts    # Vite plugin entry point
│       │   ├── transform.ts # Core transformation logic
│       │   ├── register.ts # tsx loader registration
│       │   └── loader-hooks.ts # Node.js loader hooks
│       └── test/           # Unit tests
├── babel-plugin/           # Core transformation plugin
│   ├── src/
│   │   ├── parser.ts       # Custom syntax parser for gen { }
│   │   ├── generator.ts    # Code generator for Effect.gen
│   │   └── index.ts        # Plugin entry point
│   └── test/               # Unit tests
├── vscode-extension/       # VSCode extension with TypeScript plugin
├── test/
│   └── integration/        # Integration tests with Effect-TS
├── examples/               # Usage examples (.gen.ts files)
├── scripts/
│   └── preprocess.js       # Transforms gen blocks before TypeScript
└── target/                 # Build outputs
```

## Transformation Syntax

```typescript
// Input - gen block syntax
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
}

// Output - Effect.gen
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
})
```

## Build Pipeline

There are multiple integration options depending on your project setup:

### Option A: Vite Plugin (Frontend)

For Vite-based projects (React, Vue, etc.):

```typescript
// vite.config.ts
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [
    effectSugar(),  // Add BEFORE other plugins like react()
    react()
  ]
})
```

**Flow:** `.ts` files → Vite plugin transforms `gen { }` → esbuild compiles → bundled output

### Option B: tsx Loader (Backend/Node.js)

For backend development with tsx:

```bash
pnpm add -D effect-sugar-vite esbuild
```

```json
// package.json
{
  "scripts": {
    "dev": "tsx --import effect-sugar-vite/register --watch src/index.ts"
  }
}
```

**Flow:** `.ts` files → loader reads source → transforms `gen { }` → esbuild compiles → Node.js executes

Note: esbuild is required because the loader bypasses tsx for files with gen blocks.

### Option C: Preprocessor Script (Legacy)

For projects that can't use Vite or tsx loader:

```
.gen.ts files → preprocess.js → .ts files → TypeScript → .js + .d.ts
```

1. **Preprocessing**: `scripts/preprocess.js` transforms `gen { }` blocks
2. **Type Checking**: TypeScript compiles transformed `.ts` files
3. **Output**: JavaScript with declarations and source maps

## Key Patterns

### Statement Types
- `x <- effect` → `const x = yield* effect` (bind)
- `let x = expr` → `const x = expr` (let)
- `return expr` → `return expr` (return)
- `if/else` → preserved with condition wrapped

### Plugin Pre-Processing
The plugin uses `transformSource()` which runs before Babel parses. This allows custom `gen { }` syntax without modifying Babel's parser.

## Common Pitfalls

### Import Extensions
ESM requires `.js` extensions in imports:
```typescript
// Correct
import { parseEffBlock } from './parser.js'

// Wrong - will fail at runtime
import { parseEffBlock } from './parser'
```

### Comments with gen
The plugin transforms ALL occurrences of `gen {` including in comments. Avoid this pattern in documentation strings.

### File Extensions
Use `.gen.ts` for files with gen block syntax. The preprocessing step outputs standard `.ts` files.

## Testing

- **Unit tests**: Test parser and generator in isolation (`babel-plugin/test/`)
- **Integration tests**: Test full pipeline with Effect-TS (`test/integration/`)

## Current Status

- **Phase 1**: Complete (parser, generator, unit tests)
- **Phase 2**: Complete (TypeScript integration, VSCode extension)
- **Phase 3**: Complete (Vite plugin + tsx loader - `effect-sugar-vite`)
- **Phase 4-5**: Not started (CLI, IntelliJ)

See GitHub Issues for specifications and roadmap.

## Planning Larger Features

For larger features or multi-step changes, create planning documents in:

```
tmp/[date]/*.md
```

Example: `tmp/2025-11-24/VIRTUAL_FILE_APPROACH.md`

- Organize by date to track planning evolution
- Gitignored - not committed to repo
- Reference these docs across sessions for continuity

---

## Development Best Practices

### Avoid Over-Engineering

**ONLY implement what is explicitly requested - NO speculative features:**

- Implement EXACTLY what the issue/spec describes
- Keep solutions minimal and focused
- Ask for clarification rather than assuming requirements
- **When in doubt**: Implement the minimum viable solution

### No Time Estimates

**NEVER include time estimates in implementation plans:**

- Use phase-based organization (Phase 1, Phase 2, Phase 3)
- Use priority-based labels (Immediate, Short-term, Long-term)
- Focus on dependency relationships between tasks

### Test-Before-Commit Workflow

**MANDATORY for all code changes:**

```bash
# 1. Make code changes
# 2. RUN TESTS
pnpm test

# 3. ONLY commit if tests pass
git add [files]
git commit -m "message"
```

**NEVER** commit without running tests or mark tests as "verified" without actually running them.

### Git Workflow - Feature Branches

**ALWAYS use feature branches:**

```bash
git checkout -b feat/feature-name
git commit -m "feat: description"
git push -u origin feat/feature-name
gh pr create
```

### Multi-Line Content - Use Temporary Files

**ALWAYS write multi-line content to temporary files:**

```bash
# Commits
cat > /tmp/commit-msg.txt << 'EOF'
feat: Brief description

Detailed explanation.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
git commit -F /tmp/commit-msg.txt

# PR bodies
cat > /tmp/pr-body.txt << 'EOF'
## Summary
...
EOF
gh pr create --title "feat: title" --body-file /tmp/pr-body.txt
```

### Bash Command Formatting

**NEVER use backslash line continuations** - use single-line commands with `&&` chaining:

```bash
# CORRECT
echo "Check" && grep -n "pattern" file.ts && echo "Done"

# WRONG - causes errors
echo "Check" && \
grep -n "pattern" file.ts
```

### Never Declare Early Success

**NEVER declare success while known issues exist:**

- State what actually works (with evidence)
- Acknowledge all known issues
- Be specific about failures
- Provide next steps

## Effect MCP Server for Documentation Lookup

**MANDATORY:** Before implementing any Effect-based functionality, use the Effect MCP server:

### 1. Search for Effect-native patterns

```
Use mcp__effect-docs__effect_docs_search to find relevant Effect patterns
Example queries: "layer composition", "resource management", "error handling", "generator"
```

### 2. Validate your approach

```
After finding relevant docs, use mcp__effect-docs__get_effect_doc to read full documentation
Verify your planned approach matches Effect best practices
```

### 3. Find Effect-native alternatives

Before using Promise.all(), Array.map(), etc., search Effect docs for:
- `Effect.all()` for concurrent operations
- `Effect.forEach()` for iteration
- `Effect.gen()` for generator syntax
- `Effect.tryPromise()` for wrapping promises

### When to check Effect docs

**ALWAYS check before:**
- Implementing concurrent operations
- Managing resources (files, connections)
- Handling errors with typed errors
- Working with async operations
- Creating new layers or services

**Example searches:**
- "generator syntax"
- "layer dependency injection"
- "error handling tagged errors"
- "concurrent effects"

## Available Agents

Located in `.claude/agents/`:

- **effect-ts-optimization-agent** - Optimize Effect-TS patterns, eliminate "as any"
- **code-review-agent** - Quality assurance and best practices
- **testing-agent** - Test execution and validation
- **refactoring-specialist** - Safe code transformation
- **dryness-agent** - Find DRY violations and duplication
