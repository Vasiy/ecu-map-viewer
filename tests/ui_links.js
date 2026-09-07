'use strict';
/*
 * Drives js/app.js through the file picker: which definition each image ends up
 * with, and what is remembered about it. The pure part lives in js/links.js and
 * is covered in run.js -- this is the wiring around it, which is where the old
 * "rename a copy of the XDF per image" workflow actually lived.
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

const bin = (name, bias) => file(name, Buffer.from(sampleImage(bias)));
const xdf = (name) => file(name, SAMPLE_XDF);

const rows = (S) => S.document.getElementById('dsList').children;
const toasts = (S) => S.document.getElementById('toasts').children.map((n) => n.textContent);
/* which option the card's picker has selected -- '' when it has no definition */
function chosen(row) {
  const m = /<option value="([^"]*)" selected>/.exec(row.innerHTML);
  return m ? m[1] : '';
}
const links = (S) => JSON.parse(S.localStorage.getItem('links') || '{}');

async function main() {
  await test('matching names still pair on their own', async () => {
    const S = makeSandbox();
    await drop(S, [bin('granpasso.bin'), xdf('granpasso.xdf')]);
    const r = rows(S);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(chosen(r[0]), 'def:def1');
    assert.ok(toasts(S).some((x) => /granpasso/.test(x)));
  });

  await test('one definition adopts every image that arrived without one', async () => {
    // the case the feature exists for: three versions of one calibration and a
    // single XDF whose name matches none of them
    const S = makeSandbox();
    await drop(S, [bin('stage1.bin', 0), bin('stage2.bin', 5), bin('stage3.bin', 9),
      xdf('shared.xdf')]);
    const r = rows(S);
    assert.strictEqual(r.length, 3);
    assert.ok(r.every((row) => chosen(row) === 'def:def1'), 'every image got the definition');
    assert.deepStrictEqual(links(S),
      { stage1: 'shared', stage2: 'shared', stage3: 'shared' });
  });

  await test('a definition that matched a name by itself does not adopt the rest', async () => {
    const S = makeSandbox();
    await drop(S, [bin('granpasso.bin'), bin('other.bin', 3), xdf('granpasso.xdf')]);
    const r = rows(S);
    assert.strictEqual(chosen(r[0]), 'def:def1');
    assert.strictEqual(chosen(r[1]), '', 'the unnamed image is left for a deliberate pick');
  });

  await test('two definitions at once are ambiguous, so neither adopts anything', async () => {
    const S = makeSandbox();
    await drop(S, [bin('stage1.bin'), xdf('one.xdf'), xdf('two.xdf')]);
    assert.strictEqual(chosen(rows(S)[0]), '');
    assert.deepStrictEqual(links(S), {});
  });

  await test('a remembered link survives a reload and beats the name match', async () => {
    const S = makeSandbox({ storage: { links: JSON.stringify({ granpasso: 'shared' }) } });
    await drop(S, [bin('granpasso.bin'), xdf('granpasso.xdf'), xdf('shared.xdf')]);
    // granpasso.xdf is def1, shared.xdf is def2 -- the remembered one wins
    assert.strictEqual(chosen(rows(S)[0]), 'def:def2');
  });

  await test('picking a definition by hand is remembered, and picking none forgets it', async () => {
    const S = makeSandbox();
    await drop(S, [bin('stage1.bin'), bin('stage2.bin', 4), xdf('a.xdf'), xdf('b.xdf')]);
    const sel = rows(S)[0].querySelector('.defsel');
    sel.value = 'def:def2';
    sel.fire('change', { target: sel });
    assert.deepStrictEqual(links(S), { stage1: 'b' });

    const again = rows(S)[0].querySelector('.defsel');
    again.value = '';
    again.fire('change', { target: again });
    assert.deepStrictEqual(links(S), {});
  });

  await test('a preset is a fallback, not a link, so nothing is remembered', async () => {
    const S = makeSandbox();
    await drop(S, [bin('lonely.bin')]);
    const sel = rows(S)[0].querySelector('.defsel');
    sel.value = 'preset:granpasso';
    sel.fire('change', { target: sel });
    assert.strictEqual(chosen(rows(S)[0]), 'preset:granpasso');
    assert.deepStrictEqual(links(S), {});
  });

  await test('re-dropping a definition refreshes it without unlinking anything', async () => {
    const S = makeSandbox();
    await drop(S, [bin('stage1.bin'), xdf('shared.xdf')]);
    assert.strictEqual(chosen(rows(S)[0]), 'def:def1');
    await drop(S, [xdf('shared.xdf')]);
    assert.strictEqual(rows(S).length, 1);
    assert.strictEqual(chosen(rows(S)[0]), 'def:def1', 'still the same definition id');
  });

  await test('the same image is not loaded twice', async () => {
    const S = makeSandbox();
    await drop(S, [bin('stage1.bin')]);
    await drop(S, [bin('stage1.bin')]);
    assert.strictEqual(rows(S).length, 1);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main();
