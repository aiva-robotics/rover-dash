#!/usr/bin/env bash
# Kör automatiskt test av WebSocket-styrservern på Raspberry Pi.
#   bash scripts/pi-test-car-server.sh                 # test mot localhost
#   bash scripts/pi-test-car-server.sh --safe          # utan throttle/ESC
#   bash scripts/pi-test-car-server.sh --url ws://192.168.1.146:81
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="rc-car-server"

echo "==> Tjänststatus"
for svc in pigpiod "$SERVICE_NAME"; do
  if systemctl is-active --quiet "$svc"; then
    printf "  %-16s OK\n" "$svc"
  else
    printf "  %-16s INAKTIV (sudo journalctl -u %s -n 30)\n" "$svc" "$svc"
  fi
done

echo
echo "!! Lyft bilen så hjulen går fria innan testet (ESC får korta pådrag)."
echo "   Använd --safe för att hoppa över throttle-testet."
echo

cd "$APP_DIR/deployment"
exec python3 test-car-server.py "$@"
