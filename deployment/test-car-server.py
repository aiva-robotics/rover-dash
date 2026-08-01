#!/usr/bin/env python3
"""Automatiskt test av RC-bilens WebSocket-server.

Skickar riktiga kommandon till servern och verifierar att styrservo- och
ESC-utgångarna faktiskt ändrar pulsbredd (läses direkt från pigpiod).

Kör på Pi:n:
    python3 deployment/test-car-server.py
    python3 deployment/test-car-server.py --url ws://192.168.1.146:81
    python3 deployment/test-car-server.py --no-gpio     # bara protokolltest

SÄKERHET: koppla loss drivhjulen/lyft bilen innan testet – ESC:n får korta pådrag.
Med --safe testas endast styrservot (ESC hålls neutral).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

import config
from hardware import percent_to_us

try:
    import websockets
except ImportError:  # pragma: no cover
    print("FEL: websockets saknas. sudo apt-get install -y python3-websockets")
    sys.exit(1)

GREEN, RED, YELLOW, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[0m"

results: list[tuple[bool, str]] = []


def check(ok: bool, label: str, detail: str = "") -> bool:
    results.append((ok, label))
    mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}FEL {RESET}"
    print(f"  [{mark}] {label}{(' – ' + detail) if detail else ''}")
    return ok


def warn(label: str) -> None:
    print(f"  [{YELLOW}INFO{RESET}] {label}")


class GpioProbe:
    """Läser tillbaka pulsbredder från pigpiod för att verifiera utgångarna."""

    def __init__(self, enabled: bool) -> None:
        self.pi = None
        if not enabled:
            return
        try:
            import pigpio  # type: ignore
        except ImportError:
            warn("pigpio-modulen saknas – hoppar över GPIO-verifiering")
            return
        pi = pigpio.pi()
        if not pi.connected:
            warn("Når inte pigpiod – hoppar över GPIO-verifiering")
            return
        self.pi = pi

    @property
    def active(self) -> bool:
        return self.pi is not None

    def read(self, gpio: int) -> int:
        return int(self.pi.get_servo_pulsewidth(gpio))  # type: ignore[union-attr]

    def close(self) -> None:
        if self.pi:
            self.pi.stop()


async def drive(ws, throttle: float, steering: float, hold: float = 0.25) -> None:
    """Skicka kommandot upprepat så att watchdogen inte slår till."""
    deadline = time.monotonic() + hold
    while time.monotonic() < deadline:
        await ws.send(json.dumps({"throttle": throttle, "steering": steering}))
        await asyncio.sleep(0.05)


def verify_pulse(probe: GpioProbe, gpio: int, expected: int, label: str, tol: int = 12) -> None:
    if not probe.active:
        return
    actual = probe.read(gpio)
    check(
        abs(actual - expected) <= tol,
        label,
        f"förväntat ~{expected} us, uppmätt {actual} us",
    )


async def run(url: str, use_gpio: bool, safe: bool) -> int:
    probe = GpioProbe(use_gpio)
    print(f"\n== Testar {url} ==")
    if probe.active:
        print("   GPIO-verifiering aktiv (läser pulsbredder via pigpiod)")
    if safe:
        print("   SAFE-läge: ESC hålls neutral, endast styrservo testas")

    try:
        ws = await asyncio.wait_for(websockets.connect(url), timeout=5)
    except Exception as exc:
        check(False, "Ansluter till WebSocket-servern", f"{exc.__class__.__name__}: {exc}")
        return 1
    check(True, "Ansluter till WebSocket-servern")

    async with ws:
        # 1. Hälsning / telemetri
        try:
            hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
            check(isinstance(hello, dict), "Tar emot telemetri vid anslutning", str(hello)[:90])
        except Exception as exc:
            check(False, "Tar emot telemetri vid anslutning", exc.__class__.__name__)
            hello = {}

        # 2. Ping/pong
        sent = int(time.time() * 1000)
        await ws.send(json.dumps({"ping": sent}))
        pong_ok = False
        t0 = time.monotonic()
        while time.monotonic() - t0 < 3:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
            if msg.get("pong") == sent:
                pong_ok = True
                break
        check(pong_ok, "Ping/pong svarar", f"{round((time.monotonic() - t0) * 1000)} ms")

        # 3. Neutral
        await drive(ws, 0, 0)
        verify_pulse(probe, config.STEERING_GPIO, config.STEERING_MID_US, "Styrservo neutral")
        verify_pulse(probe, config.ESC_GPIO, config.ESC_MID_US, "ESC neutral")

        # 4. Styrsvep
        for pct, name in ((-100, "vänster"), (100, "höger"), (0, "mitten")):
            await drive(ws, 0, pct)
            verify_pulse(
                probe,
                config.STEERING_GPIO,
                percent_to_us(
                    pct, config.STEERING_MIN_US, config.STEERING_MID_US, config.STEERING_MAX_US
                ),
                f"Styrservo {name} ({pct}%)",
            )

        # 5. Throttle fram/back
        if safe:
            warn("Hoppar över throttle-test (--safe)")
        else:
            for pct, name in ((30, "framåt"), (0, "neutral"), (-30, "bakåt"), (0, "neutral")):
                await drive(ws, pct, 0)
                verify_pulse(
                    probe,
                    config.ESC_GPIO,
                    percent_to_us(pct, config.ESC_MIN_US, config.ESC_MID_US, config.ESC_MAX_US),
                    f"ESC {name} ({pct}%)",
                )

        # 6. Nödstopp
        await drive(ws, 40, 40, hold=0.15)
        await ws.send(json.dumps({"action": "estop"}))
        await asyncio.sleep(0.4)
        verify_pulse(probe, config.STEERING_GPIO, config.STEERING_MID_US, "Nödstopp -> styrservo neutral")
        verify_pulse(probe, config.ESC_GPIO, config.ESC_MID_US, "Nödstopp -> ESC neutral")

        estop_seen = False
        t0 = time.monotonic()
        while time.monotonic() - t0 < 2:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=1))
            except asyncio.TimeoutError:
                break
            if msg.get("estop") is True:
                estop_seen = True
                break
        check(estop_seen, "Servern rapporterar estop i telemetrin")

        # 7. Återställ + watchdog
        await ws.send(json.dumps({"action": "resume"}))
        await asyncio.sleep(0.2)
        await drive(ws, 0, 60, hold=0.3)
        verify_pulse(
            probe,
            config.STEERING_GPIO,
            percent_to_us(60, config.STEERING_MIN_US, config.STEERING_MID_US, config.STEERING_MAX_US),
            "Resume återaktiverar styrningen",
        )

        await asyncio.sleep(max(1.0, config.WATCHDOG_TIMEOUT * 3))
        verify_pulse(probe, config.STEERING_GPIO, config.STEERING_MID_US, "Watchdog går till neutral")
        verify_pulse(probe, config.ESC_GPIO, config.ESC_MID_US, "Watchdog -> ESC neutral")

    probe.close()

    failed = [label for ok, label in results if not ok]
    print("\n== Resultat ==")
    print(f"  {len(results) - len(failed)}/{len(results)} test godkända")
    if failed:
        for label in failed:
            print(f"  {RED}x{RESET} {label}")
        return 1
    print(f"  {GREEN}Allt fungerar – styrning och throttle svarar korrekt.{RESET}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Testar RC-bilens WebSocket-server")
    parser.add_argument("--url", default=f"ws://localhost:{config.PORT}", help="WebSocket-adress")
    parser.add_argument("--no-gpio", action="store_true", help="Hoppa över pulsbreddsmätning")
    parser.add_argument("--safe", action="store_true", help="Testa inte ESC/throttle")
    args = parser.parse_args()
    try:
        return asyncio.run(run(args.url, not args.no_gpio, args.safe))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
