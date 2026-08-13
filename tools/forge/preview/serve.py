# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Static server for the forge preview + POST /save for screenshots.

    ~/opt/dice-forge/venv/bin/python tools/forge/preview/serve.py [port]

Serves the REPO ROOT (so /vendor/three.module.js and /tools/forge/out/*.glb
resolve) on an ephemeral port by default. POST /save?name=x.png with a PNG
data-URL body writes tools/forge/shots/x.png — that is how a hidden Browser
pane still produces reviewable renders (rAF never fires there; the pages
render explicitly and push pixels here).

Port 8123 is the live table and is refused outright.
"""
import base64
import http.server
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHOTS = os.path.join(HERE, "..", "shots")
os.makedirs(SHOTS, exist_ok=True)


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=REPO, **k)

    def do_POST(self):
        if not self.path.startswith("/save"):
            self.send_error(404)
            return
        m = re.search(r"name=([A-Za-z0-9._-]+\.png)", self.path)
        if not m:
            self.send_error(400, "need ?name=file.png")
            return
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n).decode()
        b64 = body.split(",", 1)[1] if body.startswith("data:") else body
        dest = os.path.abspath(os.path.join(SHOTS, m.group(1)))
        with open(dest, "wb") as f:
            f.write(base64.b64decode(b64))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(f"saved {dest} {os.path.getsize(dest)}b".encode())

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 0
if port == 8123:
    raise SystemExit("8123 is the live table; the preview server will not take it")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
print(f"serving {REPO} on http://127.0.0.1:{srv.server_address[1]}", flush=True)
print(f"viewer:  http://127.0.0.1:{srv.server_address[1]}/tools/forge/preview/viewer.html"
      f"?m=/tools/forge/out/<slug>.glb", flush=True)
srv.serve_forever()
