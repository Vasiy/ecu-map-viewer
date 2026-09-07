#!/usr/bin/env python3
"""Local server for the viewer.

python3 -m http.server sends no Cache-Control, so a browser (Safari in
particular) may keep a stale index.html next to a fresh js/app.js -- a mix that
breaks the page in ways that look like a bug in the app. This one says
no-store, the same thing onboard-logger does for its own static files.

    python3 serve.py [port] [host] [--data DIR] [--allow-remote-writes]

Host and port also come from the PORT and HOST environment variables, which is
how the Docker image runs it: a container has to listen on 0.0.0.0 to be
reachable from outside, while a local run stays on the loopback address.

With --data (or DATA_DIR) it also keeps a small library of firmware images and
definitions, so a standalone viewer holds its own files instead of asking for
the same drag-and-drop every time it is opened. Without one there is no library
API at all -- a plain static server, exactly as before.
"""
import json
import os
import posixpath
import re
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8123

# a firmware image is 320 KB and the biggest definition seen is ~110 KB; the cap
# is only here so a wrong POST cannot fill the disk
MAX_UPLOAD = 8 * 1024 * 1024
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(bin|xdf)$", re.I)

DATA_DIR = None
ALLOW_REMOTE_WRITES = False
LOOPBACK = False


def safe_name(name):
    """A library name is one plain file name, nothing that can leave the dir."""
    name = urllib.parse.unquote(name)
    if not SAFE_NAME.match(name) or "/" in name or "\\" in name or ".." in name:
        return None
    return name


def kind_of(name):
    return "defs" if name.lower().endswith(".xdf") else "bins"


def listing():
    out = {"bins": [], "defs": []}
    if not DATA_DIR or not os.path.isdir(DATA_DIR):
        return out
    for entry in sorted(os.listdir(DATA_DIR)):
        if not safe_name(entry):
            continue
        path = os.path.join(DATA_DIR, entry)
        if not os.path.isfile(path):
            continue
        st = os.stat(path)
        out[kind_of(entry)].append(
            {"name": entry, "size": st.st_size, "mtime": st.st_mtime})
    return out


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # ---- library ---------------------------------------------------------
    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _lib_path(self):
        """The name this request addresses, or None when it is not a file call."""
        path = posixpath.normpath(urllib.parse.urlsplit(self.path).path)
        if not path.startswith("/api/library/file/"):
            return None
        return safe_name(path[len("/api/library/file/"):])

    def _may_write(self):
        # the container binds 0.0.0.0 on purpose, and an open PUT/DELETE over
        # the network would let anyone replace a firmware image; opting in is
        # deliberate and visible in docker-compose.yml
        return LOOPBACK or ALLOW_REMOTE_WRITES

    def _library_request(self):
        return urllib.parse.urlsplit(self.path).path.startswith("/api/library")

    def do_GET(self):
        if self._library_request():
            if not DATA_DIR:
                return self._json(404, {"error": "no library"})
            path = urllib.parse.urlsplit(self.path).path
            if path.rstrip("/") == "/api/library":
                return self._json(200, listing())
            name = self._lib_path()
            if not name:
                return self._json(400, {"error": "bad name"})
            full = os.path.join(DATA_DIR, name)
            if not os.path.isfile(full):
                return self._json(404, {"error": "not found"})
            with open(full, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        return super().do_GET()

    def do_PUT(self):
        if not self._library_request():
            return self.send_error(405)
        if not DATA_DIR:
            return self._json(404, {"error": "no library"})
        if not self._may_write():
            return self._json(403, {"error": "read-only"})
        name = self._lib_path()
        if not name:
            return self._json(400, {"error": "bad name"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._json(400, {"error": "bad length"})
        if length <= 0 or length > MAX_UPLOAD:
            return self._json(413, {"error": "too large"})
        body = self.rfile.read(length)
        if len(body) != length:
            return self._json(400, {"error": "short read"})
        tmp = os.path.join(DATA_DIR, "." + name + ".part")
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            # written aside and renamed, so a half-received image never appears
            # in the listing under its real name
            with open(tmp, "wb") as fh:
                fh.write(body)
            os.replace(tmp, os.path.join(DATA_DIR, name))
        except OSError as exc:
            # a container whose library is mounted read-only, or owned by
            # someone else, used to raise here and drop the connection: the
            # client saw no status at all and could not say what went wrong
            try:
                os.unlink(tmp)
            except OSError:
                pass
            return self._json(500, {"error": "write failed", "detail": str(exc)})
        return self._json(200, {"name": name, "size": len(body)})

    def do_DELETE(self):
        if not self._library_request():
            return self.send_error(405)
        if not DATA_DIR:
            return self._json(404, {"error": "no library"})
        if not self._may_write():
            return self._json(403, {"error": "read-only"})
        name = self._lib_path()
        if not name:
            return self._json(400, {"error": "bad name"})
        full = os.path.join(DATA_DIR, name)
        try:
            if os.path.isfile(full):
                os.remove(full)
        except OSError as exc:
            return self._json(500, {"error": "delete failed", "detail": str(exc)})
        return self._json(200, {"name": name})


def writable(path):
    """Can this process actually write there? Asked at start-up, because a
    library that only fails on the first upload is a library that looks fine."""
    probe = os.path.join(path, ".write-probe")
    try:
        os.makedirs(path, exist_ok=True)
        with open(probe, "wb"):
            pass
        os.unlink(probe)
        return True
    except OSError:
        return False


def is_loopback(host):
    return host in ("127.0.0.1", "::1", "localhost", "")


def parse_args(argv, env):
    """Positional port/host as before, plus the two library flags."""
    global DATA_DIR, ALLOW_REMOTE_WRITES
    rest, data, allow = [], env.get("DATA_DIR"), env.get("ALLOW_REMOTE_WRITES")
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--data" and i + 1 < len(argv):
            data = argv[i + 1]; i += 2; continue
        if arg.startswith("--data="):
            data = arg.split("=", 1)[1]; i += 1; continue
        if arg == "--allow-remote-writes":
            allow = "1"; i += 1; continue
        rest.append(arg); i += 1
    port = int(rest[0]) if rest else int(env.get("PORT", DEFAULT_PORT))
    host = rest[1] if len(rest) > 1 else env.get("HOST", DEFAULT_HOST)
    DATA_DIR = os.path.abspath(data) if data else None
    ALLOW_REMOTE_WRITES = str(allow or "").lower() in ("1", "true", "yes", "on")
    return port, host


def main():
    global LOOPBACK
    port, host = parse_args(sys.argv[1:], os.environ)
    LOOPBACK = is_loopback(host)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer((host, port), NoCacheHandler)
    shown = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    print("ECU map viewer on http://%s:%d/  (Ctrl+C to stop)" % (shown, port), flush=True)
    if DATA_DIR:
        if not (LOOPBACK or ALLOW_REMOTE_WRITES):
            why = "  (read-only: not on a loopback address)"
        elif not writable(DATA_DIR):
            why = "  (read-only: %s is not writable by uid %d)" % (DATA_DIR, os.getuid())
        else:
            why = ""
        print("library: %s%s" % (DATA_DIR, why), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
