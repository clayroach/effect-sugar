---
"effect-sugar-vite": minor
---

### Language Service Improvements

- **Sync with @effect/language-service**: Adopted improvements from the official Effect language service implementation
- **Better position mapping**: Fixed go-to-definition offset issues with source map-based position mapping
- **Semantic classification**: Disabled semantic highlighting for gen blocks to prevent incorrect colorization
- **Stricter TypeScript**: Added stricter ESLint and TypeScript configuration (no-explicit-any, noUncheckedIndexedAccess)
- **Bounds checking**: Added validation to prevent invalid position errors in the language service plugin
