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

### Vite Projects

```bash
pnpm add -D effect-sugar-vite
```

```typescript
// vite.config.ts
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [
    effectSugar(),  // Add BEFORE other plugins
    react()
  ]
})
```

### Node.js / Backend (tsx)

```bash
pnpm add -D effect-sugar-vite esbuild
```

```json
{
  "scripts": {
    "dev": "tsx --import effect-sugar-vite/register --watch src/index.ts"
  }
}
```

### TypeScript Compiler (tsc via ts-patch)

For projects using standard `tsc`, use the ts-patch transformer:

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

| Input | Output |
|-------|--------|
| `x <- effect` | `const x = yield* effect` |
| `let x = expr` | `const x = expr` |
| `return expr` | `return expr` |

## ESLint Integration

```typescript
// eslint.config.js
import effectSugarPreprocessor from 'effect-sugar-vite/eslint'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: effectSugarPreprocessor
  },
  // ... other configs
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
- `packages/vite-plugin/` - Vite plugin + tsx loader (`effect-sugar-vite`)
- `packages/tsc-plugin/` - ts-patch transformer for tsc (`effect-sugar-tsc`)
- `packages/vscode-extension/` - VSCode extension with bundled TS plugin

## License

MIT
