#!/usr/bin/env bash
# Cross-build: build the RC Control Station app on your dev machine and deploy
# the server bundle to a Raspberry Pi (systemd + nginx reverse proxy).
#
# Run:  NITRO_PRESET=node-server bun run build && bun run deploy:pi

set -euo pipefail

PI_HOST="${PI_HOST:-pi@raspberrypi.local}"
PI_APP_DIR="${PI_APP_DIR:-/home/pi/rc-control-app}"
LOCAL_BUILD="${LOCAL_BUILD:-.output}"
APP_PORT="${PORT:-3000}"

echo "Deploying to $PI_HOST ..."

if [ ! -f "$LOCAL_BUILD/server/index.mjs" ]; then
  echo "Error: server build not found at $LOCAL_BUILD/server/index.mjs"
  echo "Build it first with:  NITRO_PRESET=node-server bun run build"
  exit 1
fi

ssh "$PI_HOST" "mkdir -p $PI_APP_DIR/deployment"

# Copy the self-contained Nitro server bundle and the deployment files
rsync -av --delete "$LOCAL_BUILD/" "$PI_HOST:$PI_APP_DIR/.output/"
rsync -av deployment/ "$PI_HOST:$PI_APP_DIR/deployment/"
rsync -av scripts/pi-deploy-local.sh "$PI_HOST:$PI_APP_DIR/scripts/pi-deploy-local.sh" 2>/dev/null || {
  ssh "$PI_HOST" "mkdir -p $PI_APP_DIR/scripts"
  rsync -av scripts/pi-deploy-local.sh "$PI_HOST:$PI_APP_DIR/scripts/pi-deploy-local.sh"
}

# Install/refresh the systemd service and nginx proxy on the Pi
ssh "$PI_HOST" "cd $PI_APP_DIR && PORT=$APP_PORT bash scripts/pi-deploy-local.sh"

echo "Done."
