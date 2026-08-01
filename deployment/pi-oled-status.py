#!/usr/bin/env python3
"""Visar Raspberry Pi:ns IP-adress på en liten I2C-OLED (0.91", SSD1306 128x32).

Koppling:
  VCC -> 3.3 V (pin 1)
  GND -> GND   (pin 6)
  SDA -> GPIO 2 (pin 3)
  SCL -> GPIO 3 (pin 5)

Rad 1: hostname
Rad 2: aktiv IP (wlan0, fallback eth0)
Rad 3: tjänststatus WEB / CAM / WS
"""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("pi-oled")

ADDRESS = int(os.environ.get("OLED_ADDRESS", "0x3C"), 16)
WIDTH = int(os.environ.get("OLED_WIDTH", "128"))
HEIGHT = int(os.environ.get("OLED_HEIGHT", "32"))
I2C_PORT = int(os.environ.get("OLED_I2C_PORT", "1"))
INTERVAL = float(os.environ.get("OLED_INTERVAL", "5"))
ROTATE = int(os.environ.get("OLED_ROTATE", "0"))

WEB_PORT = int(os.environ.get("OLED_WEB_PORT", "80"))
CAM_PORT = int(os.environ.get("OLED_CAM_PORT", "8080"))
WS_PORT = int(os.environ.get("OLED_WS_PORT", "81"))

PREFERRED_IFACES = ("wlan0", "eth0")


def iface_ip(iface: str) -> str | None:
    try:
        out = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", "dev", iface],
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout
        for part in out.split():
            if "/" in part and part.count(".") == 3:
                return part.split("/")[0]
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def current_ip() -> str | None:
    for iface in PREFERRED_IFACES:
        ip = iface_ip(iface)
        if ip:
            return ip
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=2).stdout
        first = out.split()
        if first:
            return first[0]
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def build_device():
    try:
        from luma.core.interface.serial import i2c
        from luma.oled.device import ssd1306
    except ImportError as exc:
        log.error(
            "luma.oled saknas. Installera: sudo apt-get install -y python3-luma.oled  (%s)", exc
        )
        sys.exit(1)
    try:
        serial = i2c(port=I2C_PORT, address=ADDRESS)
        return ssd1306(serial, width=WIDTH, height=HEIGHT, rotate=ROTATE)
    except Exception as exc:
        log.error(
            "Hittar ingen OLED på I2C-%s adress 0x%02X: %s\n"
            "Kontrollera kopplingen och kör: i2cdetect -y %s",
            I2C_PORT,
            ADDRESS,
            exc,
            I2C_PORT,
        )
        sys.exit(1)


def main() -> None:
    from luma.core.render import canvas
    from PIL import ImageFont

    device = build_device()
    try:
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 9)
        big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
    except OSError:
        small = ImageFont.load_default()
        big = ImageFont.load_default()

    host = socket.gethostname()
    log.info("OLED igång på I2C-%s adress 0x%02X", I2C_PORT, ADDRESS)

    try:
        while True:
            ip = current_ip()
            web = "W+" if port_open(WEB_PORT) else "W-"
            cam = "C+" if port_open(CAM_PORT) else "C-"
            ws = "S+" if port_open(WS_PORT) else "S-"
            with canvas(device) as draw:
                draw.text((0, -1), host[:22], font=small, fill=255)
                draw.text((0, 9), ip or "Ingen IP", font=big, fill=255)
                draw.text((0, 23), f"{web} {cam} {ws}", font=small, fill=255)
            time.sleep(INTERVAL)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            device.clear()
        except Exception:
            pass
        log.info("OLED avstängd")


if __name__ == "__main__":
    main()
