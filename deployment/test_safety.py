#!/usr/bin/env python3
"""Enhetstester för de säkerhetskritiska delarna av rc-car-server.

Kräver ingen hårdvara – kör med simulerade PWM-utgångar och fejkade
WebSocket-objekt.

Kör:
    python3 deployment/test_safety.py
"""

from __future__ import annotations

import asyncio
import base64
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# Simulerade utgångar + känd token innan config/servern importeras.
os.environ.setdefault("RC_SIMULATE", "1")
os.environ["RC_TOKEN"] = "hemlig-token"
os.environ["RC_WATCHDOG_TIMEOUT"] = "0.2"
os.environ["RC_WATCHDOG_INTERVAL"] = "0.05"
os.environ["RC_MAX_THROTTLE"] = "80"

_spec = importlib.util.spec_from_file_location("rc_car_server", HERE / "rc-car-server.py")
srv = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(srv)

GREEN, RED, RESET = "\033[32m", "\033[31m", "\033[0m"
results: list[tuple[bool, str]] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    results.append((bool(ok), label))
    mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}FEL {RESET}"
    print(f"  {mark}  {label}{(' – ' + detail) if detail and not ok else ''}")


def _b64(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


class FakeRequest:
    def __init__(self, path: str, protocols: list[str]) -> None:
        self.path = path
        self.headers = {"Sec-WebSocket-Protocol": ", ".join(protocols)}



class FakeWS:
    """Minimal WebSocket-stubb."""

    def __init__(self, token: str | None = None, session: str = "", path: str = "/", delay: float = 0.0):
        protos = ["rc-control"]
        if token is not None:
            protos.append("rc-token." + _b64(token))
        if session:
            protos.append("rc-session." + _b64(session))
        self.request = FakeRequest(path)
        self.request_headers = {"Sec-WebSocket-Protocol": ", ".join(protos)}
        self.subprotocols = protos
        self.remote_address = ("10.0.0.5", 1234)
        self.sent: list[str] = []
        self.closed_with: tuple[int, str] | None = None
        self._delay = delay
        self._incoming: asyncio.Queue = asyncio.Queue()

    async def send(self, payload: str) -> None:
        if self._delay:
            await asyncio.sleep(self._delay)
        self.sent.append(payload)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed_with = (code, reason)

    def feed(self, message: dict) -> None:
        self._incoming.put_nowait(json.dumps(message))

    def eof(self) -> None:
        self._incoming.put_nowait(None)

    def __aiter__(self):
        return self

    async def __anext__(self):
        item = await self._incoming.get()
        if item is None:
            raise StopAsyncIteration
        return item


def reset_state() -> None:
    srv.active_client = None
    srv.active_session = ""
    srv.state.estop = False
    srv.state.failsafe = True
    srv.state.reset_controls()


# --- 1. Auth ---------------------------------------------------------------
def test_auth() -> None:
    print("\nAuth:")
    check(srv._authorized(FakeWS(token="hemlig-token")), "korrekt token accepteras")
    check(not srv._authorized(FakeWS(token="fel-token")), "felaktig token avvisas")
    check(not srv._authorized(FakeWS(token=None)), "saknad token avvisas")
    legacy = FakeWS(token=None, path="/?token=hemlig-token")
    check(srv._authorized(legacy), "legacy query-token fungerar (bakåtkompatibilitet)")
    check(
        srv._supplied_session(FakeWS(token="hemlig-token", session="abc123")) == "abc123",
        "sessions-ID läses ur handskakningen",
    )


# --- 2. Estop-ordning ------------------------------------------------------
def test_estop_ordering() -> None:
    print("\nNödstopp:")
    reset_state()
    srv.apply_command(50, 20)
    check(abs(srv.state.throttle - 50) < 0.01, "gas släpps igenom i normalläge")

    srv.handle_action("estop", None)
    check(srv.state.estop, "estop sätter estop-flaggan")
    check(srv.state.throttle == 0 and srv.state.steering == 0, "estop nollställer kommandon")

    # Kommandon efter estop får aldrig nå utgångarna.
    srv.apply_command(100, 100)
    check(srv.state.throttle == 0, "gas ignoreras medan estop är aktivt")
    check(srv.outputs.last_esc_us == srv.config.ESC_MID_US, "ESC hålls neutral under estop")

    srv.handle_action("resume", None)
    check(not srv.state.estop and srv.state.throttle == 0, "resume återställer till neutral")

    # Estop + gas i samma paket: estop hanteras först i handler-loopen.
    reset_state()
    data = {"estop": True, "throttle": 100, "steering": 100}
    if "estop" in data and bool(data["estop"]) != srv.state.estop:
        srv.handle_action("estop", None)
    srv.apply_command(data["throttle"], data["steering"])
    check(srv.state.throttle == 0, "estop+gas i samma paket ger noll gas")

    reset_state()
    srv.apply_command(100, 0)
    check(
        abs(srv.state.throttle - srv.config.MAX_THROTTLE) < 0.01,
        "MAX_THROTTLE begränsar gasen serverside",
        f"throttle={srv.state.throttle}",
    )


# --- 3. Watchdog -----------------------------------------------------------
async def test_watchdog() -> None:
    print("\nWatchdog:")
    reset_state()
    srv.apply_command(60, 0)
    check(not srv.state.failsafe, "failsafe avaktiveras vid kommando")

    task = asyncio.create_task(srv.watchdog())
    try:
        # Håll den vid liv en stund.
        for _ in range(4):
            await asyncio.sleep(0.05)
            srv.apply_command(60, 0)
        check(not srv.state.failsafe, "watchdog löser inte ut vid regelbundna kommandon")

        await asyncio.sleep(srv.config.WATCHDOG_TIMEOUT + 0.25)
        check(srv.state.failsafe, "watchdog löser ut när kommandon uteblir")
        check(srv.state.throttle == 0, "watchdog nollställer gasen")
        check(srv.outputs.last_esc_us == srv.config.ESC_MID_US, "watchdog sätter ESC neutral")
    finally:
        task.cancel()


# --- 4. Race på aktiv förare ----------------------------------------------
async def test_single_driver_race() -> None:
    print("\nFörarlås (race):")
    reset_state()
    srv.config.SINGLE_CLIENT = True
    srv.config.TAKEOVER = False

    # Två klienter ansluter exakt samtidigt; den första har långsam send()
    # så att den hinner ge upp kontrollen vid ett await om låset saknas.
    a = FakeWS(token="hemlig-token", session="sess-a", delay=0.05)
    b = FakeWS(token="hemlig-token", session="sess-b", delay=0.05)
    for ws in (a, b):
        ws.feed({"throttle": 10, "steering": 0})
        ws.eof()

    await asyncio.gather(srv.handler(a), srv.handler(b))

    rejected = [ws for ws in (a, b) if ws.closed_with and ws.closed_with[0] == 4002]
    check(len(rejected) == 1, "exakt en av två samtidiga klienter avvisas som upptagen",
          f"avvisade={len(rejected)}")
    check(srv.active_client is None, "aktiv förare rensas när alla kopplat ner")

    # Samma session som återansluter ska inte räknas som övertagning.
    reset_state()
    first = FakeWS(token="hemlig-token", session="samma")
    srv.active_client = first
    srv.active_session = "samma"
    second = FakeWS(token="hemlig-token", session="samma")
    second.eof()
    await srv.handler(second)
    check(first.closed_with is not None and first.closed_with[0] == 4005,
          "återanslutning med samma session ersätter tyst (4005)")

    srv.config.TAKEOVER = True


async def main() -> int:
    print("Säkerhetstester för rc-car-server")
    srv.outputs.connect()
    srv.outputs.arm()
    test_auth()
    test_estop_ordering()
    await test_watchdog()
    await test_single_driver_race()
    srv.outputs.close()

    failed = [label for ok, label in results if not ok]
    print("\n" + "-" * 50)
    if failed:
        print(f"{RED}{len(failed)} av {len(results)} test misslyckades{RESET}")
        for label in failed:
            print(f"  - {label}")
        return 1
    print(f"{GREEN}Alla {len(results)} test godkända{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
