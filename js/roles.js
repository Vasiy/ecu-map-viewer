/*
 * Matching the same physical map across definitions.
 *
 * Every XDF author names the tables their own way. The same ignition map is
 * "Ignition Main advance" on a Granpasso, "Ignition - Main" on a 1198 and
 * "Ignition map" on a Hypermotard; corrections are "Coolant Temperature
 * Multiplier" here and "Engine temp Correction" there. Titles also carry noise:
 * a "[corsaro]" tag marking where an entry was re-pointed from, and address
 * crumbs like "4A 3 F4" left in by hand.
 *
 * So there are two levels of matching:
 *   normTitle()  strips the noise and the punctuation that only splits a name,
 *                so "Fuel - Main" and "Fuel Main" land on the same key;
 *   roleOf()     matches by meaning, which no amount of normalising can do.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Roles = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAG = /^\[[^\]]*\]\s*/;                 // [corsaro]
  var CRUMBS = /^(?:[0-9a-f]{1,3}\s+){2,}/;   // "4A 3 F4 ", "48 5 6A 9A "
  var SPLITTERS = /[-–—:;,.\/\\()]+/g;        // punctuation that only splits a name

  /* Key two titles share when they differ only in punctuation or noise. */
  function normTitle(title) {
    return String(title).toLowerCase()
      .replace(TAG, '')
      .replace(CRUMBS, '')
      .replace(SPLITTERS, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Same, reduced to bare words -- what the role tests run against. */
  function words(title) {
    return String(title).toLowerCase()
      .replace(TAG, '')
      .replace(CRUMBS, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var IGN = /\bignition\b|\bspark\b/;
  var FUEL = /\bfuel\b|\binjection\b/;
  var TEMP = /\btemp\b|\btemperature\b/;
  var IDLE = /\bidle\b/;
  var OFFSET = /\boffset\b/;
  // a main map is never one of these
  var QUALIFIED = /\bdwell\b|\bcut\b|\bthreshold\b|\btorque\b|\bmultiplier\b|\bcorrection\b|\btrim\b|\bflow\b|\blegend\b|\bbreakpoint/;

  /*
   * Order matters: the first match wins, so the qualified roles (delta, the
   * temperature corrections) are tested before the main map.
   */
  var ROLES = [
    { key: '@ign-delta', label: 'role.ign_delta',
      test: function (w) { return IGN.test(w) && /\bdelta\b/.test(w) && !IDLE.test(w); } },
    { key: '@ign-air', label: 'role.ign_air',
      test: function (w) { return IGN.test(w) && /\bair\b/.test(w) && TEMP.test(w); } },
    { key: '@ign-engine', label: 'role.ign_engine',
      test: function (w) { return IGN.test(w) && /\bengine\b|\bcoolant\b/.test(w) && TEMP.test(w) && !IDLE.test(w); } },
    { key: '@ign-main', label: 'role.ign_main',
      test: function (w) {
        return IGN.test(w) && /\bmain\b|\bmap\b|\badvance\b/.test(w) &&
          !OFFSET.test(w) && !IDLE.test(w) && !QUALIFIED.test(w);
      } },
    { key: '@fuel-delta', label: 'role.fuel_delta',
      test: function (w) { return FUEL.test(w) && /\bdelta\b/.test(w) && !IDLE.test(w); } },
    { key: '@fuel-air', label: 'role.fuel_air',
      test: function (w) { return FUEL.test(w) && /\bair\b/.test(w) && (TEMP.test(w) || /\bpressure\b/.test(w)); } },
    { key: '@fuel-engine', label: 'role.fuel_engine',
      test: function (w) { return FUEL.test(w) && /\bengine\b|\bcoolant\b/.test(w) && TEMP.test(w) && !IDLE.test(w); } },
    { key: '@fuel-warm', label: 'role.fuel_warm',
      test: function (w) { return FUEL.test(w) && /\bwarm\b|\bstartup\b|\bstart up\b/.test(w); } },
    { key: '@fuel-phase', label: 'role.fuel_phase',
      test: function (w) { return FUEL.test(w) && /\bphase\b/.test(w); } },
    { key: '@fuel-main', label: 'role.fuel_main',
      test: function (w) {
        return FUEL.test(w) && /\bmain\b|\bmap\b/.test(w) &&
          !OFFSET.test(w) && !IDLE.test(w) && !QUALIFIED.test(w);
      } },
    { key: '@torque-max', label: 'role.torque_max',
      test: function (w) { return /\btorque\b/.test(w) && /\bmax\b|\bmaximum\b/.test(w); } }
  ];

  /* Reading order for the picker: the main maps first, corrections after. */
  var DISPLAY_ORDER = ['@ign-main', '@ign-delta', '@ign-air', '@ign-engine',
    '@fuel-main', '@fuel-delta', '@fuel-air', '@fuel-engine', '@fuel-warm', '@fuel-phase',
    '@torque-max'];

  function listed() {
    return ROLES.slice().sort(function (a, b) {
      return DISPLAY_ORDER.indexOf(a.key) - DISPLAY_ORDER.indexOf(b.key);
    });
  }

  function roleOf(title) {
    var w = words(title);
    for (var i = 0; i < ROLES.length; i++) {
      if (ROLES[i].test(w)) return ROLES[i].key;
    }
    return null;
  }

  /*
   * The table a definition offers for a role. A definition can hold several
   * candidates (a 3-D map plus its 1-D idle variants); prefer the surface, then
   * the least qualified title.
   */
  function pick(tables, roleKey) {
    var hits = tables.filter(function (t) { return roleOf(t.title) === roleKey; });
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      if (a.is3d !== b.is3d) return a.is3d ? -1 : 1;
      return a.title.length - b.title.length;
    });
    return hits[0];
  }

  return { ROLES: ROLES, listed: listed, roleOf: roleOf, pick: pick, normTitle: normTitle, words: words };
});
