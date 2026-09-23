/*
 * Where the files come from, when they do not come from a drag and drop.
 *
 * Three arrangements, one interface, chosen by what actually answers rather
 * than by configuration -- the page has to keep working from a dumb static
 * host and from file://, where none of this exists.
 *
 *   addon    the viewer is served by onboard-logger at /addons/<name>/.
 *            Images are the board's own firmware directory and are read-only
 *            here: the logger owns them. Definitions live in the addon's own
 *            store, so the logger never learns what an .xdf is and deleting
 *            the addon directory takes its data with it.
 *   library  serve.py was given a data directory; it holds both kinds.
 *   none     nothing answers. Drag and drop, exactly as before.
 *
 * `fetch` and the path are passed in, so the whole thing runs under node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Store = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // matches serve.py's own cap; checked here so an oversize body is never sent
  var MAX_UPLOAD = 8 * 1024 * 1024;

  function enc(name) { return encodeURIComponent(name); }

  function fail(res) {
    return res.text().then(function (body) {
      var msg = body;
      try { msg = JSON.parse(body).error || body; } catch (e) { /* not json */ }
      throw new Error(res.status + ' ' + (msg || res.statusText || ''));
    });
  }

  function asJson(res) { return res.ok ? res.json() : fail(res); }
  function asBuffer(res) { return res.ok ? res.arrayBuffer() : fail(res); }
  function asText(res) { return res.ok ? res.text() : fail(res); }

  function readOnly() {
    return Promise.reject(new Error('read-only'));
  }

  function guardSize(data) {
    var size = data && (data.byteLength !== undefined ? data.byteLength : data.length) || 0;
    if (size > MAX_UPLOAD) return new Error('too large');
    return null;
  }

  /* ---------- backends ---------- */

  function noneStore() {
    return {
      kind: 'none',
      addon: null,
      writable: function () { return false; },
      list: function () { return Promise.resolve({ bins: [], defs: [] }); },
      read: readOnly,
      write: readOnly,
      remove: readOnly,
      logs: null
    };
  }

  function libraryStore(fetch) {
    var file = function (name) { return '/api/library/file/' + enc(name); };
    return {
      kind: 'library',
      addon: null,
      writable: function () { return true; },
      list: function () { return fetch('/api/library').then(asJson); },
      read: function (kind, name) {
        return fetch(file(name)).then(kind === 'defs' ? asText : asBuffer);
      },
      write: function (kind, name, data) {
        var bad = guardSize(data);
        if (bad) return Promise.reject(bad);
        return fetch(file(name), { method: 'PUT', body: data }).then(asJson);
      },
      remove: function (kind, name) {
        return fetch(file(name), { method: 'DELETE' }).then(asJson);
      },
      // onboard-logger's own drive-log API has no equivalent on a plain static
      // server -- standalone log loading is drag-and-drop only
      logs: null
    };
  }

  function addonStore(fetch, name) {
    var data = function (f) { return '/api/addons/' + enc(name) + '/data' + (f ? '/' + enc(f) : ''); };
    return {
      kind: 'addon',
      addon: name,
      // the board's images are the logger's to write; the addon only reads them
      writable: function (kind) { return kind === 'defs'; },
      list: function () {
        return Promise.all([
          fetch('/api/firmware').then(asJson).catch(function () { return { files: [] }; }),
          fetch(data()).then(asJson).catch(function () { return { files: [] }; })
        ]).then(function (both) {
          var bins = (both[0].files || []).filter(function (f) {
            return /\.bin$/i.test(f.name);
          }).map(function (f) {
            return { name: f.name, size: f.size, mtime: f.mtime, ident: f.ident || null };
          });
          return { bins: bins, defs: both[1].files || [] };
        });
      },
      read: function (kind, file) {
        return kind === 'defs'
          ? fetch(data(file)).then(asText)
          : fetch('/api/firmware/files/' + enc(file)).then(asBuffer);
      },
      write: function (kind, file, body) {
        if (kind !== 'defs') return readOnly();
        var bad = guardSize(body);
        if (bad) return Promise.reject(bad);
        return fetch(data(file), { method: 'PUT', body: body }).then(asJson);
      },
      remove: function (kind, file) {
        if (kind !== 'defs') return readOnly();
        return fetch(data(file), { method: 'DELETE' }).then(asJson);
      },
      // decoded drive logs: onboard-logger's own /api/logs*, read-only here.
      // A log's name is "<day>/<file>" -- encoding the whole string would
      // %2F the slash and 404, so each segment is encoded on its own.
      logs: {
        list: function () {
          return fetch('/api/logs?kind=decoded').then(asJson).then(function (r) {
            return (r.files || []).slice().sort(function (a, b) { return (b.mtime || 0) - (a.mtime || 0); });
          });
        },
        read: function (entry) {
          var path = String(entry.name).split('/').map(enc).join('/');
          return fetch('/api/logs/' + path + '/data').then(asJson).then(function (r) { return r.text; });
        }
      }
    };
  }

  /* ---------- detection ---------- */

  /* An addon is recognised by where the page itself is served from, then
     confirmed -- the path alone would leave a dead panel on a static copy of
     the tree sitting under /addons/. */
  function addonName(pathname) {
    var m = /^\/addons\/([^/]+)\//.exec(pathname || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function probe(fetch, url) {
    return fetch(url).then(function (res) { return !!(res && res.ok); },
      function () { return false; });
  }

  function detect(opts) {
    opts = opts || {};
    var fetch = opts.fetch;
    if (typeof fetch !== 'function') return Promise.resolve(noneStore());
    var name = addonName(opts.pathname);
    var first = name
      ? probe(fetch, '/api/addons/' + enc(name) + '/data').then(function (ok) {
        return ok ? addonStore(fetch, name) : null;
      })
      : Promise.resolve(null);
    return first.then(function (hit) {
      if (hit) return hit;
      return probe(fetch, '/api/library').then(function (ok) {
        return ok ? libraryStore(fetch) : noneStore();
      });
    });
  }

  return { MAX_UPLOAD: MAX_UPLOAD, detect: detect, addonName: addonName,
    noneStore: noneStore, libraryStore: libraryStore, addonStore: addonStore };
});
