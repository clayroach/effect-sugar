# esbuild Plugin Setup

This guide shows how to use effect-sugar with esbuild for bundling and building applications.

## When to Use This

- Building applications with esbuild
- Using esbuild-based tools (tsup, unbuild, etc.)
- Need fast bundling with gen block transformation
- Creating production bundles

## Installation

```bash
pnpm add -D effect-sugar-esbuild esbuild
```

## Direct esbuild Usage

```typescript
// build.ts
import * as esbuild from 'esbuild'
import { effectSugarPlugin } from 'effect-sugar-esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  plugins: [effectSugarPlugin()],
  outfile: 'dist/bundle.js',
  format: 'esm',
  platform: 'node'
})
```

## Plugin Options

```typescript
effectSugarPlugin({
  // File filter pattern (default: /\.tsx?$/)
  filter: /\.tsx?$/,

  // Skip node_modules (default: true)
  skipNodeModules: true
})
```

## Integration Examples

### tsup

tsup uses esbuild internally and supports esbuild plugins:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'
import { effectSugarPlugin } from 'effect-sugar-esbuild'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  esbuildPlugins: [effectSugarPlugin()]
})
```

### unbuild

```typescript
// build.config.ts
import { defineBuildConfig } from 'unbuild'
import { effectSugarPlugin } from 'effect-sugar-esbuild'

export default defineBuildConfig({
  entries: ['src/index'],
  declaration: true,
  rollup: {
    esbuild: {
      plugins: [effectSugarPlugin()]
    }
  }
})
```

### Vite

Vite uses esbuild for dependency pre-bundling:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { effectSugarPlugin } from 'effect-sugar-esbuild'

export default defineConfig({
  optimizeDeps: {
    esbuildOptions: {
      plugins: [effectSugarPlugin()]
    }
  }
})
```

**Note**: For Vite, the [deprecated vite-plugin](./vite.md) is still available but not recommended.

## Build Scripts

Add to package.json:

```json
{
  "scripts": {
    "build": "node build.ts",
    "build:watch": "node build.ts --watch"
  }
}
```

## How It Works

The esbuild plugin:
1. Intercepts `.ts`/`.tsx` files during the build
2. Checks for `gen {` blocks
3. Transforms them to `Effect.gen()` before esbuild compiles
4. Lets esbuild handle TypeScript compilation

This happens at build time, so there's no runtime overhead.

## Production Builds

The plugin works seamlessly in production builds:

```typescript
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  plugins: [effectSugarPlugin()],
  outfile: 'dist/bundle.js',
  platform: 'node',
  target: 'node18',
  format: 'esm'
})
```

## Troubleshooting

### "Expected ';' but found '{'"

Make sure the plugin is added to your esbuild configuration:

```typescript
plugins: [effectSugarPlugin()]
```

### Plugin not transforming files

Check that:
1. Files match the filter pattern (default: `.ts`/`.tsx`)
2. `skipNodeModules` isn't excluding your files
3. Plugin is listed in the `plugins` array

### Type errors in IDE

The esbuild plugin only handles build-time transformation. For IDE support, add the [TypeScript plugin](../README.md#ide-support).

## When to Use esbuild vs tsc

**Use esbuild when**:
- Need fast bundling
- Building for production
- Using esbuild-based tools (tsup, unbuild)

**Use tsc when**:
- Need strict type checking during build
- Generating declaration files (.d.ts)
- Prefer the recommended setup

For most projects, we recommend [tsc with ts-patch](../README.md#quick-start) for development and esbuild for production bundling.
