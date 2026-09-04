#!/usr/bin/env bash
# Installerar WebSocket-styrservern (STM32 UART bridge) på Raspberry Pi.
# Kör på Pi:n:  bash scripts/pi-car-server-setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_NAME="rc-car-server"

echo "==> Uppdaterar paketförteckning"
sudo apt-get update

echo "==> Installerar byggberoenden och python-paket"
sudo apt-get install -y \
  git \
  python3 python3-pip python3-venv python3-setuptools python3-websockets python3-serial || true

echo "==> Lägger till $RUN_USER i gruppen dialout"
sudo usermod -aG dialout "$RUN_USER" || true

echo "==> Installerar systemd-tjänsten $SERVICE_NAME"
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$RUN_USER|g" \
  "$APP_DIR/deployment/rc-car-server.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sleep 3
sudo systemctl --no-pager --full status "$SERVICE_NAME" || true

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo
  echo "!! Tjänsten startade inte. Senaste loggar:"
  sudo journalctl -u "$SERVICE_NAME" -n 40 --no-pager || true
  echo
  echo "!! Testar att köra servern direkt för tydligt felmeddelande:"
  (cd "$APP_DIR/deployment" && timeout 8 python3 rc-car-server.py || true)
fi


IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

Klart!
  STM32 UART : /dev/serial0 @ 115200 baud
  Kontroll   : WebSocket-kommandon skickas vidare som STM32 CONTROL-paket.

  WebSocket : ws://$IP:81

Sätt WebSocket-adress i appens inställningar till adressen ovan.
Loggar: sudo journalctl -u $SERVICE_NAME -f
EOF
