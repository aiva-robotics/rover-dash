#!/usr/bin/env bash
# Kör automatiskt test av WebSocket-styrservern på Raspberry Pi.
#   bash scripts/pi-test-car-server.sh                 # test mot localhost
#   bash scripts/pi-test-car-server.sh --require-stm32 # kräv STM32-telemetri
#   bash scripts/pi-test-car-server.sh --url ws://192.168.1.146:81
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="rc-car-server"

echo "==> Tjänststatus"
if systemctl is-active --quiet "$SERVICE_NAME"; then
  printf "  %-16s OK\n" "$SERVICE_NAME"
else
  printf "  %-16s INAKTIV (sudo journalctl -u %s -n 30)\n" "$SERVICE_NAME" "$SERVICE_NAME"
fi

echo
echo "!! Testet skickar korta generiska RC/digital/buzzer-kommandon."
echo "   Lyft bilen eller koppla bort drivning om utgångarna kan röra hårdvara."
echo

cd "$APP_DIR/deployment"
exec python3 test-car-server.py "$@"
