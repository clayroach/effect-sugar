---
"effect-sugar-core": patch
"effect-sugar-vite": patch
"effect-sugar-ts-plugin": patch
---

Fix CommonJS require exports in effect-sugar-core package.json.

TypeScript plugins and other CommonJS consumers need the require entry point
in the exports field to properly load the module. This fix adds require entries
for both the main and scanner exports, enabling the package to be used by both
ES modules and CommonJS consumers.
