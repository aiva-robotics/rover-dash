#!/usr/bin/env python3
"""MJPEG-streamingserver för Raspberry Pi Camera Module (v2.1).

Kör en enkel HTTP-server som levererar en multipart/x-mixed-replace-ström
som webbläsaren kan visa direkt i en <img>-tagg.

Endpoints:
  GET /stream    MJPEG-ström (multipart/x-mixed-replace)
  GET /snapshot  Enstaka JPEG-bild
  GET /health    JSON-status
  GET /          Enkel testsida

Konfigureras via miljövariabler:
  CAM_PORT      (default 8080)
  CAM_WIDTH     (default 640)
  CAM_HEIGHT    (default 480)
  CAM_FPS       (default 20)
  CAM_QUALITY   (default 75)
  CAM_HFLIP     (0/1, default 0)
  CAM_VFLIP     (0/1, default 0)
"""

from __future__ import annotations

import io
import json
import logging
import os
import socketserver
import threading
from http import server

from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutput
from libcamera import Transform

PORT = int(os.environ.get("CAM_PORT", "8080"))
WIDTH = int(os.environ.get("CAM_WIDTH", "640"))
HEIGHT = int(os.environ.get("CAM_HEIGHT", "480"))
FPS = int(os.environ.get("CAM_FPS", "20"))
QUALITY = int(os.environ.get("CAM_QUALITY", "75"))
HFLIP = os.environ.get("CAM_HFLIP", "0") == "1"
VFLIP = os.environ.get("CAM_VFLIP", "0") == "1"

logging.basicConfig(level=logging.INFO, format="[pi-camera] %(message)s")

INDEX_PAGE = f"""<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi Camera Stream</title>
<style>body{{margin:0;background:#0b0f14;color:#e6edf3;font-family:system-ui,sans-serif;
display:grid;place-items:center;min-height:100vh;gap:12px}}img{{max-width:100%;border-radius:12px}}</style>
</head><body>
<h1>Pi Camera — {WIDTH}x{HEIGHT} @ {FPS}fps</h1>
<img src="/stream" alt="Live MJPEG-ström från Raspberry Pi-kameran">
<p><code>/stream</code> · <code>/snapshot</code> · <code>/health</code></p>
</body></html>"""


class StreamBuffer(io.BufferedIOBase):
    """Tar emot JPEG-ramar från encodern och väcker väntande klienter."""

    def __init__(self) -> None:
        self.frame: bytes | None = None
        self.condition = threading.Condition()
        self.frames = 0

    def write(self, buf):  # type: ignore[override]
        with self.condition:
            self.frame = bytes(buf)
            self.frames += 1
            self.condition.notify_all()
        return len(buf)

    def wait_frame(self, timeout: float = 5.0) -> bytes | None:
        with self.condition:
            if not self.condition.wait(timeout):
                return None
            return self.frame


output = StreamBuffer()


class StreamHandler(server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # tystare loggar
        logging.debug(fmt % args)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0]

        if path == "/":
            body = INDEX_PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/health":
            body = json.dumps(
                {
                    "ok": True,
                    "width": WIDTH,
                    "height": HEIGHT,
                    "fps": FPS,
                    "quality": QUALITY,
                    "frames": output.frames,
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/snapshot":
            frame = output.wait_frame()
            if frame is None:
                self.send_error(503, "No frame available")
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(frame)))
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(frame)
            return

        if path == "/stream":
            self.send_response(200)
            self.send_header("Age", "0")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Connection", "close")
            self.send_header(
                "Content-Type", "multipart/x-mixed-replace; boundary=FRAME"
            )
            self._cors()
            self.end_headers()
            try:
                while True:
                    frame = output.wait_frame()
                    if frame is None:
                        continue
                    self.wfile.write(b"--FRAME\r\n")
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(frame)))
                    self.end_headers()
                    self.wfile.write(frame)
                    self.wfile.write(b"\r\n")
            except (BrokenPipeError, ConnectionResetError):
                logging.info("Klient kopplade från: %s", self.client_address[0])
            return

        self.send_error(404)


class StreamingServer(socketserver.ThreadingMixIn, server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    picam2 = Picamera2()
    config = picam2.create_video_configuration(
        main={"size": (WIDTH, HEIGHT)},
        controls={"FrameRate": FPS},
        transform=Transform(hflip=HFLIP, vflip=VFLIP),
    )
    picam2.configure(config)
    picam2.start_recording(JpegEncoder(q=QUALITY), FileOutput(output))
    logging.info("Streamar på http://0.0.0.0:%d/stream", PORT)

    try:
        StreamingServer(("", PORT), StreamHandler).serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        picam2.stop_recording()
        logging.info("Kameran stoppad")


if __name__ == "__main__":
    main()
