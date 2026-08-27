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
node tests/run.js                 # offline suite: xml, expr, binio, xdf, grid, i18n
python3 serve.py                  # serve the page (no-store headers) on 8123
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

**Titles differ per platform**, so `ROLES` in `js/app.js` matches a map by meaning
("Ignition Main advance" / "Ignition - Main" / "Ignition map" are all `@ign-main`).
Add a role there rather than special-casing a title elsewhere.

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
