# effect-sugar - AI Context

Babel plugin providing syntactic sugar for Effect-TS with for-comprehension style `gen` blocks.

## Quick Commands

```bash
# Build everything
npm run build

# Run unit tests (babel-plugin)
npm run test:plugin

# Run integration tests
npm run test:integration

# Clean build artifacts
npm run clean
```

## Package Structure

```
effect-sugar/
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
- **Phase 2**: In Progress (TypeScript integration)
- **Phase 3-5**: Not started (VSCode extension, CLI, IntelliJ)

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
