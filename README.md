# effect-sugar

Syntactic sugar for [Effect-TS](https://effect.website/) with for-comprehension style `gen` blocks.

```typescript
// Write this:
const fetchUser = (id: string) => gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  return { user, profile }
}

// Instead of:
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const user = yield* getUser(id)
    const profile = yield* getProfile(user.id)
    return { user, profile }
  })
```

## Installation

### 1. Install packages

```bash
pnpm add -D effect-sugar-tsc ts-patch
```

### 2. Configure TypeScript

**tsconfig.json** (for IDE support):

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "effect-sugar-ts-plugin" }
    ]
  }
}
```

**tsconfig.build.json** (for compilation):

```json
{
  "extends": "./tsconfig.json",
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

### 3. Add scripts to package.json

```json
{
  "scripts": {
    "prepare": "ts-patch install -s",
    "build": "tspc --project tsconfig.build.json"
  }
}
```

### 4. Install and build

```bash
pnpm install
pnpm build
```

## VSCode Extension

Install the Effect Sugar VSCode extension for the best experience:

1. Download from [releases](https://github.com/clayroach/effect-sugar/releases)
2. Install: `code --install-extension effect-sugar-x.x.x.vsix`

The extension provides:

- Syntax highlighting for gen blocks
- IntelliSense (hover, go-to-definition, autocomplete)
- **Prettier formatting** that preserves gen block syntax

### Configure as Default Formatter

Add to `.vscode/settings.json`:

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "clayroach.effect-sugar"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "clayroach.effect-sugar"
  }
}
```

The extension uses your workspace's prettier installation and `.prettierrc` config.

## ESLint Integration

Transform gen blocks before linting:

```javascript
// eslint.config.mjs
import effectSugarPreprocessor from 'effect-sugar-tsc/eslint'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: effectSugarPreprocessor,
  }
]
```

## Syntax Reference

| Input | Output | Description |
|-------|--------|-------------|
| `x <- effect` | `const x = yield* effect` | Bind effect result to variable |
| `_ <- effect` | `yield* effect` | Execute effect, discard result |
| `let x = expr` | `const x = expr` | Local variable binding |
| `return expr` | `return expr` | Return value |
| `return _ <- effect` | `return yield* effect` | Early return (for type narrowing) |

## Alternative Setups

- **[Vite Plugin](./docs/setup/vite.md)** - For existing Vite projects
- **[esbuild](./docs/setup/esbuild.md)** - For production bundling
- **[tsx runtime](./docs/setup/tsx-runtime.md)** - For Docker development

## Examples

### Racing Multiple Data Sources

Fetch data from multiple sources simultaneously and use the first to respond:

```typescript
import { Effect, fail, raceAll } from "effect"

const fetchProduct = (productId: string) => gen {
  metadata <- getProductMetadata(productId)

  if (!metadata.isAvailable) {
    return _ <- fail(new UnavailableError())
  }

  data <- raceAll([
    gen {
      cached <- fetchFromCache(productId)
      _ <- validateCache(cached)
      enriched <- enrichProductData(cached)
      return { source: 'cache', data: enriched }
    },
    gen {
      primary <- fetchFromPrimaryDB(productId)
      { details, inventory } <- getProductDetails(primary.id)
      return { source: 'primary', data: { ...primary, details, inventory } }
    },
    gen {
      replica <- fetchFromReplica(productId)
      _ <- logReplicaUsage(productId)
      return { source: 'replica', data: replica }
    }
  ])

  _ <- updateMetrics(data.source)
  formatted <- formatProduct(data.data)

  return { product: formatted, source: data.source, metadata }
}
```

<details>
<summary>View the equivalent Effect.gen code</summary>

```typescript
import { Effect } from "effect"

const fetchProduct = (productId: string) =>
  Effect.gen(function* () {
    const metadata = yield* getProductMetadata(productId)

    if (!metadata.isAvailable) {
      return yield* Effect.fail(new UnavailableError())
    }

    const data = yield* Effect.raceAll([
      Effect.gen(function* () {
        const cached = yield* fetchFromCache(productId)
        yield* validateCache(cached)
        const enriched = yield* enrichProductData(cached)
        return { source: 'cache', data: enriched }
      }),
      Effect.gen(function* () {
        const primary = yield* fetchFromPrimaryDB(productId)
        const { details, inventory } = yield* getProductDetails(primary.id)
        return { source: 'primary', data: { ...primary, details, inventory } }
      }),
      Effect.gen(function* () {
        const replica = yield* fetchFromReplica(productId)
        yield* logReplicaUsage(productId)
        return { source: 'replica', data: replica }
      })
    ])

    yield* updateMetrics(data.source)
    const formatted = yield* formatProduct(data.data)

    return { product: formatted, source: data.source, metadata }
  })
```

</details>

### Parallel Operations

Execute multiple independent operations concurrently with `Effect.all`:

```typescript
import { Effect, fail, all } from "effect"

const fetchDashboard = (userId: string) => gen {
  user <- getUser(userId)

  if (!user.isActive) {
    return _ <- fail(new InactiveUserError())
  }

  [profile, stats, notifications] <- all([
    gen {
      p <- fetchProfile(user.id)
      enriched <- enrichProfile(p)
      return enriched
    },
    gen {
      s <- fetchStats(user.id)
      _ <- cacheStats(s)
      return s
    },
    gen {
      events <- fetchNotifications(user.id)
      let unread = events.filter(x => !x.read)
      return unread
    }
  ])

  return { user, profile, stats, notifications }
}
```

## License

MIT
