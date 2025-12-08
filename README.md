# effect-sugar

Syntactic sugar for [Effect-TS](https://effect.website/) with for-comprehension style `gen` blocks.

```typescript
// Write this:
import { Effect, fail } from "effect"

const buildReport = (customerId: string) => gen {
  customer <- getCustomer(customerId)

  if (!customer) {
    return _ <- fail(new NotFoundError("Customer"))
  }

  { orders, invoices } <- fetchCustomerData(customer.id)
  _ <- validateDataIntegrity(orders, invoices)
  let total = orders.reduce((sum, o) => sum + o.amount, 0)
  formatted <- formatCurrency(total, customer.locale)

  return { customer, orders, total: formatted }
}

// Instead of this:
import { Effect } from "effect"

const buildReport = (customerId: string) =>
  Effect.gen(function* () {
    const customer = yield* getCustomer(customerId)

    if (!customer) {
      return yield* Effect.fail(new NotFoundError("Customer"))
    }

    const { orders, invoices } = yield* fetchCustomerData(customer.id)
    yield* validateDataIntegrity(orders, invoices)
    const total = orders.reduce((sum, o) => sum + o.amount, 0)
    const formatted = yield* formatCurrency(total, customer.locale)

    return { customer, orders, total: formatted }
  })
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

### IDE Support

#### Option 1: TypeScript Plugin Only (Any Editor)

The TypeScript language service plugin provides IntelliSense features (hover, go-to-definition, auto-complete) for gen blocks in **any editor** that uses the TypeScript language server (VSCode, WebStorm, Vim, etc.).

Add the language service plugin to your `tsconfig.json` alongside the tsc transformer:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "effect-sugar-tsc",
        "transform": "effect-sugar-tsc/transform",
        "transformProgram": true
      },
      { "name": "effect-sugar-vscode/ts-plugin" }
    ]
  }
}
```

Then restart your editor's TypeScript server (in VSCode: Cmd+Shift+P → "TypeScript: Restart TS Server").

#### Option 2: VSCode Extension (Full Experience)

For VSCode users, the extension adds syntax highlighting and suppresses TypeScript errors inside gen blocks.

Install from the [releases page](https://github.com/clayroach/effect-sugar/releases) or build locally:

```bash
cd packages/vscode-extension
pnpm build && pnpm package
code --install-extension ../../target/effect-sugar-0.1.0.vsix
```

The VSCode extension bundles the TypeScript language service plugin, so you don't need to add the second plugin entry to `tsconfig.json`.

## Syntax Reference

| Input | Output | Notes |
|-------|--------|-------|
| `x <- effect` | `const x = yield* effect` | Bind pattern |
| `_ <- effect` | `yield* effect` | Discard pattern (no binding) |
| `let x = expr` | `const x = expr` | Let binding |
| `return expr` | `return expr` | Return value |
| `return _ <- effect` | `return yield* effect` | Early return (required for type narrowing) |

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

## Advanced Examples

### Racing Multiple Data Sources

Fetch data from multiple sources simultaneously and use the first to respond:

```typescript
// Instead of this:
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

// Write this:
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

### Parallel Operations with Effect.all

Execute multiple independent operations concurrently:

```typescript
// Instead of this:
import { Effect } from "effect"

const fetchDashboard = (userId: string) =>
  Effect.gen(function* () {
    const user = yield* getUser(userId)

    if (!user.isActive) {
      return yield* Effect.fail(new InactiveUserError())
    }

    const [profile, stats, notifications] = yield* Effect.all([
      Effect.gen(function* () {
        const p = yield* fetchProfile(user.id)
        const enriched = yield* enrichProfile(p)
        return enriched
      }),
      Effect.gen(function* () {
        const s = yield* fetchStats(user.id)
        yield* cacheStats(s)
        return s
      }),
      Effect.gen(function* () {
        const events = yield* fetchNotifications(user.id)
        const unread = events.filter(x => !x.read)
        return unread
      })
    ])

    return { user, profile, stats, notifications }
  })

// Write this:
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

### Nested Gen Blocks for Scoped Operations

Use nested gen blocks to create logical scopes for complex operations:

```typescript
// Instead of this:
import { Effect } from "effect"

const buildUserReport = (userId: string) =>
  Effect.gen(function* () {
    const user = yield* getUser(userId)

    if (!user) {
      return yield* Effect.fail(new NotFoundError("User"))
    }

    const summary = yield* Effect.gen(function* () {
      const { orders, total } = yield* fetchOrders(user.id)
      const formatted = yield* formatCurrency(total)
      yield* cacheOrderSummary(user.id, formatted)
      return { count: orders.length, total: formatted }
    })

    const activity = yield* Effect.gen(function* () {
      const events = yield* getRecentActivity(user.id)
      const filtered = events.filter(e => e.type === 'purchase')
      return filtered.slice(0, 10)
    })

    return { user, summary, activity }
  })

// Write this:
import { Effect, fail } from "effect"

const buildUserReport = (userId: string) => gen {
  user <- getUser(userId)

  if (!user) {
    return _ <- fail(new NotFoundError("User"))
  }

  summary <- gen {
    { orders, total } <- fetchOrders(user.id)
    formatted <- formatCurrency(total)
    _ <- cacheOrderSummary(user.id, formatted)
    return { count: orders.length, total: formatted }
  }

  activity <- gen {
    events <- getRecentActivity(user.id)
    let filtered = events.filter(e => e.type === 'purchase')
    return filtered.slice(0, 10)
  }

  return { user, summary, activity }
}
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
