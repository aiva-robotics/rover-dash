#!/usr/bin/env python3
"""Set the STM32 digital outputs through the Raspberry Pi WebSocket bridge.

Examples from Windows PowerShell:
    py deployment\set-digital-outputs.py --host 192.168.1.42 --digital 15
    py deployment\set-digital-outputs.py --host 192.168.1.42 --on 0 2
    py deployment\set-digital-outputs.py --host 192.168.1.42 --off

Digital output mapping:
    0 = PA6
    1 = PA7
    2 = PB0
    3 = PB1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    print("Missing dependency: py -m pip install websockets", file=sys.stderr)
    raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Control STM32 digital outputs over WebSocket")
    parser.add_argument("--host", help="Raspberry Pi IP/hostname, for example 192.168.1.42")
    parser.add_argument("--port", type=int, default=81, help="WebSocket port, default 81")
    parser.add_argument("--url", help="Full WebSocket URL, for example ws://192.168.1.42:81")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--digital", type=lambda value: int(value, 0), help="Bitmask 0..15, e.g. 0x0f")
    group.add_argument("--on", nargs="+", type=int, metavar="N", help="Turn on output indexes 0..3")
    group.add_argument("--off", action="store_true", help="Turn all digital outputs off")

    return parser.parse_args()


def make_url(args: argparse.Namespace) -> str:
    if args.url:
        return args.url
    if not args.host:
        raise SystemExit("Use --host <pi-ip> or --url ws://<pi-ip>:81")
    return f"ws://{args.host}:{args.port}"


def make_mask(args: argparse.Namespace) -> int:
    if args.off:
        return 0
    if args.digital is not None:
        mask = args.digital
    else:
        mask = 0
        for index in args.on:
            if index < 0 or index > 3:
                raise SystemExit("Output indexes must be 0..3")
            mask |= 1 << index

    if mask < 0 or mask > 0x0F:
        raise SystemExit("Digital bitmask must be between 0 and 15 / 0x0f")
    return mask


async def run() -> int:
    args = parse_args()
    url = make_url(args)
    mask = make_mask(args)

    print(f"Connecting to {url}")
    async with websockets.connect(url) as ws:
        message = {"digital": mask}
        await ws.send(json.dumps(message))
        print(f"Sent: {message}")

        try:
            reply = await asyncio.wait_for(ws.recv(), timeout=2.0)
            print(f"Received: {reply}")
        except asyncio.TimeoutError:
            print("No reply within 2 seconds. Command was still sent.")

    return 0


def main() -> int:
    try:
        return asyncio.run(run())
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
