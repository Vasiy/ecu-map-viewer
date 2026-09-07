#!/usr/bin/env bash
# Pack the viewer as an onboard-logger add-on.
#
# The board holds no repository and has no internet on the bike, so the add-on
# arrives the same way an update does: as an archive the phone already has,
# picked in Config -> System. What goes in is the page and nothing else --
# no tests, no docs, no server. The board never runs a line of it.
#
# The archive root carries addon.json (that is what makes it an add-on rather
# than a folder of files) beside index.html; the board puts the page under
# addons/<name>/web/ and keeps a data/ directory next to it for the definitions
# the viewer stores. Removing the add-on removes both.
#
#   ./release-addon.sh            # run the suites, then pack
#   ./release-addon.sh --no-tests # pack what is here now
set -euo pipefail
cd "$(dirname "$0")"

NAME=maps
TITLE="ECU map viewer"
VERSION=$(cat VERSION)
OUT=dist

run_tests() {
  echo "== offline suite"
  node tests/run.js
  node tests/ui_links.js
  node tests/ui_library.js
  python3 tests/serve_test.py
  node -e "new Function(require('fs').readFileSync('js/app.js','utf8'))"
  echo "== ok"
}

[ "${1:-}" = "--no-tests" ] || run_tests

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nogit)
DIRTY=""
git diff --quiet 2>/dev/null || DIRTY="-dirty"
STAMP="$VERSION$DIRTY"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# addon.json is the manifest the board validates; "name" becomes the directory
# and the URL, so it is a slug, not a title.
cat > "$STAGE/addon.json" <<JSON
{
  "name": "$NAME",
  "version": "$STAMP",
  "title": "$TITLE",
  "commit": "$SHA"
}
JSON

cp index.html "$STAGE/"
cp -R css js vendor "$STAGE/"

mkdir -p "$OUT"
ARCHIVE="$OUT/ecu-map-viewer-addon-$VERSION-$SHA.tar.gz"
# named rather than ".", so the archive carries no entry for its own root
tar -czf "$ARCHIVE" -C "$STAGE" addon.json index.html css js vendor

echo
echo "$ARCHIVE"
du -h "$ARCHIVE" | cut -f1
echo "Install it in onboard-logger: Config -> System -> Add-ons."
