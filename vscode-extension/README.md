# Effect Sugar VSCode Extension

Provides syntax highlighting and TypeScript error suppression for Effect-TS `gen` blocks.

## Features

- **Syntax highlighting** for `gen { }` blocks and `<-` operator
- **TypeScript error suppression** inside gen blocks (via TS plugin)
- **Code actions** explaining suppressed errors

## Installation

### Development Installation

1. Install dependencies:
   ```bash
   cd packages/effect-sugar/vscode-extension
   npm install
   ```

2. Compile the extension:
   ```bash
   npm run compile
   ```

3. Open VSCode and press `F5` to launch the Extension Development Host

### TypeScript Plugin Setup

To enable error suppression, add the TypeScript plugin to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "effect-sugar-ts-plugin" }
    ]
  }
}
```

Then tell VSCode to use the workspace TypeScript version:
1. Open Command Palette (`Cmd+Shift+P`)
2. Run "TypeScript: Select TypeScript Version"
3. Choose "Use Workspace Version"

## Usage

Files with `.gen.ts` extension will automatically use the Effect Sugar language mode.

For regular `.ts` files, the syntax injection grammar will highlight `gen` blocks.

### Example

```typescript
// This will be highlighted and errors suppressed
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  return { user, profile }
}
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `effectSugar.suppressDiagnostics` | `true` | Suppress TypeScript diagnostics inside gen blocks |

## How It Works

1. **TextMate Grammar**: Provides syntax highlighting for `gen`, `<-`, and variable bindings
2. **Injection Grammar**: Highlights gen blocks in regular `.ts/.tsx` files
3. **TypeScript Plugin**: Hooks into the language service to filter diagnostics

## Known Limitations

- Full type inference inside gen blocks requires the build transformation to run
- Hover information shows raw syntax, not inferred types
- Go-to-definition for bound variables doesn't work inside gen blocks

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package extension
npm run package
```

## Roadmap

- [ ] Semantic token provider for better highlighting
- [ ] Hover information showing transformed code
- [ ] Go-to-definition support for bound variables
- [ ] Auto-complete for Effect methods
