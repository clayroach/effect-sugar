# Vite Plugin Setup (Deprecated)

> ⚠️ **Deprecated**: The `effect-sugar-vite` package is deprecated. For new projects, use [`effect-sugar-tsc`](../README.md#quick-start) with tsc or [`effect-sugar-esbuild`](./esbuild.md) for bundling.

This guide is maintained for existing projects using the Vite plugin.

## Installation

```bash
pnpm add -D effect-sugar-vite vite
```

## Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [effectSugarPlugin()]
})
```

## Migration Path

### From Vite Plugin to tsc

**Step 1**: Install tsc plugin

```bash
pnpm add -D effect-sugar-tsc ts-patch
pnpm remove effect-sugar-vite
```

**Step 2**: Add prepare script

```json
{
  "scripts": {
    "prepare": "ts-patch install -s"
  }
}
```

**Step 3**: Update tsconfig.json

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

**Step 4**: Remove from vite.config.ts

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Remove: effectSugar()
  ]
})
```

**Step 5**: Run install

```bash
pnpm install
```

### From Vite Plugin to esbuild

For bundling with esbuild instead:

```bash
pnpm add -D effect-sugar-esbuild
pnpm remove effect-sugar-vite
```

See [esbuild setup guide](./esbuild.md) for configuration.

## Why Deprecated?

The Vite plugin was an early solution but has several limitations:

1. **Vite-specific** - Only works with Vite, not other tools
2. **Runtime overhead** - Transformation happens at dev server time
3. **IDE mismatch** - Vite transformation doesn't help TypeScript language service
4. **Maintenance burden** - Requires keeping up with Vite API changes

The tsc plugin with ts-patch is now the recommended approach because:
- Works with any tool that uses TypeScript
- Transforms at compile time
- Provides IDE support through TypeScript language service
- More maintainable long-term

## Support

For issues with the Vite plugin, please check [existing issues](https://github.com/clayroach/effect-sugar/issues) or open a new one. However, we strongly encourage migrating to the tsc plugin for better long-term support.
