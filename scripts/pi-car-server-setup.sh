#!/usr/bin/env bash
# Installerar WebSocket-styrservern (styrservo + ESC) på Raspberry Pi.
# Kör på Pi:n:  bash scripts/pi-car-server-setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_NAME="rc-car-server"

echo "==> Installerar pigpio och python-beroenden"
sudo apt-get update
sudo apt-get install -y pigpio python3-pigpio python3-websockets

echo "==> Startar pigpiod"
sudo systemctl enable --now pigpiod
sleep 1

echo "==> Lägger till $RUN_USER i gruppen gpio"
sudo usermod -aG gpio "$RUN_USER" || true

echo "==> Installerar systemd-tjänsten $SERVICE_NAME"
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$RUN_USER|g" \
  "$APP_DIR/deployment/rc-car-server.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sleep 3
sudo systemctl --no-pager --full status "$SERVICE_NAME" || true

IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

Klart!
  Styrservo : GPIO 18 (pin 12)  signal
  ESC       : GPIO 13 (pin 33)  signal
  GND från servo/ESC till Pi GND (t.ex. pin 6). Mata INTE servot från Pi:ns 5V.

  WebSocket : ws://$IP:81

Sätt WebSocket-adress i appens inställningar till adressen ovan.
Loggar: sudo journalctl -u $SERVICE_NAME -f
EOF
