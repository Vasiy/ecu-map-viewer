/*
 * Which definition explains which image.
 *
 * Matching by file name is the convenient case, not the rule: comparing several
 * versions of one calibration used to mean copying the same XDF once per image
 * and renaming each copy. So a link is a first-class thing here -- remembered
 * per image, and free to point at a definition that shares nothing with its
 * name. Several images pointing at one definition is the normal case, not an
 * edge one: the parsed document is read-only, and each dataset keeps its own
 * grid cache.
 *
 * The store is keyed by the image's base name, never by the card's display
 * name -- that one is editable and would take the link with it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Links = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'links';

  /* Which of the loaded definitions belongs to this image.
     A remembered link wins over the name match -- it is the deliberate one. */
  function resolve(binBase, defs, saved) {
    defs = defs || [];
    var wanted = saved && Object.prototype.hasOwnProperty.call(saved, binBase)
      ? saved[binBase] : null;
    if (wanted) {
      var linked = byName(defs, wanted);
      if (linked) return linked;
    }
    return byName(defs, binBase);
  }

  function byName(defs, name) {
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].name === name) return defs[i];
    }
    return null;
  }

  /* Remember (defName) or forget (null/'') one image's link, in place. */
  function remember(saved, binBase, defName) {
    if (!saved || !binBase) return saved;
    if (defName) saved[binBase] = defName;
    else delete saved[binBase];
    return saved;
  }

  /* A stored map is user-editable and survives across versions, so anything
     that is not a flat string->string object is treated as absent. */
  function decode(text) {
    var out = {};
    if (!text) return out;
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return out; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (k) {
      if (typeof raw[k] === 'string' && raw[k]) out[k] = raw[k];
    });
    return out;
  }

  function encode(saved) {
    return JSON.stringify(saved || {});
  }

  /* Storage is passed in: it is missing under node, and in a browser told to
     block site data even reaching for it throws -- so a falsy one is normal. */
  function load(storage) {
    if (!storage) return {};
    try { return decode(storage.getItem(KEY)); } catch (e) { return {}; }
  }

  function save(storage, saved) {
    if (!storage) return;
    try { storage.setItem(KEY, encode(saved)); } catch (e) { /* private mode */ }
  }

  return { KEY: KEY, resolve: resolve, remember: remember,
    decode: decode, encode: encode, load: load, save: save };
});
