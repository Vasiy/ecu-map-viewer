'use strict';
/*
 * The library panel: it appears only when something answers, a click on a row
 * is the same arrival as a drop, and a definition dropped by hand is kept where
 * the device can find it again.
 */
const assert = require('assert');
const { makeSandbox, drop, file } = require('./ui_sandbox.js');
const { SAMPLE_XDF, sampleImage } = require('./fixtures.js');

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed++; console.log('ok   ' + name); },
    (e) => { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); });
}

const settle = () => new Promise((r) => setImmediate(() => setImmediate(
  () => setImmediate(() => setImmediate(r)))));

/* A fetch backed by an in-memory directory, recording what was written. */
function libraryFetch(files) {
  const writes = [];
  const fn = (url, init) => {
    const method = (init && init.method) || 'GET';
    if (url === '/api/library' && method === 'GET') {
      const rows = Object.keys(files).map((n) => ({ name: n, size: files[n].length }));
      return ok({
        bins: rows.filter((r) => /\.bin$/i.test(r.name)),
        defs: rows.filter((r) => /\.xdf$/i.test(r.name)),
      });
    }
    const m = /^\/api\/library\/file\/(.+)$/.exec(url);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (method === 'PUT') {
        writes.push(name);
        files[name] = init.body;
        return ok({ name });
      }
      if (files[name] === undefined) return notFound();
      return ok(files[name]);
    }
    return notFound();
  };
  fn.writes = writes;
  return fn;
}

function ok(payload) {
  const isBuf = payload instanceof ArrayBuffer || Buffer.isBuffer(payload);
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(isBuf ? payload.toString('utf8') : String(payload)),
    arrayBuffer: () => Promise.resolve(
      Buffer.isBuffer(payload)
        ? payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
        : payload),
  });
}
function notFound() {
  return Promise.resolve({ ok: false, status: 404, statusText: 'not found',
    text: () => Promise.resolve('{"error":"not found"}') });
}

const panel = (S) => S.document.getElementById('library');
const libRows = (S) => S.document.getElementById('libList').children
  .filter((n) => n.className === 'library-row');
const dsRows = (S) => S.document.getElementById('dsList').children
  .filter((n) => n.tagName === 'article');
function chosen(row) {
  const m = /<option value="([^"]*)" selected>/.exec(row.innerHTML);
  return m ? m[1] : '';
}

async function main() {
  await test('with no backend the panel stays hidden', async () => {
    const S = makeSandbox();
    await settle();
    assert.strictEqual(panel(S).hidden, true);
  });

  await test('a library that answers is listed, images and definitions apart', async () => {
    const S = makeSandbox({ fetch: libraryFetch({
      'stage1.bin': Buffer.from(sampleImage()),
      'shared.xdf': SAMPLE_XDF,
    }) });
    await settle();
    assert.strictEqual(panel(S).hidden, false);
    const names = libRows(S).map((r) => /library-name">([^<]*)</.exec(r.innerHTML)[1]);
    assert.deepStrictEqual(names, ['stage1.bin', 'shared.xdf']);
  });

  await test('clicking a definition then an image pairs them like a drop', async () => {
    const S = makeSandbox({ fetch: libraryFetch({
      'stage1.bin': Buffer.from(sampleImage()),
      'granpasso.xdf': SAMPLE_XDF,
    }) });
    await settle();
    const rows = libRows(S);
    rows.find((r) => /granpasso\.xdf/.test(r.innerHTML)).fire('click');
    await settle();
    rows.find((r) => /stage1\.bin/.test(r.innerHTML)).fire('click');
    await settle();
    assert.strictEqual(dsRows(S).length, 1);
    // names do not match, and a lone definition adopts the image anyway
    assert.strictEqual(chosen(dsRows(S)[0]), 'def:def1');
  });

  await test('taking the same image twice does not double the card', async () => {
    const S = makeSandbox({ fetch: libraryFetch({ 'stage1.bin': Buffer.from(sampleImage()) }) });
    await settle();
    const row = libRows(S)[0];
    row.fire('click');
    await settle();
    row.fire('click');
    await settle();
    assert.strictEqual(dsRows(S).length, 1);
  });

  await test('a definition dropped by hand is saved to the device', async () => {
    const f = libraryFetch({});
    const S = makeSandbox({ fetch: f });
    await settle();
    await drop(S, [file('shared.xdf', SAMPLE_XDF)]);
    await settle();
    assert.deepStrictEqual(f.writes, ['shared.xdf']);
  });

  await test('an image dropped by hand is not deposited on the device', async () => {
    const f = libraryFetch({});
    const S = makeSandbox({ fetch: f });
    await settle();
    await drop(S, [file('stage1.bin', Buffer.from(sampleImage()))]);
    await settle();
    assert.deepStrictEqual(f.writes, []);
  });

  await test('a definition already on the device is not written back', async () => {
    const f = libraryFetch({ 'shared.xdf': SAMPLE_XDF });
    const S = makeSandbox({ fetch: f });
    await settle();
    await drop(S, [file('shared.xdf', SAMPLE_XDF)]);
    await settle();
    assert.deepStrictEqual(f.writes, []);
  });

  await test('under the addon the board images are listed but never written', async () => {
    const S = makeSandbox({
      pathname: '/addons/maps/',
      fetch: (url, init) => {
        const method = (init && init.method) || 'GET';
        if (url === '/api/addons/maps/data' && method === 'GET') {
          return ok({ files: [{ name: 'shared.xdf', size: 110 }] });
        }
        if (url === '/api/firmware') {
          return ok({ files: [{ name: 'stock.bin', size: 327680 }] });
        }
        return notFound();
      },
    });
    await settle();
    assert.strictEqual(panel(S).hidden, false);
    const names = libRows(S).map((r) => /library-name">([^<]*)</.exec(r.innerHTML)[1]);
    assert.deepStrictEqual(names, ['stock.bin', 'shared.xdf']);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main();
