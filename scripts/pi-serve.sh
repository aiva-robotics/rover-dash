#!/usr/bin/env bash
# Serve the already-built RC Control Station app on the Raspberry Pi.
set -euo pipefail

log() { echo "[pi-serve] $*"; }

PORT="${PORT:-3000}"
ROOT="${ROOT:-dist/client}"

if [ ! -d "$ROOT" ]; then
  echo "Error: build output not found at $ROOT"
  echo "Run scripts/pi-build.sh first."
  exit 1
fi

# Prefer nginx if installed and configured; otherwise use the Node fallback.
if command -v nginx >/dev/null 2>&1 && [ -f /etc/nginx/sites-enabled/rc-control.conf ]; then
  log "Starting nginx..."
  sudo systemctl start nginx
  log "App should be available at http://$(hostname -I | awk '{print $1}')"
else
  log "Using built-in Node static server on port $PORT..."
  node deployment/pi-server.js
fi
