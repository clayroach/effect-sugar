# effect-sugar - AI Context

Source transformer and tooling for Effect-TS with for-comprehension style `gen` blocks.

## Quick Commands

**IMPORTANT: Always use pnpm, never npm**

```bash
# Build everything (uses Turborepo)
pnpm run build

# Run all package tests
pnpm run test

# Run vite-plugin tests only
pnpm --filter effect-sugar-vite test

# Run integration tests
pnpm run test:integration

# Clean build artifacts
pnpm run clean

# Typecheck all packages
pnpm run typecheck

# Create a changeset for versioning
pnpm changeset
```

## Package Structure

```
effect-sugar/
├── packages/
│   ├── vite-plugin/        # Vite plugin + tsx loader (effect-sugar-vite)
│   │   ├── src/
│   │   │   ├── index.ts        # Vite plugin entry point
│   │   │   ├── transform.ts    # Core transformation logic
│   │   │   ├── scanner.ts      # Token-based gen {} parser (js-tokens)
│   │   │   ├── eslint.ts       # ESLint preprocessor
│   │   │   ├── register.ts     # tsx loader registration
│   │   │   └── loader-hooks.ts # Node.js loader hooks
│   │   └── test/           # Unit tests
│   └── vscode-extension/   # VSCode extension (bundles ts-plugin)
│       ├── src/            # Extension source
│       └── ts-plugin/      # TypeScript language service plugin
├── test/
│   └── integration/        # Integration tests with Effect-TS
├── examples/               # Usage examples
├── turbo.json              # Turborepo configuration
├── pnpm-workspace.yaml     # pnpm workspace configuration
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

- **Unit tests**: Test scanner and transformation (`packages/vite-plugin/test/`)
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

See `~/.claude/CLAUDE.md` for global development principles (over-engineering, time estimates, git workflow, testing, etc.).

## Project-Specific Testing

```bash
# Run tests before committing
pnpm test

# Run integration tests
pnpm test:integration
```

## Available Agents

Located in `.claude/agents/`:

- **effect-ts-optimization-agent** - Optimize Effect-TS patterns, eliminate "as any"
- **code-review-agent** - Quality assurance and best practices
- **testing-agent** - Test execution and validation
- **refactoring-specialist** - Safe code transformation
- **dryness-agent** - Find DRY violations and duplication
