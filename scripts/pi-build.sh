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
unset npm_config_optional || true
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
# binary that way. Strategy: check whether each binding can already be loaded;
# only install the ones that are missing, in ONE npm operation (separate
# `npm install --no-save` calls prune the binding installed by the previous call).
package_version() {
  node -p "try{require('./node_modules/$1/package.json').version}catch(e){''}" 2>/dev/null || true
}

# Rolldown may be nested under vite OR hoisted to the root — check both.
ROLLDOWN_VERSION="$(package_version 'vite/node_modules/rolldown')"
[ -n "$ROLLDOWN_VERSION" ] || ROLLDOWN_VERSION="$(package_version 'rolldown')"
LIGHTNING_VERSION="$(package_version '@tailwindcss/node/node_modules/lightningcss')"
[ -n "$LIGHTNING_VERSION" ] || LIGHTNING_VERSION="$(package_version 'lightningcss')"
OXIDE_VERSION="$(package_version '@tailwindcss/oxide')"

binding_loads() { node -e "require('$1')" >/dev/null 2>&1; }

NATIVE_PACKAGES=()
if ! binding_loads "@rolldown/binding-linux-${NAPI_ARCH}-gnu"; then
  [ -n "$ROLLDOWN_VERSION" ] && NATIVE_PACKAGES+=("@rolldown/binding-linux-${NAPI_ARCH}-gnu@${ROLLDOWN_VERSION}")
fi
if ! binding_loads "lightningcss-linux-${NAPI_ARCH}-gnu"; then
  [ -n "$LIGHTNING_VERSION" ] && NATIVE_PACKAGES+=("lightningcss-linux-${NAPI_ARCH}-gnu@${LIGHTNING_VERSION}")
fi
if ! binding_loads "@tailwindcss/oxide-linux-${NAPI_ARCH}-gnu"; then
  [ -n "$OXIDE_VERSION" ] && NATIVE_PACKAGES+=("@tailwindcss/oxide-linux-${NAPI_ARCH}-gnu@${OXIDE_VERSION}")
fi

if [ "${#NATIVE_PACKAGES[@]}" -gt 0 ]; then
  if [ -z "$ROLLDOWN_VERSION" ] || [ -z "$LIGHTNING_VERSION" ] || [ -z "$OXIDE_VERSION" ]; then
    log "ERROR: Could not determine all native dependency versions."
    log "rolldown='$ROLLDOWN_VERSION' lightningcss='$LIGHTNING_VERSION' oxide='$OXIDE_VERSION'"
    exit 1
  fi
  log "Installing missing native bindings: ${NATIVE_PACKAGES[*]}"
  npm install --include=optional --no-save --package-lock=false --no-audit --no-fund "${NATIVE_PACKAGES[@]}"
else
  log "All native bindings already present — skipping."
fi

# Final verification: every required binding must load.
for name in "@rolldown/binding-linux-${NAPI_ARCH}-gnu" "lightningcss-linux-${NAPI_ARCH}-gnu" "@tailwindcss/oxide-linux-${NAPI_ARCH}-gnu"; do
  if ! binding_loads "$name"; then
    log "ERROR: Native binding cannot be loaded: $name"
    log "Do a clean retry: rm -rf node_modules package-lock.json && bash scripts/pi-build.sh"
    exit 1
  fi
done

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
