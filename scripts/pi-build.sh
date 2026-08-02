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

# The app is server-rendered, so a plain static folder is not enough.
# Build a self-hosted Node server bundle (.output/server/index.mjs).
export NITRO_PRESET="${NITRO_PRESET:-node-server}"
log "Build target (NITRO_PRESET): $NITRO_PRESET"

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
  # `npm ci` fails when package-lock.json is out of sync with package.json
  # (common after a git pull that bumps a dependency). Fall back to a normal
  # install, and as a last resort regenerate the lock file from scratch.
  npm ci --include=optional --prefer-offline --no-audit --no-fund \
    || npm install --include=optional --prefer-offline --no-audit --no-fund \
    || { log "Install failed — regenerating package-lock.json from scratch..."
         rm -rf node_modules package-lock.json
         npm install --include=optional --no-audit --no-fund; }
fi

NAPI_ARCH="$( [ "$ARCH" = "x86_64" ] && echo x64 || echo arm64 )"

# npm has a long-standing bug where optional native packages are skipped when
# switching platforms/lock states (https://github.com/npm/cli/issues/4828).
# Rolldown (Vite 8), lightningcss and @tailwindcss/oxide all ship their native
# binary that way, so verify each one and install it explicitly if missing.
ensure_binding() {
  local label="$1" glob="$2" pkg="$3" version_from="$4"
  # shellcheck disable=SC2086
  if ls $glob >/dev/null 2>&1; then
    return 0
  fi
  log "$label native binding missing — installing it explicitly..."
  rm -f node_modules/.package-lock.json
  local version=""
  if [ -n "$version_from" ]; then
    version="$(node -p "try{require('./node_modules/${version_from}/package.json').version}catch(e){''}" 2>/dev/null || true)"
  fi
  if [ -n "$version" ]; then
    npm install --include=optional --no-save --no-audit --no-fund "${pkg}@${version}" || true
  else
    npm install --include=optional --no-save --no-audit --no-fund "$pkg" || true
  fi
  # shellcheck disable=SC2086
  if ! ls $glob >/dev/null 2>&1; then
    log "ERROR: $label native binding still missing ($pkg)."
    log "Make sure you are on 64-bit Raspberry Pi OS with glibc (not musl/Alpine),"
    log "then do a clean install:  rm -rf node_modules package-lock.json && bash scripts/pi-build.sh"
    exit 1
  fi
}

ensure_binding "Rolldown" "node_modules/@rolldown/binding-linux-*/*.node" \
  "@rolldown/binding-linux-${NAPI_ARCH}-gnu" "rolldown"
ensure_binding "lightningcss" "node_modules/lightningcss-linux-*/*.node" \
  "lightningcss-linux-${NAPI_ARCH}-gnu" "lightningcss"
ensure_binding "Tailwind oxide" "node_modules/@tailwindcss/oxide-linux-*/*.node" \
  "@tailwindcss/oxide-linux-${NAPI_ARCH}-gnu" "@tailwindcss/oxide"



log "Building production bundle..."
if [ "$RUNNER" = "bun" ]; then
  bun run build
else
  npm run build
fi

SERVER_ENTRY=""
for candidate in .output/server/index.mjs dist/server/index.mjs; do
  if [ -f "$candidate" ]; then
    SERVER_ENTRY="$candidate"
    break
  fi
done

if [ -z "$SERVER_ENTRY" ]; then
  log "ERROR: the build finished but no server bundle was produced."
  log "Checked: .output/server/index.mjs, dist/server/index.mjs"
  ls -la .output 2>/dev/null || true
  ls -la dist 2>/dev/null || true
  exit 1
fi

log "Build complete. Server bundle: $SERVER_ENTRY"

# Deploy the finished build locally unless disabled with DEPLOY=false
DEPLOY="${DEPLOY:-true}"
if [ "$DEPLOY" = "true" ]; then
  log "Deploying build..."
  SERVER_ENTRY="$SERVER_ENTRY" bash scripts/pi-deploy-local.sh
else
  log "DEPLOY=false — skipping deploy."
  log "Run 'npm run pi:serve' or 'bash scripts/pi-deploy-local.sh' to start the app."
fi
