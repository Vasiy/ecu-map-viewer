# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A dependency-free browser page that reads IAW 5AM firmware dumps (`.bin`) through
TunerPro definitions (`.xdf`) and draws the calibration tables as 3-D surfaces.
`README.md` (Russian) is the user-facing document; read it first.

## Commands

```bash
node tests/run.js                 # offline suite: xml, expr, binio, xdf, grid
python3 -m http.server 8123       # serve the page from the repo root
node -e "new Function(require('fs').readFileSync('js/app.js','utf8'))"   # JS syntax check
node tests/browser.mjs            # browser checks (needs playwright + testdata/)
```

i18n parity is an invariant — `en` and `ru` must hold identical key sets:

```bash
node -e "const I=require('./js/i18n.js');const en=Object.keys(I.locales.en),ru=Object.keys(I.locales.ru);
console.log(en.length,ru.length,en.filter(k=>!ru.includes(k)).concat(ru.filter(k=>!en.includes(k))))"
```

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
