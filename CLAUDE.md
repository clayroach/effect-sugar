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

## Release Process with Changesets

This project uses changesets for automated versioning and releases:

### 1. During Development (Feature Branch)

Create a changeset when making changes that should be released:

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

Commit the changeset file as part of your feature branch PR.

### 2. On Main Branch (Before Release)

When PRs are merged to main and it's time to release:

```bash
# 1. Update package.json versions based on changesets
pnpm changeset version

# 2. Review the changes, build and test
pnpm run build
pnpm run test

# 3. Publish all packages to npm
pnpm changeset publish
```

This will:
- Consume all changeset files
- Update version numbers in each package.json
- Generate changelog entries
- Publish updated packages to npm registry

### 3. Configuration

- Changeset config: `.changeset/config.json`
- Ignored packages (not published): `effect-sugar`, `gen-block-examples`
- Base branch: `main`
- Access: public

**Note**: The `publish:dev` script publishes dev versions to local verdaccio for testing.

## Available Agents

Located in `.claude/agents/`:

- **effect-ts-optimization-agent** - Optimize Effect-TS patterns, eliminate "as any"
- **code-review-agent** - Quality assurance and best practices
- **testing-agent** - Test execution and validation
- **refactoring-specialist** - Safe code transformation
- **dryness-agent** - Find DRY violations and duplication
