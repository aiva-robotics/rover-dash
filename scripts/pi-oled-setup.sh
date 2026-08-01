#!/usr/bin/env bash
# Installerar statusskärmen (0.91" I2C OLED, SSD1306 128x32) som visar Pi:ns IP.
# Kör på Pi:n:  bash scripts/pi-oled-setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_NAME="pi-oled"
I2C_ADDR="${OLED_ADDRESS:-0x3C}"

echo "==> Aktiverar I2C"
if command -v raspi-config >/dev/null 2>&1; then
  sudo raspi-config nonint do_i2c 0 || true
else
  echo "raspi-config saknas – aktivera I2C manuellt (dtparam=i2c_arm=on i /boot/firmware/config.txt)"
fi

echo "==> Installerar beroenden"
sudo apt-get update
sudo apt-get install -y i2c-tools python3-luma.oled python3-pil fonts-dejavu-core

echo "==> Lägger till $RUN_USER i gruppen i2c"
sudo usermod -aG i2c "$RUN_USER" || true

echo "==> Söker efter skärmen på I2C-buss 1"
DETECT="$(sudo i2cdetect -y 1 || true)"
echo "$DETECT"
SHORT_ADDR="$(printf '%02x' "$((I2C_ADDR))")"
if echo "$DETECT" | grep -qi " $SHORT_ADDR "; then
  echo "OK: skärm hittad på adress $I2C_ADDR"
else
  cat <<EOF

VARNING: ingen skärm hittades på adress $I2C_ADDR.
Kontrollera:
  VCC -> 3.3V (pin 1)   GND -> GND (pin 6)
  SDA -> GPIO 2 (pin 3) SCL -> GPIO 3 (pin 5)
Vissa moduler använder 0x3D. Kör 'sudo i2cdetect -y 1' och sätt sedan
OLED_ADDRESS i /etc/systemd/system/$SERVICE_NAME.service.
Installationen fortsätter – tjänsten startar om automatiskt när skärmen kopplas in.

EOF
fi

echo "==> Installerar systemd-tjänsten $SERVICE_NAME"
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$RUN_USER|g" \
  "$APP_DIR/deployment/pi-oled.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sleep 2
sudo systemctl --no-pager --full status "$SERVICE_NAME" || true

echo
echo "Klart! Skärmen visar nu: $(hostname) / $(hostname -I | awk '{print $1}')"
echo "Loggar: sudo journalctl -u $SERVICE_NAME -f"
