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
import base64
import hmac
import os
import signal
import subprocess
import sys
import time
import urllib.request
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
    from websockets.exceptions import ConnectionClosed
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
