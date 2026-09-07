# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A dependency-free browser page that reads IAW 5AM firmware dumps (`.bin`) through
TunerPro definitions (`.xdf`) and draws the calibration tables as 3-D surfaces.
`README.md` (English) is the user-facing document; read it first. `docs/README.<code>.md`
holds the same instructions in the other twelve interface languages — a change to how the
tool is used belongs in all thirteen, or in none.

## Commands

```bash
node tests/run.js                 # offline suite: xml, expr, binio, xdf, links, grid, i18n
node tests/ui_links.js            # js/app.js in a node vm on tests/ui_sandbox.js
node tests/ui_library.js          # the library panel, on the same stub
python3 tests/serve_test.py       # serve.py's library API: names, size, write guard
python3 serve.py                  # serve the page (no-store headers) on 8123
python3 serve.py --data ~/firmware   # ...and keep a library of .bin/.xdf there
node -e "new Function(require('fs').readFileSync('js/app.js','utf8'))"   # JS syntax check
node tests/browser.mjs            # browser checks (needs playwright + testdata/)

docker build -t ecu-map-viewer .  # the same page in a container
docker run --rm -p 8123:8123 ecu-map-viewer
```

**`serve.py` runs both ways.** Host and port come from arguments or from `HOST`/`PORT`; the
default stays on the loopback address and the image sets `HOST=0.0.0.0`, because a
container that binds to 127.0.0.1 is unreachable from outside. Keep it that way: one server
implementation means the container and the laptop behave identically, cache headers
included.

i18n parity is an invariant — all 13 locales must hold identical key sets
(`tests/run.js` guards it; this prints the detail):

```bash
node -e "const I=require('./js/i18n.js');const en=Object.keys(I.locales.en);
for(const c of Object.keys(I.locales)){const k=Object.keys(I.locales[c]);
console.log(c,k.length,'missing:',en.filter(x=>!(x in I.locales[c])).join(','))}"
```

Eight of the locales match onboard-logger (en, de, es, fr, it, nl, bg, ru) so
those strings can move there wholesale; keep the vocabulary aligned with it.
pl, sv, el, cs and fi are viewer-only. A new locale is one object in
`js/i18n.js` with the full English key set — the picker builds itself from
`I18N.list()`.

## Architecture

**Every module is UMD-ish on purpose.** `js/*.js` register on `window` in the
browser and export through `module.exports` under node, so the offline suite runs
the very same code the page runs — no build step, no test doubles.

**Where files come from is detected, never configured.** `js/store.js` has one interface
and three backends, and picks by what actually answers: **addon** when the page is served
at `/addons/<name>/` and that addon's data endpoint replies (images are the logger's
firmware directory and read-only here, definitions live in the addon's own store, so the
logger never learns what an `.xdf` is and deleting the addon directory takes its data with
it); **library** when `serve.py` was given a `--data` directory and holds both kinds; and
**none**, which is drag-and-drop exactly as before. That last one is not a fallback to
apologise for -- the page has to keep working from `file://` and from any dumb static host,
so a dead panel is hidden rather than shown broken.

**serve.py's library is off until a data directory is named, and will not be written to
from off the machine.** The container binds `0.0.0.0` on purpose, and an open `PUT` would
let anyone on the network replace a firmware image; writes need a loopback bind or an
explicit `ALLOW_REMOTE_WRITES`, which `docker-compose.yml` sets in the open. Uploads land
on a dotted temporary name and are renamed into place, so a half-received image never
appears in the listing under its real one.

**A definition belongs to an image by choice, not by file name.** Matching base names
still pair on their own, but `js/links.js` is what actually decides, and any number of
images may share one parsed document -- comparing three versions of a calibration against
one XDF used to mean three renamed copies of it. `ds.choice` ('def:<id>', 'preset:<id>' or
'') is the source of truth and `setDef()` in `js/app.js` is the only place `ds.doc` is ever
written; the grid cache belongs to the definition that filled it, so it goes when the
choice does. Deliberate links are remembered in `localStorage` under `links`, keyed by the
image's **base name** -- never by the card's display name, which is editable.

A definition is marked **generic** when, at the moment it arrived, no loaded image carried
its name; a lone generic definition is then given to every image that has none, including
the ones that arrive later. That verdict sticks to the definition rather than to the batch
it came in, because through the library the files are clicked one at a time and the XDF is
usually taken before any image exists -- a batch-only rule left every one of them bare. The
other half matters just as much: a definition that *did* match an image by name stays that
image's business, so a Granpasso definition is never quietly used to draw a Ducati.

**`js/app.js` is testable now.** It is an IIFE and exports nothing, so `tests/ui_sandbox.js`
evaluates it in a node vm on a DOM stub and `tests/ui_links.js` drives it through the
handlers it binds -- the same path a person takes. Nothing reaches inside; a behaviour that
is not wired to a control cannot be tested here. Plotly and the canvas 2-D context are
stubbed to no-ops.

**A definition is data, not code.** Naming a table, fixing an address or changing a
scale is an edit to the XDF, never to the parser. Equations go through
`js/expr.js` (shunting-yard), never `eval`/`new Function` — an XDF is untrusted
input.

**Axes resolve through a chain** (`js/xdf.js:axisValues`): linked legend table →
the axis' own address → static `<LABEL>`s → cell index. The 5AM files use the
first form, which is why loading a table can read several places in the image.

**Two range rules exist because of a real visual bug.** The shared z axis is
computed from the *visible* datasets only (`Viewer.visibleRange`), and every
surface pins its own `cmin`/`cmax`. Breaking either one makes a hidden dataset
silently distort the scene. `tests/run.js` guards the first.

**Titles differ per platform**, so `js/roles.js` matches a map by meaning: "Ignition
Main advance" / "Ignition - Main" / "Ignition map" are all `@ign-main`. Eleven roles
cover the main maps and the recurring corrections; `normTitle()` in the same file
strips the noise definitions carry — a `[corsaro]` tag, address crumbs like "4A 3 F4",
and the punctuation that only splits a name — so the exact-title group joins
"Fuel - Main" with "Fuel Main". Add a role there rather than special-casing a title
elsewhere, and keep `tests/run.js` fed with the real spellings: those tests are the
record of how each definition writes each map.

**The scene is never left empty, and hot paths never rebuild it.** Measured on
this machine (Chromium; WebKit is ~1.7x slower across the board):

| path | before | after |
|---|---|---|
| drop two pairs -> first surface | 859 ms | ~300 ms |
| opacity slider, ten steps | 1572 ms | ~210 ms |
| cross-section slider, ten steps | 2307 ms | ~480 ms |
| toggle one dataset | 530-720 ms | 330-400 ms |

Three rules produce that, and undoing any of them costs it back:

1. `draw()` puts an invisible seed surface in the scene when there is nothing to
   show. Dropping to zero traces tears the gl3d subplot down, and rebuilding it
   costs ~500 ms of context creation and shader compilation on the next drop.
2. Properties that change during a drag restyle in place (`setOpacity`,
   `updateSlice`, `drawSlice`'s restyle path) instead of going through `draw()`.
   Contours are the exception — restyling them rebuilds the mesh anyway and
   measured slower than a plain redraw, so that toggle stays a redraw.
3. A checkbox is one `Plotly.update`: visibility, the cross-section line and the
   rescaled z axis in a single redraw rather than three.

Parsing is not the bottleneck and never was: a 110 KB XDF parses in ~9 ms and a
32x20 table reads in ~2 ms. Measure before optimising anything here.

**A 1-D table is a chart, not a surface.** `isCurve()` in `js/app.js` switches the
stage to the 2-D renderer when every selected grid has a single column, and
`body.curve-mode` hides the controls that only mean something for a surface.

## Conventions

- No `alert()`/`confirm()` — `toast(msg, kind)` in `app.js`.
- All user-visible strings live in `js/i18n.js`, reached via `t(key)` or
  `data-i18n`; English is the fallback. Never hardcode display text.
- Anything from a file (names, titles, addresses) goes through `esc()` before it
  touches `innerHTML`.
- Offline first: no CDN, no web fonts. Plotly is vendored in `vendor/`.
- Responsive in two directions (`max-width: 820px`, `max-height: 500px`) plus
  `env(safe-area-inset-*)`.
- Comments explain *why* (a format quirk, a past bug), not *what*.
- `testdata/` is git-ignored; firmware images are not committed.
