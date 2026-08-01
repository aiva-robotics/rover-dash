#!/usr/bin/env bash
# Deploy the finished RC Control Station build locally on the Raspberry Pi.
# The app is server-rendered, so this installs a systemd service that runs the
# Node server (.output/server/index.mjs) and an nginx reverse proxy on port 80.
set -euo pipefail

log() { echo "[pi-deploy] $*"; }

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

SERVER_ENTRY="${SERVER_ENTRY:-.output/server/index.mjs}"
APP_PORT="${PORT:-3000}"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"

if [ ! -f "$SERVER_ENTRY" ]; then
  log "ERROR: server build not found at $PROJECT_DIR/$SERVER_ENTRY"
  log "Build it first with:  NITRO_PRESET=node-server bash scripts/pi-build.sh"
  [ -d .output ] && { log "Contents of .output/:"; ls -la .output || true; }
  [ -d dist ] && { log "Contents of dist/:"; ls -la dist || true; }
  exit 1
fi

log "Server build found: $SERVER_ENTRY"

# 1. systemd service that runs the app server
log "Installing systemd service (user: $SERVICE_USER, port: $APP_PORT)..."
sudo tee /etc/systemd/system/rc-control.service > /dev/null <<EOF
[Unit]
Description=RC Control Station web app
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment=PORT=$APP_PORT
Environment=NODE_ENV=production
ExecStart=$(command -v node) $PROJECT_DIR/$SERVER_ENTRY
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable rc-control
sudo systemctl restart rc-control

# 2. nginx reverse proxy on port 80 (optional)
if command -v nginx >/dev/null 2>&1; then
  log "Installing nginx reverse proxy config..."
  sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  sudo cp deployment/nginx-rc-control.conf /etc/nginx/sites-available/rc-control.conf
  sudo ln -sf /etc/nginx/sites-available/rc-control.conf /etc/nginx/sites-enabled/rc-control.conf
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx || sudo systemctl restart nginx
  URL="http://$(hostname -I | awk '{print $1}')"
else
  log "nginx not installed — the app is available on port $APP_PORT only."
  URL="http://$(hostname -I | awk '{print $1}'):$APP_PORT"
fi

sleep 2
if systemctl is-active --quiet rc-control; then
  log "Deployed and running. Open $URL"
else
  log "ERROR: the rc-control service failed to start. Logs:"
  sudo journalctl -u rc-control -n 30 --no-pager || true
  exit 1
fi
