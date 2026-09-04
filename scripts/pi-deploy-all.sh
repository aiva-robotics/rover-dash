#!/usr/bin/env bash
# Ett kommando som uppdaterar allt på Raspberry Pi:n:
#   git pull -> bygg webbappen -> installera/uppdatera alla systemd-tjänster
#
# Kör på Pi:n:  bash scripts/pi-deploy-all.sh
# Privat repo:  GITHUB_TOKEN=xxx bash scripts/pi-deploy-all.sh
# Hoppa över bygget: SKIP_BUILD=1 bash scripts/pi-deploy-all.sh
set -euo pipefail

log() { echo -e "\n[deploy-all] $*"; }

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

RUN_USER="${SUDO_USER:-$(id -un)}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
SKIP_BUILD="${SKIP_BUILD:-0}"
WITH_CAMERA="${WITH_CAMERA:-1}"
WITH_CAR_SERVER="${WITH_CAR_SERVER:-1}"

# --- 1. Hämta senaste koden ------------------------------------------------
if [ -d .git ]; then
  log "Hämtar senaste koden från GitHub (gren: $BRANCH)"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    ORIGIN="$(git remote get-url origin)"
    CLEAN="${ORIGIN#https://}"; CLEAN="${CLEAN#*@}"
    git -c "credential.helper=" -c "url.https://${GITHUB_TOKEN}@${CLEAN%%/*}/.insteadOf=https://${CLEAN%%/*}/" \
      fetch origin "$BRANCH"
  else
    git fetch origin "$BRANCH"
  fi
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  log "VARNING: ingen git-katalog – hoppar över uppdatering"
fi

# --- 2. Bygg webbappen -----------------------------------------------------
if [ "$SKIP_BUILD" = "1" ]; then
  log "SKIP_BUILD=1 – hoppar över bygget"
else
  log "Bygger webbappen (kan ta 10-20 min på en Pi 3)"
  NITRO_PRESET=node-server bash scripts/pi-build.sh
fi

# --- 3. Webbtjänst + nginx -------------------------------------------------
log "Installerar webbtjänst och nginx"
sudo bash scripts/pi-deploy-local.sh

install_service() {
  local name="$1" template="$2"
  log "Installerar tjänsten $name"
  sed -e "s|__APP_DIR__|$PROJECT_DIR|g" -e "s|__USER__|$RUN_USER|g" \
    "$template" | sudo tee "/etc/systemd/system/$name.service" >/dev/null
  sudo systemctl enable "$name" >/dev/null
}

# --- 4. Kamera / styrserver ------------------------------------------------
if [ "$WITH_CAMERA" = "1" ]; then
  install_service "pi-camera" "deployment/pi-camera.service"
  install_service "pi-camera-watchdog" "deployment/pi-camera-watchdog.service"
fi
[ "$WITH_CAR_SERVER" = "1" ] && install_service "rc-car-server" "deployment/rc-car-server.service"

sudo systemctl daemon-reload
for svc in pi-camera pi-camera-watchdog rc-car-server; do
  if [ -f "/etc/systemd/system/$svc.service" ]; then
    sudo systemctl restart "$svc" || true
  fi
done

# --- 5. Hälsokontroll ------------------------------------------------------
sleep 3
IP="$(hostname -I | awk '{print $1}')"
echo
echo "================ STATUS ================"
FAILED=0
for svc in rc-control pi-camera pi-camera-watchdog rc-car-server; do
  [ -f "/etc/systemd/system/$svc.service" ] || continue
  if systemctl is-active --quiet "$svc"; then
    printf "  %-16s OK\n" "$svc"
  else
    printf "  %-16s FEL  (sudo journalctl -u %s -n 30)\n" "$svc" "$svc"
    FAILED=1
  fi
done
cat <<EOF
========================================
  Webbapp    : http://$IP
  Kamera     : http://$IP/camera/stream
  WebSocket  : ws://$IP:81
========================================
EOF

exit "$FAILED"
