# effect-sugar

Syntactic sugar for [Effect-TS](https://effect.website/) with for-comprehension style `gen` blocks.

## Example: Racing Multiple Data Sources

```typescript
import { Effect, Race } from "effect"

// Write this:
const fetchUserProfile = (userId: string) => gen {
  // Race between cache and API
  cached <- Effect.promise(() => cache.get(userId))
  [profile, stats] <- Race.race(
    fetchFromPrimary(userId),
    fetchFromBackup(userId)
  )

  // Validate and enrich
  _ <- validateProfile(profile)
  enriched <- enrichWithStats(profile, stats)

  // Cache the result
  _ <- Effect.promise(() => cache.set(userId, enriched))

  return enriched
}

// Instead of this:
const fetchUserProfile = (userId: string) =>
  Effect.gen(function* () {
    const cached = yield* Effect.promise(() => cache.get(userId))
    const [profile, stats] = yield* Race.race(
      fetchFromPrimary(userId),
      fetchFromBackup(userId)
    )

    yield* validateProfile(profile)
    const enriched = yield* enrichWithStats(profile, stats)
    yield* Effect.promise(() => cache.set(userId, enriched))

    return enriched
  })
```

## Quick Start

### TypeScript Compiler (Recommended)

For projects using standard TypeScript compilation with tsc.

```bash
pnpm add -D effect-sugar-tsc ts-patch
```

## Installation Options

### TypeScript Compiler (tsc via ts-patch)

**1. Create `tsconfig.json`** for IDE support:
```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "effect-sugar-ts-plugin" }
    ]
  }
}
```

**2. Create `tsconfig.build.json`** for compilation:
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

**3. Add build scripts** to `package.json`:
```json
{
  "scripts": {
    "prepare": "ts-patch install -s",
    "build": "tspc --project tsconfig.build.json"
  }
}
```

**4. Install and build:**
```bash
pnpm install
pnpm build
```

**Why separate configs?** The compilation transformer operates during TypeScript's program transformation phase, while the IDE plugin works at the language service level. Using separate configs ensures optimal performance and stability in both contexts.

### Vite Plugin

For Vite projects:

```bash
pnpm add -D effect-sugar-vite esbuild
```

Configure in `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import effectSugar from 'effect-sugar-vite'

export default defineConfig({
  plugins: [effectSugar()]
})
```

Add to `tsconfig.json` for IDE support:
```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "effect-sugar-ts-plugin" }
    ]
  }
}
```

## IDE Support (VSCode Recommended)

### VSCode Extension (Recommended)

For the best developer experience, install the VSCode extension:

1. Download from the [releases page](https://github.com/clayroach/effect-sugar/releases)
2. Install: `code --install-extension effect-sugar-x.x.x.vsix`

The extension provides:
- ✅ Syntax highlighting for gen blocks
- ✅ IntelliSense (hover, go-to-definition, autocomplete)
- ✅ Suppresses TypeScript errors inside gen blocks

### Other Editors (TypeScript Plugin)

For editors other than VSCode (WebStorm, Vim, etc.), add the TypeScript language service plugin:

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

Then restart your editor's TypeScript server.

## ESLint Integration

Transform gen blocks before linting to prevent syntax errors:

```javascript
// eslint.config.mjs
import effectSugarPreprocessor from 'effect-sugar-tsc/eslint'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: effectSugarPreprocessor,
    // ... your other config
  }
]
```

## Prettier Integration

Format gen block code with Prettier using the `effect-sugar-format` CLI tool:

```bash
# Format specific files
npx effect-sugar-format src/**/*.ts

# Format directories
npx effect-sugar-format src/ test/

# Add to package.json scripts
{
  "scripts": {
    "format": "effect-sugar-format src/"
  }
}
```

The CLI tool:
1. Transforms `gen {}` → `Effect.gen()` before formatting
2. Runs Prettier with your project's configuration
3. Transforms back to `gen {}` syntax

**Note:** The formatter requires `prettier` as a peer dependency. Install it with:

```bash
pnpm add -D prettier
```

## Alternative Setups

The recommended setup above works for most projects. For specific build tools or use cases:

- **[esbuild bundling](./docs/setup/esbuild.md)** - For production builds with esbuild, tsup, or unbuild
- **[tsx runtime with hot reload](./docs/setup/tsx-runtime.md)** - For Docker development environments
- **[Vite](./docs/setup/vite.md)** - ⚠️ Deprecated, for existing projects only

See the [setup guides](./docs/setup/) for more options.

## Syntax Reference

| Input | Output | Notes |
|-------|--------|-------|
| `x <- effect` | `const x = yield* effect` | Bind pattern |
| `_ <- effect` | `yield* effect` | Discard pattern (no binding) |
| `let x = expr` | `const x = expr` | Let binding |
| `return expr` | `return expr` | Return value |
| `return _ <- effect` | `return yield* effect` | Early return (required for type narrowing) |

## Example: Racing Multiple Data Sources

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

## Example: Parallel Operations

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
- `packages/esbuild-plugin/` - esbuild plugin (`effect-sugar-esbuild`)
- `packages/vscode-extension/` - VSCode extension with bundled TS plugin
- `packages/vite-plugin/` - ⚠️ Deprecated - Vite plugin (`effect-sugar-vite`)

## License

MIT
