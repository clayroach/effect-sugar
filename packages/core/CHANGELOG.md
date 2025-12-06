# @effect-sugar/core

## 0.2.0

### Minor Changes

- a1345a3: Add backend preset for Node.js builds and support destructuring patterns in bind arrows.

  **@effect-sugar/core**: First public release as extracted shared scanner package.

  **effect-sugar-vite**: Add `effectSugarBackend()` preset for Node.js backend builds with automatic entry point discovery, path alias generation, and proper module externalization. Support array and object destructuring in bind arrows (`[a, b] <- expr` and `{ x, y } <- expr`). Fix #25.

  **effect-sugar-ts-plugin**: Updated to use `@effect-sugar/core` scanner. Support destructuring patterns in bind arrows via improved pattern matching.
