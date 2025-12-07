---
"effect-sugar-tsc": minor
"effect-sugar-core": minor
---

feat: Add ts-patch transformer for gen {} block compilation

New package `effect-sugar-tsc` enables compiling gen {} blocks with standard `tsc` via ts-patch.

**Setup:**
```bash
pnpm add -D effect-sugar-tsc ts-patch
```

Add to `package.json`:
```json
{
  "scripts": {
    "prepare": "ts-patch install -s"
  }
}
```

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "plugins": [{
      "name": "effect-sugar-tsc",
      "transform": "effect-sugar-tsc/transform",
      "transformProgram": true
    }]
  }
}
```

Then use regular `tsc` to compile.

Also adds `transformSource` function to `effect-sugar-core` for use by the new package.
