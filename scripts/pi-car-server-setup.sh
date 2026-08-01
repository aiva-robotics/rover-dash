#!/usr/bin/env bash
# Installerar WebSocket-styrservern (styrservo + ESC) på Raspberry Pi.
# Kör på Pi:n:  bash scripts/pi-car-server-setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_NAME="rc-car-server"

PIGPIO_VERSION="v79"

echo "==> Uppdaterar paketförteckning"
sudo apt-get update

echo "==> Installerar byggberoenden och python-paket"
sudo apt-get install -y \
  build-essential git wget unzip \
  python3 python3-pip python3-venv python3-setuptools python3-websockets || true

echo "==> Säkerställer att pigpiod finns"
if command -v pigpiod >/dev/null 2>&1; then
  echo "pigpiod finns redan: $(command -v pigpiod)"
elif apt-cache policy pigpio 2>/dev/null | grep -Eq 'Candidate: [^ ]+' && \
     ! apt-cache policy pigpio 2>/dev/null | grep -q 'Candidate: (none)'; then
  echo "==> Installerar pigpio från apt"
  sudo apt-get install -y pigpio python3-pigpio
else
  echo "==> pigpio finns inte i apt – bygger från källkod ($PIGPIO_VERSION)"
  BUILD_DIR="$(mktemp -d)"
  trap 'rm -rf "$BUILD_DIR"' EXIT

  cd "$BUILD_DIR"
  wget -q "https://github.com/joan2937/pigpio/archive/${PIGPIO_VERSION}.zip" -O pigpio.zip
  unzip -q pigpio.zip
  cd "pigpio-${PIGPIO_VERSION#v}"

  echo "==> Patchar setup.py för Python 3.12+ (distutils borttaget)"
  sed -i 's/from distutils.core import setup/from setuptools import setup/' setup.py

  echo "==> Kompilerar pigpio"
  make -j"$(nproc)"

  echo "==> Installerar pigpio"
  sudo make install

  echo "==> Installerar Python-klienten pigpio via pip"
  sudo pip3 install --break-system-packages pigpio || sudo pip3 install pigpio || true
fi

# Se till att Python-klientbiblioteket finns även om vi byggde från källkod
if ! python3 -c "import pigpio" 2>/dev/null; then
  echo "==> Installerar Python-klienten pigpio"
  sudo pip3 install --break-system-packages pigpio || sudo pip3 install pigpio
fi

echo "==> Säkerställer systemd-tjänsten pigpiod"
if ! systemctl list-unit-files 2>/dev/null | grep -q '^pigpiod\.service'; then
  PIGPIOD_BIN="$(command -v pigpiod || echo /usr/local/bin/pigpiod)"
  sed "s|/usr/local/bin/pigpiod|$PIGPIOD_BIN|" "$APP_DIR/deployment/pigpiod.service" \
    | sudo tee /etc/systemd/system/pigpiod.service >/dev/null
  sudo systemctl daemon-reload
fi

echo "==> Startar pigpiod"
sudo systemctl enable --now pigpiod || true
sleep 2
if ! pgrep -x pigpiod >/dev/null; then
  echo "!! pigpiod kunde inte startas – kör: sudo journalctl -u pigpiod -n 30"
fi


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
