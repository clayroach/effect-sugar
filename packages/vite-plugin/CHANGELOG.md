# effect-sugar-vite

## 0.3.4

### Patch Changes

- Updated dependencies [64a8a8d]
- Updated dependencies [64a8a8d]
- Updated dependencies [30c270a]
  - effect-sugar-core@0.4.0

## 0.3.3

### Patch Changes

- ca8dd58: Fix CommonJS require exports in effect-sugar-core package.json.

  TypeScript plugins and other CommonJS consumers need the require entry point
  in the exports field to properly load the module. This fix adds require entries
  for both the main and scanner exports, enabling the package to be used by both
  ES modules and CommonJS consumers.

- Updated dependencies [ca8dd58]
  - effect-sugar-core@0.3.2

## 0.3.2

### Patch Changes

- 7846ccb: Rename @effect-sugar/core to effect-sugar-core for public npm publishing.

  The scoped package name @effect-sugar/core requires an npm organization which adds unnecessary setup. Renaming to effect-sugar-core removes this requirement while maintaining the naming convention.

  This is a re-release of the same functionality after the previous @effect-sugar/core@0.3.0 failed to publish due to npm scope permissions.

- Updated dependencies [7846ccb]
  - effect-sugar-core@0.3.1

## 0.3.1

### Patch Changes

- 367a826: Publish @effect-sugar/core as public npm package.

  Previously @effect-sugar/core was marked as private and only used internally within the workspace. It's now published to npm as a public package so that consumers of effect-sugar-vite and effect-sugar-ts-plugin can properly resolve its dependencies.

  - Remove "private" flag from @effect-sugar/core package.json
  - Bump @effect-sugar/core to 0.2.0
  - Update vite-plugin and ts-plugin as dependent patches (no code changes, just version bump for proper npm resolution)

- Updated dependencies [367a826]
  - @effect-sugar/core@0.3.0

## 0.3.0

### Minor Changes

- a1345a3: Add backend preset for Node.js builds and support destructuring patterns in bind arrows.

  **@effect-sugar/core**: First public release as extracted shared scanner package.

  **effect-sugar-vite**: Add `effectSugarBackend()` preset for Node.js backend builds with automatic entry point discovery, path alias generation, and proper module externalization. Support array and object destructuring in bind arrows (`[a, b] <- expr` and `{ x, y } <- expr`). Fix #25.

  **effect-sugar-ts-plugin**: Updated to use `@effect-sugar/core` scanner. Support destructuring patterns in bind arrows via improved pattern matching.

### Patch Changes

- Updated dependencies [a1345a3]
  - @effect-sugar/core@0.2.0

## 0.2.0

### Minor Changes

- 34d1be3: vite plugin working with atrim2
