# babel-plugin-effect-sugar

Babel plugin that adds syntactic sugar for Effect-TS with for-comprehension style syntax and the `<-` operator.

## Installation

```bash
pnpm add -D babel-plugin-effect-sugar
```

## Usage

### Babel Configuration

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-effect-sugar', {
      effectImport: 'Effect' // optional, defaults to 'Effect'
    }]
  ]
}
```

### Syntax

Write monadic Effect code using `gen { }` blocks with the `<-` operator:

```typescript
import { Effect } from 'effect'

// Before: Custom syntax
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  let name = user.name.toUpperCase()
  return { user, profile, name }
}

// After: Transformed to Effect.gen
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const profile = yield* getProfile(user.id)
  const name = user.name.toUpperCase()
  return { user, profile, name }
})
```

### Supported Statements

#### Bind (`<-`)

Extracts value from an Effect:

```typescript
x <- someEffect()
// becomes: const x = yield* someEffect()
```

#### Let

Pure value assignment:

```typescript
let x = someValue
// becomes: const x = someValue
```

#### Return

Returns a value from the block:

```typescript
return { x, y }
// becomes: return { x, y }
```

#### If/Else

Conditional branching:

```typescript
if (condition) {
  return x
} else {
  return y
}
```

## Examples

### Basic Usage

```typescript
const fetchUserData = gen {
  user <- getUserById(id)
  posts <- getPostsByUserId(user.id)
  return { user, posts }
}
```

### With Error Handling

```typescript
const safeOperation = gen {
  config <- getConfig()
  result <- Effect.try(() => riskyOperation(config))
  return result
}
```

### Chaining Operations

```typescript
const pipeline = gen {
  raw <- fetchData(url)
  validated <- validate(raw)
  transformed <- transform(validated)
  result <- save(transformed)
  return result.id
}
```

## Tree Shaking

This plugin outputs standard ES modules with `import`/`export` syntax, ensuring full tree-shaking compatibility with modern bundlers.

## Source Maps

Source maps are automatically generated to map transformed code back to original `gen { }` blocks for debugging.

## API

### Direct Usage

You can also use the transformation functions directly:

```typescript
import { transformSource, parseEffBlock, generateEffectGen } from 'babel-plugin-effect-sugar'

// Transform source code
const output = transformSource(inputCode)

// Parse and generate manually
const ast = parseEffBlock('x <- effect()')
const code = generateEffectGen(ast)
```

## License

MIT
