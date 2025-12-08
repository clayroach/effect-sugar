#!/usr/bin/env node
/**
 * Publish dev versions to local verdaccio registry.
 *
 * This script:
 * 1. Creates temporary snapshot versions
 * 2. Publishes all packages to verdaccio in dependency order
 * 3. Restores original versions
 *
 * Usage: pnpm publish:dev
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const REGISTRY = 'http://localhost:4873'
const PACKAGES = [
  'packages/core',
  'packages/vite-plugin',
  'packages/tsc-plugin',
  'packages/vscode-extension/ts-plugin'
]

const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

function getPackageJson(dir) {
  const path = join(process.cwd(), dir, 'package.json')
  return { path, data: JSON.parse(readFileSync(path, 'utf8')) }
}

function savePackageJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

// Store original versions
const originals = PACKAGES.map(dir => {
  const { path, data } = getPackageJson(dir)
  return { dir, path, original: data.version, data }
})

try {
  // Update to dev versions
  const devVersion = `0.0.0-dev-${timestamp}`
  console.log(`\n📦 Publishing dev version: ${devVersion}\n`)

  for (const pkg of originals) {
    pkg.data.version = devVersion
    // Update workspace dependencies to use the dev version
    if (pkg.data.dependencies) {
      for (const dep of Object.keys(pkg.data.dependencies)) {
        if (pkg.data.dependencies[dep] === 'workspace:*') {
          pkg.data.dependencies[dep] = devVersion
        }
      }
    }
    savePackageJson(pkg.path, pkg.data)
  }

  // Publish each package
  for (const pkg of originals) {
    console.log(`🚀 Publishing ${pkg.data.name}@${devVersion}`)
    try {
      execSync(`pnpm publish --registry ${REGISTRY} --no-git-checks --tag dev`, {
        cwd: join(process.cwd(), pkg.dir),
        stdio: 'inherit'
      })
    } catch (e) {
      console.error(`❌ Failed to publish ${pkg.data.name}`)
    }
  }

  console.log('\n✅ Done!\n')
} finally {
  // Restore original versions
  for (const pkg of originals) {
    pkg.data.version = pkg.original
    // Restore workspace dependencies
    if (pkg.data.dependencies) {
      for (const dep of Object.keys(pkg.data.dependencies)) {
        if (originals.some(p => p.data.name === dep)) {
          pkg.data.dependencies[dep] = 'workspace:*'
        }
      }
    }
    savePackageJson(pkg.path, pkg.data)
  }
}
