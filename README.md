# effect-sugar

Syntactic sugar for [Effect-TS](https://effect.website/) with for-comprehension style `gen` blocks.

## Overview

Write cleaner Effect code with Scala/Haskell-inspired syntax:

```typescript
// Instead of this:
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
})

// Write this:
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
}
```

## Installation

### Prerequisites

- Node.js 18+
- VSCode (for IDE support)
- An existing Effect-TS project

### Step 1: Install the VSCode Extension

Download and install the VSCode extension:

```bash
# Download and install the .vsix from GitHub releases
curl -LO https://github.com/clayroach/effect-sugar/releases/download/v0.1.0/effect-sugar-0.1.0.vsix
code --install-extension effect-sugar-0.1.0.vsix
rm effect-sugar-0.1.0.vsix  # cleanup
```

### Step 2: Set Up Your Project

In your Effect-TS project, you need to:

#### 2a. Install the TypeScript Plugin

Install the TypeScript plugin from GitHub releases:

```bash
# npm
npm install https://github.com/clayroach/effect-sugar/releases/download/v0.1.0/effect-sugar-ts-plugin-0.1.0.tgz

# pnpm
pnpm add https://github.com/clayroach/effect-sugar/releases/download/v0.1.0/effect-sugar-ts-plugin-0.1.0.tgz
```

#### 2b. Configure tsconfig.json

Add the TypeScript plugin to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "effect-sugar-ts-plugin" }
    ]
  }
}
```

#### 2c. Configure VSCode to Use Workspace TypeScript

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run "TypeScript: Select TypeScript Version"
3. Choose "Use Workspace Version"

### Step 3: Set Up Build Transformation

The `gen { }` syntax needs to be transformed to `Effect.gen()` before TypeScript compiles.

#### Option A: Vite Plugin (Recommended for Frontend)

For projects using Vite:

```bash
pnpm add -D effect-sugar-vite
```

Add to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [
    effectSugar(),  // Add BEFORE other plugins
    react()
  ]
})
```

#### Option B: tsx Loader (Recommended for Backend/Node.js)

For backend development with tsx:

```bash
pnpm add -D effect-sugar-vite esbuild
```

Update your dev script in `package.json`:

```json
{
  "scripts": {
    "dev": "tsx --import effect-sugar-vite/register --watch src/index.ts"
  }
}
```

Note: The tsx loader uses esbuild internally to compile TypeScript files that contain gen blocks.

#### Option C: Preprocessor Script (Legacy)

For projects that can't use Vite or tsx loader:

```bash
# Install transform package from GitHub releases
pnpm add -D https://github.com/clayroach/effect-sugar/releases/download/v0.1.0/effect-sugar-transform-0.1.0.tgz

# Download the preprocessor script
mkdir -p scripts
curl -o scripts/preprocess.js https://raw.githubusercontent.com/clayroach/effect-sugar/main/scripts/preprocess.js
```

Add a build script to your `package.json`:

```json
{
  "scripts": {
    "preprocess": "node scripts/preprocess.js src",
    "build": "pnpm run preprocess && tsc -p tsconfig.build.json"
  }
}
```

Create a `tsconfig.build.json` that points to the transformed files:

```json
{
  "extends": "./tsconfig.json",
  "include": ["target/src_managed/**/*"],
  "exclude": ["node_modules"]
}
```

### Step 4: Write Code with gen Blocks

Create files using the gen block syntax. You can use either `.ts` or `.gen.ts` extension:

```typescript
// src/example.ts
import { Effect } from "effect"

// Helper functions that return Effects
const getUser = (id: string) => Effect.succeed({ id, name: "Alice" })
const getProfile = (userId: string) => Effect.succeed({ bio: "Developer" })

// Use gen block syntax
const program = gen {
  user <- getUser("123")
  profile <- getProfile(user.id)
  let fullName = user.name.toUpperCase()
  return { user, profile, fullName }
}

// Run the effect
Effect.runPromise(program).then(console.log)
```

### Step 5: Build and Run

```bash
# Transform gen blocks and compile
pnpm run build

# Run the compiled output
node target/src_managed/example.js
```

## Syntax Reference

| Input | Output |
|-------|--------|
| `x <- effect` | `const x = yield* effect` |
| `let x = expr` | `const x = expr` |
| `return expr` | `return expr` |

## Project Structure

- `packages/transform/` - Core source transformer (`effect-sugar-transform`)
- `packages/vite-plugin/` - Vite plugin and tsx loader (`effect-sugar-vite`)
- `packages/ts-plugin/` - TypeScript language service plugin (`effect-sugar-ts-plugin`)
- `packages/vscode-extension/` - VSCode extension (bundles ts-plugin)
- `examples/` - Usage examples
- `test/` - Integration tests
- `scripts/` - Build scripts

## Troubleshooting

### TypeScript errors still showing in gen blocks

1. Verify the plugin is installed: `ls node_modules/effect-sugar-ts-plugin`
2. Check that `tsconfig.json` has the plugin configured
3. Run "TypeScript: Select TypeScript Version" and choose "Use Workspace Version"
4. Restart VSCode

### Preprocessor not finding files

The preprocessor looks for `.ts` files containing `gen {` pattern. Ensure:

- Your source directory is passed as an argument: `node scripts/preprocess.js src`
- Files aren't in `node_modules`, `target`, or `dist` directories

### Build output location

Transformed files are written to `target/src_managed/`. Point your TypeScript build config to this directory.

## Development

**Note: Always use pnpm, never npm**

```bash
# Build everything (uses Turborepo)
pnpm run build

# Run all package tests
pnpm test

# Run integration tests
pnpm test:integration

# Clean build artifacts
pnpm run clean

# Typecheck all packages
pnpm run typecheck

# Publish to local Verdaccio for testing
pnpm publish:dev
```

## Status

- **Phase 1**: Complete (parser, generator, unit tests)
- **Phase 2**: Complete (TypeScript integration, VSCode extension)
- **Phase 3**: Complete (Vite plugin + tsx loader)
- **Phase 4-5**: Not started (CLI, IntelliJ)

## License

MIT
