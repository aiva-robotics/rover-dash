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

# Speed up installs by skipping optional deps that are not needed for a static build
export npm_config_optional="false"

log "Installing dependencies (this may take several minutes on a Pi)..."
if [ "$RUNNER" = "bun" ]; then
  bun install
else
  npm ci --prefer-offline --no-audit --no-fund || npm install --prefer-offline --no-audit --no-fund
fi

log "Building production bundle..."
if [ "$RUNNER" = "bun" ]; then
  bun run build
else
  npm run build
fi

log "Build complete. Output should be in dist/client/"
log "Run 'npm run pi:serve' or 'scripts/pi-serve.sh' to start the local server."
