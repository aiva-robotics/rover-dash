#!/usr/bin/env python3
"""WebSocket-to-STM32 UART bridge for the RC car on Raspberry Pi.

Protokoll (matchar webbappens useCarSocket):
  in : {"throttle": -100..100, "steering": -100..100}
  in : {"ping": <ms-timestamp>}            -> ut: {"pong": <samma>}
  in : {"action": "estop"|"resume"|"headlights"|"horn"|"photo", "value": ...}
  in : {"rc": [..4 values -1000..1000], "digital": 0..15, "buzzer": 0..65535}
  in : {"action": "oled", "value": {"base64"|"hex"|"framebuffer": <512 bytes>}}
  ut : {"speed":..,"rssi":..,"temperature":..,"heading":..,"headlights":..,
        "recording":..,"estop":..,"armed":..,"stm32": {...}}

Kör:  python3 rc-car-server.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import base64
import hmac
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from urllib.parse import parse_qs, urlparse

import config
from hardware import clamp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("rc-car")

try:
    import websockets
    from websockets.server import serve
    from websockets.exceptions import ConnectionClosed
except ImportError:  # pragma: no cover
    log.error("websockets saknas. Installera: sudo apt-get install -y python3-websockets")
    sys.exit(1)

try:
    import serial  # type: ignore
except ImportError:  # pragma: no cover
    serial = None  # type: ignore[assignment]


MSG_CONTROL = 0x01
MSG_RPI_SHUTDOWN = 0x02
MSG_DISPLAY_DATA = 0x03
MSG_DISPLAY_UPDATE = 0x04
MSG_STATUS = 0x80

MAX_PAYLOAD_SIZE = 64
CONTROL_PAYLOAD_SIZE = 11
STATUS_PAYLOAD_SIZE = 56
DISPLAY_FRAMEBUFFER_SIZE = 512
DISPLAY_CHUNK_DATA_SIZE = 63
DISPLAY_CHUNK_COUNT = 9


def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def cobs_encode(data: bytes) -> bytes:
    encoded = bytearray([0])
    code_index = 0
    code = 1

    for byte in data:
        if byte == 0:
            encoded[code_index] = code
            code_index = len(encoded)
            encoded.append(0)
            code = 1
        else:
            encoded.append(byte)
            code += 1
            if code == 0xFF:
                encoded[code_index] = code
                code_index = len(encoded)
                encoded.append(0)
                code = 1

    encoded[code_index] = code
    return bytes(encoded)


def cobs_decode(data: bytes) -> bytes:
    decoded = bytearray()
    index = 0

    while index < len(data):
        code = data[index]
        index += 1
        if code == 0:
            raise ValueError("zero byte inside COBS frame")

        end = index + code - 1
        if end > len(data):
            raise ValueError("COBS code byte overruns frame")

        decoded.extend(data[index:end])
        index = end
        if code != 0xFF and index < len(data):
            decoded.append(0)

    return bytes(decoded)


def encode_packet(msg_type: int, payload: bytes = b"") -> bytes:
    if len(payload) > MAX_PAYLOAD_SIZE:
        raise ValueError(f"payload too large: {len(payload)} > {MAX_PAYLOAD_SIZE}")

    packet = bytes([msg_type, len(payload)]) + payload
    packet += crc16_ccitt(packet).to_bytes(2, "little")
    return cobs_encode(packet) + b"\x00"


def decode_packet(frame: bytes) -> tuple[int, bytes]:
    decoded = cobs_decode(frame)
    if len(decoded) < 4:
        raise ValueError("decoded packet too short")

    msg_type = decoded[0]
    payload_length = decoded[1]
    if payload_length > MAX_PAYLOAD_SIZE or len(decoded) != payload_length + 4:
        raise ValueError("invalid decoded packet length")

    received_crc = int.from_bytes(decoded[-2:], "little")
    calculated_crc = crc16_ccitt(decoded[:-2])
    if received_crc != calculated_crc:
        raise ValueError(f"CRC mismatch rx=0x{received_crc:04x} calc=0x{calculated_crc:04x}")

    return msg_type, decoded[2:-2]


def parse_status_payload(payload: bytes) -> dict:
    if len(payload) != STATUS_PAYLOAD_SIZE:
        raise ValueError(f"wrong STATUS length: {len(payload)}")

    speed_hz_x100 = int.from_bytes(payload[47:51], "little")
    bus_mv = int.from_bytes(payload[51:53], "little")
    current_ma = int.from_bytes(payload[53:55], "little", signed=True)
    return {
        "stm32": {
            "uptimeMs": int.from_bytes(payload[0:4], "little"),
            "rc": [
                int.from_bytes(payload[4:6], "little", signed=True),
                int.from_bytes(payload[6:8], "little", signed=True),
                int.from_bytes(payload[8:10], "little", signed=True),
                int.from_bytes(payload[10:12], "little", signed=True),
            ],
            "digitalMask": payload[12],
            "buzzerHz": int.from_bytes(payload[14:16], "little"),
            "uartRxFrames": int.from_bytes(payload[16:20], "little"),
            "uartCrcErrors": int.from_bytes(payload[20:24], "little"),
            "failsafeCount": int.from_bytes(payload[24:28], "little"),
            "rpiConnected": bool(int.from_bytes(payload[28:30], "little")),
            "rpiPowerEnabled": bool(payload[30]),
            "rpiPoweroffOk": bool(payload[31]),
            "rpiShutdownRequested": bool(payload[32]),
            "rpiStatus": payload[33],
            "analogRaw": [
                int.from_bytes(payload[34:36], "little"),
                int.from_bytes(payload[36:38], "little"),
                int.from_bytes(payload[38:40], "little"),
                int.from_bytes(payload[40:42], "little"),
            ],
            "ntcRaw": int.from_bytes(payload[42:44], "little"),
            "tmp75C": int.from_bytes(payload[44:46], "little", signed=True) / 100.0,
            "tmp75Valid": bool(payload[46]),
            "speedHz": speed_hz_x100 / 100.0,
            "ina226VoltageV": bus_mv / 1000.0,
            "ina226CurrentA": current_ma / 1000.0,
            "ina226Valid": bool(payload[55]),
        },
        "battery": bus_mv / 1000.0 if bus_mv else None,
        "speed": speed_hz_x100 / 100.0,
        "temperature": int.from_bytes(payload[44:46], "little", signed=True) / 100.0,
        "failsafe": bool(payload[13]),
    }


def percent_to_stm32_command(value: float) -> int:
    return int(round(clamp(value, -100.0, 100.0) * 10.0))


def _int_auto(value, default: int = 0) -> int:
    try:
        if isinstance(value, str):
            return int(value, 0)
        return int(value)
    except (TypeError, ValueError):
        return default


def _decode_bytes_value(value) -> bytes:
    if isinstance(value, list):
        return bytes(int(v) & 0xFF for v in value)
    if isinstance(value, str):
        compact = value.strip().replace(" ", "")
        try:
            return bytes.fromhex(compact)
        except ValueError:
            return base64.b64decode(value)
    if isinstance(value, dict):
        if "framebuffer" in value:
            return _decode_bytes_value(value["framebuffer"])
        if "hex" in value:
            return bytes.fromhex(str(value["hex"]).strip().replace(" ", ""))
        if "base64" in value:
            return base64.b64decode(str(value["base64"]))
    raise ValueError("expected framebuffer as byte list, hex string, or base64 string")


class STM32Bridge:
    """STM32 UART protocol bridge with the same surface as the old RCOutputs."""

    def __init__(self) -> None:
        self.simulated = config.SIMULATE
        self.ser = None
        self.lock = threading.Lock()
        self.armed = False
        self.rc = [0, 0, 0, 0]
        self.digital_mask = 0
        self.buzzer_hz = 0
        self.latest_status: dict = {}
        self.shutdown_requested = False
        self.rx_buffer = bytearray()
        self.last_steering_us = config.STEERING_MID_US
        self.last_esc_us = config.ESC_MID_US

    def connect(self) -> None:
        if self.simulated:
            log.warning("Kör i SIMULERAT STM32-läge – ingen UART öppnas")
            return
        if serial is None:  # pragma: no cover
            raise RuntimeError("pyserial saknas. Installera med: sudo apt-get install -y python3-serial")
        self.ser = serial.Serial(
            config.STM32_UART_PORT,
            config.STM32_UART_BAUD,
            timeout=0,
            write_timeout=config.STM32_WRITE_TIMEOUT,
        )
        log.info("STM32 UART öppen: %s @ %s baud", config.STM32_UART_PORT, config.STM32_UART_BAUD)

    def arm(self) -> None:
        self.neutral()
        log.info("Armerar STM32 bridge (%.1f s neutral)...", config.ARM_SECONDS)
        time.sleep(config.ARM_SECONDS)
        self.armed = True
        log.info("STM32 bridge armerad")

    def close(self) -> None:
        try:
            self.accessories_off()
            self.neutral()
            if self.ser is not None:
                self.ser.close()
        finally:
            self.ser = None
            self.armed = False

    def _write_frame(self, frame: bytes) -> None:
        if self.simulated:
            log.debug("SIM STM32 TX: %s", frame.hex(" "))
            return
        if self.ser is None:
            return
        with self.lock:
            self.ser.write(frame)
            self.ser.flush()

    def _send_control(self) -> None:
        payload = bytearray()
        for value in self.rc:
            payload += int(clamp(value, -1000, 1000)).to_bytes(2, "little", signed=True)
        payload.append(self.digital_mask & 0x0F)
        payload += int(clamp(self.buzzer_hz, 0, 65535)).to_bytes(2, "little")
        if len(payload) != CONTROL_PAYLOAD_SIZE:
            raise RuntimeError("internal CONTROL payload size mismatch")
        self._write_frame(encode_packet(MSG_CONTROL, bytes(payload)))

    def apply(self, throttle: float, steering: float) -> None:
        if abs(throttle) < config.ESC_DEADBAND:
            throttle = 0.0
        rc = [0, 0, 0, 0]
        if 0 <= config.STM32_STEERING_RC_OUTPUT < len(rc):
            rc[config.STM32_STEERING_RC_OUTPUT] = percent_to_stm32_command(steering)
        if 0 <= config.STM32_THROTTLE_RC_OUTPUT < len(rc):
            rc[config.STM32_THROTTLE_RC_OUTPUT] = percent_to_stm32_command(throttle)
        self.rc = rc
        steering_command = self.rc[config.STM32_STEERING_RC_OUTPUT] if 0 <= config.STM32_STEERING_RC_OUTPUT < len(self.rc) else 0
        throttle_command = self.rc[config.STM32_THROTTLE_RC_OUTPUT] if 0 <= config.STM32_THROTTLE_RC_OUTPUT < len(self.rc) else 0
        self.last_steering_us = config.STEERING_MID_US + steering_command // 2
        self.last_esc_us = config.ESC_MID_US + throttle_command // 2
        self._send_control()

    def apply_board_control(self, rc=None, digital=None, buzzer=None) -> None:
        if isinstance(rc, list) and len(rc) == 4:
            self.rc = [int(clamp(float(value), -1000, 1000)) for value in rc]
        if digital is not None:
            self.digital_mask = _int_auto(digital) & 0x0F
        if buzzer is not None:
            self.buzzer_hz = int(clamp(float(_int_auto(buzzer)), 0, 65535))
        self._send_control()

    def neutral(self) -> None:
        self.rc = [0, 0, 0, 0]
        self.last_steering_us = config.STEERING_MID_US
        self.last_esc_us = config.ESC_MID_US
        self._send_control()

    def _set_digital_bit(self, bit: int, enabled: bool) -> None:
        if not 0 <= bit <= 3:
            return
        if enabled:
            self.digital_mask |= 1 << bit
        else:
            self.digital_mask &= ~(1 << bit)
        self._send_control()

    def set_lights(self, on: bool) -> None:
        self._set_digital_bit(config.STM32_LIGHTS_OUTPUT_BIT, on)
        log.info("STM32 digital bit %s -> %s", config.STM32_LIGHTS_OUTPUT_BIT, on)

    def horn(self, seconds: float | None = None) -> None:
        duration = config.HORN_SECONDS if seconds is None else float(seconds)
        self.buzzer_hz = config.STM32_HORN_BUZZER_HZ
        self._send_control()
        time.sleep(max(0.05, min(3.0, duration)))
        self.buzzer_hz = 0
        self._send_control()

    def accessories_off(self) -> None:
        self.digital_mask = 0
        self.buzzer_hz = 0
        self._send_control()

    def fail_safe(self) -> None:
        self.neutral()

    def send_oled_framebuffer(self, framebuffer: bytes, chunk_delay: float = 0.0) -> None:
        if len(framebuffer) != DISPLAY_FRAMEBUFFER_SIZE:
            raise ValueError(f"OLED framebuffer must be {DISPLAY_FRAMEBUFFER_SIZE} bytes")
        for chunk in range(DISPLAY_CHUNK_COUNT):
            offset = chunk * DISPLAY_CHUNK_DATA_SIZE
            data = framebuffer[offset : offset + DISPLAY_CHUNK_DATA_SIZE]
            self._write_frame(encode_packet(MSG_DISPLAY_DATA, bytes([chunk]) + data))
            if chunk_delay > 0:
                time.sleep(chunk_delay)
        self._write_frame(encode_packet(MSG_DISPLAY_UPDATE))

    def read_available(self) -> list[tuple[int, bytes]]:
        if self.simulated or self.ser is None:
            return []
        data = self.ser.read(4096)
        if not data:
            return []
        packets: list[tuple[int, bytes]] = []
        self.rx_buffer.extend(data)
        while True:
            try:
                delimiter = self.rx_buffer.index(0)
            except ValueError:
                break
            frame = bytes(self.rx_buffer[:delimiter])
            del self.rx_buffer[: delimiter + 1]
            if not frame:
                continue
            try:
                packets.append(decode_packet(frame))
            except ValueError as exc:
                log.warning("STM32 RX decode error: %s raw=%s", exc, frame.hex(" "))
        return packets

    # alias used by older tests/code
    fail_safe = fail_safe


class CarState:
    def __init__(self) -> None:
        self.throttle = 0.0
        self.steering = 0.0
        self.last_command = 0.0
        self.estop = False
        self.headlights = False
        self.recording = False
        self.heading = 0.0
        self.failsafe = True

    def reset_controls(self) -> None:
        self.throttle = 0.0
        self.steering = 0.0


state = CarState()
outputs = STM32Bridge()
active_client = None  # type: ignore[var-annotated]
active_session = ""
driver_info = {"session": "", "label": "", "since": None, "handover": None}
# Skyddar check-and-set av aktiv förare mot samtidiga anslutningar.
client_lock = asyncio.Lock()



# --- Telemetriläsning -------------------------------------------------------
def cpu_temperature() -> float | None:
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r", encoding="utf-8") as fh:
            return round(int(fh.read().strip()) / 1000.0, 1)
    except OSError:
        return None


_RSSI_RE = re.compile(r"Signal level[=:]\s*(-?\d+)")


def wifi_rssi() -> int | None:
    try:
        out = subprocess.run(
            ["iwconfig", config.WIFI_INTERFACE],
            capture_output=True,
            text=True,
            timeout=1.0,
        ).stdout
        match = _RSSI_RE.search(out)
        if match:
            return int(match.group(1))
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        with open("/proc/net/wireless", "r", encoding="utf-8") as fh:
            for line in fh:
                if line.strip().startswith(config.WIFI_INTERFACE):
                    parts = line.split()
                    return int(float(parts[3]))
    except (OSError, IndexError, ValueError):
        pass
    return None


# Cachade systemvärden – iwconfig är ett subprocess-anrop och får aldrig
# köras i event-loopen (det fördröjer styrkommandon).
_cached_temp: float | None = None
_cached_rssi: int | None = None


async def system_stats_loop() -> None:
    """Läser CPU-temp och WiFi-RSSI i en tråd var 5:e sekund."""
    global _cached_temp, _cached_rssi
    loop = asyncio.get_running_loop()
    while True:
        try:
            _cached_temp = await loop.run_in_executor(None, cpu_temperature)
            _cached_rssi = await loop.run_in_executor(None, wifi_rssi)
        except Exception:
            log.exception("Kunde inte läsa systemstatus")
        await asyncio.sleep(5.0)


def telemetry() -> dict:
    payload = {
        "speed": round(abs(state.throttle) * config.SPEED_FACTOR, 1),
        "heading": round(state.heading, 1),
        "headlights": state.headlights,
        "recording": state.recording,
        "estop": state.estop,
        "armed": outputs.armed,
        "failsafe": state.failsafe,
    }
    payload["driver"] = dict(driver_info)
    if outputs.latest_status:
        payload.update(outputs.latest_status)
    if _cached_temp is not None:
        payload["temperature"] = _cached_temp
    if _cached_rssi is not None:
        payload["rssi"] = _cached_rssi
    return payload


# --- Kommandohantering ------------------------------------------------------
def _coerce_percent(value, default: float, label: str) -> float:
    if isinstance(value, bool):
        log.warning("Ignorerar ogiltigt %s-värde: bool", label)
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        log.warning("Ignorerar ogiltigt %s-värde: %r", label, value)
        return default


def apply_command(throttle: float, steering: float) -> None:
    limit = clamp(config.MAX_THROTTLE, 0.0, 100.0)
    state.last_command = time.monotonic()
    state.failsafe = False
    if state.estop:
        # Under nödstopp får inget kommando lagras eller nå utgångarna – annars
        # rapporterar telemetrin gas som inte finns och ett resume kan rycka till.
        state.reset_controls()
        outputs.neutral()
        return
    state.throttle = clamp(_coerce_percent(throttle, 0.0, "throttle"), -limit, limit)
    state.steering = clamp(_coerce_percent(steering, 0.0, "steering"), -100.0, 100.0)
    outputs.apply(state.throttle, state.steering)



def take_photo() -> str | None:
    """Hämtar en stillbild från kameraservern och sparar den på disk."""
    try:
        os.makedirs(config.PHOTO_DIR, exist_ok=True)
        name = time.strftime("photo-%Y%m%d-%H%M%S.jpg")
        path = os.path.join(config.PHOTO_DIR, name)
        with urllib.request.urlopen(config.SNAPSHOT_URL, timeout=5) as resp:
            data = resp.read()
        with open(path, "wb") as fh:
            fh.write(data)
        log.info("Bild sparad: %s (%d kB)", path, len(data) // 1024)
        return path
    except Exception as exc:
        log.warning("Kunde inte ta bild: %s", exc)
        return None


async def handle_action_async(action: str, value, websocket) -> None:
    """Åtgärder som kan blockera körs i en tråd."""
    loop = asyncio.get_running_loop()
    if action == "horn":
        await loop.run_in_executor(None, outputs.horn, None)
        return
    if action in ("oled", "display", "display_update"):
        try:
            framebuffer = _decode_bytes_value(value)
            chunk_delay = 0.0
            if isinstance(value, dict):
                chunk_delay = float(value.get("chunkDelay", 0.0) or 0.0)
            await loop.run_in_executor(None, outputs.send_oled_framebuffer, framebuffer, chunk_delay)
            await websocket.send(json.dumps({"display": {"ok": True}}))
        except Exception as exc:
            log.warning("Kunde inte skicka OLED-framebuffer: %s", exc)
            try:
                await websocket.send(json.dumps({"display": {"ok": False, "error": str(exc)}}))
            except Exception:
                pass
        return
    if action == "photo":
        path = await loop.run_in_executor(None, take_photo)
        try:
            await websocket.send(
                json.dumps(
                    {"photo": {"ok": path is not None, "path": path}}
                )
            )
        except Exception:
            pass
        return
    handle_action(action, value)


def handle_action(action: str, value) -> None:
    if action == "estop":
        state.estop = True
        state.reset_controls()
        outputs.fail_safe()
        outputs.accessories_off()
        state.headlights = False
        log.warning("NÖDSTOPP aktiverat av klient")
    elif action == "resume":
        state.estop = False
        state.reset_controls()
        outputs.neutral()
        log.info("Nödstopp återställt")
    elif action == "headlights":
        state.headlights = bool(value) if value is not None else not state.headlights
        outputs.set_lights(state.headlights)
    elif action == "horn":
        outputs.horn()
    else:
        log.info("Okänt kommando: %s", action)


async def watchdog() -> None:
    """Sätt neutral om inga kommandon kommer in."""
    while True:
        await asyncio.sleep(config.WATCHDOG_INTERVAL)
        if state.failsafe:
            continue
        if time.monotonic() - state.last_command > config.WATCHDOG_TIMEOUT:
            state.reset_controls()
            outputs.fail_safe()
            state.failsafe = True
            log.warning("Watchdog: inga kommandon – går till neutral")


async def telemetry_loop() -> None:
    interval = 1.0 / max(0.5, config.TELEMETRY_HZ)
    while True:
        await asyncio.sleep(interval)
        client = active_client
        if client is None:
            continue
        try:
            # Backpressure: en långsam klient får inte bromsa hela loopen.
            # Hinner den inte ta emot inom ett intervall stänger vi anslutningen.
            await asyncio.wait_for(client.send(json.dumps(telemetry())), timeout=max(0.5, interval * 2))
        except ConnectionClosed:
            log.debug("Telemetri: klienten är frånkopplad")
        except asyncio.TimeoutError:
            log.warning("Telemetri: klienten hinner inte ta emot – stänger anslutningen")
            try:
                await client.close(code=1013, reason="slow consumer")
            except Exception:
                log.debug("Kunde inte stänga långsam klient", exc_info=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Oväntat fel i telemetriloopen")


async def stm32_rx_loop() -> None:
    """Reads STM32 UART packets without blocking the WebSocket event loop."""
    loop = asyncio.get_running_loop()
    while True:
        try:
            packets = await loop.run_in_executor(None, outputs.read_available)
            for msg_type, payload in packets:
                if msg_type == MSG_STATUS:
                    outputs.latest_status = parse_status_payload(payload)
                elif msg_type == MSG_RPI_SHUTDOWN:
                    outputs.shutdown_requested = True
                    log.warning("STM32 begär Raspberry Pi shutdown")
                    client = active_client
                    if client is not None:
                        try:
                            await client.send(json.dumps({"shutdownRequested": True}))
                        except Exception:
                            pass
                else:
                    log.debug("STM32 RX type=0x%02x payload=%s", msg_type, payload.hex(" "))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Oväntat fel i STM32 UART-loopen")
            await asyncio.sleep(1.0)
        await asyncio.sleep(0.002)



def _request_path(websocket) -> str:
    request = getattr(websocket, "request", None)
    return getattr(request, "path", None) or getattr(websocket, "path", "") or ""


def _b64url_decode(value: str) -> str:
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        return ""


def _offered_protocols(websocket) -> list[str]:
    request = getattr(websocket, "request", None)
    raw = ""
    if request is not None:
        try:
            raw = request.headers.get("Sec-WebSocket-Protocol", "") or ""
        except Exception:
            raw = ""
    return [p.strip() for p in raw.split(",") if p.strip()]


def _supplied_token(websocket) -> str:
    """Token läses i första hand ur handskakningen (Sec-WebSocket-Protocol).

    Query-parametern stöds bara för bakåtkompatibilitet – den kan läcka ut i
    proxy- och åtkomstloggar och bör inte användas.
    """
    for proto in _offered_protocols(websocket):
        if proto.startswith("rc-token."):
            return _b64url_decode(proto[len("rc-token.") :])
    query = urlparse(_request_path(websocket)).query
    legacy = parse_qs(query).get("token", [""])[0]
    if legacy:
        log.warning("Klient skickade token i URL:en – uppdatera appen")
    return legacy


def _supplied_session(websocket) -> str:
    """Klientens sessions-ID (samma flik/enhet) ur handskakningen."""
    for proto in _offered_protocols(websocket):
        if proto.startswith("rc-session."):
            return _b64url_decode(proto[len("rc-session.") :]) or proto[len("rc-session.") :]
    return ""


def select_subprotocol(_connection, subprotocols) -> str | None:
    for proto in subprotocols or []:
        if proto == "rc-control":
            return "rc-control"
    return None


def _authorized(websocket) -> bool:
    if not config.AUTH_TOKEN:
        return True
    return hmac.compare_digest(_supplied_token(websocket), config.AUTH_TOKEN)


async def handler(websocket) -> None:
    global active_client, active_session
    peer = getattr(websocket, "remote_address", ("?", 0))

    if not _authorized(websocket):
        log.warning("Avvisar klient %s – felaktig token", peer[0])
        try:
            await websocket.send(
                json.dumps({"error": "unauthorized", "message": "Felaktig eller saknad åtkomsttoken"})
            )
        finally:
            await websocket.close(code=4003, reason="unauthorized")
        return

    session = _supplied_session(websocket)

    # Check-and-set av aktiv förare måste vara atomärt: annars kan två klienter
    # som ansluter samtidigt båda passera kontrollen och styra bilen parallellt.
    async with client_lock:
        if config.SINGLE_CLIENT and active_client is not None and active_client is not websocket:
            # Samma flik/enhet som återansluter (t.ex. efter WiFi-glapp) är ingen
            # övertagning – stäng den gamla, halvöppna anslutningen tyst.
            same_session = bool(session) and session == active_session
            if same_session or config.TAKEOVER:
                old = active_client
                active_client = None
                if same_session:
                    log.info("Klient %s återansluter (samma session) – ersätter gammal anslutning", peer[0])
                else:
                    log.warning("Ny klient %s tar över styrningen", peer[0])
                try:
                    if not same_session:
                        await old.send(
                            json.dumps({"error": "taken_over", "message": "En annan klient tog över styrningen"})
                        )
                        await old.close(code=4001, reason="taken over")
                    else:
                        await old.close(code=4005, reason="replaced")
                except ConnectionClosed:
                    pass
                except Exception:
                    log.exception("Fel vid stängning av tidigare anslutning")
            else:
                log.warning("Avvisar klient %s – redan upptagen", peer[0])
                await websocket.send(
                    json.dumps({"error": "busy", "message": "En annan klient styr redan bilen"})
                )
                await websocket.close(code=4002, reason="busy")
                return

        active_client = websocket
        active_session = session
        now_ms = int(time.time() * 1000)
        previous = driver_info.get("session")
        driver_info["session"] = session
        driver_info["label"] = str(peer[0])
        driver_info["since"] = now_ms
        if previous and previous != session:
            driver_info["handover"] = now_ms

    state.last_command = time.monotonic()
    state.failsafe = False
    log.info("Klient ansluten: %s", peer[0])
    try:
        await websocket.send(json.dumps({"hello": "rc-car", **telemetry()}))
    except Exception:
        pass

    try:
        async for raw in websocket:
            if isinstance(raw, bytes):
                raw_size = len(raw)
            else:
                raw_size = len(raw.encode("utf-8", errors="replace"))
            if raw_size > config.MAX_MESSAGE_BYTES:
                log.warning("För stort klientmeddelande från %s: %d bytes", peer[0], raw_size)
                continue
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                log.debug("Ogiltigt JSON-meddelande")
                continue
            if not isinstance(data, dict):
                continue

            if "estop" in data:
                requested = bool(data["estop"])
                if requested != state.estop:
                    handle_action("estop" if requested else "resume", None)

            if "throttle" in data or "steering" in data:
                apply_command(data.get("throttle", 0), data.get("steering", 0))

            if "rc" in data or "digital" in data or "buzzer" in data:
                outputs.apply_board_control(data.get("rc"), data.get("digital"), data.get("buzzer"))

            if "ping" in data:
                try:
                    await websocket.send(json.dumps({"pong": data["ping"]}))
                except ConnectionClosed:
                    break

            action = data.get("action")
            if isinstance(action, str):
                await handle_action_async(action, data.get("value"), websocket)
    except ConnectionClosed as exc:
        log.info("Klient frånkopplad (%s): kod=%s", exc.__class__.__name__, getattr(exc, "code", "?"))
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("Oväntat serverfel i klienthanteraren för %s", peer[0])

    finally:
        if active_client is websocket:
            active_client = None
            active_session = ""
            driver_info["session"] = ""
            driver_info["label"] = ""
            driver_info["since"] = None
            state.reset_controls()
            outputs.fail_safe()
            outputs.accessories_off()
            state.headlights = False
            state.failsafe = True
        log.info("Klient frånkopplad: %s – bilen i neutral", peer[0])


async def main() -> None:
    outputs.connect()
    await asyncio.get_running_loop().run_in_executor(None, outputs.arm)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # pragma: no cover
            pass

    async with serve(
        handler,
        config.HOST,
        config.PORT,
        ping_interval=20,
        ping_timeout=20,
        max_size=config.MAX_MESSAGE_BYTES,
        select_subprotocol=select_subprotocol,
    ):
        log.info("WebSocket-server lyssnar på ws://%s:%s", config.HOST, config.PORT)
        if not config.AUTH_TOKEN:
            log.warning("RC_TOKEN är inte satt – vem som helst i nätverket kan styra bilen")
        watch = asyncio.create_task(watchdog())
        tele = asyncio.create_task(telemetry_loop())
        stats = asyncio.create_task(system_stats_loop())
        stm32 = asyncio.create_task(stm32_rx_loop())
        await stop.wait()
        watch.cancel()
        tele.cancel()
        stats.cancel()
        stm32.cancel()

    log.info("Stänger av – neutral utgång")
    outputs.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RuntimeError as exc:
        log.error("%s", exc)
        sys.exit(1)
    except KeyboardInterrupt:
        pass
