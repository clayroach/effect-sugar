# effect-sugar TypeScript Definitions

This package provides the TypeScript integration strategy for the Effect-TS syntactic sugar.

## Type Checking Strategy

Since `gen { }` blocks use custom syntax that TypeScript doesn't understand, we use a **two-pass compilation** approach:

### Build Pipeline

```
Source (.ts with gen blocks)
    ↓
Transform (gen → Effect.gen)
    ↓
Standard TypeScript (.ts)
    ↓
TypeScript Compiler (type checking)
    ↓
JavaScript Output
```

### Configuration

1. **babel.config.js** - Transforms custom syntax first
2. **tsconfig.json** - Type checks the transformed output

### Development Experience

During development, TypeScript will show errors for the `gen` keyword since it doesn't recognize the syntax. The VSCode extension (coming soon) will provide:

- Syntax highlighting for `gen { }` blocks
- Type inference for `<-` bindings
- Error suppression for the custom syntax
- Go-to-definition support

### Interim Solution

Until the VSCode extension is available, you can use the `// @ts-nocheck` directive or work with `.tsx` files that allow more flexible syntax.

## Alternative: Type-Safe Builder Pattern

If you need full TypeScript type checking without the custom syntax, consider using the builder pattern approach:

```typescript
import { Effect } from 'effect'

// Builder pattern (fully type-safe)
const program = Effect.Do.pipe(
  Effect.bind('user', () => getUser(id)),
  Effect.bind('profile', ({ user }) => getProfile(user.id)),
  Effect.map(({ user, profile }) => ({ user, profile }))
)

// Compared to gen syntax
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  return { user, profile }
}
```

The `gen { }` syntax trades some IDE support for cleaner code. Use it when readability is more important than inline type errors.
