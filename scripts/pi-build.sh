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

log "Build complete. Output should be in dist/client/"

# Deploy the finished build locally (nginx web root) unless disabled with DEPLOY=false
DEPLOY="${DEPLOY:-true}"
if [ "$DEPLOY" = "true" ]; then
  log "Deploying build..."
  bash scripts/pi-deploy-local.sh
else
  log "DEPLOY=false — skipping deploy."
  log "Run 'npm run pi:serve' or 'scripts/pi-serve.sh' to start the local server."
fi
