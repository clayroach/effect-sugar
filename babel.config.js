// Babel configuration for effect-sugar two-pass compilation
// Pipeline: gen blocks → Effect.gen → TypeScript
export default {
  presets: [
    // Preserve TypeScript syntax - let tsc handle type checking
    ['@babel/preset-typescript', { onlyRemoveTypeImports: false }]
  ],
  plugins: [
    // Use local babel-plugin to transform gen { } blocks
    './babel-plugin/dist/index.js'
  ],
  // Generate source maps for debugging back to original gen { } syntax
  sourceMaps: true
}
