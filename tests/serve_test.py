#!/usr/bin/env python3
"""Offline checks for serve.py's library API -- plain script, no runner.

The interesting part is what the server refuses: a name that could leave the
data directory, a body that is too big, and any write at all when the server is
reachable from off the machine.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import serve  # noqa: E402

passed = failed = 0


def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print("ok   " + name)
    except Exception as e:                                  # noqa: BLE001
        failed += 1
        print("FAIL %s: %s" % (name, e))


# ---------- names ----------
def t_names():
    for good in ("stage1.bin", "shared.xdf", "a-b_c.1.BIN"):
        assert serve.safe_name(good) == good, good
    for bad in ("../etc/passwd", "a/b.bin", "..bin", ".hidden.bin", "x.txt",
                "", "a" * 200 + ".bin", "a\\b.bin", "%2e%2e%2fx.bin"):
        assert serve.safe_name(bad) is None, bad


def t_kind():
    assert serve.kind_of("a.xdf") == "defs"
    assert serve.kind_of("A.XDF") == "defs"
    assert serve.kind_of("a.bin") == "bins"


# ---------- arguments ----------
def t_args():
    port, host = serve.parse_args([], {})
    assert (port, host) == (8123, "127.0.0.1"), (port, host)
    assert serve.DATA_DIR is None and serve.ALLOW_REMOTE_WRITES is False

    port, host = serve.parse_args(["9000", "0.0.0.0", "--data", "/tmp/x"], {})
    assert (port, host) == (9000, "0.0.0.0")
    assert serve.DATA_DIR == "/tmp/x"

    serve.parse_args([], {"DATA_DIR": "/tmp/y", "ALLOW_REMOTE_WRITES": "1"})
    assert serve.DATA_DIR == "/tmp/y" and serve.ALLOW_REMOTE_WRITES is True
    # the flag form has to work too, since the container passes arguments
    serve.parse_args(["--data=/tmp/z", "--allow-remote-writes"], {})
    assert serve.DATA_DIR == "/tmp/z" and serve.ALLOW_REMOTE_WRITES is True


def t_loopback():
    assert serve.is_loopback("127.0.0.1") and serve.is_loopback("::1")
    assert not serve.is_loopback("0.0.0.0") and not serve.is_loopback("192.168.5.1")


# ---------- a live server ----------
class Server:
    def __init__(self, data, loopback=True, allow_remote=False):
        serve.DATA_DIR = data
        serve.LOOPBACK = loopback
        serve.ALLOW_REMOTE_WRITES = allow_remote
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), serve.NoCacheHandler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def url(self, path):
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def call(self, method, path, body=None):
        req = urllib.request.Request(self.url(path), data=body, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except (urllib.error.URLError, OSError):
            # the server answers an oversize PUT before draining the body, so
            # the client's own write can fail first -- refused either way
            return 0, b""

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def with_server(fn, **kw):
    data = tempfile.mkdtemp(prefix="viewer-lib-")
    srv = Server(data, **kw)
    try:
        fn(srv, data)
    finally:
        srv.close()
        shutil.rmtree(data, ignore_errors=True)
        serve.DATA_DIR = None


def t_round_trip():
    def body(srv, data):
        code, raw = srv.call("PUT", "/api/library/file/stage1.bin", b"\x01\x02\x03")
        assert code == 200, code
        assert os.path.isfile(os.path.join(data, "stage1.bin"))

        code, raw = srv.call("GET", "/api/library")
        assert code == 200
        listed = json.loads(raw)
        assert [f["name"] for f in listed["bins"]] == ["stage1.bin"], listed
        assert listed["defs"] == []
        assert listed["bins"][0]["size"] == 3

        code, raw = srv.call("GET", "/api/library/file/stage1.bin")
        assert (code, raw) == (200, b"\x01\x02\x03")

        code, _ = srv.call("DELETE", "/api/library/file/stage1.bin")
        assert code == 200
        assert not os.path.exists(os.path.join(data, "stage1.bin"))
    with_server(body)


def t_traversal_refused():
    def body(srv, data):
        outside = os.path.join(os.path.dirname(data), "escaped.bin")
        for path in ("/api/library/file/..%2f..%2fescaped.bin",
                     "/api/library/file/../escaped.bin",
                     "/api/library/file/notes.txt"):
            code, _ = srv.call("PUT", path, b"x")
            assert code in (400, 404), (path, code)
        assert not os.path.exists(outside)
    with_server(body)


def t_partial_upload_is_not_listed():
    def body(srv, data):
        # a name the listing must ignore even if it is left behind
        open(os.path.join(data, ".stage1.bin.part"), "wb").write(b"half")
        code, raw = json.loads(srv.call("GET", "/api/library")[1]), None
        assert code["bins"] == [] and code["defs"] == []
    with_server(body)


def t_oversize_refused():
    def body(srv, data):
        big = b"x" * (serve.MAX_UPLOAD + 1)
        code, _ = srv.call("PUT", "/api/library/file/huge.bin", big)
        assert code in (413, 0), code
        assert not os.path.exists(os.path.join(data, "huge.bin"))
    with_server(body)


def t_remote_writes_refused():
    def body(srv, data):
        open(os.path.join(data, "stage1.bin"), "wb").write(b"keep")
        code, _ = srv.call("PUT", "/api/library/file/other.bin", b"x")
        assert code == 403, code
        code, _ = srv.call("DELETE", "/api/library/file/stage1.bin")
        assert code == 403, code
        assert os.path.isfile(os.path.join(data, "stage1.bin"))
        # reading stays open: the exposure that matters is replacing an image
        assert srv.call("GET", "/api/library")[0] == 200
    with_server(body, loopback=False, allow_remote=False)


def t_an_unwritable_library_answers_instead_of_dropping_the_connection():
    """The container case: the library is mounted, but this process cannot write
    to it. That used to raise inside the handler and hand the client a dead
    connection with no status at all."""
    if os.getuid() == 0:
        print("   (skipped: root ignores the mode bits)")
        return

    def body(srv, data):
        os.chmod(data, 0o555)
        try:
            code, raw = srv.call("PUT", "/api/library/file/stage1.bin", b"xyz")
            assert code == 500, code
            assert b"write failed" in raw, raw
            assert not os.path.exists(os.path.join(data, "stage1.bin"))
            # nothing half-written is left lying about either
            assert os.listdir(data) == [], os.listdir(data)
        finally:
            os.chmod(data, 0o755)
    with_server(body)


def t_writable_says_what_it_finds():
    d = tempfile.mkdtemp(prefix="viewer-w-")
    try:
        assert serve.writable(d) is True
        if os.getuid() != 0:
            os.chmod(d, 0o555)
            assert serve.writable(d) is False
            os.chmod(d, 0o755)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def t_no_library_without_a_data_dir():
    serve.DATA_DIR = None
    serve.LOOPBACK = True
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), serve.NoCacheHandler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        req = urllib.request.Request("http://127.0.0.1:%d/api/library" % port)
        try:
            urllib.request.urlopen(req)
            raise AssertionError("expected 404")
        except urllib.error.HTTPError as e:
            assert e.code == 404, e.code
    finally:
        httpd.shutdown()
        httpd.server_close()


def t_static_still_served():
    def body(srv, data):
        code, raw = srv.call("GET", "/index.html")
        assert code == 200 and b"ECU map viewer" in raw
    with_server(body)


for name, fn in [
    ("a library name cannot leave the data directory", t_names),
    ("an .xdf is a definition and a .bin is an image", t_kind),
    ("arguments and environment both configure the library", t_args),
    ("loopback is recognised", t_loopback),
    ("put, list, get and delete round-trip", t_round_trip),
    ("traversal and foreign extensions are refused", t_traversal_refused),
    ("a half-received upload is not listed", t_partial_upload_is_not_listed),
    ("an oversize body is refused before it lands", t_oversize_refused),
    ("writes are refused when the server is not on a loopback", t_remote_writes_refused),
    ("an unwritable library answers instead of dropping the connection",
     t_an_unwritable_library_answers_instead_of_dropping_the_connection),
    ("the writability probe reports what it finds", t_writable_says_what_it_finds),
    ("without a data directory there is no library at all", t_no_library_without_a_data_dir),
    ("the static page is still served", t_static_still_served),
]:
    test(name, fn)

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
