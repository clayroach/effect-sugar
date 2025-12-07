---
"effect-sugar-core": patch
"effect-sugar-vite": patch
"effect-sugar-ts-plugin": patch
---

Rename @effect-sugar/core to effect-sugar-core for public npm publishing.

The scoped package name @effect-sugar/core requires an npm organization which adds unnecessary setup. Renaming to effect-sugar-core removes this requirement while maintaining the naming convention.

This is a re-release of the same functionality after the previous @effect-sugar/core@0.3.0 failed to publish due to npm scope permissions.
