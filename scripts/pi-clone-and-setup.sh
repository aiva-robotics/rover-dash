#!/usr/bin/env bash
# Clone the RC Control Station repo from GitHub and prepare the Raspberry Pi.
# Run this directly on the Pi. It installs dependencies, builds the app,
# and optionally enables nginx + auto-start on boot.
#
# Usage:
#   export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
#   bash scripts/pi-clone-and-setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-}"
PROJECT_DIR="${PROJECT_DIR:-$HOME/rc-control-app}"
BRANCH="${BRANCH:-main}"

if [ -z "$REPO_URL" ]; then
  echo "Error: REPO_URL is not set."
  echo "Set it to your GitHub repository URL, for example:"
  echo "  export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
  exit 1
fi

log() { echo "[pi-clone-and-setup] $*"; }

# 1. Clone or update
if [ -d "$PROJECT_DIR/.git" ]; then
  log "Repository already exists at $PROJECT_DIR. Pulling latest changes..."
  cd "$PROJECT_DIR"
  git pull origin "$(git rev-parse --abbrev-ref HEAD)"
else
  log "Cloning $REPO_URL into $PROJECT_DIR..."
  git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
  git checkout "$BRANCH" || true
fi

# 2. Run one-time setup
log "Running Pi setup (Node, nginx, swap, etc.)..."
bash scripts/pi-build-setup.sh

# 3. Build the app
log "Building the app on the Pi (this may take 10–30 min on a Pi 3)..."
bash scripts/pi-build.sh

# 4. Install nginx config
log "Installing nginx site config..."
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo cp deployment/nginx-rc-control.conf /etc/nginx/sites-available/rc-control.conf
sudo ln -sf /etc/nginx/sites-available/rc-control.conf /etc/nginx/sites-enabled/rc-control.conf
sudo nginx -t && sudo systemctl reload nginx

# 5. Enable auto-start on boot
log "Enabling rc-control systemd service..."
sudo cp deployment/rc-control.service /etc/systemd/system/rc-control.service
sudo systemctl daemon-reload
sudo systemctl enable rc-control
sudo systemctl start rc-control

log "Done. The app should be available at http://$(hostname -I | awk '{print $1}')"
