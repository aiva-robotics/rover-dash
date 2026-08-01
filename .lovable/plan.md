## Mål

Raspberry Pi 3 kör hela stacken: webbappen, MJPEG-kameran, WebSocket-servern som styr styrservo + ESC, och nu även en liten I2C-OLED (0.91", SSD1306 128x32) som visar Pi:ns IP-adress så du kan ansluta utan skärm.

## 1. WebSocket-server för RC-styrning (Python)

- `deployment/config.py` — GPIO 18 (styrservo), GPIO 13 (ESC), pulsintervall 1000–2000 µs, neutral 1500 µs, port 81, watchdog-timeout 500 ms.
- `deployment/hardware.py` — `pigpio`-baserad RC-PWM (50 Hz). Mappar `-100..100` till µs, stöder framåt/bakåt på ESC:n, 2 s arm-sekvens i neutral vid start, `fail_safe()` som sätter båda till neutral.
- `deployment/rc-car-server.py` — WebSocket-loop på `0.0.0.0:81`:
  - Tar emot `{ "throttle": n, "steering": n }` och skriver direkt till PWM.
  - Svarar `{ "pong": <timestamp> }` på `{ "ping": ... }` (matchar `useCarSocket`).
  - Hanterar `action`-kommandon (strålkastare, tuta, bild, nödstopp).
  - Skickar telemetri ~5 Hz: `speed`, `heading`, `temperature` (CPU-temp), `rssi` (från `iwconfig`), `recording`, `headlights`. Batteri lämnas tomt (ingen ADC).
  - Watchdog: inga kommandon på 500 ms → neutral + nödstoppsflagga.
  - En klient åt gången (nya anslutningar avvisas eller tar över kontrollerat).
- `deployment/rc-car-server.service` — systemd-unit, startar efter `pigpiod`, `Restart=always`.

## 2. I2C-OLED med IP-adress (nytt)

- `deployment/pi-oled-status.py` — Python-tjänst för SSD1306 128x32 på I2C (adress 0x3C, GPIO 2/3) via `luma.oled`:
  - Rad 1: hostname
  - Rad 2: aktiv IP (wlan0, fallback eth0) — stor/tydlig text
  - Rad 3: statusindikatorer — webb (port 80), kamera (8080), WS (81) som `WEB ✓ CAM ✓ WS ✓`
  - Uppdaterar var 5:e sekund, visar "Ingen IP" när nätverket är nere, rensar skärmen snyggt vid avstängning.
- `deployment/pi-oled.service` — systemd-unit, startar vid boot, `Restart=always`.
- `scripts/pi-oled-setup.sh` — aktiverar I2C (`raspi-config nonint do_i2c 0`), installerar `python3-luma.oled` + `i2c-tools`, kör `i2cdetect -y 1` som verifiering och visar tydligt fel om skärmen inte hittas, installerar och startar tjänsten.

Kopplingsschema dokumenteras: VCC→3.3 V (pin 1), GND→pin 6, SDA→GPIO 2 (pin 3), SCL→GPIO 3 (pin 5).

## 3. Deploy-script från GitHub

- `scripts/pi-deploy-all.sh` — ett kommando som:
  1. `git pull` i repo-katalogen (stöder privat repo via `GITHUB_TOKEN`),
  2. bygger webbappen (befintlig `pi-build.sh` med swap/minnesinställningar),
  3. installerar/uppdaterar alla systemd-tjänster: webb, kamera, WS-server, OLED,
  4. `systemctl daemon-reload` + `enable --now` på samtliga,
  5. skriver ut hälsokontroll för varje tjänst och den IP som visas på OLED:en.
- Kan köras om säkert (idempotent).

## 4. Tydliga felmeddelanden i appen vid WS-fel

- `src/hooks/useCarSocket.ts`: spara en strukturerad felorsak (kan ej nå servern, anslutning bruten, timeout/watchdog, avvisad av annan klient) plus antal återanslutningsförsök.
- `src/components/car/ConnectionLostOverlay.tsx`: visa orsaken i klartext på svenska med konkret åtgärd ("Kontrollera att `rc-car-server` kör: `sudo systemctl status rc-car-server`"), samt adressen som testades. Behåll Försök igen / Demoläge.
- `src/components/car/TelemetryPanel.tsx`: kort felstatus-chip.

## 5. Defaults och inställningar

- `src/hooks/useSettings.tsx`: `wsUrl` default till `ws://<samma host>:81` (härleds från `window.location.hostname`).
- `src/routes/settings.tsx`: presetknappar för "Pi WebSocket (lokal)" och direktadress med IP.

## 6. Dokumentation

- `docs/raspberry-pi-deployment.md`: nytt avsnitt om OLED (koppling, setup, felsökning `i2cdetect`), WS-serverns GPIO-koppling till servo/ESC, samt enkommandodeploy.
