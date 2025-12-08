# Setup Guides

This directory contains setup guides for specific build tools and use cases. For most projects, we recommend the [main setup guide](../../README.md#quick-start) using tsc + VSCode + ESLint.

## Available Guides

### Build Tools

- **[esbuild Plugin](./esbuild.md)** - Bundle applications with esbuild, tsup, or unbuild
- **[tsx Runtime](./tsx-runtime.md)** - Hot reloading with tsx and Node.js loaders (useful for Docker)
- **[Vite Plugin](./vite.md)** - ⚠️ Deprecated - For existing Vite projects only

## Which Guide Should I Use?

### For Most Projects

Follow the [main README](../../README.md#quick-start):
- TypeScript compiler (tsc) with ts-patch
- VSCode extension for IDE support
- ESLint integration
- Prettier (coming soon)

This is the **recommended approach** because:
- ✅ Works with any tool that uses TypeScript
- ✅ Best IDE experience
- ✅ Standard TypeScript compilation
- ✅ Most maintainable

### For Specific Needs

**Use [esbuild](./esbuild.md) if**:
- Building production bundles
- Using esbuild-based tools (tsup, unbuild)
- Need fast bundling

**Use [tsx runtime](./tsx-runtime.md) if**:
- Running TypeScript with tsx in development
- Need hot reloading in Docker
- Cannot use tsc build step

**Use [Vite](./vite.md) if**:
- Maintaining an existing project with effect-sugar-vite
- *Not recommended for new projects*

## Can I Use Multiple?

Yes! You can combine approaches:

- **Development**: tsc with ts-patch for IDE support
- **Production**: esbuild plugin for bundling
- **Docker dev**: tsx runtime with hot reload

Example:

```json
{
  "scripts": {
    "dev": "tsc --watch",
    "dev:docker": "node --import tsx/esm --import effect-sugar-esbuild/register --watch src/index.ts",
    "build": "node build.ts"
  }
}
```

Where `build.ts` uses the esbuild plugin for optimized production bundles.

## Need Help?

- Check the [main README](../../README.md) for the recommended setup
- Review the specific guide for your build tool
- [Open an issue](https://github.com/clayroach/effect-sugar/issues) if you're stuck

## Contributing

Have a setup guide for another build tool? PRs welcome!
