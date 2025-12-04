# effect-sugar-ts-plugin

## 0.2.0

### Minor Changes

- ### TypeScript Language Service Plugin 0.2.0
  - **Sync with @effect/language-service**: Adopted improvements from the official Effect language service implementation
  - **Better position mapping**: Fixed go-to-definition offset issues with source map-based position mapping
  - **Semantic classification**: Disabled semantic highlighting for gen blocks to prevent incorrect colorization
  - **Stricter TypeScript**: Added stricter ESLint and TypeScript configuration
  - **Bounds checking**: Added validation to prevent invalid position errors
