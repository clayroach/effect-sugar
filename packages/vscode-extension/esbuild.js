const esbuild = require('esbuild')

const production = process.argv.includes('--production')

esbuild
  .build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    // prettier is loaded dynamically from the workspace
    external: ['vscode', 'prettier'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !production,
    minify: production
  })
  .catch(() => process.exit(1))
