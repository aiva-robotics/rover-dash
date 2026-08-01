#!/usr/bin/env python3
"""WebSocket-server för RC-bilen på Raspberry Pi.

Protokoll (matchar webbappens useCarSocket):
  in : {"throttle": -100..100, "steering": -100..100}
  in : {"ping": <ms-timestamp>}            -> ut: {"pong": <samma>}
  in : {"action": "estop"|"resume"|"headlights"|"horn"|"photo", "value": ...}
  ut : {"speed":..,"rssi":..,"temperature":..,"heading":..,"headlights":..,
        "recording":..,"estop":..,"armed":..}

Kör:  python3 rc-car-server.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import hmac
import signal
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlparse

import config
from hardware import RCOutputs, clamp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("rc-car")

try:
    import websockets
    from websockets.server import serve
except ImportError:  # pragma: no cover
    log.error("websockets saknas. Installera: sudo apt-get install -y python3-websockets")
    sys.exit(1)


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
outputs = RCOutputs()
active_client = None  # type: ignore[var-annotated]


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
    if _cached_temp is not None:
        payload["temperature"] = _cached_temp
    if _cached_rssi is not None:
        payload["rssi"] = _cached_rssi
    return payload


# --- Kommandohantering ------------------------------------------------------
def apply_command(throttle: float, steering: float) -> None:
    state.throttle = clamp(float(throttle), -100.0, 100.0)
    state.steering = clamp(float(steering), -100.0, 100.0)
    state.last_command = time.monotonic()
    state.failsafe = False
    if state.estop:
        outputs.neutral()
    else:
        outputs.apply(state.throttle, state.steering)


def handle_action(action: str, value) -> None:
    if action == "estop":
        state.estop = True
        state.reset_controls()
        outputs.fail_safe()
        log.warning("NÖDSTOPP aktiverat av klient")
    elif action == "resume":
        state.estop = False
        state.reset_controls()
        outputs.neutral()
        log.info("Nödstopp återställt")
    elif action == "headlights":
        state.headlights = bool(value) if value is not None else not state.headlights
        log.info("Strålkastare: %s", state.headlights)
    elif action == "horn":
        log.info("Tuta")
    elif action == "photo":
        log.info("Bild begärd")
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
            await client.send(json.dumps(telemetry()))
        except Exception as exc:
            log.debug("Kunde inte skicka telemetri: %s", exc.__class__.__name__)


def _request_path(websocket) -> str:
    request = getattr(websocket, "request", None)
    return getattr(request, "path", None) or getattr(websocket, "path", "") or ""


def _authorized(websocket) -> bool:
    if not config.AUTH_TOKEN:
        return True
    query = urlparse(_request_path(websocket)).query
    supplied = parse_qs(query).get("token", [""])[0]
    return hmac.compare_digest(supplied, config.AUTH_TOKEN)


async def handler(websocket) -> None:
    global active_client
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

    if config.SINGLE_CLIENT and active_client is not None and active_client is not websocket:
        if config.TAKEOVER:
            log.warning("Ny klient %s tar över styrningen", peer[0])
            old = active_client
            active_client = None
            try:
                await old.send(json.dumps({"error": "taken_over", "message": "En annan klient tog över styrningen"}))
                await old.close(code=4001, reason="taken over")
            except Exception:
                pass
        else:
            log.warning("Avvisar klient %s – redan upptagen", peer[0])
            await websocket.send(
                json.dumps({"error": "busy", "message": "En annan klient styr redan bilen"})
            )
            await websocket.close(code=4002, reason="busy")
            return

    active_client = websocket
    state.last_command = time.monotonic()
    state.failsafe = False
    log.info("Klient ansluten: %s", peer[0])
    try:
        await websocket.send(json.dumps({"hello": "rc-car", **telemetry()}))
    except Exception:
        pass

    try:
        async for raw in websocket:
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

            if "ping" in data:
                try:
                    await websocket.send(json.dumps({"pong": data["ping"]}))
                except Exception:
                    break

            action = data.get("action")
            if isinstance(action, str):
                handle_action(action, data.get("value"))
    except Exception as exc:  # websockets.ConnectionClosed m.m.
        log.info("Klientfel/frånkoppling: %s", exc.__class__.__name__)
    finally:
        if active_client is websocket:
            active_client = None
            state.reset_controls()
            outputs.fail_safe()
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

    async with serve(handler, config.HOST, config.PORT, ping_interval=20, ping_timeout=20):
        log.info("WebSocket-server lyssnar på ws://%s:%s", config.HOST, config.PORT)
        if not config.AUTH_TOKEN:
            log.warning("RC_TOKEN är inte satt – vem som helst i nätverket kan styra bilen")
        watch = asyncio.create_task(watchdog())
        tele = asyncio.create_task(telemetry_loop())
        stats = asyncio.create_task(system_stats_loop())
        await stop.wait()
        watch.cancel()
        tele.cancel()
        stats.cancel()

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
