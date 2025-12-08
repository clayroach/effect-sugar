#!/bin/bash
set -e

# Publish snapshot versions to local Verdaccio registry
# Usage: pnpm publish:dev

REGISTRY="http://localhost:4873"
SNAPSHOT_TAG="dev"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

echo "📦 Publishing snapshot to $REGISTRY..."

# Get list of packages to publish (excluding private packages)
PACKAGES=(
  "packages/core"
  "packages/tsc-plugin"
  "packages/vite-plugin"
  "packages/esbuild-plugin"
  "packages/vscode-extension/ts-plugin"
)

# Step 1: Update versions with timestamp
echo "🔖 Creating snapshot versions with timestamp: $TIMESTAMP"

for pkg_dir in "${PACKAGES[@]}"; do
  if [ -f "$pkg_dir/package.json" ]; then
    PKG_VERSION=$(node -p "require('./$pkg_dir/package.json').version")
    BASE_VERSION=$(echo "$PKG_VERSION" | sed 's/-.*$//')
    NEW_VERSION="${BASE_VERSION}-dev.${TIMESTAMP}"

    echo "  📝 $pkg_dir: $PKG_VERSION → $NEW_VERSION"

    (cd "$pkg_dir" && npm version --no-git-tag-version "$NEW_VERSION" > /dev/null)
  fi
done

# Step 2: Publish each package to Verdaccio
echo ""
echo "🚀 Publishing packages..."

for pkg_dir in "${PACKAGES[@]}"; do
  if [ -f "$pkg_dir/package.json" ]; then
    PKG_NAME=$(node -p "require('./$pkg_dir/package.json').name")
    PKG_VERSION=$(node -p "require('./$pkg_dir/package.json').version")

    echo "  📤 Publishing $PKG_NAME@$PKG_VERSION"

    (cd "$pkg_dir" && pnpm publish \
      --registry "$REGISTRY" \
      --tag "$SNAPSHOT_TAG" \
      --no-git-checks \
      --access public) || echo "  ⚠️  Failed to publish $PKG_NAME"
  fi
done

# Step 3: Restore original package.json files
echo ""
echo "🔄 Restoring original package versions..."
git checkout -- packages/*/package.json packages/vscode-extension/ts-plugin/package.json

echo ""
echo "✅ Snapshot publish complete!"
echo ""
echo "To install, use:"
echo "  pnpm add effect-sugar-core@dev --registry $REGISTRY"
