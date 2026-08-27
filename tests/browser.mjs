/*
 * Browser check: drives the real page with real firmware.
 *
 * Needs playwright's chromium and a static server on 8123 (see the header of
 * this file's console output for the command). It is not part of the offline
 * suite -- tests/run.js stays dependency-free.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const shots = process.env.SHOT_DIR || '/tmp';
const errors = [];

const drop = async (page, names) => {
  await page.evaluate(async (files) => {
    const dt = new DataTransfer();
    for (const name of files) {
      const buf = await (await fetch('testdata/' + name)).arrayBuffer();
      dt.items.add(new File([buf], name));
    }
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, names);
  await page.waitForTimeout(1200);
};

const zRange = (page) => page.evaluate(() => {
  const gd = document.getElementById('plot');
  return gd._fullLayout.scene.zaxis.range.map((v) => Math.round(v * 100) / 100);
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(400);

await drop(page, ['granpasso.bin', 'granpasso.xdf', 'multistrada.bin', 'multistrada.xdf', 'ducati1198.bin', 'ducati1198.xdf']);

const report = {};
report.datasets = await page.locator('.ds').count();
report.table = await page.locator('#tableSel').inputValue();
report.tableOptions = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#tableSel optgroup')).map((g) => g.label + ': ' + g.children.length));
report.traces = await page.evaluate(() => document.getElementById('plot').data.length);
report.baseFieldHiddenInSurfaceMode = !(await page.locator('#baseField').isVisible());
report.contours = await page.evaluate(() => {
  const c = document.getElementById('plot').data[0].contours;
  return { x: c.x.show && c.x.project.x, y: c.y.show && c.y.project.y, z: c.z.show && c.z.project.z };
});
report.cRanges = await page.evaluate(() =>
  document.getElementById('plot').data.map((d) => [Math.round(d.cmin * 10) / 10, Math.round(d.cmax * 10) / 10]));
report.zAll = await zRange(page);

await page.screenshot({ path: shots + '/shot-1-surfaces.png' });

// hide two datasets -> the z axis must shrink to the one left visible
await page.locator('.ds .vis').nth(1).uncheck();
await page.locator('.ds .vis').nth(2).uncheck();
await page.waitForTimeout(600);
report.zOneVisible = await zRange(page);
await page.screenshot({ path: shots + '/shot-2-one-visible.png' });

await page.locator('.ds .vis').nth(1).check();
await page.locator('.ds .vis').nth(2).check();
await page.waitForTimeout(400);

// custom display name shows up on the trace
await page.locator('.ds .ds-name').first().fill('Granpasso — stock');
await page.waitForTimeout(600);
report.traceName = await page.evaluate(() => document.getElementById('plot').data[0].name);

// every platform must resolve the same map through its role
report.tracesForRole = await page.evaluate(() => document.getElementById('plot').data.length);
report.noMapCards = await page.locator('.ds .warn').count();

// hover tooltip over the surface
const box = await page.locator('#plot').boundingBox();
await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 });
await page.waitForTimeout(900);
report.hover = await page.evaluate(() => {
  const nodes = document.querySelectorAll('#plot .hovertext text, #plot .hoverlayer text');
  return Array.from(nodes).map((n) => n.textContent).join(' | ').slice(0, 140);
});

// cross-section
await page.locator('#sliceSel').selectOption('rpm');
await page.waitForTimeout(500);
await page.locator('#sliceRange').fill('20');
await page.waitForTimeout(500);
report.sliceTraces = await page.evaluate(() => document.getElementById('slicePlot').data.length);
report.sliceLabel = await page.locator('#sliceValue').textContent();
await page.screenshot({ path: shots + '/shot-3-slice.png' });

// difference mode
await page.locator('[data-mode="diff"]').click();
await page.waitForTimeout(800);
report.diffTraces = await page.evaluate(() => document.getElementById('plot').data.length);
report.baseBadge = await page.locator('.ds.is-base .badge').count();
report.baseFieldVisible = await page.locator('#baseField').isVisible();
report.diffRange = await zRange(page);
await page.screenshot({ path: shots + '/shot-4-diff.png' });
await page.locator('[data-mode="surface"]').click();
await page.waitForTimeout(400);

// a lone .bin must fall back to a preset definition
await drop(page, ['tuned.bin']);
report.presetSelects = await page.locator('.ds .preset').count();
await page.locator('.ds .preset').first().selectOption('granpasso');
await page.waitForTimeout(900);
report.tracesAfterPreset = await page.evaluate(() => document.getElementById('plot').data.length);

// PNG export must actually hand the browser a file
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
  page.locator('#btnPng').click()
]);
report.pngDownload = download ? download.suggestedFilename() : null;

// light theme + english
await page.locator('#btnTheme').click();
await page.waitForTimeout(600);
await page.locator('#btnLang').click();
await page.waitForTimeout(600);
report.lang = await page.locator('#btnLang').textContent();
await page.screenshot({ path: shots + '/shot-5-light-en.png' });

// narrow layout
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: shots + '/shot-6-mobile.png' });
report.horizontalOverflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);

report.consoleErrors = errors;
console.log(JSON.stringify(report, null, 2));
await browser.close();
