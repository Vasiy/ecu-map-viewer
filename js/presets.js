/*
 * Fallback definitions for a firmware image that arrives without its XDF.
 *
 * The addresses are the ones verified on real IAW5AM dumps; the axes are the
 * breakpoints this ECU family shares (confirmed against the Granpasso and
 * Multistrada definitions). A preset builds the same document shape xdf.js
 * produces, so readTable() does not care where the definition came from.
 */
(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./binio.js') : root.BinIO);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Presets = api;
})(typeof self !== 'undefined' ? self : this, function (BinIO) {
  'use strict';

  var RPM = [1000, 1200, 1400, 1600, 1800, 2000, 2250, 2500, 2750, 3000, 3250, 3500,
    3750, 4000, 4250, 4500, 4750, 5000, 5250, 5500, 5750, 6000, 6250, 6500, 6750,
    7000, 7250, 7500, 7750, 8000, 8250, 8500];
  var TPS = [2.4, 2.7, 3.2, 3.55, 4.0, 5.0, 6.0, 7.0, 8.5, 10.0, 12.0, 15.0, 19.0,
    24.0, 29.0, 34.0, 41.0, 51.0, 64.0, 81.0];

  var PLATFORMS = [
    { id: 'granpasso', name: 'Moto Morini Granpasso (23EC)', address: 0x4856E },
    { id: 'mts1100', name: 'Ducati Multistrada 1100 DP', address: 0x484DE },
    { id: 'd1198', name: 'Ducati 1198 Stock', address: 0x48634 },
    { id: 'hyper1100', name: 'Ducati Hypermotard 1100', address: 0x4856E }
  ];

  function labels(values) {
    return values.map(function (v, i) { return { index: i, value: String(v) }; });
  }

  function axis(id, values) {
    return {
      id: id, address: null, sizeBits: 16, flags: BinIO.LSB_FIRST,
      rows: null, cols: null, majorStrideBits: 0, minorStrideBits: 0,
      indexCount: values.length, decimals: 1, units: id === 'x' ? 'deg' : 'rpm',
      min: null, max: null, linkId: null, embedType: null,
      labels: labels(values), equation: 'X'
    };
  }

  /* A document holding the single Ignition Main table of one platform. */
  function docFor(platformId) {
    var p = PLATFORMS.filter(function (q) { return q.id === platformId; })[0];
    if (!p) return null;
    var table = {
      index: 0, uniqueId: 1,
      title: 'Ignition Main advance',
      description: 'Preset definition (' + p.name + '), no XDF loaded',
      categories: ['Preset'],
      x: axis('x', TPS),
      y: axis('y', RPM),
      z: {
        id: 'z', address: p.address, sizeBits: 16, flags: BinIO.LSB_FIRST,
        rows: RPM.length, cols: TPS.length, majorStrideBits: 0, minorStrideBits: 0,
        indexCount: null, decimals: 1, units: 'deg', min: null, max: null,
        linkId: null, embedType: null, labels: [], equation: 'X/10'
      },
      rows: RPM.length, cols: TPS.length, is3d: true
    };
    return {
      version: 'preset', title: p.name, description: table.description, author: '',
      baseOffset: 0,
      defaults: { datasizeinbits: 16, signed: false, lsbfirst: true, float: false },
      categories: { 0: 'Preset' },
      tables: [table],
      byId: { 1: table },
      preset: p.id
    };
  }

  return { RPM: RPM, TPS: TPS, PLATFORMS: PLATFORMS, docFor: docFor };
});
