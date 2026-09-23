/*
 * Wiring: files in, surfaces out.
 *
 * A dataset is one firmware image plus the definition that explains it. Matching
 * file names (firmware.bin + firmware.xdf) still pair on their own, but that is
 * a convenience, not the rule: a definition can be picked by hand per image, and
 * one definition can explain any number of images -- which is the whole point
 * when comparing several versions of one calibration. `js/links.js` decides who
 * gets what and remembers the deliberate choices; an image that ends up with
 * nothing can still borrow one of the built-in preset definitions.
 */
(function () {
  'use strict';

  var t = window.I18N.t;
  var XDF = window.XDF, Grid = window.Grid, Presets = window.Presets, Viewer = window.Viewer;
  var Links = window.Links, Store = window.Store, Log = window.Log;

  var state = {
    datasets: [],
    defs: [],                 // every parsed definition, by arrival: {id,name,doc}
    links: {},                // remembered image -> definition name (localStorage)
    tableKey: null,
    mode: 'surface',
    baseId: null,
    contours: true,
    opacity: 0.95,
    sliceAxis: 'off',
    sliceIndex: 0,
    theme: 'dark',
    seq: 0,
    defSeq: 0,
    store: null,              // where files come from besides drag and drop
    library: { bins: [], defs: [] },
    log: {
      doc: null,               // { name, columns, time, channels, rows } | null
      mapping: {},              // tableKey -> { x, y, compare, seeded }
      showPath: true,           // the 3-D path-marker toggle
      view: 'replay',           // 'replay' | 'dwell' -- which panel #logWrap shows
      available: [],            // addon mode: [{name, day, file, size, mtime}]
      warnKey: null,             // dedupe key for the out-of-range toast
      scrub: 0,                  // row index into log.doc.time -- the shared timeline
      playing: false
    }
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  /* ---------- small helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function baseName(fileName) {
    return fileName.replace(/\.[^.]+$/, '');
  }

  /* Reaching for localStorage throws outright in a browser told to block site
     data, so the failure is handled here rather than at every call site. */
  function store() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  var Roles = window.Roles;

  function normTitle(title) {
    return Roles.normTitle(title);
  }

  function hex(n) {
    return '0x' + Number(n).toString(16).toUpperCase();
  }

  /* Coalesce repeated work into one animation frame -- slider drags fire many
     input events per frame and each redraw is far more expensive than one. */
  var frameJobs = {}, framePending = false;
  function onNextFrame(key, fn) {
    frameJobs[key] = fn;
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(function () {
      framePending = false;
      var jobs = frameJobs;
      frameJobs = {};
      Object.keys(jobs).forEach(function (k) { jobs[k](); });
    });
  }

  function toast(message, kind) {
    var box = $('toasts');
    var node = document.createElement('div');
    node.className = 'toast' + (kind ? ' toast-' + kind : '');
    node.textContent = message;
    box.appendChild(node);
    setTimeout(function () { node.classList.add('out'); }, kind === 'error' ? 6000 : 3600);
    setTimeout(function () { node.remove(); }, kind === 'error' ? 6500 : 4100);
  }

  /* ---------- loading ---------- */

  function readFile(file, asText) {
    if (typeof file.arrayBuffer === 'function') {
      return asText ? file.text() : file.arrayBuffer();
    }
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('read error')); };
      fr.onload = function () { resolve(fr.result); };
      if (asText) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }

  /* A definition that matched no image by name is almost always meant for all
     of them -- N versions of one calibration against one XDF is exactly the
     case that used to need N renamed copies. That verdict sticks to the
     definition rather than to the batch it arrived in, because through the
     library the files are clicked one at a time: the XDF is usually taken
     before any image exists, and a batch-only rule left every one of them bare.
     One that did match an image by name stays that image's business, so a
     Granpasso definition is never quietly used to draw a Ducati. */
  function markGeneric(fresh) {
    fresh.forEach(function (def) {
      def.generic = !datasetByName(def.name);
    });
  }

  function adoptOrphans(fresh) {
    var claimed = function (def) {
      return state.datasets.some(function (ds) { return ds.choice === 'def:' + def.id; });
    };
    var generic = genericDefs();
    // more than one candidate is ambiguous: those wait to be picked by hand
    if (generic.length === 1) {
      var orphans = state.datasets.filter(function (ds) { return !ds.doc; });
      if (orphans.length) {
        orphans.forEach(function (ds) { setDef(ds, 'def:' + generic[0].id, true); });
        toast(t('files.linked_all', { name: generic[0].name, count: orphans.length }));
        return;
      }
    }
    // a definition with no image yet is not an error, just a note
    fresh.forEach(function (def) {
      if (!claimed(def)) toast(t('files.unpaired_xdf', { name: def.name }), 'warn');
    });
  }

  function datasetByName(name) {
    return state.datasets.filter(function (d) { return d.file === name; })[0];
  }

  function defById(id) {
    return state.defs.filter(function (d) { return d.id === id; })[0] || null;
  }

  /* Re-dropping a definition refreshes it in place: the id stays, so the links
     already pointing at it keep pointing at the new parse. */
  function addDef(name, doc) {
    var existing = state.defs.filter(function (d) { return d.name === name; })[0];
    if (existing) {
      existing.doc = doc;
      state.datasets.forEach(function (ds) {
        if (ds.choice === 'def:' + existing.id) { ds.doc = doc; ds.cache = {}; }
      });
      return existing;
    }
    var def = { id: 'def' + (++state.defSeq), name: name, doc: doc, generic: false };
    state.defs.push(def);
    return def;
  }

  var genericDefs = function () {
    return state.defs.filter(function (d) { return d.generic; });
  };

  /* The one place ds.doc is ever written. `choice` is the source of truth --
     'def:<id>', 'preset:<id>' or '' -- and the cached grids belong to the
     definition that produced them, so they go with it. */
  function setDef(ds, choice, remember) {
    ds.choice = choice || '';
    var linkName = null, doc = null;
    if (ds.choice.indexOf('def:') === 0) {
      var def = defById(ds.choice.slice(4));
      if (def) { doc = def.doc; linkName = def.name; }
    } else if (ds.choice.indexOf('preset:') === 0) {
      doc = Presets.docFor(ds.choice.slice(7));
    }
    ds.doc = doc;
    ds.cache = {};
    // presets are a fallback, not a link -- only a real definition is worth
    // remembering, and picking one clears whatever was remembered before
    if (remember) {
      Links.remember(state.links, ds.file, linkName);
      Links.save(store(), state.links);
    }
  }

  function addDataset(name, buffer) {
    var ds = {
      id: 'ds' + (++state.seq),
      file: name,
      name: name,
      buffer: buffer,
      doc: null,
      choice: '',
      visible: true,
      color: Viewer.colorFor(state.datasets.length, state.theme),
      cache: {}
    };
    state.datasets.push(ds);
    return ds;
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    // a log is neither a dataset nor a definition -- it never reaches ingest()
    var csv = files.filter(function (f) { return /\.csv$/i.test(f.name); });
    var rest = files.filter(function (f) { return !/\.csv$/i.test(f.name); });
    if (csv.length > 1) toast(t('log.multiple_csv'), 'warn');
    if (csv.length) loadLogFile(csv[0]);
    if (!rest.length) return;
    var jobs = rest.map(function (f) {
      var isXdf = /\.xdf$/i.test(f.name);
      return readFile(f, isXdf).then(function (data) {
        return { name: f.name, base: baseName(f.name), isXdf: isXdf, data: data };
      });
    });
    Promise.all(jobs).then(function (loaded) {
      ingest(loaded, { save: true });
    }).catch(function (e) {
      toast(String(e && e.message || e), 'error');
    });
  }

  /* The one way anything enters the page, whichever door it came through:
     definitions first, so the images that follow can find them. */
  function ingest(loaded, opts) {
    opts = opts || {};
    var fresh = [];
    loaded.forEach(function (item) {
      if (!item.isXdf) return;
      try {
        fresh.push(addDef(item.base, XDF.parse(item.data)));
        if (opts.save) keepDefinition(item);
      } catch (e) {
        toast(t('files.bad_xdf', { name: item.base, err: e.message }), 'error');
      }
    });
    loaded.forEach(function (item) {
      if (item.isXdf) return;
      if (datasetByName(item.base)) { toast(t('files.duplicate', { name: item.base })); return; }
      var ds = addDataset(item.base, item.data);
      var def = Links.resolve(item.base, state.defs, state.links);
      if (def) {
        setDef(ds, 'def:' + def.id, false);
        toast(t('files.paired', { name: item.base }));
      } else {
        toast(t('files.unpaired_bin', { name: item.base }), 'warn');
      }
    });
    markGeneric(fresh);       // after the images, so a name match can be seen
    adoptOrphans(fresh);
    refreshTables();
    renderAll();
  }

  /* A definition dropped by hand is worth keeping where the device can find it
     again -- that is the whole promise of the library. Images are not saved:
     under the addon they belong to the logger, and a drag and drop of one is
     usually a look, not a deposit. */
  function keepDefinition(item) {
    if (!state.store || !state.store.writable('defs')) return;
    if (state.library.defs.some(function (d) { return d.name === item.name; })) return;
    state.store.write('defs', item.name, item.data).then(function () {
      toast(t('lib.saved', { name: item.name }));
      loadLibrary();
    }, function (e) {
      toast(t('lib.save_failed', { name: item.name, err: e.message }), 'warn');
    });
  }

  /* ---------- drive log ---------- */

  function loadLogFile(file) {
    readFile(file, true).then(function (text) {
      applyLogText(text, file.name);
    }).catch(function (e) {
      toast(String(e && e.message || e), 'error');
    });
  }

  function takeLogFromStore(entry) {
    state.store.logs.read(entry).then(function (text) {
      applyLogText(text, entry.name);
    }, function (e) {
      toast(t('log.read_error', { name: entry.name, err: e.message }), 'error');
    });
  }

  function applyLogText(text, name) {
    var doc;
    try {
      doc = Log.parse(text);
    } catch (e) {
      toast(t('log.bad_file', { name: name, err: e.message }), 'error');
      return;
    }
    if (!doc.rows) { toast(t('log.empty', { name: name }), 'warn'); return; }
    doc.name = name;
    stopLogPlay();
    state.log.doc = doc;
    // a fresh log starts unmapped -- a stale channel choice from a previous
    // log could silently point at a column this one does not have
    state.log.mapping = {};
    state.log.warnKey = null;
    // start at the end: the whole ride shown, same as today's picture, until
    // the scrub slider is actually touched
    state.log.scrub = Math.max(0, doc.rows - 1);
    toast(t('log.loaded', { name: name, rows: doc.rows }));
    renderAll();
  }

  function clearLog() {
    stopLogPlay();
    state.log.doc = null;
    state.log.warnKey = null;
    renderAll();
  }

  function fmtElapsed(seconds) {
    var s = Math.max(0, Math.round(seconds || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function updatePlayLabel() {
    if (!el.logPlay) return;
    el.logPlay.textContent = state.log.playing ? '⏸' : '▶';
    var label = t(state.log.playing ? 'log.pause' : 'log.play');
    el.logPlay.title = label;
    el.logPlay.setAttribute('aria-label', label);
  }

  function stopLogPlay() {
    if (playTimer) { window.clearInterval(playTimer); playTimer = null; }
    state.log.playing = false;
    updatePlayLabel();
  }

  /* Compressed into a fixed-length animation regardless of how long the ride
     actually was -- scrubbing through an hour of riding one row at a time,
     in real time, would not get watched. */
  function startLogPlay() {
    if (!state.log.doc || state.log.doc.rows < 2) return;
    if (state.log.scrub >= state.log.doc.rows - 1) state.log.scrub = 0;
    state.log.playing = true;
    updatePlayLabel();
    var tickMs = 80, totalMs = 15000;
    var perTick = Math.max(1, Math.ceil((state.log.doc.rows - 1) * tickMs / totalMs));
    playTimer = window.setInterval(function () {
      state.log.scrub = Math.min(state.log.doc.rows - 1, state.log.scrub + perTick);
      el.logScrub.value = String(state.log.scrub);
      updateLogScrub();
      if (state.log.scrub >= state.log.doc.rows - 1) stopLogPlay();
    }, tickMs);
  }

  /* Moves the shared timeline without rebuilding anything: the playhead line
     restyles, the path highlight restyles, and only the dwell panel -- which
     has no per-trace restyle of its own -- redraws, and only while it is the
     one actually on screen. */
  function updateLogScrub() {
    if (!state.log.doc) return;
    var t0 = state.log.doc.time[state.log.scrub];
    el.logScrubValue.textContent = fmtElapsed(t0) + ' / ' + fmtElapsed(state.log.doc.time[state.log.doc.rows - 1]);
    if (el.logChart && el.logChart.data && el.logChart.data.length) {
      Viewer.setReplayPlayhead(el.logChart, t0, { theme: state.theme });
    }
    Viewer.setPathHighlight(el.plot, lastItems, state.log.scrub, { theme: state.theme });
    if (state.log.view === 'dwell') renderLogDwellPanels(lastItems);
  }

  function mappingFor(tableKey) {
    return state.log.mapping[tableKey] ||
      (state.log.mapping[tableKey] = { x: '', y: '', compare: '', seeded: false });
  }

  /* Only the two main maps have a documented RPM x TPS axis convention, and
     only until a manual choice is made -- seeded once per table key, never
     overwritten again so a deliberate blank ("no compare channel") sticks. */
  function updateLogMapping() {
    if (!state.log.doc || !state.tableKey) return;
    var m = mappingFor(state.tableKey);
    if (m.seeded) return;
    var axes = Log.defaultAxisChannels(state.tableKey, state.log.doc.columns);
    m.x = axes.x;
    m.y = axes.y;
    m.compare = Log.defaultCompareChannel(state.tableKey, state.log.doc.columns);
    m.seeded = true;
  }

  /* param.<key> names a logged channel for display; a raw, unmapped RLI
     column (r53, r6a...) simply shows its own key, via t()'s own fallback. */
  function channelLabel(key) {
    var s = t('param.' + key);
    return s === 'param.' + key ? key : s;
  }

  /* Replays the log through every item's own grid, and warns once if most of
     it falls outside this table's axes -- the sign of a wrong channel or a
     unit mismatch, not just a drive that did not visit every corner. */
  function attachLogData(items) {
    var m = state.log.doc ? state.log.mapping[state.tableKey] : null;
    var warned = false;
    items.forEach(function (item) {
      var oneX = item.grid.x.length === 1;
      var ready = !!(m && m.y && (m.x || oneX));
      item.replay = ready ? Log.replay(item.grid, state.log.doc, m) : null;
      item.path = item.replay ? item.replay.path : null;
      if (!warned && item.replay && item.replay.coverage !== null && item.replay.coverage < 0.5) {
        var key = state.tableKey + '|' + m.x + '|' + m.y;
        if (state.log.warnKey !== key) {
          warned = true;
          state.log.warnKey = key;
          toast(t('log.warn_out_of_range'), 'warn');
        }
      }
    });
  }

  function fillChannelSelect(sel, columns, value, allowNone) {
    sel.innerHTML = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = allowNone ? t('log.compare_none') : t('log.axis_pick');
    sel.appendChild(blank);
    columns.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = channelLabel(c);
      sel.appendChild(o);
    });
    sel.value = value || '';
  }

  function renderLogInfo() {
    var box = el.logInfo;
    if (!box) return;
    var on = !!state.log.doc;
    box.hidden = !on;
    if (!on) return;
    el.logName.textContent = state.log.doc.name;
    var m = mappingFor(state.tableKey || '');
    var cols = state.log.doc.columns;
    fillChannelSelect(el.logAxisY, cols, m.y, false);
    fillChannelSelect(el.logAxisX, cols, m.x, false);
    fillChannelSelect(el.logCompareSel, cols, m.compare, true);
    el.logShowPath.checked = state.log.showPath;
  }

  /* The addon's own list of decoded logs -- same visual language as the
     bins/defs library, shown only while that capability actually answers. */
  function renderLogPanel() {
    var box = el.logPanel, list = el.logList;
    if (!box || !list) return;
    var on = !!(state.store && state.store.logs);
    box.hidden = !on;
    if (!on) return;
    list.innerHTML = '';
    if (!state.log.available.length) {
      var p = document.createElement('p');
      p.className = 'muted pad';
      p.textContent = t('log.list_empty');
      list.appendChild(p);
      return;
    }
    state.log.available.forEach(function (f) {
      var row = document.createElement('button');
      row.className = 'library-row';
      row.type = 'button';
      row.innerHTML = '<span class="library-name">' + esc(f.name) + '</span>' +
        '<span class="mono muted">' + esc(fmtSize(f.size)) + '</span>';
      row.addEventListener('click', function () { takeLogFromStore(f); });
      list.appendChild(row);
    });
  }

  function loadLogListFromStore() {
    if (!state.store || !state.store.logs) {
      state.log.available = [];
      renderLogPanel();
      return Promise.resolve();
    }
    return state.store.logs.list().then(function (files) {
      state.log.available = files;
      renderLogPanel();
    }, function () {
      state.log.available = [];
      renderLogPanel();
    });
  }

  /* One shared panel below the stage, toggled between the replay chart and
     the dwell heatmaps -- both at once does not fit next to the 3-D scene. */
  function renderLogChartPanel(items) {
    if (!el.logWrap) return;
    var wasHidden = el.logWrap.hidden;
    var ready = items.some(function (i) { return i.replay; });
    el.logWrap.hidden = !ready;
    // #plot's canvas keeps whatever pixel size Plotly last gave it; appearing
    // or disappearing changes how much height is left for the 3-D scene, and
    // only a resize call makes the canvas catch up -- otherwise a stale,
    // oversized canvas sits on top of this panel's own controls
    if (el.logWrap.hidden !== wasHidden) window.Plotly.Plots.resize(el.plot);
    if (!ready) return;
    if (state.log.scrub > state.log.doc.rows - 1) state.log.scrub = state.log.doc.rows - 1;
    el.logScrub.max = String(Math.max(0, state.log.doc.rows - 1));
    el.logScrub.value = String(state.log.scrub);
    el.logScrubValue.textContent = fmtElapsed(state.log.doc.time[state.log.scrub]) + ' / ' +
      fmtElapsed(state.log.doc.time[state.log.doc.rows - 1]);
    var showReplay = state.log.view !== 'dwell';
    el.logChart.hidden = !showReplay;
    el.logDwellList.hidden = showReplay;
    if (showReplay) renderLogReplayChart(items); else renderLogDwellPanels(items);
    Viewer.setPathHighlight(el.plot, items, state.log.scrub, { theme: state.theme });
  }

  /* One predicted line per dataset, always emitted (hidden ones included) so
     a dataset toggle can restyle a single trace instead of a rebuild -- the
     same reason the surfaces and the cross-section line do this. */
  function renderLogReplayChart(items) {
    var m = state.log.mapping[state.tableKey];
    var predicted = items.map(function (i) {
      return {
        name: t('log.predicted_suffix', { name: i.name }),
        color: i.color,
        visible: i.visible && !!i.replay,
        values: i.replay ? i.replay.chart.predicted : []
      };
    });
    var actual = null;
    if (m && m.compare && state.log.doc.channels[m.compare]) {
      actual = {
        name: t('log.actual_suffix', { name: channelLabel(m.compare) }),
        values: state.log.doc.channels[m.compare]
      };
    }
    var context = [];
    if (m && m.y && state.log.doc.channels[m.y]) {
      context.push({ name: channelLabel(m.y), values: state.log.doc.channels[m.y] });
    }
    if (m && m.x && state.log.doc.channels[m.x]) {
      context.push({ name: channelLabel(m.x), values: state.log.doc.channels[m.x] });
    }
    var doc = state.log.doc;
    Viewer.drawReplay(el.logChart, {
      theme: state.theme,
      time: doc.time,
      predicted: predicted,
      actual: actual,
      context: context,
      xTitle: t('log.axis_time'),
      yTitle: zTitle()
    }).then(function () {
      Viewer.setReplayPlayhead(el.logChart, doc.time[state.log.scrub], { theme: state.theme });
    });
  }

  /* Cumulative up to the scrub position, via the same Log.replay() the full
     picture uses -- a prefix of the log in, the matching prefix of dwell out,
     no separate running-total bookkeeping to keep in sync with it. */
  function renderLogDwellPanels(items) {
    var box = el.logDwellList;
    box.innerHTML = '';
    var m = state.log.mapping[state.tableKey];
    var upTo = Log.sliceTo(state.log.doc, state.log.scrub + 1);
    items.filter(function (i) { return i.visible && i.replay; }).forEach(function (item) {
      var wrap = document.createElement('div');
      wrap.className = 'log-dwell';
      var name = document.createElement('p');
      name.className = 'log-dwell-name';
      name.textContent = item.name;
      var plot = document.createElement('div');
      plot.className = 'log-dwell-plot';
      wrap.appendChild(name);
      wrap.appendChild(plot);
      box.appendChild(wrap);
      var dwell = Log.replay(item.grid, upTo, m).dwell;
      Viewer.drawDwell(plot, {
        x: item.grid.x, y: item.grid.y, seconds: dwell.seconds
      }, { theme: state.theme, color: item.color });
    });
  }

  /* ---------- library ---------- */

  function fmtSize(n) {
    if (!(n > 0)) return '';
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB'
      : n >= 1024 ? Math.round(n / 1024) + ' kB' : n + ' B';
  }

  function loadLibrary() {
    if (!state.store || state.store.kind === 'none') return Promise.resolve();
    return state.store.list().then(function (l) {
      state.library = { bins: l.bins || [], defs: l.defs || [] };
      renderLibrary();
    }, function (e) {
      toast(t('lib.load_failed', { name: t('lib.title'), err: e.message }), 'warn');
    });
  }

  /* Clicking a row is the same arrival as a drop, minus the file picker --
     it goes through ingest() so pairing and links behave identically. */
  function takeFromLibrary(kind, name) {
    var isXdf = kind === 'defs';
    if (!isXdf && datasetByName(baseName(name))) {
      toast(t('files.duplicate', { name: baseName(name) }));
      return;
    }
    state.store.read(kind, name).then(function (data) {
      ingest([{ name: name, base: baseName(name), isXdf: isXdf, data: data }], { save: false });
    }, function (e) {
      toast(t('lib.load_failed', { name: name, err: e.message }), 'error');
    });
  }

  function renderLibrary() {
    var box = el.library, list = el.libList;
    if (!box || !list) return;
    var on = !!state.store && state.store.kind !== 'none';
    box.hidden = !on;
    if (!on) return;
    list.innerHTML = '';
    var groups = [['bins', t('lib.bins')], ['defs', t('lib.defs')]];
    var any = false;
    groups.forEach(function (g) {
      var rows = state.library[g[0]];
      if (!rows.length) return;
      any = true;
      var head = document.createElement('p');
      head.className = 'library-group muted';
      head.textContent = g[1];
      list.appendChild(head);
      rows.forEach(function (f) {
        var row = document.createElement('button');
        row.className = 'library-row';
        row.type = 'button';
        row.innerHTML = '<span class="library-name">' + esc(f.name) + '</span>' +
          '<span class="mono muted">' + esc(fmtSize(f.size)) + '</span>';
        row.addEventListener('click', function () { takeFromLibrary(g[0], f.name); });
        list.appendChild(row);
      });
    });
    if (!any) {
      var p = document.createElement('p');
      p.className = 'muted pad';
      p.textContent = t('lib.empty');
      list.appendChild(p);
    }
  }

  /* Images named in the query string, in the order they were asked for.
     onboard-logger's Firmware tab builds this when "Show map" is pressed, and
     reuses one named tab -- so arriving here is also how a *second* press is
     seen: the page simply loads again with a different selection. */
  function queryBins(search) {
    var out = [];
    String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0 || pair.slice(0, i) !== 'bin') return;
      var name = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      if (name && out.indexOf(name) < 0) out.push(name);
    });
    return out;
  }

  /* Every stored definition first, then the images -- in one ingest, so a lone
     definition adopts the whole selection instead of only the first file. */
  function bootFromQuery(search) {
    var names = queryBins(search);
    if (!names.length || !state.store || state.store.kind === 'none') {
      return Promise.resolve();
    }
    var defs = state.library.defs.map(function (d) {
      return state.store.read('defs', d.name).then(function (text) {
        return { name: d.name, base: baseName(d.name), isXdf: true, data: text };
      }, function () { return null; });
    });
    var bins = names.map(function (n) {
      return state.store.read('bins', n).then(function (data) {
        return { name: n, base: baseName(n), isXdf: false, data: data };
      }, function (e) {
        toast(t('lib.load_failed', { name: n, err: e.message }), 'error');
        return null;
      });
    });
    return Promise.all(defs.concat(bins)).then(function (items) {
      ingest(items.filter(Boolean), { save: false });
    });
  }

  /* ---------- tables ---------- */

  function tablesOf(ds) {
    return ds.doc ? ds.doc.tables : [];
  }

  /* Union of the maps across every loaded definition, matched by title. */
  function tableIndex() {
    var map = {};
    state.datasets.forEach(function (ds) {
      tablesOf(ds).forEach(function (tb) {
        var key = normTitle(tb.title);
        if (!map[key]) map[key] = { key: key, title: tb.title, is3d: tb.is3d, owners: [] };
        if (map[key].owners.indexOf(ds.id) < 0) map[key].owners.push(ds.id);
        map[key].is3d = map[key].is3d || tb.is3d;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) {
        if (a.owners.length !== b.owners.length) return b.owners.length - a.owners.length;
        return a.title.localeCompare(b.title);
      });
  }

  function findTable(ds, key) {
    if (key && key.charAt(0) === '@') return Roles.pick(tablesOf(ds), key);
    var hit = tablesOf(ds).filter(function (tb) { return normTitle(tb.title) === key; });
    return hit.length ? hit[0] : null;
  }

  function gridFor(ds, key) {
    if (!key) return null;
    if (ds.cache[key] !== undefined) return ds.cache[key];
    var tb = findTable(ds, key);
    var grid = null;
    if (tb) {
      try {
        grid = XDF.readTable(ds.doc, tb, ds.buffer);
        grid.address = tb.z.address + ds.doc.baseOffset;
      } catch (e) {
        grid = null;
        ds.cache[key + ':err'] = e.message;
      }
    }
    ds.cache[key] = grid;
    return grid;
  }

  function refreshTables() {
    var list = tableIndex();
    var total = state.datasets.filter(function (d) { return d.doc; }).length;
    var sel = el.tableSel;
    sel.innerHTML = '';
    if (!list.length) {
      var opt = document.createElement('option');
      opt.textContent = t('table.none');
      opt.value = '';
      sel.appendChild(opt);
      sel.disabled = true;
      state.tableKey = null;
      return;
    }
    sel.disabled = false;

    var roleEntries = Roles.listed().map(function (r) {
      var owners = state.datasets.filter(function (ds) {
        return ds.doc && Roles.pick(tablesOf(ds), r.key);
      });
      return { key: r.key, title: t(r.label), owners: owners, is3d: true };
    }).filter(function (r) { return r.owners.length > 0; });

    if (roleEntries.length) {
      var rg = document.createElement('optgroup');
      rg.label = t('table.group_role');
      roleEntries.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r.key;
        o.textContent = r.title + '  ' + t('table.count', { have: r.owners.length, total: total });
        rg.appendChild(o);
      });
      sel.appendChild(rg);
    }

    [['3d', t('table.group3d')], ['1d', t('table.group2d')]].forEach(function (grp) {
      var members = list.filter(function (x) { return grp[0] === '3d' ? x.is3d : !x.is3d; });
      if (!members.length) return;
      var og = document.createElement('optgroup');
      og.label = grp[1];
      members.forEach(function (x) {
        var o = document.createElement('option');
        o.value = x.key;
        o.textContent = x.title + '  ' + t('table.count', { have: x.owners.length, total: total });
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    // keep the current pick if it still exists, else prefer the ignition map
    var keys = roleEntries.map(function (x) { return x.key; })
      .concat(list.map(function (x) { return x.key; }));
    if (!state.tableKey || keys.indexOf(state.tableKey) < 0) {
      var ignitionRole = roleEntries.filter(function (x) { return x.key === '@ign-main'; })[0];
      var any3d = list.filter(function (x) { return x.is3d; })[0];
      state.tableKey = (ignitionRole || roleEntries[0] || any3d || list[0]).key;
    }
    sel.value = state.tableKey;
  }

  /* ---------- items for the scene ---------- */

  function baseDataset() {
    var withGrid = state.datasets.filter(function (d) { return gridFor(d, state.tableKey); });
    var picked = withGrid.filter(function (d) { return d.id === state.baseId; })[0];
    return picked || withGrid[0] || null;
  }

  /* What the scene should draw right now, in dataset order. */
  function buildItems() {
    var key = state.tableKey;
    var items = [];
    var base = state.mode === 'diff' ? baseDataset() : null;
    var baseGrid = base ? gridFor(base, key) : null;

    state.datasets.forEach(function (ds) {
      var g = gridFor(ds, key);
      if (!g) return;
      if (state.mode === 'diff') {
        if (!base || ds.id === base.id) return;
        items.push({
          ds: ds, name: ds.name, color: ds.color, visible: ds.visible,
          units: g.units, digits: Math.max(1, g.decimals),
          grid: { x: baseGrid.x, y: baseGrid.y, z: Grid.difference(g, baseGrid) }
        });
      } else {
        items.push({
          ds: ds, name: ds.name, color: ds.color, visible: ds.visible,
          units: g.units, digits: g.decimals, yUnits: g.yUnits,
          grid: g
        });
      }
    });
    return items;
  }

  function zTitle() {
    if (state.mode === 'diff') {
      var b = baseDataset();
      return t('axis.delta', { name: b ? b.name : '?' });
    }
    var key = state.tableKey || '';
    if (/ign/.test(key)) return t('axis.advance');
    return t('axis.value');
  }

  /* ---------- rendering ---------- */

  var lastItems = [];
  var curveMode = false;
  var playTimer = null;   // the scrub timeline's play/pause interval, if running

  /* A table with a single column is a curve, not a surface: plot it as one. */
  function isCurve(items) {
    return items.length > 0 && items.every(function (i) { return i.grid.z[0].length === 1; });
  }

  function curveXTitle(items) {
    var first = items[0];
    if (first && first.yUnits) return first.yUnits;
    // the y axis of these tables is nearly always the rpm breakpoint list
    var ys = first ? first.grid.y : [];
    if (ys.length > 2 && ys[0] >= 400 && ys[ys.length - 1] > 2000) return t('axis.rpm');
    return t('axis.breakpoint');
  }

  function renderPlot() {
    var items = buildItems();
    attachLogData(items);
    lastItems = items;
    var visible = items.filter(function (i) { return i.visible; });
    var wasCurve = curveMode;
    curveMode = isCurve(items);
    document.body.classList.toggle('curve-mode', curveMode);
    el.empty.hidden = visible.length > 0;
    el.empty.textContent = state.mode === 'diff' && items.length === 0
      ? t('plot.diff_need_base')
      : t('plot.empty');

    if (curveMode) {
      el.plot.hidden = true;
      el.curve.hidden = false;
      var series = visible.map(function (i) {
        return {
          name: i.name, color: i.color,
          at: i.grid.y,
          values: i.grid.z.map(function (row) { return row[0]; })
        };
      });
      Viewer.drawSlice(el.curve, series, {
        theme: state.theme,
        xTitle: curveXTitle(items),
        yTitle: zTitle()
      });
      window.Plotly.Plots.resize(el.curve);
    } else {
      el.curve.hidden = true;
      el.plot.hidden = false;
      Viewer.draw(el.plot, items, {
        theme: state.theme,
        contours: state.contours,
        opacity: state.opacity,
        diff: state.mode === 'diff',
        zTitle: zTitle(),
        slice: sliceSpec(items),
        showPath: state.log.showPath,
        camera: Viewer.currentCamera(el.plot)
      });
      // only worth a resize when the stage swapped renderers; a plain redraw
      // already fits the box, and a resize costs a full relayout
      if (wasCurve) window.Plotly.Plots.resize(el.plot);
    }
    renderSlice(items);
    renderLogChartPanel(items);
  }

  /* The cut the slider currently points at, or null when it is off. */
  function sliceSpec(items) {
    if (state.sliceAxis === 'off' || curveMode) return null;
    var axisVals = sliceAxisValues(items);
    if (!axisVals.length) return null;
    var i = Math.min(state.sliceIndex, axisVals.length - 1);
    return { axis: state.sliceAxis, value: axisVals[i] };
  }

  function sliceAxisValues(items) {
    var first = items.filter(function (i) { return i.visible; })[0] || items[0];
    if (!first) return [];
    return state.sliceAxis === 'rpm' ? first.grid.y : first.grid.x;
  }

  function renderSlice(items) {
    if (!el.sliceWrap || !el.slicePlot) return;
    var on = state.sliceAxis !== 'off' && !curveMode;
    var wasOn = !el.sliceWrap.hidden;
    el.sliceWrap.hidden = !on;
    // the 3-D canvas keeps its old height unless it is told the box changed
    if (on !== wasOn) window.Plotly.Plots.resize(el.plot);
    if (!on) {
      Viewer.updateSlice(el.plot, items, null, { theme: state.theme });
      return;
    }
    var axisVals = sliceAxisValues(items);
    // nothing to cut (difference mode with a single map, say): keep the panel
    // out of the way instead of leaving an empty box behind
    if (!axisVals.length || !items.some(function (i) { return i.visible; })) {
      el.sliceWrap.hidden = true;
      if (wasOn) window.Plotly.Plots.resize(el.plot);
      return;
    }
    if (state.sliceIndex >= axisVals.length) state.sliceIndex = axisVals.length - 1;
    el.sliceRange.max = String(axisVals.length - 1);
    el.sliceRange.value = String(state.sliceIndex);
    var at = axisVals[state.sliceIndex];
    el.sliceValue.textContent = state.sliceAxis === 'rpm'
      ? Viewer.fmt(at, 0) + ' ' + 'rpm'
      : Viewer.fmt(at, 2) + ' °';

    // the same cut, drawn on the surfaces themselves
    Viewer.updateSlice(el.plot, items, { axis: state.sliceAxis, value: at }, { theme: state.theme });

    var series = items.filter(function (i) { return i.visible; }).map(function (i) {
      var s = Grid.slice(i.grid, state.sliceAxis === 'rpm' ? 'y' : 'x', at);
      return { name: i.name, color: i.color, at: s.at, values: s.values };
    });
    // the rotated y title eats the chart if a long custom name lands in it
    var yTitle = zTitle();
    if (yTitle.length > 22) yTitle = yTitle.slice(0, 21) + '…';
    Viewer.drawSlice(el.slicePlot, series, {
      theme: state.theme,
      xTitle: state.sliceAxis === 'rpm' ? t('axis.tps') : t('axis.rpm'),
      yTitle: yTitle
    });
  }

  /* Mini heat map for the sidebar: the map's shape at a glance. */
  function drawThumb(canvas, grid, color) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!grid) {
      ctx.fillStyle = 'rgba(128,128,128,0.12)';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    var range = Grid.extent(grid.z) || [0, 1];
    var span = range[1] - range[0] || 1;
    var rows = grid.z.length, cols = grid.z[0].length;

    if (cols === 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = 0; i < rows; i++) {
        var px = rows > 1 ? (i / (rows - 1)) * (w - 3) + 1.5 : w / 2;
        var py = h - 2 - ((grid.z[i][0] - range[0]) / span) * (h - 4);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      return;
    }

    var cw = w / cols, ch = h / rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var f = (grid.z[r][c] - range[0]) / span;
        // low values fade toward the panel, high values toward the series hue
        ctx.fillStyle = Viewer.mix(color, state.theme === 'light' ? '#ffffff' : '#141519', 1 - Math.pow(f, 0.85));
        // rows run low rpm -> high rpm; draw high rpm at the top like the plot
        ctx.fillRect(c * cw, h - (r + 1) * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
  }

  /* Loaded definitions first, then the built-in presets: two namespaces in one
     control, so the value carries which one it came from. */
  function defOptions(ds) {
    var opt = function (value, label, extra) {
      return '<option value="' + esc(value) + '"' + (ds.choice === value ? ' selected' : '') +
        '>' + esc(label) + (extra ? ' · ' + esc(extra) : '') + '</option>';
    };
    var out = [opt('', t('ds.preset_none'))];
    if (state.defs.length) {
      out.push('<optgroup label="' + esc(t('ds.def_loaded')) + '">');
      state.defs.forEach(function (d) { out.push(opt('def:' + d.id, d.name)); });
      out.push('</optgroup>');
    }
    out.push('<optgroup label="' + esc(t('ds.def_preset')) + '">');
    Presets.PLATFORMS.forEach(function (p) {
      out.push(opt('preset:' + p.id, p.name, hex(p.address)));
    });
    out.push('</optgroup>');
    return out.join('');
  }

  function renderSidebar() {
    var list = el.dsList;
    list.innerHTML = '';
    if (!state.datasets.length) {
      var p = document.createElement('p');
      p.className = 'muted pad';
      p.textContent = t('files.none');
      list.appendChild(p);
      return;
    }

    state.datasets.forEach(function (ds) {
      var grid = gridFor(ds, state.tableKey);
      var isBase = state.mode === 'diff' && baseDataset() && baseDataset().id === ds.id;
      var row = document.createElement('article');
      row.className = 'ds' + (ds.visible && !isBase ? '' : ' off') + (isBase ? ' is-base' : '');
      row.style.setProperty('--ds-color', ds.color);

      // the picker stays on every card: which definition explains this image is
      // a standing choice, not a one-off rescue for an unpaired drop
      var meta = '<select class="defsel" aria-label="' + esc(t('ds.preset')) + '">' +
        defOptions(ds) + '</select>';
      var missing = false;
      if (!ds.doc) {
        /* nothing to report until this image has a definition */
      } else if (grid) {
        var range = Grid.extent(grid.z) || [0, 0];
        meta += '<span class="mono">' + esc(t('stat.cells', {
          rows: grid.rows, cols: grid.cols, addr: hex(grid.address)
        })) + '</span><span class="mono val">' + esc(t('stat.range', {
          min: Viewer.fmt(range[0], grid.decimals), max: Viewer.fmt(range[1], grid.decimals)
        })) + '</span>';
      } else {
        var err = ds.cache[state.tableKey + ':err'];
        meta += '<span class="alert">' + esc(err ? t('ds.read_error', { err: err }) : t('ds.no_table')) + '</span>';
        missing = true;
      }

      // a map the definition does not carry is a dead card: say so loudly
      if (missing) row.classList.add('missing');

      row.innerHTML =
        '<label class="ds-head">' +
          '<input type="checkbox" class="vis"' + (ds.visible ? ' checked' : '') +
            ' aria-label="' + esc(t('ds.visible')) + '">' +
          '<canvas class="thumb" width="80" height="52" aria-hidden="true"></canvas>' +
          '<input class="ds-name" value="' + esc(ds.name) + '" aria-label="' + esc(t('ds.name')) + '" spellcheck="false">' +
          (isBase ? '<span class="badge">' + esc(t('ds.base_badge')) + '</span>' : '') +
        '</label>' +
        '<div class="ds-meta">' + meta + '</div>' +
        '<button class="icon remove" title="' + esc(t('ds.remove')) + '" aria-label="' + esc(t('ds.remove')) + '">×</button>';

      drawThumb(row.querySelector('.thumb'), grid, ds.color);

      row.querySelector('.vis').addEventListener('change', function (ev) {
        ds.visible = ev.target.checked;
        row.classList.toggle('off', !ds.visible);
        var idx = curveMode ? -1 : lastItems.map(function (i) { return i.ds; }).indexOf(ds);
        if (idx >= 0) {
          // toggle in place, then rescale the axis to the visible maps only
          Viewer.setVisible(el.plot, lastItems, idx, ds.visible, {
            theme: state.theme, slice: sliceSpec(lastItems), showPath: state.log.showPath
          });
          renderSlice(lastItems);
          // a single-trace restyle on the small chart, never a rebuild
          Viewer.setReplayVisible(el.logChart, idx, ds.visible && !!lastItems[idx].replay);
          // the dwell heatmap has no per-trace restyle (one Plotly div per
          // dataset), so a hidden or newly-shown one only leaves a stale
          // panel behind if this does not redraw it
          if (state.log.view === 'dwell') renderLogDwellPanels(lastItems);
          var stillVisible = lastItems.some(function (i) { return i.visible; });
          el.empty.hidden = stillVisible;
        } else {
          renderPlot();
        }
      });

      row.querySelector('.ds-name').addEventListener('input', function (ev) {
        ds.name = ev.target.value || ds.file;
        renderPlot();
      });

      row.querySelector('.remove').addEventListener('click', function () {
        state.datasets = state.datasets.filter(function (d) { return d !== ds; });
        state.datasets.forEach(function (d, i) { d.color = Viewer.colorFor(i, state.theme); });
        refreshTables();
        renderAll();
      });

      row.querySelector('.defsel').addEventListener('change', function (ev) {
        setDef(ds, ev.target.value, true);
        refreshTables();
        renderAll();
      });

      list.appendChild(row);
    });
  }

  function renderBaseSelect() {
    var sel = el.baseSel;
    var current = state.baseId;
    sel.innerHTML = '';
    state.datasets.forEach(function (ds) {
      var o = document.createElement('option');
      o.value = ds.id;
      o.textContent = ds.name;
      sel.appendChild(o);
    });
    var base = baseDataset();
    state.baseId = base ? base.id : null;
    if (state.baseId) sel.value = state.baseId;
    else if (current) state.baseId = current;
    el.baseField.hidden = state.mode !== 'diff';
  }

  function renderAll() {
    updateLogMapping();
    renderBaseSelect();
    renderSidebar();
    renderLibrary();          // its group headings are translated too
    renderLogPanel();
    renderLogInfo();
    renderPlot();
  }

  /* ---------- chrome ---------- */

  function fillLangSelect() {
    if (!el.langSel) return;
    el.langSel.innerHTML = '';
    window.I18N.list().forEach(function (loc) {
      var o = document.createElement('option');
      o.value = loc.code;
      o.textContent = loc.name;   // each locale names itself, in itself
      el.langSel.appendChild(o);
    });
  }

  function applyLang(lang) {
    window.I18N.setLang(lang);
    lang = window.I18N.getLang();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      node.title = t(node.getAttribute('data-i18n-title'));
    });
    if (el.langSel) {
      el.langSel.value = lang;
      el.langSel.setAttribute('aria-label', t('lang.label'));
      el.langSel.title = t('lang.label');
    }
    el.btnTheme.textContent = state.theme === 'dark' ? t('theme.light') : t('theme.dark');
    updatePlayLabel();
    try { localStorage.setItem('lang', lang); } catch (e) { /* private mode */ }
    refreshTables();
    renderAll();
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    state.datasets.forEach(function (d, i) { d.color = Viewer.colorFor(i, theme); });
    el.btnTheme.textContent = theme === 'dark' ? t('theme.light') : t('theme.dark');
    try { localStorage.setItem('theme', theme); } catch (e) { /* private mode */ }
    renderAll();
  }

  function bind() {
    el.file.addEventListener('change', function (ev) {
      handleFiles(ev.target.files);
      ev.target.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      el.drop.addEventListener(evt, function (e) { e.preventDefault(); el.drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      el.drop.addEventListener(evt, function (e) { e.preventDefault(); el.drop.classList.remove('over'); });
    });
    el.drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    el.tableSel.addEventListener('change', function (ev) {
      state.tableKey = ev.target.value;
      renderAll();
    });

    el.modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.mode = btn.dataset.mode;
        el.modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        renderAll();
      });
    });

    el.baseSel.addEventListener('change', function (ev) {
      state.baseId = ev.target.value;
      renderAll();
    });

    el.contours.addEventListener('change', function (ev) {
      // measured: restyling the contour object rebuilds the mesh anyway and
      // lands slower than a plain redraw, so this one stays a redraw
      state.contours = ev.target.checked;
      renderPlot();
    });

    el.opacity.addEventListener('input', function (ev) {
      state.opacity = Number(ev.target.value) / 100;
      if (curveMode || !lastItems.length) { renderPlot(); return; }
      onNextFrame('opacity', function () {
        Viewer.setOpacity(el.plot, lastItems, state.opacity);
      });
    });

    el.sliceSel.addEventListener('change', function (ev) {
      state.sliceAxis = ev.target.value;
      state.sliceIndex = 0;
      renderSlice(lastItems);
    });

    el.sliceRange.addEventListener('input', function (ev) {
      state.sliceIndex = Number(ev.target.value);
      onNextFrame('slice', function () { renderSlice(lastItems); });
    });

    if (el.libRefresh) {
      el.libRefresh.addEventListener('click', function () { loadLibrary(); });
    }

    if (el.logRefresh) {
      el.logRefresh.addEventListener('click', function () { loadLogListFromStore(); });
    }

    el.logClear.addEventListener('click', clearLog);

    ['logAxisY', 'logAxisX'].forEach(function (id, i) {
      el[id].addEventListener('change', function (ev) {
        mappingFor(state.tableKey)[i === 0 ? 'y' : 'x'] = ev.target.value;
        renderPlot();
      });
    });
    el.logCompareSel.addEventListener('change', function (ev) {
      mappingFor(state.tableKey).compare = ev.target.value;
      renderLogChartPanel(lastItems);
    });

    el.logShowPath.addEventListener('change', function (ev) {
      state.log.showPath = ev.target.checked;
      renderPlot();
    });

    el.logViewBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.log.view = btn.dataset.logview;
        el.logViewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        renderLogChartPanel(lastItems);
      });
    });

    el.logPlay.addEventListener('click', function () {
      if (state.log.playing) stopLogPlay(); else startLogPlay();
    });

    el.logScrub.addEventListener('input', function (ev) {
      stopLogPlay();
      state.log.scrub = Number(ev.target.value);
      onNextFrame('logScrub', updateLogScrub);
    });

    el.btnReset.addEventListener('click', function () { Viewer.resetCamera(el.plot); });

    el.btnPng.addEventListener('click', function () {
      var name = (state.tableKey || 'map').replace(/^@/, '').replace(/[^\w.-]+/g, '-');
      Viewer.toPng(curveMode ? el.curve : el.plot, 'ecu-' + name);
    });

    el.langSel.addEventListener('change', function (ev) {
      applyLang(ev.target.value);
    });

    el.btnTheme.addEventListener('click', function () {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    el.btnSide.addEventListener('click', function () {
      document.body.classList.toggle('side-open');
    });

    if (el.btnInfo && el.about) {
      el.btnInfo.addEventListener('click', function () {
        if (typeof el.about.showModal === 'function') el.about.showModal();
        else el.about.setAttribute('open', '');   // very old engines
      });
    }
  }

  function init() {
    ['file', 'drop', 'tableSel', 'dsList', 'library', 'libList', 'libRefresh',
      'logPanel', 'logList', 'logRefresh', 'logInfo', 'logName', 'logClear',
      'logAxisY', 'logAxisX', 'logCompareSel', 'logShowPath', 'logWrap', 'logChart', 'logDwellList',
      'logPlay', 'logScrub', 'logScrubValue',
      'plot', 'curve', 'empty', 'sliceWrap', 'slicePlot',
      'sliceSel', 'sliceRange', 'sliceValue', 'contours', 'opacity', 'baseSel', 'baseField',
      'btnReset', 'btnPng', 'langSel', 'btnTheme', 'btnSide', 'btnInfo', 'about', 'toasts'].forEach(function (id) {
      el[id] = $(id);
    });
    // A stale cached index.html must not take the whole render down with it.
    if (!el.curve && el.plot && el.plot.parentNode) {
      el.curve = document.createElement('div');
      el.curve.id = 'curve';
      el.curve.className = 'plot';
      el.curve.hidden = true;
      el.plot.parentNode.insertBefore(el.curve, el.plot.nextSibling);
    }
    el.modeBtns = Array.prototype.slice.call(document.querySelectorAll('[data-mode]'));
    el.logViewBtns = Array.prototype.slice.call(document.querySelectorAll('[data-logview]'));

    // no stored choice yet: follow the browser, fall back to English
    var savedTheme = 'dark', savedLang = window.I18N.preferred();
    // outside the try below: a theme read that throws must not cost the links
    state.links = Links.load(store());
    try {
      savedTheme = localStorage.getItem('theme') || savedTheme;
      savedLang = localStorage.getItem('lang') || savedLang;
    } catch (e) { /* private mode */ }

    fillLangSelect();
    bind();
    Store.detect({
      fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
      pathname: window.location && window.location.pathname
    }).then(function (st) {
      state.store = st;
      renderLibrary();
      renderLogPanel();
      return Promise.all([loadLibrary(), loadLogListFromStore()]);
    }).then(function () {
      return bootFromQuery(window.location && window.location.search);
    });
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    applyLang(savedLang);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
