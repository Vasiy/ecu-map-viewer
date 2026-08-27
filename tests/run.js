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

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); }
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
var SAMPLE_XDF = [
  '<XDFFORMAT version="1.50"><XDFHEADER><baseoffset>0</baseoffset>',
  '<DEFAULTS datasizeinbits="16" signed="0" lsbfirst="1" float="0"/>',
  '<CATEGORY index="0x0" name="Maps"/></XDFHEADER>',
  '<XDFTABLE uniqueid="0x10"><title>TPS legend</title>',
  '<XDFAXIS id="x"><indexcount>1</indexcount><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="y"><indexcount>3</indexcount><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="z"><EMBEDDEDDATA mmedtypeflags="0x02" mmedaddress="0x200" mmedelementsizebits="16" mmedrowcount="3"/>',
  '<MATH equation="X/100"/></XDFAXIS></XDFTABLE>',
  '<XDFTABLE uniqueid="0x20" flags="0x0"><title>Ignition Main advance</title>',
  '<CATEGORYMEM index="0" category="1"/>',
  '<XDFAXIS id="x"><indexcount>3</indexcount><embedinfo type="3" linkobjid="0x10"/><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="y"><indexcount>2</indexcount><LABEL index="0" value="1000"/><LABEL index="1" value="2000"/><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="z"><EMBEDDEDDATA mmedtypeflags="0x02" mmedaddress="0x100" mmedelementsizebits="16" mmedrowcount="2" mmedcolcount="3"/>',
  '<decimalpl>1</decimalpl><units>deg</units><MATH equation="X/10"/></XDFAXIS></XDFTABLE></XDFFORMAT>'
].join('');

function sampleImage() {
  var buf = new ArrayBuffer(0x1000);
  var v = new DataView(buf);
  [100, 200, 300, 400, 500, 600].forEach(function (n, i) { v.setUint16(0x100 + i * 2, n, true); });
  [240, 500, 810].forEach(function (n, i) { v.setUint16(0x200 + i * 2, n, true); });
  return buf;
}

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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
