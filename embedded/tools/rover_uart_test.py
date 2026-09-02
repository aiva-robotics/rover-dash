#!/usr/bin/env python3
"""Small Raspberry Pi UART test tool for the Rover Dash STM32 controller.

Install dependency on the Raspberry Pi:
    python3 -m pip install pyserial

Examples:
    python3 rover_uart_test.py --port /dev/serial0 monitor
    python3 rover_uart_test.py --port /dev/serial0 control --digital 0x01 --buzzer 1200
    python3 rover_uart_test.py --port /dev/serial0 oled
"""

from __future__ import annotations

import argparse
import select
import struct
import sys
import time
from dataclasses import dataclass

try:
    import serial
except ImportError:
    print("Missing dependency: install with 'python3 -m pip install pyserial'", file=sys.stderr)
    raise


MSG_CONTROL = 0x01
MSG_RPI_SHUTDOWN = 0x02
MSG_DISPLAY_DATA = 0x03
MSG_DISPLAY_UPDATE = 0x04
MSG_STATUS = 0x80

MAX_PAYLOAD_SIZE = 64
CONTROL_PAYLOAD_SIZE = 11
STATUS_PAYLOAD_SIZE = 56
DISPLAY_CHUNK_DATA_SIZE = 63
DISPLAY_CHUNK_COUNT = 9
DISPLAY_FRAMEBUFFER_SIZE = 512


@dataclass
class Packet:
    msg_type: int
    payload: bytes


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
    out = bytearray()
    code_index = 0
    out.append(0)
    code = 1

    for byte in data:
        if byte == 0:
            out[code_index] = code
            code_index = len(out)
            out.append(0)
            code = 1
        else:
            out.append(byte)
            code += 1
            if code == 0xFF:
                out[code_index] = code
                code_index = len(out)
                out.append(0)
                code = 1

    out[code_index] = code
    return bytes(out)


def cobs_decode(data: bytes) -> bytes:
    out = bytearray()
    index = 0

    while index < len(data):
        code = data[index]
        index += 1
        if code == 0:
            raise ValueError("zero byte inside COBS frame")

        end = index + code - 1
        if end > len(data):
            raise ValueError("COBS code byte overruns frame")

        out.extend(data[index:end])
        index = end
        if code != 0xFF and index < len(data):
            out.append(0)

    return bytes(out)


def encode_packet(msg_type: int, payload: bytes = b"") -> bytes:
    if len(payload) > MAX_PAYLOAD_SIZE:
        raise ValueError(f"payload too large: {len(payload)} > {MAX_PAYLOAD_SIZE}")

    packet = bytes([msg_type, len(payload)]) + payload
    packet += struct.pack("<H", crc16_ccitt(packet))
    return cobs_encode(packet) + b"\x00"


def decode_packet(frame: bytes) -> Packet:
    decoded = cobs_decode(frame)
    if len(decoded) < 4:
        raise ValueError("decoded packet too short")

    msg_type = decoded[0]
    payload_length = decoded[1]
    if payload_length > MAX_PAYLOAD_SIZE:
        raise ValueError("payload length too large")
    if len(decoded) != payload_length + 4:
        raise ValueError(f"wrong decoded length: {len(decoded)}")

    received_crc = struct.unpack_from("<H", decoded, len(decoded) - 2)[0]
    calculated_crc = crc16_ccitt(decoded[:-2])
    if received_crc != calculated_crc:
        raise ValueError(f"CRC mismatch rx=0x{received_crc:04x} calc=0x{calculated_crc:04x}")

    return Packet(msg_type, decoded[2:-2])


def build_control(rc: list[int], digital: int, buzzer: int) -> bytes:
    clamped_rc = [max(-1000, min(1000, value)) for value in rc]
    payload = struct.pack("<hhhhBH", *clamped_rc, digital & 0x0F, buzzer & 0xFFFF)
    assert len(payload) == CONTROL_PAYLOAD_SIZE
    return encode_packet(MSG_CONTROL, payload)


def parse_status(payload: bytes) -> dict[str, object]:
    if len(payload) != STATUS_PAYLOAD_SIZE:
        raise ValueError(f"wrong STATUS length: {len(payload)}")

    rc = struct.unpack_from("<hhhh", payload, 4)
    analog = struct.unpack_from("<HHHH", payload, 34)
    speed_hz_x100 = struct.unpack_from("<I", payload, 47)[0]

    return {
        "uptime_ms": struct.unpack_from("<I", payload, 0)[0],
        "rc": rc,
        "digital_mask": payload[12],
        "failsafe": bool(payload[13]),
        "buzzer_hz": struct.unpack_from("<H", payload, 14)[0],
        "uart_rx_frames": struct.unpack_from("<I", payload, 16)[0],
        "uart_crc_errors": struct.unpack_from("<I", payload, 20)[0],
        "failsafe_count": struct.unpack_from("<I", payload, 24)[0],
        "rpi_connected": bool(struct.unpack_from("<H", payload, 28)[0]),
        "rpi_power_enabled": bool(payload[30]),
        "rpi_poweroff_ok": bool(payload[31]),
        "rpi_shutdown_requested": bool(payload[32]),
        "rpi_status": payload[33],
        "adc_pa0_pa3": analog,
        "ntc_raw": struct.unpack_from("<H", payload, 42)[0],
        "tmp75_c": struct.unpack_from("<h", payload, 44)[0] / 100.0,
        "tmp75_valid": bool(payload[46]),
        "speed_hz": speed_hz_x100 / 100.0,
        "ina226_voltage_v": struct.unpack_from("<H", payload, 51)[0] / 1000.0,
        "ina226_current_a": struct.unpack_from("<h", payload, 53)[0] / 1000.0,
        "ina226_valid": bool(payload[55]),
    }


def print_status(status: dict[str, object]) -> None:
    print(
        "STATUS "
        f"uptime={status['uptime_ms']}ms "
        f"rpi_connected={status['rpi_connected']} "
        f"failsafe={status['failsafe']} "
        f"rc={status['rc']} "
        f"digital=0x{status['digital_mask']:02x} "
        f"buzzer={status['buzzer_hz']}Hz "
        f"adc={status['adc_pa0_pa3']} "
        f"ntc={status['ntc_raw']} "
        f"tmp75={status['tmp75_c']:.2f}C valid={status['tmp75_valid']} "
        f"speed={status['speed_hz']:.2f}Hz "
        f"ina226={status['ina226_voltage_v']:.3f}V/{status['ina226_current_a']:.3f}A valid={status['ina226_valid']} "
        f"uart_rx={status['uart_rx_frames']} crc_err={status['uart_crc_errors']}"
    )


def make_oled_test_framebuffer() -> bytes:
    framebuffer = bytearray(DISPLAY_FRAMEBUFFER_SIZE)

    for page in range(4):
        base = page * 128
        for x in range(128):
            if x < 4 or x >= 124:
                framebuffer[base + x] = 0xFF
            elif page == 0 or page == 3:
                framebuffer[base + x] = 0x81
            else:
                framebuffer[base + x] = 0x00

    for x in range(0, 128, 8):
        framebuffer[128 + x] = 0xFF
        framebuffer[256 + x] = 0xFF

    return bytes(framebuffer)


def send_oled_frame(ser: serial.Serial, delay: float) -> None:
    framebuffer = make_oled_test_framebuffer()
    for chunk in range(DISPLAY_CHUNK_COUNT):
        offset = chunk * DISPLAY_CHUNK_DATA_SIZE
        data = framebuffer[offset : offset + DISPLAY_CHUNK_DATA_SIZE]
        payload = bytes([chunk]) + data
        ser.write(encode_packet(MSG_DISPLAY_DATA, payload))
        ser.flush()
        if delay > 0:
            time.sleep(delay)

    ser.write(encode_packet(MSG_DISPLAY_UPDATE))
    ser.flush()
    print("Sent OLED test framebuffer")


def handle_rx_bytes(rx_buffer: bytearray, data: bytes) -> None:
    rx_buffer.extend(data)
    while True:
        try:
            delimiter = rx_buffer.index(0)
        except ValueError:
            return

        frame = bytes(rx_buffer[:delimiter])
        del rx_buffer[: delimiter + 1]
        if not frame:
            continue

        try:
            packet = decode_packet(frame)
        except ValueError as exc:
            print(f"RX decode error: {exc}; raw={frame.hex(' ')}")
            continue

        if packet.msg_type == MSG_STATUS:
            print_status(parse_status(packet.payload))
        elif packet.msg_type == MSG_RPI_SHUTDOWN:
            print("RX RPI_SHUTDOWN: STM32 requests Raspberry Pi shutdown")
        else:
            print(f"RX type=0x{packet.msg_type:02x} payload={packet.payload.hex(' ')}")


def parse_rc(values: str) -> list[int]:
    parts = [part.strip() for part in values.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("expected four comma-separated RC values")
    return [int(part, 0) for part in parts]


def run(args: argparse.Namespace) -> int:
    rx_buffer = bytearray()
    rc = args.rc

    with serial.Serial(args.port, args.baud, timeout=0, write_timeout=1) as ser:
        print(f"Opened {ser.port} at {ser.baudrate} baud")
        next_control = time.monotonic()
        next_oled = time.monotonic() + args.oled_after
        oled_sent = False

        while True:
            now = time.monotonic()

            if args.command in ("control", "oled") and now >= next_control:
                ser.write(build_control(rc, args.digital, args.buzzer))
                ser.flush()
                next_control = now + args.control_period

            if args.command == "oled" and not oled_sent and now >= next_oled:
                send_oled_frame(ser, args.oled_chunk_delay)
                oled_sent = True

            data = ser.read(4096)
            if data:
                handle_rx_bytes(rx_buffer, data)

            if args.command == "monitor":
                pass
            elif args.duration > 0 and now >= args.started_at + args.duration:
                break

            ready, _, _ = select.select([sys.stdin], [], [], 0)
            if ready and sys.stdin.readline().strip().lower() in ("q", "quit", "exit"):
                break

            time.sleep(0.002)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Rover Dash STM32 UART protocol tester")
    parser.add_argument("--port", default="/dev/serial0", help="serial port, for example /dev/serial0 or /dev/ttyAMA0")
    parser.add_argument("--baud", type=int, default=115200, help="UART baud rate")

    subparsers = parser.add_subparsers(dest="command", required=True)

    monitor = subparsers.add_parser("monitor", help="only receive and decode STM32 frames")
    monitor.set_defaults(rc=[0, 0, 0, 0], digital=0, buzzer=0, control_period=0.05, duration=0)

    control = subparsers.add_parser("control", help="send periodic CONTROL frames and print received STATUS frames")
    control.add_argument("--rc", type=parse_rc, default=[0, 0, 0, 0], help="four RC values, e.g. 0,0,0,0 or 1000,0,-1000,0")
    control.add_argument("--digital", type=lambda value: int(value, 0), default=0, help="digital output mask, e.g. 0x0f")
    control.add_argument("--buzzer", type=int, default=0, help="buzzer frequency in Hz, 0 is off")
    control.add_argument("--control-period", type=float, default=0.05, help="seconds between CONTROL frames")
    control.add_argument("--duration", type=float, default=0, help="seconds to run, 0 means until q/ctrl-c")

    oled = subparsers.add_parser("oled", help="send periodic CONTROL frames plus one OLED test framebuffer")
    oled.add_argument("--rc", type=parse_rc, default=[0, 0, 0, 0], help="four RC values")
    oled.add_argument("--digital", type=lambda value: int(value, 0), default=0, help="digital output mask")
    oled.add_argument("--buzzer", type=int, default=0, help="buzzer frequency in Hz")
    oled.add_argument("--control-period", type=float, default=0.05, help="seconds between CONTROL frames")
    oled.add_argument("--oled-after", type=float, default=0.5, help="seconds before sending OLED framebuffer")
    oled.add_argument("--oled-chunk-delay", type=float, default=0.0, help="optional delay between OLED chunks")
    oled.add_argument("--duration", type=float, default=5.0, help="seconds to run")

    args = parser.parse_args()
    args.started_at = time.monotonic()

    try:
        return run(args)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
