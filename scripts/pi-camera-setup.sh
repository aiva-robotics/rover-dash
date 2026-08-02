#!/usr/bin/env bash
# Installerar och startar MJPEG-streamingservern för Raspberry Pi-kameran.
# Kör på Pi:n:  bash scripts/pi-camera-setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_NAME="pi-camera"

echo "==> Installerar picamera2 och beroenden"
sudo apt-get update
sudo apt-get install -y python3-picamera2 python3-libcamera libcamera-apps

echo "==> Lägger till $RUN_USER i gruppen video"
sudo usermod -aG video "$RUN_USER" || true

echo "==> Testar att kameran hittas"
if ! libcamera-hello --list-cameras >/dev/null 2>&1; then
  echo "VARNING: ingen kamera hittades. Kontrollera kabeln och att kameran är aktiverad."
  echo "         På Bullseye: lägg till 'start_x=1' / använd raspi-config."
  echo "         På Bookworm: kameran autodetekteras (camera_auto_detect=1 i /boot/firmware/config.txt)."
fi

if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
  echo "==> OBS: $SERVICE_NAME.service finns redan. Anpassade miljövariabler (t.ex. CAM_HFLIP)"
  echo "    kommer att skrivas över. Använd 'sudo systemctl edit --full $SERVICE_NAME'"
  echo "    efteråt om du vill behålla egna värden."
fi

echo "==> Installerar systemd-tjänsten $SERVICE_NAME"
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$RUN_USER|g" \
  "$APP_DIR/deployment/pi-camera.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sleep 2
sudo systemctl --no-pager --full status "$SERVICE_NAME" || true

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Klart! Strömmen finns på:"
echo "  http://$IP:8080/stream"
echo "  (via nginx: http://$IP/camera/stream)"
echo
echo "Sätt Videoadress i appens inställningar till en av adresserna ovan."
