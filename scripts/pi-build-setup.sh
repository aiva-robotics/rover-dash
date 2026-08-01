#!/usr/bin/env bash
# One-time setup script to prepare a Raspberry Pi 3/4/5 for building this app natively.
# Run directly on the Pi with: curl ... | bash or copy it over and run it.
set -euo pipefail

log() { echo "[pi-build-setup] $*"; }

# 1. Install basics
log "Updating package list and installing dependencies..."
sudo apt update
sudo apt install -y curl ca-certificates gnupg git unzip nginx

# 2. Install Node.js LTS (NodeSource)
log "Installing Node.js LTS..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt install -y nodejs
fi

# 3. Install bun (optional, the app scripts default to bun but node works too)
log "Installing bun..."
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  # Make bun available in the current shell
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# 4. Increase swap so the Vite build does not run out of memory on a 1 GB Pi 3
log "Configuring 2 GB swap file..."
if ! grep -q '/swapfile' /etc/fstab; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 5. Create project directory
PROJECT_DIR="${PROJECT_DIR:-$HOME/rc-control-app}"
log "Project directory: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"

# 6. Print versions
log "Node: $(node -v)"
log "npm: $(npm -v)"
command -v bun >/dev/null 2>&1 && log "bun: $(bun -v)"
log "Swap: $(free -h | awk '/Swap:/ {print $2}')"

log "Setup complete."
log "Next steps:"
log "  1. Clone your project source into $PROJECT_DIR (if not already done):"
log "     Public repo:  git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git $PROJECT_DIR"
log "     Private repo: git clone git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git $PROJECT_DIR"
log "     Private repo with token: GITHUB_TOKEN=ghp_xxx bash scripts/pi-clone-and-setup.sh"
log "  2. Run scripts/pi-build.sh inside the project to build"
log "  3. Run scripts/pi-serve.sh (or use nginx) to start the server"
