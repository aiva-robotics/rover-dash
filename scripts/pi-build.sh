#!/usr/bin/env bash
# Build the RC Control Station app directly on a Raspberry Pi.
# Run this inside the project directory on the Pi.
set -euo pipefail

log() { echo "[pi-build] $*"; }

# Use Node by default on the Pi; bun can OOM more easily on 1 GB devices.
RUNNER="${RUNNER:-node}"
log "Using runner: $RUNNER"

# Limit Node's heap to avoid OOM during the Vite/TanStack build.
# With 2 GB of swap this is safe on a Pi 3 with 1 GB RAM.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

# The app is server-rendered, so a plain static folder is not enough.
# Build a self-hosted Node server bundle (.output/server/index.mjs).
export NITRO_PRESET="${NITRO_PRESET:-node-server}"
log "Build target (NITRO_PRESET): $NITRO_PRESET"

# IMPORTANT: optional dependencies MUST be installed.
# Vite 8 uses Rolldown, whose native binary (@rolldown/binding-linux-arm64-gnu)
# ships as an OPTIONAL dependency. Skipping optional deps causes:
#   Cannot find module './rolldown-binding.linux-arm64-gnu.node'
export npm_config_optional="true"
unset npm_config_omit || true

# The Rolldown/Node binaries require a 64-bit OS. Raspberry Pi OS 32-bit (armv7l)
# will not work — check early and fail with a clear message.
ARCH="$(uname -m)"
log "Architecture: $ARCH"
case "$ARCH" in
  aarch64|arm64|x86_64) ;;
  *)
    log "ERROR: $ARCH is a 32-bit userland. Vite 8 (Rolldown) has no prebuilt binary for it."
    log "Install the 64-bit Raspberry Pi OS, or use the cross-build workflow (scripts/deploy-to-pi.sh)."
    exit 1
    ;;
esac

log "Installing dependencies (this may take several minutes on a Pi)..."
if [ "$RUNNER" = "bun" ]; then
  bun install
else
  npm ci --include=optional --prefer-offline --no-audit --no-fund \
    || npm install --include=optional --prefer-offline --no-audit --no-fund
fi

# Verify the Rolldown native binding is actually present before building.
if ! ls node_modules/@rolldown/binding-linux-*/*.node >/dev/null 2>&1; then
  log "Rolldown native binding missing — reinstalling it explicitly..."
  rm -rf node_modules/.package-lock.json
  npm install --include=optional --no-audit --no-fund "@rolldown/binding-linux-$( [ "$ARCH" = "x86_64" ] && echo x64 || echo arm64 )-gnu" || true
fi

if ! ls node_modules/@rolldown/binding-linux-*/*.node >/dev/null 2>&1; then
  log "ERROR: Rolldown native binding still missing."
  log "Try a clean install:  rm -rf node_modules package-lock.json && bash scripts/pi-build.sh"
  exit 1
fi

log "Building production bundle..."
if [ "$RUNNER" = "bun" ]; then
  bun run build
else
  npm run build
fi

SERVER_ENTRY=""
for candidate in .output/server/index.mjs dist/server/index.mjs; do
  if [ -f "$candidate" ]; then
    SERVER_ENTRY="$candidate"
    break
  fi
done

if [ -z "$SERVER_ENTRY" ]; then
  log "ERROR: the build finished but no server bundle was produced."
  log "Checked: .output/server/index.mjs, dist/server/index.mjs"
  ls -la .output 2>/dev/null || true
  ls -la dist 2>/dev/null || true
  exit 1
fi

log "Build complete. Server bundle: $SERVER_ENTRY"

# Deploy the finished build locally unless disabled with DEPLOY=false
DEPLOY="${DEPLOY:-true}"
if [ "$DEPLOY" = "true" ]; then
  log "Deploying build..."
  SERVER_ENTRY="$SERVER_ENTRY" bash scripts/pi-deploy-local.sh
else
  log "DEPLOY=false — skipping deploy."
  log "Run 'npm run pi:serve' or 'bash scripts/pi-deploy-local.sh' to start the app."
fi
