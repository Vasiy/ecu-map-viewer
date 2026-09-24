'use strict';
/*
 * The drive-log panel: a dropped .csv never gets mistaken for firmware, the
 * add-on log picker lists what onboard-logger has, switching tables re-seeds
 * the axis mapping per table key, and toggling a dataset with a log loaded
 * still costs exactly one Plotly.update -- not a rebuild -- the same perf
 * rule the cross-section line already had to keep.
 */
const assert = require('assert');
const { makeSandbox, drop, file } = require('./ui_sandbox.js');
const { SAMPLE_XDF, sampleImage } = require('./fixtures.js');

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed++; console.log('ok   ' + name); },
    (e) => { failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); });
}

const settle = () => new Promise((r) => setImmediate(() => setImmediate(
  () => setImmediate(() => setImmediate(r)))));

function ok(payload) {
  const isBuf = payload instanceof ArrayBuffer || Buffer.isBuffer(payload);
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(isBuf ? payload.toString('utf8') : String(payload)),
  });
}
function notFound() {
  return Promise.resolve({ ok: false, status: 404, statusText: 'not found',
    text: () => Promise.resolve('{"error":"not found"}') });
}

/* The addon arrangement, plus onboard-logger's decoded-log API. */
function addonFetch({ bins, defs, logs }) {
  logs = logs || {};
  const writes = [];
  return Object.assign((url, init) => {
    const method = (init && init.method) || 'GET';
    if (url === '/api/firmware' && method === 'GET') {
      return ok({ files: Object.keys(bins || {}).map((n) => ({ name: n, size: bins[n].length })) });
    }
    if (url === '/api/addons/maps/data' && method === 'GET') {
      return ok({ files: Object.keys(defs || {}).map((n) => ({ name: n, size: defs[n].length })) });
    }
    if (url === '/api/logs?kind=decoded' && method === 'GET') {
      return ok({ files: Object.keys(logs).map((n) => ({
        name: n, day: n.split('/')[0], size: logs[n].length, mtime: logs[n].mtime,
      })) });
    }
    let m = /^\/api\/addons\/maps\/data\/(.+)$/.exec(url);
    if (m) {
      if (method === 'PUT') { writes.push(decodeURIComponent(m[1])); return ok({ name: m[1] }); }
      return notFound();
    }
    m = /^\/api\/logs\/(.+)\/data$/.exec(url);
    if (m) {
      const name = m[1].split('/').map(decodeURIComponent).join('/');
      return logs[name] === undefined ? notFound() : ok({ name, text: logs[name].text });
    }
    return notFound();
  }, { writes });
}

const dsRows = (S) => S.document.getElementById('dsList').children
  .filter((n) => n.tagName === 'article');
const logRows = (S) => S.document.getElementById('logList').children
  .filter((n) => n.className === 'library-row');
const toastText = (S) => S.document.getElementById('toasts').children.map((n) => n.textContent);

const RIDE_CSV = 'time,rpm,throttle\n' +
  '2026-09-09T11:27:33.774,1000,2.4\n' +
  '2026-09-09T11:27:34.774,2000,8.1\n';

async function main() {
  await test('a dropped .csv is never mistaken for firmware or written to the device', async () => {
    const f = addonFetch({ bins: {}, defs: {} });
    const S = makeSandbox({ pathname: '/addons/maps/', fetch: f });
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    assert.strictEqual(dsRows(S).length, 0);
    assert.deepStrictEqual(f.writes, []);
    assert.ok(toastText(S).some((t) => /ride\.csv/.test(t)), toastText(S).join(' | '));
  });

  await test('the add-on log list is sorted newest first and a click loads one', async () => {
    const S = makeSandbox({
      pathname: '/addons/maps/',
      fetch: addonFetch({
        bins: {}, defs: {},
        logs: {
          '09-09-2026/kline-dec-a.csv': { length: 10, mtime: 1, text: RIDE_CSV },
          '10-09-2026/kline-dec-b.csv': { length: 10, mtime: 5, text: RIDE_CSV },
        },
      }),
    });
    await settle();
    const names = logRows(S).map((r) => /library-name">([^<]*)</.exec(r.innerHTML)[1]);
    assert.deepStrictEqual(names, ['10-09-2026/kline-dec-b.csv', '09-09-2026/kline-dec-a.csv']);
    logRows(S)[0].fire('click');
    await settle();
    assert.ok(toastText(S).some((t) => /kline-dec-b\.csv/.test(t)), toastText(S).join(' | '));
  });

  await test('loading a log seeds rpm/throttle for the ignition main map, and a table switch re-seeds per key', async () => {
    const S = makeSandbox();
    await settle();
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    assert.strictEqual(S.document.getElementById('logAxisY').value, 'rpm');
    assert.strictEqual(S.document.getElementById('logAxisX').value, 'throttle');

    // a correction role has no RPM x TPS convention to assume
    S.document.getElementById('tableSel').fire('change', { target: { value: '@ign-air' } });
    await settle();
    assert.strictEqual(S.document.getElementById('logAxisX').value, '');
    assert.strictEqual(S.document.getElementById('logAxisY').value, '');

    // switching back finds the ignition-main mapping exactly as it was left
    S.document.getElementById('tableSel').fire('change', { target: { value: '@ign-main' } });
    await settle();
    assert.strictEqual(S.document.getElementById('logAxisY').value, 'rpm');
    assert.strictEqual(S.document.getElementById('logAxisX').value, 'throttle');
  });

  await test('toggling a dataset with a mapped log costs one Plotly.update, not a rebuild', async () => {
    const S = makeSandbox();
    await settle();
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    Object.assign(S.Plotly.counts, { react: 0, update: 0, restyle: 0 });
    S.document.getElementById('dsList').children[0].querySelector('.vis').fire('change',
      { target: { checked: false } });
    await settle();
    assert.strictEqual(S.Plotly.counts.update, 1);
    assert.strictEqual(S.Plotly.counts.react, 0);
  });

  await test('#logWrap appearing resizes the canvas exactly once, after its hidden state (and the reflow) settle first', async () => {
    // Viewer.draw() (Plotly.react()) only updates trace/layout config -- it
    // does not itself resize the <canvas> element to match a container that
    // just changed size. Confirmed by inspecting the real DOM: #plot's own
    // box shrinks immediately when #logWrap appears, but the canvas inside
    // it does not, and keeps overflowing into #logWrap underneath -- which
    // swallowed every click meant for the panel's own controls (the play
    // button among them). Only Plotly.Plots.resize() touches the canvas, so
    // it still has to run -- but #logWrap's hidden state (and a forced
    // reflow) are settled before draw() runs, so the resize afterward reads
    // the real final size on the first try instead of the stale one.
    const S = makeSandbox();
    await settle();
    assert.strictEqual(S.document.getElementById('logWrap').hidden, true);
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    assert.strictEqual(S.document.getElementById('logWrap').hidden, true, 'no log loaded yet');
    S.Plotly.counts.resize = 0;
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    assert.strictEqual(S.document.getElementById('logWrap').hidden, false);
    assert.strictEqual(S.Plotly.counts.resize, 1, 'exactly one resize for this transition');
    S.Plotly.counts.resize = 0;
    S.document.getElementById('logClear').fire('click');
    await settle();
    assert.strictEqual(S.document.getElementById('logWrap').hidden, true);
    assert.strictEqual(S.Plotly.counts.resize, 1, 'and one more when it disappears again');
  });

  await test('hiding a dataset on the dwell tab drops its stale heatmap instead of leaving it behind', async () => {
    const S = makeSandbox();
    await settle();
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    S.document.querySelector('[data-logview="dwell"]').fire('click');
    await settle();
    assert.strictEqual(S.document.getElementById('logDwellList').children.length, 1);
    S.document.getElementById('dsList').children[0].querySelector('.vis').fire('change',
      { target: { checked: false } });
    await settle();
    assert.strictEqual(S.document.getElementById('logDwellList').children.length, 0,
      'the hidden dataset\'s heatmap should not still be shown');
  });

  await test('the scrub slider starts at the end of the log with an elapsed/total label', async () => {
    const S = makeSandbox();
    await settle();
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    assert.strictEqual(S.document.getElementById('logScrub').max, '1');   // RIDE_CSV has 2 rows
    assert.strictEqual(S.document.getElementById('logScrub').value, '1');
    assert.strictEqual(S.document.getElementById('logScrubValue').textContent, '0:01 / 0:01');
  });

  await test('scrubbing back on the dwell tab re-renders it, and play toggles its own label', async () => {
    const S = makeSandbox();
    await settle();
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();
    S.document.querySelector('[data-logview="dwell"]').fire('click');
    await settle();
    S.Plotly.counts.react = 0;
    S.document.getElementById('logScrub').fire('input', { target: { value: '0' } });
    await settle();
    assert.strictEqual(S.document.getElementById('logScrubValue').textContent, '0:00 / 0:01');
    assert.ok(S.Plotly.counts.react > 0, 'dwell panel should redraw when scrubbed');

    const play = S.document.getElementById('logPlay');
    const before = play.textContent;
    play.fire('click');
    assert.notStrictEqual(play.textContent, before, 'play should flip to a pause label');
    play.fire('click');
    assert.strictEqual(play.textContent, before, 'clicking again should stop it');
  });

  await test('scrubbing re-asserts the live camera instead of the stale one baked into the last full redraw', async () => {
    const S = makeSandbox();
    await settle();
    await drop(S, [file('granpasso.bin', Buffer.from(sampleImage())), file('granpasso.xdf', SAMPLE_XDF)]);
    await settle();
    await drop(S, [file('ride.csv', RIDE_CSV)]);
    await settle();

    // a real Plotly.react() populates el.data and el._fullLayout; this sandbox's
    // stub does not, since nothing here needs a real GL scene -- stand in for
    // just enough of it to exercise setPathHighlight's own guard and camera read
    const plot = S.document.getElementById('plot');
    plot.data = [];
    const LIVE_CAMERA = { up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 },
      eye: { x: 9, y: 8, z: 7 }, projection: { type: 'perspective' } };
    plot._fullLayout = { scene: {
      camera: { eye: { x: 1.65, y: -1.75, z: 0.95 } },   // the stale value from the last full react()
      _scene: { getCamera: () => LIVE_CAMERA },           // what the user's drag actually left on screen
    } };

    S.document.getElementById('logScrub').fire('input', { target: { value: '0' } });
    await settle();

    assert.ok(S.Plotly.last.update, 'the path-highlight restyle should go through Plotly.update, carrying scene.camera along');
    // a strict object-identity check, not deepStrictEqual: the layout object
    // itself is built inside the sandbox's vm realm, so its Object.prototype
    // differs from this (outer) realm's -- deepStrictEqual across realms
    // fails on that alone even when every value matches. The camera value is
    // handed through by reference, so identity is the right check anyway.
    assert.strictEqual(S.Plotly.last.update[2]['scene.camera'], LIVE_CAMERA,
      'the live (rotated) camera must be re-asserted, not the stale one from the layout');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main();
