# ECU map viewer

Reads Magneti Marelli **IAW 5AM** firmware dumps (Ducati / Moto Morini) through their
TunerPro `.xdf` definitions and draws the calibration tables — ignition, fuel, and every
other table the definition carries — as 3-D surfaces. Several firmwares go into one scene
so you can see where the calibrations part company: a step that should be smooth, an
unblended seam between grid points, a different shape on another platform.

A static page: no build step, no dependencies, no network. It runs from a folder, from a
container, or from the board that serves its own Wi-Fi access point.

**Instructions in your language:**
[English](README.md) ·
[Čeština](docs/README.cs.md) ·
[Deutsch](docs/README.de.md) ·
[Español](docs/README.es.md) ·
[Français](docs/README.fr.md) ·
[Italiano](docs/README.it.md) ·
[Nederlands](docs/README.nl.md) ·
[Polski](docs/README.pl.md) ·
[Suomi](docs/README.fi.md) ·
[Svenska](docs/README.sv.md) ·
[Ελληνικά](docs/README.el.md) ·
[Български](docs/README.bg.md) ·
[Русский](docs/README.ru.md)

## Run it

### With Docker

```bash
docker build -t ecu-map-viewer .
docker run --rm -p 8123:8123 ecu-map-viewer
```

Or with Compose:

```bash
docker compose up --build
```

Then open <http://127.0.0.1:8123/>. The container serves the same files the local run
serves, through the same `serve.py`; nothing is fetched from the internet at any point.
To use another port, map it: `docker run --rm -p 9000:8123 ecu-map-viewer`.

### Without Docker

Python 3 is all you need — it ships with macOS and every Linux distribution:

```bash
python3 serve.py          # http://127.0.0.1:8123/
python3 serve.py 9000     # another port
```

Opening `index.html` straight from disk works too, but a local server is safer: some
browsers restrict what a page loaded over `file://` may read.

`serve.py` sends `Cache-Control: no-store`. That matters after an update — `python3 -m
http.server` sends no cache headers at all, and a browser can end up running a stale
`index.html` beside a fresh `js/app.js`.

## Load a firmware

Drag a `.bin` and its `.xdf` into the left panel, or press **Choose files**. **The two
files must have the same name** — `firmware.bin` + `firmware.xdf`. Drop as many pairs
as you like; each becomes a card in the list with its own colour.

The name in the card is editable. Whatever you type is what the tooltip, the legend and
the cross-section curve will call that firmware.

### A .bin without its .xdf

The card offers a platform preset instead: the built-in address of the Ignition Main
table and the axes this ECU family shares.

| Platform | Address |
|---|---|
| Moto Morini Granpasso (23EC) | `0x4856E` |
| Ducati Multistrada 1100 DP | `0x484DE` |
| Ducati 1198 Stock | `0x48634` |
| Ducati Hypermotard 1100 | `0x4856E` |

A preset is the fallback. Your own XDF is always better: it carries the real axes, the
real scaling formulas, and every other table.

## Pick a map

An XDF holds dozens of tables, so the **Map** selector groups them:

- **Same map across platforms** — roles. The same table is named differently in every
  definition (`Ignition Main advance`, `Ignition - Main`, `Ignition map`); a role gathers
  them, so one pick draws every firmware.
- **Surfaces (3D)** — exact titles from the definition.
- **Curves (1D)** — one-dimensional tables, drawn as an ordinary line chart.

The counter beside each entry (`2/3`) says how many of the loaded firmwares carry that
table. A firmware that does not is marked in red on its card.

## Compare

- Rotate by dragging, zoom with the wheel, hover a surface to read RPM, throttle and the
  cell value.
- The checkbox on a card shows and hides that surface. **The z axis and the colour scales
  follow the visible firmwares only** — hiding one rescales the scene to what is left, so
  a hump on a single map cannot be flattened by a map you are not looking at.
- Every surface keeps its own colour scale, so toggling one never repaints the others.
- Contours are drawn on the surface and projected onto all three planes: the floor
  (RPM × throttle), the back wall (throttle × value) and the side wall (RPM × value).

**Difference** turns the selected baseline into the reference and shows the others as
deltas against it. Breakpoints differ between platforms (2.4° against 2.2° at the first
throttle point), so a map is resampled bilinearly onto the baseline's axes rather than
matched cell by cell.

**Cross-section** cuts the map at a fixed RPM or a fixed throttle angle. The cut appears
twice: as a line drawn on the surfaces themselves, each in its firmware's colour, and as
a 2-D chart below the scene. The slider moves both.

**PNG** saves the current view. The **i** button, top right, has a short description and
a link to this repository.

## Language and appearance

Thirteen languages, picked in the header: English, Čeština, Deutsch, Español, Français,
Italiano, Nederlands, Polski, Suomi, Svenska, Ελληνικά, Български, Русский. Until you
choose, the browser's own language decides, falling back to English. Light and dark
themes; both choices are remembered in the browser.

## What is read from the XDF

- `<XDFTABLE>` → title, categories, three axes;
- `EMBEDDEDDATA`: address, cell size, row and column strides, type flags (`0x01` signed,
  `0x02` little-endian, `0x04` floating point), with `<DEFAULTS>` from the header when the
  flags are absent;
- `<MATH equation="X/10">` is evaluated by a shunting-yard parser rather than `eval` — an
  XDF from the internet must not run code in the page;
- axis values come from a linked legend table (`<embedinfo linkobjid=...>`, which is how
  the 5AM files store the RPM and throttle breakpoints), from the axis' own address, from
  static `<LABEL>` entries, or, failing all three, from the cell index.

The Ignition Main table in this family is 32 RPM points × 20 throttle points, `uint16 LE`,
angle = `raw / 10`.

## Tests

```bash
node tests/run.js        # offline suite: xml, expressions, binary reads, xdf, grid, i18n
```

Browser checks need playwright and firmware images in `testdata/` (git-ignored):

```bash
python3 serve.py &
npm i playwright && npx playwright install chromium
node tests/browser.mjs   # contours, axis ranges, cross-section, difference, PNG
```

## Using it inside onboard-logger

No dependencies and no build step, and Plotly is vendored in `vendor/`, so the page works
on a board with no route to the internet:

1. copy `js/`, `css/`, `vendor/` and `index.html` into `app/static/maps/`;
2. serve the directory statically (`main.py` already serves `/static/*` with
   `Cache-Control: no-cache`);
3. the strings already follow that project's rules (`t(key)`, `data-i18n`) and eight of
   the locales match it, so the keys move across as they are.

## Layout

| File | What it does |
|---|---|
| `js/xml.js` | minimal XML reader (same code in the browser and under node) |
| `js/expr.js` | evaluates `MATH` formulas without `eval` |
| `js/binio.js` | reads cells from the image per the `EMBEDDEDDATA` geometry |
| `js/xdf.js` | the XDF model: tables, axes, reading a table out of a firmware |
| `js/presets.js` | built-in definitions for a `.bin` with no XDF |
| `js/grid.js` | ranges, bilinear sampling, difference, cross-sections |
| `js/viewer.js` | the Plotly layer: surfaces, contours, axis ranges |
| `js/app.js` | file loading, datasets, modes |
| `js/i18n.js` | interface strings, 13 locales |
| `serve.py` | local server with cache disabled |
| `Dockerfile` | the same server in a container |
