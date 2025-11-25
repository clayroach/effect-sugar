# effect-sugar-vite

Vite plugin and tsx loader for Effect-TS gen block syntax.

## Installation

```bash
pnpm add -D effect-sugar-vite
```

## Usage

### Vite Plugin (Frontend)

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [effectSugar()]
})
```

### tsx Loader (Backend/Node.js)

For backend development with tsx:

```bash
pnpm add -D effect-sugar-vite esbuild
```

Then run:

```bash
tsx --import effect-sugar-vite/register src/index.ts
```

Or in `package.json`:

```json
{
  "scripts": {
    "dev": "tsx --import effect-sugar-vite/register --watch src/index.ts"
  }
}
```

Note: esbuild is required for the tsx loader to compile TypeScript files with gen blocks.

## What It Does

Transforms gen block syntax:

```typescript
// Input
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
}

// Output
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
})
```

## Options

### Vite Plugin Options

```typescript
effectSugar({
  // File extensions to process (default: ['.ts', '.tsx', '.mts', '.cts'])
  include: ['.ts', '.tsx'],

  // Patterns to exclude (default: [/node_modules/])
  exclude: [/node_modules/, /\.test\.ts$/],

  // Enable source maps (default: true)
  sourcemap: true
})
```

## IDE Support

For full IntelliSense support, install the [effect-sugar VS Code extension](https://github.com/croach/effect-sugar).

## API

For advanced usage, you can import the transformation utilities directly:

```typescript
import { transformSource, hasGenBlocks, findGenBlocks } from 'effect-sugar-vite/transform'

// Check if source contains gen blocks
if (hasGenBlocks(source)) {
  const result = transformSource(source, 'filename.ts')
  console.log(result.code)
  console.log(result.map) // Source map
}
```

## License

MIT
