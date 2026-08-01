#!/usr/bin/env node
// Minimal static file server for the Pi (fallback if nginx is not installed).
// Usage: node pi-server.js
// Serves the current folder on port 3000.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const PORT = process.env.PORT || 3000;
const ROOT = process.env.ROOT || ".";

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const filePath = join(ROOT, pathname);

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      res.writeHead(302, { Location: `${pathname}/` });
      res.end();
      return;
    }

    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch {
    // SPA fallback
    try {
      const index = await readFile(join(ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-cache" });
      res.end(index);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }
});

server.listen(PORT, () => {
  console.log(`RC Control Station server running on http://0.0.0.0:${PORT}`);
});
