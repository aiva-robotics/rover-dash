#!/usr/bin/env bash
# Serve the already-built RC Control Station app on the Raspberry Pi.
set -euo pipefail

log() { echo "[pi-serve] $*"; }

export PORT="${PORT:-3000}"
SERVER_ENTRY="${SERVER_ENTRY:-.output/server/index.mjs}"

if [ ! -f "$SERVER_ENTRY" ]; then
  echo "Error: server build not found at $SERVER_ENTRY"
  echo "Build it first with: bash scripts/pi-build.sh"
  exit 1
fi

log "Starting the app server on port $PORT..."
exec node "$SERVER_ENTRY"
