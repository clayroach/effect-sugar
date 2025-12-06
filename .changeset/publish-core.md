---
"@effect-sugar/core": minor
"effect-sugar-vite": patch
"effect-sugar-ts-plugin": patch
---

Publish @effect-sugar/core as public npm package.

Previously @effect-sugar/core was marked as private and only used internally within the workspace. It's now published to npm as a public package so that consumers of effect-sugar-vite and effect-sugar-ts-plugin can properly resolve its dependencies.

- Remove "private" flag from @effect-sugar/core package.json
- Bump @effect-sugar/core to 0.2.0
- Update vite-plugin and ts-plugin as dependent patches (no code changes, just version bump for proper npm resolution)
