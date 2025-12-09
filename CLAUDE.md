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

# Run tsc-plugin tests only
pnpm --filter effect-sugar-tsc test

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
│   ├── core/               # Core scanner and transformer (effect-sugar-core)
│   │   ├── src/
│   │   │   ├── index.ts        # Exports transformSource, hasGenBlocks, etc.
│   │   │   └── scanner.ts      # Token-based gen {} parser (js-tokens)
│   │   └── test/
│   ├── tsc-plugin/         # ts-patch transformer for tsc (effect-sugar-tsc)
│   │   ├── src/
│   │   │   ├── index.ts        # Re-exports
│   │   │   ├── transform.ts    # Program Transformer implementation
│   │   │   └── eslint.ts       # ESLint preprocessor
│   │   └── test/
│   ├── vscode-extension/   # VSCode extension (bundles ts-plugin)
│   │   ├── src/            # Extension source
│   │   └── ts-plugin/      # TypeScript language service plugin
│   └── vite-plugin/        # Vite plugin + tsx loader (effect-sugar-vite)
│       ├── src/
│       │   ├── index.ts        # Vite plugin entry point
│       │   ├── transform.ts    # Transformation with source maps (MagicString)
│       │   ├── eslint.ts       # ESLint preprocessor (moved to tsc-plugin)
│       │   ├── register.ts     # tsx loader registration
│       │   └── loader-hooks.ts # Node.js loader hooks
│       └── test/
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

### TypeScript Compiler (tsc via ts-patch)

**Note**: The tsc-plugin uses ts-patch's `transformProgram` API for compilation. For optimal IDE and build performance, use separate tsconfig files.

**Setup:**

```bash
pnpm add -D effect-sugar-tsc ts-patch
```

**1. Create `tsconfig.json`** (for IDE/Language Service):
```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "effect-sugar-ts-plugin"  // For VSCode/IDE support
      }
    ]
  }
}
```

**2. Create `tsconfig.build.json`** (for compilation):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "plugins": [
      {
        "name": "effect-sugar-tsc",  // For tsc compilation
        "transform": "effect-sugar-tsc/transform",
        "transformProgram": true
      }
    ]
  }
}
```

**3. Update `package.json`:**
```json
{
  "scripts": {
    "prepare": "ts-patch install -s",
    "build": "tspc --project tsconfig.build.json",
    "typecheck": "tspc --noEmit --project tsconfig.build.json"
  }
}
```

**Why separate configs?**
- The compilation transformer operates during TypeScript's program transformation phase
- The IDE plugin works at the language service level
- Separate configs ensure optimal performance and stability in both contexts

**Flow:** `.ts` files → ts-patch intercepts getSourceFile → transforms `gen { }` → TypeScript parses valid code → compiles

**How it works:** Uses a Program Transformer that wraps `CompilerHost.getSourceFile()` to transform source before TypeScript's parser sees it. This is necessary because `gen {}` is not valid TypeScript syntax.

### ESLint Integration

Configure ESLint to transform gen blocks before linting:

```javascript
// eslint.config.mjs
import effectSugarPreprocessor from 'effect-sugar-tsc/eslint'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: effectSugarPreprocessor,
    // ... your other config
  }
]
```

### Prettier Integration

Format gen block code using the `effect-sugar-format` CLI tool:

```bash
# Format specific files
pnpm --filter effect-sugar-tsc exec effect-sugar-format src/**/*.ts

# Format directories
pnpm --filter effect-sugar-tsc exec effect-sugar-format src/ test/

# Or install globally/locally and run directly
npx effect-sugar-format src/
```

**How it works:**
1. Transforms `gen {}` → `Effect.gen()` with markers
2. Runs Prettier with your project's configuration
3. Transforms back to `gen {}` syntax using markers

**Project-level usage:** Add to root package.json:
```json
{
  "scripts": {
    "format": "pnpm --filter effect-sugar-tsc exec effect-sugar-format examples"
  }
}
```

## Key Patterns

### Statement Types
- `x <- effect` → `const x = yield* effect` (bind)
- `_ <- effect` → `yield* effect` (discard pattern - no binding)
- `let x = expr` → `const x = expr` (let)
- `return expr` → `return expr` (return)
- `return _ <- effect` → `return yield* effect` (early return for type narrowing)

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

### Type Narrowing Requires `return`
TypeScript's control flow analysis doesn't recognize `yield*` as an exit point. For early returns that need type narrowing, use `return _ <- expr`:

```typescript
// ✅ Correct - TypeScript narrows types
if (!info) {
  return _ <- Effect.fail(new Error("Not found"))
}
return info  // TypeScript knows info is not null

// ❌ Wrong - TypeScript doesn't narrow
if (!info) {
  _ <- Effect.fail(new Error("Not found"))
}
return info  // TypeScript still thinks info could be null
```

## Testing

- **Unit tests**: Test scanner and transformation (`packages/core/test/`, `packages/tsc-plugin/test/`)
- **Integration tests**: Test full pipeline with Effect-TS (`test/integration/`)

## Current Status

- **Phase 1**: Complete (parser, generator, unit tests)
- **Phase 2**: Complete (TypeScript integration, VSCode extension)
- **Phase 3**: Complete (ts-patch transformer - `effect-sugar-tsc`)
- **Vite plugin**: Recommended for Vite projects - no separate config needed

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

## Position Mapping Architecture

The ts-plugin uses @jridgewell/trace-mapping for accurate bidirectional position mapping between original (gen {}) and transformed (Effect.gen()) source code.

**Key components:**
- `packages/vscode-extension/ts-plugin/src/position-mapper.ts` - PositionMapper class using TraceMap
- `packages/vscode-extension/ts-plugin/src/transformer.ts` - Source map generation via MagicString

**How it works:**
1. Transformer uses MagicString to apply code transformations
2. MagicString generates VLQ source maps tracking all changes
3. PositionMapper wraps TraceMap for efficient position lookups
4. All IntelliSense features use the mapper (hover, completion, go-to-definition, syntax highlighting)

**Why source maps instead of manual segment tracking?**
- Industry standard for position mapping
- Handles complex transformations accurately
- Better than custom interpolation-based approaches
- Powers all IDE features seamlessly

## Debugging the VSCode Extension

F5 debug workflow for plugin development:

1. **Press F5** in VSCode (project root)
2. **Automated steps run via tasks.json:**
   - Builds ts-plugin (`pnpm run build`)
   - Installs dependencies in examples/gen-block
   - Launches new VSCode instance with examples/gen-block workspace
   - Sets TSS_DEBUG=5667 to enable TypeScript server debugging
   - Attaches debugger to port 5667

3. **Set breakpoints** in `packages/vscode-extension/ts-plugin/src/*.ts`

4. **Trigger in debug window:**
   - Open basic.ts, hover over variables
   - Use go-to-definition (Cmd+Click)
   - Trigger auto-complete

5. **After changes:**
   - Stop debug (Shift+F5)
   - Press F5 again to rebuild and relaunch
   - OR in debug window: Cmd+Shift+P > "TypeScript: Restart TS Server"

**Troubleshooting:**
- Port 5667 in use: Change port in launch.json and TSS_DEBUG variable in tasks.json
- Breakpoints not hit: Check outFiles path in launch.json
- Plugin not loading: Verify build succeeded, check examples/gen-block/tsconfig.json plugins

**Key files:**
- `.vscode/launch.json` - Debug configuration
- `.vscode/tasks.json` - Build and launch tasks
- `examples/gen-block/` - Isolated debug workspace

## Sync with language-service

effect-sugar shares gen-block components with the language-service project. See `tmp/2025-12-02/SYNC_WITH_LANGUAGE_SERVICE.md` for:
- Which components stay in sync
- Sync workflow and frequency
- History of adopted changes

## Project-Specific Testing

```bash
# Run tests before committing
pnpm test

# Run integration tests
pnpm test:integration
```

## Release Process with Changesets (Automated via GitHub Actions)

**IMPORTANT: This is fully automated. Do NOT manually run release commands locally.**

### 1. During Development (Feature Branch)

Create a changeset when your feature/fix is ready to be released:

```bash
# Interactive prompt to select packages and bump type (major/minor/patch)
pnpm changeset

# Or manually create .changeset/<slug>.md with format:
# ---
# "package-name": minor
# "other-package": patch
# ---
# Description of changes for the changelog
```

Commit the changeset file(s) as part of your feature branch PR.

### 2. Merge PR to Main

When your PR is merged to main, the GitHub Actions release workflow (`.github/workflows/release.yml`) automatically:

1. **Detects changesets** in the repository
2. **Creates a Release PR** that:
   - Runs `pnpm changeset version` (bumps versions, generates changelogs)
   - Commits all version changes with `chore: version packages`
3. **Auto-merges the Release PR** back to main
4. **On the second push to main** (from Release PR merge):
   - Runs `pnpm run publish` which executes:
     - `turbo run build` (full clean build)
     - `changeset publish` (publishes to npm with NPM_TOKEN secret)
   - Creates git tags for each published package

### 3. What NOT to Do

❌ **DO NOT run locally:**
- `pnpm changeset version`
- `pnpm changeset publish`
- Manual version bumps
- Manual npm publishes

These are handled entirely by GitHub Actions using the `changesets/action@v1` workflow.

### 4. Configuration

- Changeset config: `.changeset/config.json`
- Ignored packages (not published): `effect-sugar`, `gen-block-examples`
- Base branch: `main`
- Access: public
- Release workflow: `.github/workflows/release.yml`

**Secrets Required:**
- `NPM_TOKEN`: npm authentication token
- `CHANGESET_TOKEN`: GitHub token (for auto-merge of Release PR)

**Local Alternative (Dev Releases Only):**
```bash
pnpm publish:dev          # Publish dev version to local registry
pnpm publish:dryrun       # Dry-run without publishing
```

## Available Agents

Located in `.claude/agents/`:

- **effect-ts-optimization-agent** - Optimize Effect-TS patterns, eliminate "as any"
- **code-review-agent** - Quality assurance and best practices
- **testing-agent** - Test execution and validation
- **refactoring-specialist** - Safe code transformation
- **dryness-agent** - Find DRY violations and duplication
