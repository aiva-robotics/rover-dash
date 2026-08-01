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
GITHUB_TOKEN="${GITHUB_TOKEN:-${GIT_TOKEN:-${PAT:-}}}"
PROJECT_DIR="${PROJECT_DIR:-$HOME/rc-control-app}"
BRANCH="${BRANCH:-main}"

if [ -z "$REPO_URL" ]; then
  echo "Error: REPO_URL is not set."
  echo "Set it to your GitHub repository URL, for example:"
  echo "  export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
  echo ""
  echo "For a private repository, also set a personal access token:"
  echo "  export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx"
  exit 1
fi

log() { echo "[pi-clone-and-setup] $*"; }

# Build an authenticated URL for HTTPS clones/pulls without leaking the token in logs.
AUTH_URL="$REPO_URL"
if [ -n "$GITHUB_TOKEN" ] && [[ "$REPO_URL" == https://github.com/* ]]; then
  AUTH_URL="https://${GITHUB_TOKEN}@github.com/${REPO_URL#https://github.com/}"
fi

safe_url() {
  # Strip any embedded token from a URL before printing it.
  printf '%s\n' "$1" | sed -E 's#https://[^@]+@#https://#'
}

# 1. Clone or update
if [ -d "$PROJECT_DIR/.git" ]; then
  log "Repository already exists at $PROJECT_DIR. Pulling latest changes..."
  cd "$PROJECT_DIR"

  if [ -n "$GITHUB_TOKEN" ] && git remote get-url origin 2>/dev/null | grep -q '^https://github\.com/'; then
    # Use a temporary GIT_ASKPASS helper so the token is not written to .git/config.
    askpass_helper="$(mktemp)"
    printf '#!/bin/sh\nif printf "%%s" "$1" | grep -qi password; then printf "%%s\\n" "%s"; else printf "%%s\\n" "x-access-token"; fi\n' "$GITHUB_TOKEN" > "$askpass_helper"
    chmod +x "$askpass_helper"
    GIT_ASKPASS="$askpass_helper" git pull origin "$(git rev-parse --abbrev-ref HEAD)"
    rm -f "$askpass_helper"
  else
    git pull origin "$(git rev-parse --abbrev-ref HEAD)"
  fi
else
  log "Cloning $(safe_url "$AUTH_URL") into $PROJECT_DIR..."
  git clone "$AUTH_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
  # Remove the token from the stored origin URL so it does not persist on disk.
  git remote set-url origin "$REPO_URL"
  git checkout "$BRANCH" || true
fi

# 2. Run one-time setup
log "Running Pi setup (Node, nginx, swap, etc.)..."
bash scripts/pi-build-setup.sh

# 3. Build the app (pi-build.sh also deploys it: systemd service + nginx proxy)
log "Building the app on the Pi (this may take 10–30 min on a Pi 3)..."
bash scripts/pi-build.sh

log "Done. The app should be available at http://$(hostname -I | awk '{print $1}')"
