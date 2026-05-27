#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"

# Generate update.json for local release (no Gitee upload)
VERSION=$(node -p "require('./package.json').version")
GITEE_REPO="hanliuliu110/csp-pet"

echo "=== Building CSP Desktop Pet v${VERSION} ==="
npx tauri build "$@"

# Sign packages with updater key
SIGN_KEY="$HOME/.tauri/csp-updater.seckey"
if [ -f "$SIGN_KEY" ]; then
  echo "=== Signing packages ==="
  for bundle in src-tauri/target/*/release/bundle/dmg/*.dmg src-tauri/target/*/release/bundle/msi/*.msi; do
    [ -f "$bundle" ] || continue
    echo "Signing: $bundle"
    npx tauri signer sign --private-key "$SIGN_KEY" --password "" "$bundle" 2>/dev/null || echo "  (skip signing for this file)"
  done
else
  echo "WARNING: No signing key at $SIGN_KEY — packages will not be signed"
fi

echo ""
echo "=== Done ==="
echo "To release, push a tag:  git tag v${VERSION} && git push --tags"
echo "Update endpoint: https://gitee.com/${GITEE_REPO}/raw/main/update.json"
