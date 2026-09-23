/*
 * Offline test suite -- plain node, no runner, no browser, no firmware needed
 * beyond the synthetic images built here. `node tests/run.js` prints one line
 * per test.
 */
'use strict';
var assert = require('assert');
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var XML = require(path.join(ROOT, 'js/xml.js'));
var Expr = require(path.join(ROOT, 'js/expr.js'));
var BinIO = require(path.join(ROOT, 'js/binio.js'));
var XDF = require(path.join(ROOT, 'js/xdf.js'));
var Grid = require(path.join(ROOT, 'js/grid.js'));
var Presets = require(path.join(ROOT, 'js/presets.js'));
var I18N = require(path.join(ROOT, 'js/i18n.js'));
var Roles = require(path.join(ROOT, 'js/roles.js'));
var Links = require(path.join(ROOT, 'js/links.js'));
var Store = require(path.join(ROOT, 'js/store.js'));
var Log = require(path.join(ROOT, 'js/log.js'));
var Fixtures = require('./fixtures.js');
var SAMPLE_XDF = Fixtures.SAMPLE_XDF, sampleImage = Fixtures.sampleImage;

var passed = 0, failed = 0, pending = [];
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); }
}
/* js/store.js answers over the network, so its checks settle later than the
   rest; the summary waits for them. */
function atest(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    function () { passed++; console.log('ok   ' + name); },
    function (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); }));
}

/* ---------- xml ---------- */
test('xml parses attributes, nesting and self-closing tags', function () {
  var r = XML.parse('<!-- c --><?xml version="1.0"?><a x="1"><b y=\'2\'/><t>hi</t></a>');
  assert.strictEqual(r.tag, 'a');
  assert.strictEqual(r.attr.x, '1');
  assert.strictEqual(XML.child(r, 'b').attr.y, '2');
  assert.strictEqual(XML.childText(r, 't'), 'hi');
});

test('xml decodes entities and tolerates > inside attribute values', function () {
  var r = XML.parse('<a t="a &gt; b" u="x&#65;"><c/></a>');
  assert.strictEqual(r.attr.t, 'a > b');
  assert.strictEqual(r.attr.u, 'xA');
  assert.strictEqual(XML.children(r, 'c').length, 1);
});

/* ---------- expr ---------- */
test('expr evaluates the equations XDF uses', function () {
  assert.strictEqual(Expr.compile('X/10')(320), 32);
  assert.strictEqual(Expr.compile('(X-128)*0.75')(192), 48);
  assert.strictEqual(Expr.compile('X&0x0F')(0xAB), 0x0B);
  assert.strictEqual(Expr.compile('2^3')(0), 8);
  assert.strictEqual(Expr.compile('-X+5')(2), 3);
  assert.strictEqual(Expr.compile('ABS(0-X)')(5), 5);
});

test('expr degrades to identity on an equation it cannot parse', function () {
  var f = Expr.compile('X @@ 3');
  assert.strictEqual(f.ok, false);
  assert.strictEqual(f(7), 7);
});

test('expr never executes code from the definition', function () {
  var f = Expr.compile('process.exit(1)');
  assert.strictEqual(typeof f(1), 'number');
});

/* ---------- binio ---------- */
function imageWith(address, values, opts) {
  opts = opts || {};
  var buf = new ArrayBuffer(opts.size || 0x1000);
  var view = new DataView(buf);
  values.forEach(function (v, i) { view.setUint16(address + i * 2, v, true); });
  return buf;
}

test('binio reads 16-bit little-endian cells row-major', function () {
  var buf = imageWith(0x100, [1, 2, 3, 4, 5, 6]);
  var g = BinIO.readGrid(buf, { address: 0x100, sizeBits: 16, flags: BinIO.LSB_FIRST, rows: 2, cols: 3 });
  assert.deepStrictEqual(g, [[1, 2, 3], [4, 5, 6]]);
});

test('binio honours endianness and sign flags', function () {
  var buf = new ArrayBuffer(16);
  new DataView(buf).setUint16(0, 0x1234, true);
  var le = BinIO.readGrid(buf, { address: 0, sizeBits: 16, flags: BinIO.LSB_FIRST, rows: 1, cols: 1 })[0][0];
  var be = BinIO.readGrid(buf, { address: 0, sizeBits: 16, flags: 0, rows: 1, cols: 1 })[0][0];
  assert.strictEqual(le, 0x1234);
  assert.strictEqual(be, 0x3412);
  new DataView(buf).setUint16(0, 0xFFFF, true);
  var signed = BinIO.readGrid(buf, { address: 0, sizeBits: 16, flags: BinIO.LSB_FIRST | BinIO.SIGNED, rows: 1, cols: 1 })[0][0];
  assert.strictEqual(signed, -1);
});

test('binio refuses to read past the end of the image', function () {
  var buf = new ArrayBuffer(8);
  assert.throws(function () {
    BinIO.readGrid(buf, { address: 4, sizeBits: 16, flags: BinIO.LSB_FIRST, rows: 4, cols: 4 });
  }, /past the end/);
});

/* ---------- xdf ---------- */
test('xdf parses tables, categories and shape', function () {
  var doc = XDF.parse(SAMPLE_XDF);
  assert.strictEqual(doc.tables.length, 2);
  var t = doc.tables[1];
  assert.strictEqual(t.title, 'Ignition Main advance');
  assert.strictEqual(t.rows, 2);
  assert.strictEqual(t.cols, 3);
  assert.strictEqual(t.is3d, true);
  assert.deepStrictEqual(t.categories, ['Maps']);
});

test('xdf reads a table and applies its equation', function () {
  var doc = XDF.parse(SAMPLE_XDF);
  var g = XDF.readTable(doc, doc.tables[1], sampleImage());
  assert.deepStrictEqual(g.z, [[10, 20, 30], [40, 50, 60]]);
  assert.strictEqual(g.units, 'deg');
});

test('xdf resolves a linked axis through another table', function () {
  var doc = XDF.parse(SAMPLE_XDF);
  var g = XDF.readTable(doc, doc.tables[1], sampleImage());
  assert.deepStrictEqual(g.x, [2.4, 5, 8.1]);   // from the TPS legend table
  assert.deepStrictEqual(g.y, [1000, 2000]);    // from static LABELs
});

test('xdf rejects a file that is not an XDF', function () {
  assert.throws(function () { XDF.parse('<html><body/></html>'); }, /not an XDF/);
});

/* ---------- presets ---------- */
test('preset reads Ignition Main without an XDF', function () {
  var doc = Presets.docFor('granpasso');
  var buf = new ArrayBuffer(0x50000);
  var v = new DataView(buf);
  for (var i = 0; i < 32 * 20; i++) v.setUint16(0x4856E + i * 2, 100 + i, true);
  var g = XDF.readTable(doc, doc.tables[0], buf);
  assert.strictEqual(g.rows, 32);
  assert.strictEqual(g.cols, 20);
  assert.strictEqual(g.z[0][0], 10);
  assert.strictEqual(g.y[31], 8500);
  assert.strictEqual(g.x[0], 2.4);
});

/* ---------- grid ---------- */
var G = {
  rows: 2, cols: 3,
  x: [0, 10, 20], y: [1000, 2000],
  z: [[0, 10, 20], [10, 20, 30]]
};

test('grid extent spans only the grids it is given', function () {
  assert.deepStrictEqual(Grid.extent(G.z), [0, 30]);
  assert.deepStrictEqual(Grid.extentOf([G.z]), [0, 30]);
  assert.deepStrictEqual(Grid.extentOf([G.z, [[-5, 40]]]), [-5, 40]);
});

test('grid z range ignores hidden datasets', function () {
  // the prototype bug: a hidden dataset must not stretch the axis
  var visible = [G.z];
  var hidden = [[[-100, 100]]];
  var range = Grid.extentOf(visible);
  assert.deepStrictEqual(range, [0, 30]);
  assert.notDeepStrictEqual(Grid.extentOf(visible.concat(hidden)), range);
});

test('grid samples bilinearly and clamps outside the axes', function () {
  assert.strictEqual(Grid.sample(G.x, G.y, G.z, 5, 1000), 5);
  assert.strictEqual(Grid.sample(G.x, G.y, G.z, 0, 1500), 5);
  assert.strictEqual(Grid.sample(G.x, G.y, G.z, 10, 1500), 15);
  assert.strictEqual(Grid.sample(G.x, G.y, G.z, -99, 500), 0);
  assert.strictEqual(Grid.sample(G.x, G.y, G.z, 999, 9999), 30);
});

test('grid difference resamples onto the base axes', function () {
  var other = { rows: 2, cols: 2, x: [0, 20], y: [1000, 2000], z: [[1, 21], [11, 31]] };
  var d = Grid.difference(other, G);
  assert.deepStrictEqual(d, [[1, 1, 1], [1, 1, 1]]);
});

test('grid slice interpolates between rows', function () {
  var s = Grid.slice(G, 'y', 1500);
  assert.deepStrictEqual(s.at, [0, 10, 20]);
  assert.deepStrictEqual(s.values, [5, 15, 25]);
  var c = Grid.slice(G, 'x', 10);
  assert.deepStrictEqual(c.at, [1000, 2000]);
  assert.deepStrictEqual(c.values, [10, 20]);
});

test('grid padded range keeps a flat map visible', function () {
  var flat = Grid.padded([12, 12]);
  assert.ok(flat[1] > flat[0]);
});

/* ---------- log ---------- */

test('log parses columns, elapsed time and numeric cells', function () {
  var text = 'time,rpm,throttle\n' +
    '2026-09-09T11:27:33.774,1000,5\n' +
    '2026-09-09T11:27:34.774,1200,7\n';
  var l = Log.parse(text);
  assert.deepStrictEqual(l.columns, ['rpm', 'throttle']);
  assert.strictEqual(l.rows, 2);
  assert.deepStrictEqual(l.time, [0, 1]);
  assert.deepStrictEqual(l.channels.rpm, [1000, 1200]);
  assert.deepStrictEqual(l.channels.throttle, [5, 7]);
});

test('log turns a blank or non-numeric cell into null, never 0', function () {
  var text = 'time,rpm,throttle\n2026-09-09T11:27:33.774,,5\n2026-09-09T11:27:34.774,x,6\n';
  var l = Log.parse(text);
  assert.strictEqual(l.channels.rpm[0], null);
  assert.strictEqual(l.channels.rpm[1], null);
  assert.strictEqual(l.channels.throttle[0], 5);
});

test('log drops a row with an unparsable timestamp', function () {
  var text = 'time,rpm\n' +
    '2026-09-09T11:27:33.774,1000\n' +
    'not-a-date,1100\n' +
    '2026-09-09T11:27:35.774,1200\n';
  var l = Log.parse(text);
  assert.strictEqual(l.rows, 2);
  assert.deepStrictEqual(l.channels.rpm, [1000, 1200]);
});

test('log tolerates CRLF line endings', function () {
  var text = 'time,rpm\r\n2026-09-09T11:27:33.774,1000\r\n2026-09-09T11:27:34.774,1100\r\n';
  var l = Log.parse(text);
  assert.strictEqual(l.rows, 2);
  assert.deepStrictEqual(l.channels.rpm, [1000, 1100]);
});

test('log with only a header parses to zero rows', function () {
  var l = Log.parse('time,rpm,throttle\n');
  assert.strictEqual(l.rows, 0);
  assert.deepStrictEqual(l.columns, ['rpm', 'throttle']);
});

test('log parses an empty file to zero rows and no columns', function () {
  var l = Log.parse('');
  assert.strictEqual(l.rows, 0);
  assert.deepStrictEqual(l.columns, []);
});

test('log default-maps rpm/throttle onto the main maps when both are present', function () {
  assert.deepStrictEqual(Log.defaultAxisChannels('@ign-main', ['rpm', 'throttle', 'coolant_t']),
    { x: 'throttle', y: 'rpm' });
  assert.deepStrictEqual(Log.defaultAxisChannels('@fuel-main', ['rpm', 'throttle']),
    { x: 'throttle', y: 'rpm' });
});

test('log leaves axes unmapped when a main-map channel is missing or the table is a correction', function () {
  assert.deepStrictEqual(Log.defaultAxisChannels('@ign-main', ['rpm']), { x: '', y: '' });
  assert.deepStrictEqual(Log.defaultAxisChannels('@ign-air', ['rpm', 'throttle']), { x: '', y: '' });
  assert.deepStrictEqual(Log.defaultAxisChannels(null, ['rpm', 'throttle']), { x: '', y: '' });
});

test('log prefers live advance2 over latched advance as the default ignition compare channel', function () {
  assert.strictEqual(Log.defaultCompareChannel('@ign-main', ['advance', 'advance2']), 'advance2');
  assert.strictEqual(Log.defaultCompareChannel('@ign-main', ['advance']), 'advance');
  assert.strictEqual(Log.defaultCompareChannel('@ign-engine', ['advance2']), 'advance2');
});

test('log compares fuel roles against injector pulse width', function () {
  assert.strictEqual(Log.defaultCompareChannel('@fuel-main', ['inj_period']), 'inj_period');
  assert.strictEqual(Log.defaultCompareChannel('@fuel-warm', ['inj_period']), 'inj_period');
});

test('log gives the transient delta roles no default compare channel', function () {
  assert.strictEqual(Log.defaultCompareChannel('@ign-delta', ['advance', 'advance2']), '');
  assert.strictEqual(Log.defaultCompareChannel('@fuel-delta', ['inj_period']), '');
});

test('log replay predicts the same value Grid.sample would for each mapped row', function () {
  var log = { time: [0, 1], channels: { rpm: [1000, 1500], tps: [0, 10] } };
  var r = Log.replay(G, log, { x: 'tps', y: 'rpm' });
  assert.strictEqual(r.chart.predicted[0], Grid.sample(G.x, G.y, G.z, 0, 1000));
  assert.strictEqual(r.chart.predicted[1], Grid.sample(G.x, G.y, G.z, 10, 1500));
});

test('log replay skips a row with a missing channel value', function () {
  var log = { time: [0, 1, 2], channels: { rpm: [1000, null, 1500], tps: [0, 5, 10] } };
  var r = Log.replay(G, log, { x: 'tps', y: 'rpm' });
  assert.strictEqual(r.chart.predicted[1], null);
  assert.strictEqual(r.path.x.length, 2);   // the null row is excluded, not padded
});

test('log replay treats a channel missing from the log entirely as no data', function () {
  var log = { time: [0, 1], channels: { rpm: [1000, 1100] } };   // no tps column at all
  var r = Log.replay(G, log, { x: 'tps', y: 'rpm' });
  assert.deepStrictEqual(r.chart.predicted, [null, null]);
  assert.strictEqual(r.path.x.length, 0);
  assert.strictEqual(r.coverage, null);
});

test('log replay dwell seconds sum to about the log\'s own sample spacing', function () {
  var log = { time: [0, 1, 2, 3], channels: { rpm: [1000, 1000, 1000, 1000], tps: [0, 0, 0, 0] } };
  var r = Log.replay(G, log, { x: 'tps', y: 'rpm' });
  var total = 0;
  r.dwell.seconds.forEach(function (row) { row.forEach(function (s) { total += s; }); });
  assert.ok(Math.abs(total - 4) < 1e-9, total);
});

test('log replay does not require an X-channel mapping for a 1-D table', function () {
  var oneCol = { rows: 2, cols: 1, x: [0], y: [1000, 2000], z: [[5], [15]] };
  var log = { time: [0, 1], channels: { rpm: [1000, 2000] } };
  var r = Log.replay(oneCol, log, { x: '', y: 'rpm' });
  assert.deepStrictEqual(r.chart.predicted, [5, 15]);
});

test('log replay coverage reports the fraction of samples inside the axis extents', function () {
  var log = { time: [0, 1, 2, 3], channels: { rpm: [1000, 1000, 5000, 5000], tps: [0, 0, 0, 0] } };
  // G.y only spans 1000..2000, so half the samples (rpm=5000) fall outside
  var r = Log.replay(G, log, { x: 'tps', y: 'rpm' });
  assert.strictEqual(r.coverage, 0.5);
});

/* ---------- roles ---------- */

/* Real titles, as the four definitions in testdata/ spell them. */
var TITLES = {
  '@ign-main': ['Ignition - Main', 'Ignition Main advance', 'Ignition Main Advance', 'Ignition map'],
  '@ign-delta': ['Ignition - Delta Vertical', 'Ignition Delta', 'Ignition Delta(Right cylinder)'],
  '@ign-air': ['Ignition - Air Temperature Multiplier', 'Ignition Air temp', 'Ignition Air temp correction'],
  '@ign-engine': ['Ignition - Coolant Temperature Multiplier', 'Ignition Engine temp',
                  'Ignition Engine temp Correction'],
  '@fuel-main': ['Fuel - Main', 'Fuel Main', 'Fuel map'],
  '@fuel-delta': ['Fuel - Delta Vertical', 'Fuel Delta', 'Fuel Delta (Right cylinder)'],
  '@fuel-air': ['Fuel - Air Temperature/Pressure Multiplier', 'Fuel Air-temp-pressure',
                'Fuel: Pressure-Air Temp Correction'],
  '@fuel-engine': ['Fuel - Coolant Temperature Multiplier', 'Fuel Engine temp', 'Fuel Engine Temp Correction'],
  '@fuel-warm': ['Fuel - Startup Multiplier', 'Fuel Warm up'],
  '@fuel-phase': ['[corsaro] 4A 3 F4 Fuel Phase (End of Ignition/Injection pulse)', 'Fuel Phase'],
  '@torque-max': ['Torque - Maximum Calculated', 'Torque maximum calculated']
};

test('a role matches the same map however a definition spells it', function () {
  Object.keys(TITLES).forEach(function (role) {
    TITLES[role].forEach(function (title) {
      assert.strictEqual(Roles.roleOf(title), role, title);
    });
  });
});

test('a qualified table never passes for the main map', function () {
  ['Offset Ignition map', 'Offset Fuel map', '[corsaro] 4D 0 80 Idle Fuel Table',
   'Ignition - DQS Cut Time', '[corsaro] 48 5 6A 9A Ignition Dwell Threshold',
   'Torque - Engine Calculated', 'Torque', 'Rev Limit', 'New Table', 'Unknown Table 1'
  ].forEach(function (title) {
    var role = Roles.roleOf(title);
    assert.ok(role !== '@ign-main' && role !== '@fuel-main', title + ' -> ' + role);
  });
});

test('idle corrections do not take the engine-temp role', function () {
  assert.strictEqual(Roles.roleOf('[corsaro] 48 F AE Ignition Engine Temp correction Idle_1'), null);
  assert.strictEqual(Roles.roleOf('Ignition Engine temp'), '@ign-engine');
});

test('normTitle joins titles that differ only in punctuation or noise', function () {
  assert.strictEqual(Roles.normTitle('Fuel - Main'), Roles.normTitle('Fuel Main'));
  assert.strictEqual(Roles.normTitle('Torque - Maximum Calculated'), Roles.normTitle('Torque maximum calculated'));
  assert.strictEqual(Roles.normTitle('[corsaro] 4D 0 80 Idle Fuel Table'), 'idle fuel table');
  assert.notStrictEqual(Roles.normTitle('Fuel Main'), Roles.normTitle('Fuel Delta'));
});

test('a definition with several candidates gives up its surface first', function () {
  var tables = [
    { title: 'Ignition Engine Temp correction Idle_1', is3d: false },
    { title: 'Ignition Engine temp', is3d: true }
  ];
  assert.strictEqual(Roles.pick(tables, '@ign-engine').title, 'Ignition Engine temp');
  assert.strictEqual(Roles.pick(tables, '@fuel-main'), null);
});

test('every role carries a label that exists in English', function () {
  Roles.ROLES.forEach(function (r) {
    assert.ok(r.label in I18N.locales.en, r.key + ' has no label');
  });
  assert.strictEqual(Roles.listed().length, Roles.ROLES.length);
});

/* ---------- links ---------- */
var DEFS = [
  { id: 'd1', name: 'granpasso', doc: { tables: [] } },
  { id: 'd2', name: 'shared', doc: { tables: [] } }
];

test('links pair an image with the definition of the same name', function () {
  assert.strictEqual(Links.resolve('granpasso', DEFS, {}).id, 'd1');
  assert.strictEqual(Links.resolve('nothing', DEFS, {}), null);
});

test('a remembered link wins over the name match', function () {
  // the whole point: stage2.bin keeps pointing at shared.xdf even though a
  // stage2.xdf would match it by name
  var saved = { granpasso: 'shared' };
  assert.strictEqual(Links.resolve('granpasso', DEFS, saved).id, 'd2');
});

test('a remembered link to a definition that is not loaded falls back to the name', function () {
  var saved = { granpasso: 'gone' };
  assert.strictEqual(Links.resolve('granpasso', DEFS, saved).id, 'd1');
  assert.strictEqual(Links.resolve('stage2', DEFS, { stage2: 'gone' }), null);
});

test('one definition serves any number of images', function () {
  var saved = { a: 'shared', b: 'shared', c: 'shared' };
  var picked = ['a', 'b', 'c'].map(function (n) { return Links.resolve(n, DEFS, saved); });
  assert.ok(picked.every(function (d) { return d === DEFS[1]; }));
});

test('remember stores and forgets one image at a time', function () {
  var saved = {};
  Links.remember(saved, 'a', 'shared');
  Links.remember(saved, 'b', 'shared');
  assert.deepStrictEqual(saved, { a: 'shared', b: 'shared' });
  Links.remember(saved, 'a', null);
  assert.deepStrictEqual(saved, { b: 'shared' });
});

test('a damaged store reads as no links at all', function () {
  assert.deepStrictEqual(Links.decode('not json'), {});
  assert.deepStrictEqual(Links.decode('[1,2]'), {});
  assert.deepStrictEqual(Links.decode('null'), {});
  assert.deepStrictEqual(Links.decode(''), {});
  // a half-good object keeps the string entries and drops the rest
  assert.deepStrictEqual(Links.decode('{"a":"x","b":7,"c":""}'), { a: 'x' });
});

test('links survive a round trip through the store', function () {
  var bag = {};
  var storage = {
    getItem: function (k) { return bag[k]; },
    setItem: function (k, v) { bag[k] = v; }
  };
  Links.save(storage, { stage2: 'shared' });
  assert.deepStrictEqual(Links.load(storage), { stage2: 'shared' });
});

test('a storage that throws is not fatal', function () {
  var storage = {
    getItem: function () { throw new Error('blocked'); },
    setItem: function () { throw new Error('blocked'); }
  };
  assert.deepStrictEqual(Links.load(storage), {});
  Links.save(storage, { a: 'b' });   // must not throw
});

/* ---------- store ---------- */

/* A fetch that answers from a table of routes and records what was asked. */
function fakeFetch(routes) {
  var calls = [];
  var fn = function (url, init) {
    calls.push({ url: url, method: (init && init.method) || 'GET', body: init && init.body });
    var hit = routes[url];
    if (hit === undefined) {
      return Promise.resolve({ ok: false, status: 404, statusText: 'not found',
        text: function () { return Promise.resolve('{"error":"not found"}'); } });
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: function () { return Promise.resolve(hit); },
      text: function () { return Promise.resolve(typeof hit === 'string' ? hit : JSON.stringify(hit)); },
      arrayBuffer: function () { return Promise.resolve(hit); }
    });
  };
  fn.calls = calls;
  return fn;
}

atest('with nothing to talk to the store is drag and drop only', function () {
  return Store.detect({}).then(function (st) {
    assert.strictEqual(st.kind, 'none');
    assert.strictEqual(st.writable('defs'), false);
    return st.list();
  }).then(function (l) {
    assert.deepStrictEqual(l, { bins: [], defs: [] });
  });
});

atest('a data directory makes it the library', function () {
  var f = fakeFetch({ '/api/library': { bins: [], defs: [] } });
  return Store.detect({ fetch: f, pathname: '/index.html' }).then(function (st) {
    assert.strictEqual(st.kind, 'library');
    assert.strictEqual(st.writable('bins'), true);
  });
});

atest('being served under /addons/ makes it the addon, once confirmed', function () {
  var f = fakeFetch({ '/api/addons/maps/data': { files: [] } });
  return Store.detect({ fetch: f, pathname: '/addons/maps/' }).then(function (st) {
    assert.strictEqual(st.kind, 'addon');
    assert.strictEqual(st.addon, 'maps');
    // the board owns the images; only definitions are the addon's to write
    assert.strictEqual(st.writable('bins'), false);
    assert.strictEqual(st.writable('defs'), true);
  });
});

atest('a static copy sitting under /addons/ is not mistaken for one', function () {
  // the path says addon but nothing answers, and neither does a library
  var f = fakeFetch({});
  return Store.detect({ fetch: f, pathname: '/addons/maps/' }).then(function (st) {
    assert.strictEqual(st.kind, 'none');
  });
});

atest('the addon lists the board images beside its own definitions', function () {
  var f = fakeFetch({
    '/api/firmware': { files: [
      { name: 'stock.bin', size: 327680, mtime: 2, ident: { code: '23ECCLGPSMD' } },
      { name: 'stock.bin.txt', size: 12, mtime: 1 }
    ] },
    '/api/addons/maps/data': { files: [{ name: 'shared.xdf', size: 110, mtime: 3 }] }
  });
  var st = Store.addonStore(f, 'maps');
  return st.list().then(function (l) {
    assert.deepStrictEqual(l.bins.map(function (b) { return b.name; }), ['stock.bin']);
    assert.strictEqual(l.bins[0].ident.code, '23ECCLGPSMD');
    assert.deepStrictEqual(l.defs.map(function (d) { return d.name; }), ['shared.xdf']);
  });
});

atest('the addon refuses to write or delete a board image', function () {
  var st = Store.addonStore(fakeFetch({}), 'maps');
  return st.write('bins', 'stock.bin', new ArrayBuffer(4)).then(
    function () { throw new Error('should have refused'); },
    function (e) {
      assert.strictEqual(e.message, 'read-only');
      return st.remove('bins', 'stock.bin').then(
        function () { throw new Error('should have refused'); },
        function (e2) { assert.strictEqual(e2.message, 'read-only'); });
    });
});

atest('the addon reads images from the logger and definitions from its own store', function () {
  var f = fakeFetch({
    '/api/firmware/files/stock.bin': new ArrayBuffer(8),
    '/api/addons/maps/data/shared.xdf': '<XDFFORMAT/>'
  });
  var st = Store.addonStore(f, 'maps');
  return st.read('bins', 'stock.bin').then(function (buf) {
    assert.strictEqual(buf.byteLength, 8);
    return st.read('defs', 'shared.xdf');
  }).then(function (text) {
    assert.strictEqual(text, '<XDFFORMAT/>');
  });
});

atest('the addon lists decoded logs newest first', function () {
  var f = fakeFetch({
    '/api/logs?kind=decoded': { files: [
      { name: '09-09-2026/kline-dec-a.csv', day: '09-09-2026', size: 10, mtime: 1 },
      { name: '10-09-2026/kline-dec-b.csv', day: '10-09-2026', size: 20, mtime: 5 }
    ] }
  });
  var st = Store.addonStore(f, 'maps');
  return st.logs.list().then(function (files) {
    assert.deepStrictEqual(files.map(function (x) { return x.name; }),
      ['10-09-2026/kline-dec-b.csv', '09-09-2026/kline-dec-a.csv']);
  });
});

atest('a decoded log keeps its day-folder slash but percent-encodes the file name', function () {
  var f = fakeFetch({
    '/api/logs/09-09-2026/kline-dec-a%20b.csv/data': { name: '09-09-2026/kline-dec-a b.csv', text: 'time,rpm\n' }
  });
  var st = Store.addonStore(f, 'maps');
  return st.logs.read({ name: '09-09-2026/kline-dec-a b.csv' }).then(function (text) {
    assert.strictEqual(text, 'time,rpm\n');
    assert.deepStrictEqual(f.calls.map(function (c) { return c.url; }),
      ['/api/logs/09-09-2026/kline-dec-a%20b.csv/data']);
  });
});

atest('the library and drag-and-drop stores offer no logs accessor', function () {
  assert.strictEqual(Store.libraryStore(fakeFetch({})).logs, null);
  assert.strictEqual(Store.noneStore().logs, null);
});

atest('a library write and delete address the file endpoint', function () {
  var f = fakeFetch({ '/api/library/file/a%20b.bin': { name: 'a b.bin' } });
  var st = Store.libraryStore(f);
  return st.write('bins', 'a b.bin', new ArrayBuffer(4)).then(function () {
    return st.remove('bins', 'a b.bin');
  }).then(function () {
    assert.deepStrictEqual(f.calls.map(function (c) { return c.method; }), ['PUT', 'DELETE']);
    assert.ok(f.calls.every(function (c) { return c.url === '/api/library/file/a%20b.bin'; }));
  });
});

atest('an oversize body is refused before it is sent', function () {
  var f = fakeFetch({});
  var st = Store.libraryStore(f);
  return st.write('bins', 'huge.bin', new ArrayBuffer(Store.MAX_UPLOAD + 1)).then(
    function () { throw new Error('should have refused'); },
    function (e) {
      assert.strictEqual(e.message, 'too large');
      assert.strictEqual(f.calls.length, 0, 'nothing went out');
    });
});

atest('a refusal from the server carries its reason', function () {
  var f = fakeFetch({});                       // every route 404s
  return Store.libraryStore(f).list().then(
    function () { throw new Error('should have failed'); },
    function (e) { assert.ok(/404/.test(e.message), e.message); });
});

/* ---------- i18n ---------- */
test('every locale carries the same keys as English', function () {
  var en = Object.keys(I18N.locales.en).sort();
  Object.keys(I18N.locales).forEach(function (code) {
    var keys = Object.keys(I18N.locales[code]).sort();
    assert.deepStrictEqual(keys, en, code + ' differs from en');
  });
});

test('every locale names itself', function () {
  I18N.list().forEach(function (loc) {
    assert.ok(loc.name && loc.name.length > 1, loc.code + ' has no _name');
  });
});

test('a missing string falls back to English, and placeholders fill in', function () {
  I18N.setLang('de');
  assert.strictEqual(I18N.t('theme.dark'), 'Dunkel');
  assert.strictEqual(I18N.t('files.paired', { name: 'stock' }), 'stock geladen');
  assert.strictEqual(I18N.t('nope.missing'), 'nope.missing');
  I18N.setLang('en');
});

test('browser language picks the closest locale', function () {
  assert.strictEqual(I18N.preferred(['de-DE', 'en']), 'de');
  assert.strictEqual(I18N.preferred(['it-CH']), 'it');
  assert.strictEqual(I18N.preferred(['pt-BR']), 'en');   // not translated yet
  assert.strictEqual(I18N.preferred([]), 'en');
});

Promise.all(pending).then(function () {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});
