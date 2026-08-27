#!/usr/bin/env python3
"""Local dev server for the viewer.

python3 -m http.server sends no Cache-Control, so a browser (Safari in
particular) may keep a stale index.html next to a fresh js/app.js -- a mix that
breaks the page in ways that look like a bug in the app. This one says
no-store, the same thing onboard-logger does for its own static files.

    python3 serve.py [port]
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print("ECU map viewer on http://127.0.0.1:%d/  (Ctrl+C to stop)" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
