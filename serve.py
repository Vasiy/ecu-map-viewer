#!/usr/bin/env python3
"""Local server for the viewer.

python3 -m http.server sends no Cache-Control, so a browser (Safari in
particular) may keep a stale index.html next to a fresh js/app.js -- a mix that
breaks the page in ways that look like a bug in the app. This one says
no-store, the same thing onboard-logger does for its own static files.

    python3 serve.py [port] [host]

Host and port also come from the PORT and HOST environment variables, which is
how the Docker image runs it: a container has to listen on 0.0.0.0 to be
reachable from outside, while a local run stays on the loopback address.
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8123


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", DEFAULT_PORT))
    host = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("HOST", DEFAULT_HOST)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer((host, port), NoCacheHandler)
    shown = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    print("ECU map viewer on http://%s:%d/  (Ctrl+C to stop)" % (shown, port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
