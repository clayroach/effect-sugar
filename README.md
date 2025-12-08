# effect-sugar

Syntactic sugar for [Effect-TS](https://effect.website/) with for-comprehension style `gen` blocks.

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

## Quick Start

### Installation

```bash
pnpm add -D effect-sugar-tsc ts-patch
```

Add a prepare script to auto-patch TypeScript after installs:

```json
{
  "scripts": {
    "prepare": "ts-patch install -s"
  }
}
```

Configure the plugin in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "effect-sugar-tsc",
        "transform": "effect-sugar-tsc/transform",
        "transformProgram": true
      }
    ]
  }
}
```

Run `pnpm install` to trigger the prepare script, then use `tsc` normally.

### IDE Support (VSCode)

Install the VSCode extension from the [releases page](https://github.com/clayroach/effect-sugar/releases) or build locally:

```bash
cd packages/vscode-extension
pnpm build && pnpm package
code --install-extension ../../target/effect-sugar-0.1.0.vsix
```

The extension provides syntax highlighting and suppresses TypeScript errors inside gen blocks.

## Syntax Reference

| Input | Output | Notes |
|-------|--------|-------|
| `x <- effect` | `const x = yield* effect` | Bind pattern |
| `_ <- effect` | `yield* effect` | Discard pattern (no binding) |
| `let x = expr` | `const x = expr` | Let binding |
| `return expr` | `return expr` | Return value |
| `return _ <- effect` | `return yield* effect` | Early return (required for type narrowing) |

### Type Narrowing with Early Returns

TypeScript's control flow analysis requires the `return` keyword to understand that a branch exits:

```typescript
const program = gen {
  config <- loadConfig()
  const info = getInfo(config)  // returns ModelInfo | null

  if (!info) {
    return _ <- Effect.fail(new Error("Not found"))  // ✅ TypeScript narrows
  }

  return info  // ✅ TypeScript knows info is ModelInfo (not null)
}
```

Without `return`, TypeScript cannot narrow the type:

```typescript
if (!info) {
  _ <- Effect.fail(new Error("Not found"))  // ❌ TypeScript doesn't narrow
}
return info  // ❌ TypeScript still thinks info could be null
```

## ESLint Integration

The ESLint preprocessor transforms gen blocks before linting, preventing syntax errors:

```javascript
// eslint.config.mjs
import effectSugarPreprocessor from 'effect-sugar-tsc/eslint'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: effectSugarPreprocessor,
    // ... your other config (parser, plugins, rules)
  }
]
```

## Development

```bash
pnpm install
pnpm run build      # Build all packages
pnpm test           # Run tests
pnpm test:integration
```

## Project Structure

- `packages/core/` - Core scanner and transformer (`effect-sugar-core`)
- `packages/tsc-plugin/` - ts-patch transformer for tsc (`effect-sugar-tsc`)
- `packages/vscode-extension/` - VSCode extension with bundled TS plugin
- `packages/vite-plugin/` - ⚠️ Deprecated - Vite plugin + tsx loader (`effect-sugar-vite`)

## License

MIT
