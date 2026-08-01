#!/usr/bin/env bash
# Deploy an already-built RC Control Station bundle locally on the Raspberry Pi.
# Copies dist/client to the nginx web root, installs the site config and reloads nginx.
set -euo pipefail

log() { echo "[pi-deploy] $*"; }

WEB_ROOT="${PI_WEB_ROOT:-/var/www/rc-control}"
BUILD_DIR="${BUILD_DIR:-dist/client}"

if [ ! -d "$BUILD_DIR" ]; then
  log "ERROR: build output not found at $BUILD_DIR. Run scripts/pi-build.sh first."
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  log "nginx is not installed. Skipping web-root deploy."
  log "Serve the build directly with: bash scripts/pi-serve.sh"
  exit 0
fi

log "Copying $BUILD_DIR -> $WEB_ROOT ..."
sudo mkdir -p "$WEB_ROOT"
if command -v rsync >/dev/null 2>&1; then
  sudo rsync -a --delete "$BUILD_DIR/" "$WEB_ROOT/"
else
  sudo rm -rf "${WEB_ROOT:?}/"*
  sudo cp -r "$BUILD_DIR/." "$WEB_ROOT/"
fi
sudo cp deployment/pi-server.js "$WEB_ROOT/" 2>/dev/null || true

log "Installing nginx site config..."
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo cp deployment/nginx-rc-control.conf /etc/nginx/sites-available/rc-control.conf
sudo ln -sf /etc/nginx/sites-available/rc-control.conf /etc/nginx/sites-enabled/rc-control.conf
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

log "Deployed. App available at http://$(hostname -I | awk '{print $1}')"
