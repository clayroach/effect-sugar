# Effect Sugar VSCode Extension

Syntax highlighting and TypeScript error suppression for Effect-TS `gen` blocks.

## Features

- Syntax highlighting for `gen { }` blocks and `<-` operator
- TypeScript error suppression inside gen blocks
- Works with `.ts`, `.tsx`, and `.gen.ts` files

## Installation

Build and install locally:

```bash
cd packages/vscode-extension
pnpm build && pnpm package
code --install-extension ../../target/effect-sugar-0.1.0.vsix
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `effectSugar.suppressDiagnostics` | `true` | Suppress TypeScript diagnostics inside gen blocks |

## Example

```typescript
const program = gen {
  user <- getUser(id)
  profile <- getProfile(user.id)
  return { user, profile }
}
```

## Development

```bash
pnpm install
pnpm build           # Compile extension
pnpm package         # Create .vsix
```

Press `F5` in VSCode to launch Extension Development Host.

## Known Limitations

- Full type inference requires the build transformation (Vite plugin or tsx loader)
- Go-to-definition doesn't work for bound variables inside gen blocks

## License

MIT
