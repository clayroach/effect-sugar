# effect-sugar-vite

Vite plugin and tsx loader for Effect-TS gen block syntax.

## Installation

```bash
pnpm add -D effect-sugar-vite
```

## Usage

### Vite Plugin

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [effectSugar()]
})
```

### tsx Loader (Node.js)

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

### ESLint Preprocessor

```typescript
// eslint.config.js
import effectSugarPreprocessor from 'effect-sugar-vite/eslint'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: effectSugarPreprocessor
  }
]
```

## Transformation

```typescript
// Input
const program = gen {
  user <- getUser(id)
  let name = user.name.toUpperCase()
  return { user, name }
}

// Output
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const name = user.name.toUpperCase()
  return { user, name }
})
```

## Options

```typescript
effectSugar({
  include: ['.ts', '.tsx'],           // File extensions (default: ['.ts', '.tsx', '.mts', '.cts'])
  exclude: [/node_modules/],          // Patterns to exclude
  sourcemap: true                     // Enable source maps (default: true)
})
```

## API

```typescript
import { transformSource, hasGenBlocks } from 'effect-sugar-vite/transform'

if (hasGenBlocks(source)) {
  const result = transformSource(source, 'filename.ts')
  console.log(result.code, result.map)
}
```

## License

MIT
