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

```bash
npm install effect-sugar
```

## Quick Start

1. Use `.gen.ts` extension for files with gen block syntax
2. Run the preprocessor before TypeScript compilation
3. TypeScript sees standard `Effect.gen` code

```bash
npm run build
```

## Syntax

| Input | Output |
|-------|--------|
| `x <- effect` | `const x = yield* effect` |
| `let x = expr` | `const x = expr` |
| `return expr` | `return expr` |

## Project Structure

- `babel-plugin/` - Core transformation plugin
- `vscode-extension/` - VSCode extension with TypeScript plugin
- `examples/` - Usage examples
- `test/` - Integration tests

## Development

```bash
# Build everything
npm run build

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## Status

- **Phase 1**: Complete (parser, generator, unit tests)
- **Phase 2**: In Progress (TypeScript integration)
- **Phase 3-5**: Not started (VSCode extension, CLI, IntelliJ)

## License

MIT
