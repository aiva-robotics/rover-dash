#!/usr/bin/env python3
"""Smoke test for the WebSocket-to-STM32 UART bridge.

The test talks to rc-car-server over WebSocket and checks the public protocol.
If STM32 telemetry is available, it also verifies that generic board outputs
are reflected in the latest status packet.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from typing import Any

import config

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
    print(f"  [{mark}] {label}{(' - ' + detail) if detail else ''}")
    return ok


def warn(label: str) -> None:
    print(f"  [{YELLOW}INFO{RESET}] {label}")


async def recv_json(ws, timeout: float = 3.0) -> dict[str, Any]:
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))


async def wait_for_stm32_field(ws, field: str, expected: Any, timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            msg = await recv_json(ws, timeout=max(0.1, deadline - time.monotonic()))
        except asyncio.TimeoutError:
            return False
        stm32 = msg.get("stm32")
        if isinstance(stm32, dict) and stm32.get(field) == expected:
            return True
    return False


async def run(url: str, require_stm32: bool) -> int:
    print(f"\n== Testar {url} ==")

    try:
        ws = await asyncio.wait_for(websockets.connect(url), timeout=5)
    except Exception as exc:
        check(False, "Ansluter till WebSocket-servern", f"{exc.__class__.__name__}: {exc}")
        return 1
    check(True, "Ansluter till WebSocket-servern")

    async with ws:
        try:
            hello = await recv_json(ws)
            check(isinstance(hello, dict), "Tar emot telemetri vid anslutning", str(hello)[:90])
        except Exception as exc:
            check(False, "Tar emot telemetri vid anslutning", exc.__class__.__name__)
            hello = {}

        stm32 = hello.get("stm32") if isinstance(hello, dict) else None
        stm32_available = isinstance(stm32, dict) and bool(stm32.get("rpiConnected"))
        if not stm32_available:
            message = "STM32 rapporteras inte som ansluten i telemetrin"
            if require_stm32:
                check(False, "STM32 ansluten", message)
            else:
                warn(message)
        else:
            check(True, "STM32 ansluten")

        sent = int(time.time() * 1000)
        await ws.send(json.dumps({"ping": sent}))
        pong_ok = False
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            msg = await recv_json(ws, timeout=max(0.1, deadline - time.monotonic()))
            if msg.get("pong") == sent:
                pong_ok = True
                break
        check(pong_ok, "Ping/pong svarar")

        await ws.send(json.dumps({"rc": [250, -250, 0, 0], "digital": 0x0F, "buzzer": 800}))
        check(True, "Skickar generiskt STM32 control-paket", "rc + digital + buzzer")

        if stm32_available or require_stm32:
            check(
                await wait_for_stm32_field(ws, "digitalMask", 0x0F),
                "STM32 status visar digitalMask 0x0F",
            )
            check(
                await wait_for_stm32_field(ws, "buzzerHz", 800),
                "STM32 status visar buzzer 800 Hz",
            )

        await ws.send(json.dumps({"rc": [0, 0, 0, 0], "digital": 0, "buzzer": 0}))
        check(True, "Återställer STM32 outputs till neutral")

    failed = [label for ok, label in results if not ok]
    print("\n== Resultat ==")
    print(f"  {len(results) - len(failed)}/{len(results)} test godkända")
    if failed:
        for label in failed:
            print(f"  {RED}x{RESET} {label}")
        return 1
    print(f"  {GREEN}WebSocket-bron svarar korrekt.{RESET}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Testar RC-bilens WebSocket-till-STM32-brygga")
    parser.add_argument("--url", default=f"ws://localhost:{config.PORT}", help="WebSocket-adress")
    parser.add_argument("--require-stm32", action="store_true", help="Misslyckas om STM32 inte rapporterar status")
    parser.add_argument("--no-gpio", action="store_true", help="Ignoreras; finns kvar för bakåtkompatibilitet")
    parser.add_argument("--safe", action="store_true", help="Ignoreras; testet använder inga Pi GPIO-utgångar")
    args = parser.parse_args()
    try:
        return asyncio.run(run(args.url, args.require_stm32))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
