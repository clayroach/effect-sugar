# tsx Runtime Setup with Hot Reload

This guide shows how to use effect-sugar with tsx runtime and Node.js loaders for hot reloading in development environments, particularly useful for Docker setups.

## When to Use This

- Running TypeScript with tsx in development
- Need hot reloading with file watching
- Docker containers with mounted volumes
- Cannot use tsc build step

## Installation

```bash
pnpm add -D effect-sugar-esbuild tsx
```

## Configuration

### Basic tsx Runtime

Use Node.js module loaders to transform gen blocks at runtime:

```bash
node --import tsx/esm --import effect-sugar-esbuild/register src/index.ts
```

### With File Watching (Hot Reload)

```bash
node --import tsx/esm --import effect-sugar-esbuild/register --watch src/index.ts
```

## Docker Setup

This is particularly useful for Docker development environments where you want hot reloading without rebuilding the container.

### Dockerfile

```dockerfile
FROM node:20-alpine AS development

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source (or mount via volumes)
COPY src/ ./src/
COPY tsconfig.json ./

# Start with hot reload
CMD ["node", "--import", "tsx/esm", "--import", "effect-sugar-esbuild/register", "--watch", "src/index.ts"]
```

### docker-compose.yaml

Mount source files as volumes for hot reloading:

```yaml
services:
  app:
    build:
      context: .
      target: development
    volumes:
      - ./src:/app/src:ro
      - ./tsconfig.json:/app/tsconfig.json:ro
    ports:
      - '3000:3000'
```

## How It Works

1. **tsx/esm** - Handles TypeScript to JavaScript compilation via esbuild
2. **effect-sugar-esbuild/register** - Node.js loader that transforms `gen {}` blocks before compilation
3. **--watch** - Node.js native file watching (requires Node.js 18+)

The transformation happens at module load time, so changes to source files trigger:
1. File change detected
2. Module reloaded
3. Gen blocks transformed
4. TypeScript compiled
5. Code executed

## Publishing to Local Registry

If using a local npm registry (like Verdaccio) in Docker:

```bash
# In effect-sugar repo
cd packages/esbuild-plugin
pnpm build
pnpm publish --registry http://localhost:4873 --no-git-checks
```

Then in your project:

```bash
pnpm add -D effect-sugar-esbuild@latest --registry http://localhost:4873
```

## Troubleshooting

### "Cannot find package 'effect-sugar-esbuild'"

Make sure the package is installed in your container. If using Docker, ensure `pnpm install` runs after adding the dependency.

### "Expected ';' but found '{'"

The esbuild loader isn't running. Verify both loaders are specified:
```bash
node --import tsx/esm --import effect-sugar-esbuild/register src/index.ts
```

### Hot reload not working

Ensure source files are mounted as volumes in docker-compose.yaml and the `--watch` flag is present.

## Alternative: tsc with nodemon

For a simpler approach that doesn't require runtime transformation, see the [recommended tsc setup](../README.md#quick-start).
