#!/bin/sh
# Make the library writable, then stop being root.
#
# The container serves files, so it has no business running as root -- but the
# library is a bind mount, and Docker creates a missing host directory owned by
# root. The image's own `chown nobody /data` is underneath that mount and does
# nothing for it, which left the store read-only however ALLOW_REMOTE_WRITES was
# set. Fixing ownership has to happen here, after the mount exists, and the
# server itself still runs unprivileged.
#
# A read-only mount, or one the host deliberately owns differently, is left
# alone: serve.py says so at start-up rather than failing later on a write.
set -e

DIR="${DATA_DIR:-}"
if [ -n "$DIR" ]; then
  mkdir -p "$DIR" 2>/dev/null || true
  if [ ! -w "$DIR" ] || [ "$(stat -c %u "$DIR" 2>/dev/null)" != "65534" ]; then
    chown nobody:nobody "$DIR" 2>/dev/null || true
  fi
fi

exec su-exec nobody "$@"
