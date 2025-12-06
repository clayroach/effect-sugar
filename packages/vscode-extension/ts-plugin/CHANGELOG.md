# effect-sugar-ts-plugin

## 0.2.2

### Patch Changes

- a1345a3: Add backend preset for Node.js builds and support destructuring patterns in bind arrows.

  **@effect-sugar/core**: First public release as extracted shared scanner package.

  **effect-sugar-vite**: Add `effectSugarBackend()` preset for Node.js backend builds with automatic entry point discovery, path alias generation, and proper module externalization. Support array and object destructuring in bind arrows (`[a, b] <- expr` and `{ x, y } <- expr`). Fix #25.

  **effect-sugar-ts-plugin**: Updated to use `@effect-sugar/core` scanner. Support destructuring patterns in bind arrows via improved pattern matching.

- Updated dependencies [a1345a3]
  - @effect-sugar/core@0.2.0

## 0.2.1

### Patch Changes

- a981a54: fix build of 0.2.0 release
- 25d0eb7: fixing release process

## 0.2.0

### Minor Changes

- ### TypeScript Language Service Plugin 0.2.0
  - **Sync with @effect/language-service**: Adopted improvements from the official Effect language service implementation
  - **Better position mapping**: Fixed go-to-definition offset issues with source map-based position mapping
  - **Semantic classification**: Disabled semantic highlighting for gen blocks to prevent incorrect colorization
  - **Stricter TypeScript**: Added stricter ESLint and TypeScript configuration
  - **Bounds checking**: Added validation to prevent invalid position errors
