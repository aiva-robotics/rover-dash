"""Konfiguration för RC-bilens WebSocket-server på Raspberry Pi.

Alla värden kan överstyras med miljövariabler (se rc-car-server.service).
"""

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# --- Nätverk ---------------------------------------------------------------
HOST = os.environ.get("RC_HOST", "0.0.0.0")
PORT = _int("RC_PORT", 81)

# Dödband kring neutral för legacy throttle-procent.
ESC_DEADBAND = _float("RC_ESC_DEADBAND", 3.0)

# Sekunder med neutrala STM32-kommandon vid start.
ARM_SECONDS = _float("RC_ARM_SECONDS", 2.0)

HORN_SECONDS = _float("RC_HORN_SECONDS", 0.6)

# --- Kamera / stillbilder --------------------------------------------------
SNAPSHOT_URL = os.environ.get("RC_SNAPSHOT_URL", "http://127.0.0.1:8080/snapshot")
PHOTO_DIR = os.environ.get("RC_PHOTO_DIR", "/var/lib/rc-car/photos")

# --- Säkerhet --------------------------------------------------------------
# Om inget kommando tagits emot inom denna tid -> neutral (failsafe)
WATCHDOG_TIMEOUT = _float("RC_WATCHDOG_TIMEOUT", 0.5)
WATCHDOG_INTERVAL = _float("RC_WATCHDOG_INTERVAL", 0.1)
MAX_MESSAGE_BYTES = _int("RC_MAX_MESSAGE_BYTES", 4096)

# Serversidig hastighetsgräns (procent). Klientens maxSpeed går aldrig att
# kringgå eftersom servern klipper här också.
MAX_THROTTLE = _float("RC_MAX_THROTTLE", 100.0)

# Delad hemlighet. Tom sträng = ingen autentisering (rekommenderas ej).
AUTH_TOKEN = os.environ.get("RC_TOKEN", "").strip()

# Endast en klient i taget får styra
SINGLE_CLIENT = _bool("RC_SINGLE_CLIENT", True)
# True = ny klient tar över styrningen, False = ny klient avvisas
TAKEOVER = _bool("RC_TAKEOVER", True)

# --- Telemetri -------------------------------------------------------------
TELEMETRY_HZ = _float("RC_TELEMETRY_HZ", 5.0)
WIFI_INTERFACE = os.environ.get("RC_WIFI_IF", "wlan0")

# Grov km/h-uppskattning: throttle-procent * denna faktor
SPEED_FACTOR = _float("RC_SPEED_FACTOR", 0.32)

# --- STM32 UART bridge -----------------------------------------------------
STM32_UART_PORT = os.environ.get("RC_STM32_UART_PORT", "/dev/serial0")
STM32_UART_BAUD = _int("RC_STM32_UART_BAUD", 115200)
STM32_WRITE_TIMEOUT = _float("RC_STM32_WRITE_TIMEOUT", 0.2)
STM32_HEARTBEAT_INTERVAL = _float("RC_STM32_HEARTBEAT_INTERVAL", 1.0)

# Legacy webapp mapping: steering/throttle become generic STM32 RC outputs.
STM32_STEERING_RC_OUTPUT = _int("RC_STM32_STEERING_RC_OUTPUT", 0)
STM32_THROTTLE_RC_OUTPUT = _int("RC_STM32_THROTTLE_RC_OUTPUT", 1)
STM32_LIGHTS_OUTPUT_BIT = _int("RC_STM32_LIGHTS_OUTPUT_BIT", 0)
STM32_HORN_BUZZER_HZ = _int("RC_STM32_HORN_BUZZER_HZ", 1200)

# When STM32 sends MSG_RPI_SHUTDOWN, ask Linux to power off. The Raspberry Pi
# gpio-poweroff overlay should drive GPIO26 high during poweroff so STM32 knows
# it is safe to disable REG_5V_EN.
SHUTDOWN_ON_STM32_REQUEST = _bool("RC_SHUTDOWN_ON_STM32_REQUEST", False)
SHUTDOWN_COMMAND = os.environ.get("RC_SHUTDOWN_COMMAND", "/usr/bin/systemctl poweroff")

# Simulera STM32 UART (för test på maskin utan anslutet kort)
SIMULATE = _bool("RC_SIMULATE", False)
