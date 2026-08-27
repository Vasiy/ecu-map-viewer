/*
 * Wiring: files in, surfaces out.
 *
 * A dataset is one firmware image plus the definition that explains it. Images
 * and definitions are paired by file name (granpasso.bin + granpasso.xdf); an
 * image that arrives alone can borrow one of the built-in preset definitions.
 */
(function () {
  'use strict';

  var t = window.I18N.t;
  var XDF = window.XDF, Grid = window.Grid, Presets = window.Presets, Viewer = window.Viewer;

  var state = {
    datasets: [],
    pendingDefs: {},          // basename -> parsed xdf waiting for its image
    tableKey: null,
    mode: 'surface',
    baseId: null,
    contours: true,
    opacity: 0.95,
    sliceAxis: 'off',
    sliceIndex: 0,
    theme: 'dark',
    seq: 0
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

  /*
   * The same physical map is titled differently on every platform
   * ("Ignition Main advance", "Ignition - Main", "Ignition map"), so a role
   * matches it by meaning. Roles are what makes a cross-platform comparison
   * one click instead of one pick per firmware.
   */
  var ROLES = [
    { key: '@ign-main', label: 'role.ign_main', family: /\bignition\b|\bspark\b/, kind: /\bmain\b|\bmap\b|\badvance\b/ },
    { key: '@ign-delta', label: 'role.ign_delta', family: /\bignition\b|\bspark\b/, kind: /\bdelta\b/ },
    { key: '@fuel-main', label: 'role.fuel_main', family: /\bfuel\b|\binjection\b/, kind: /\bmain\b|\bmap\b/ },
    { key: '@fuel-delta', label: 'role.fuel_delta', family: /\bfuel\b|\binjection\b/, kind: /\bdelta\b/ }
  ];
  // qualifiers that mean "a correction of the map", not the map itself
  var NOT_MAIN = /\boffset\b|\btemp\b|\btemperature\b|\bidle\b|\bdwell\b|\bcut\b|\bcorrection\b|\bcorr\b|\bmultiplier\b|\btorque\b|\bthreshold\b|\bstartup\b|\bstart\b|\bphase\b|\bwarm\b|\btrim\b|\bflow\b|\blegend\b|\bbreakpoint/;

  function roleWords(title) {
    return String(title).toLowerCase()
      .replace(/^\[[^\]]*\]\s*/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function roleOf(table) {
    var w = roleWords(table.title);
    for (var i = 0; i < ROLES.length; i++) {
      var r = ROLES[i];
      if (!r.family.test(w) || !r.kind.test(w)) continue;
      if (r.key.indexOf('main') > 0 && NOT_MAIN.test(w)) continue;
      return r.key;
    }
    return null;
  }

  function roleTable(ds, roleKey) {
    var hits = tablesOf(ds).filter(function (tb) { return roleOf(tb) === roleKey; });
    if (!hits.length) return null;
    // prefer a surface over a curve, then the shortest title (least qualified)
    hits.sort(function (a, b) {
      if (a.is3d !== b.is3d) return a.is3d ? -1 : 1;
      return a.title.length - b.title.length;
    });
    return hits[0];
  }

  function normTitle(title) {
    return String(title).toLowerCase()
      .replace(/^\[[^\]]*\]\s*/, '')          // "[corsaro] Ignition Idle" -> "Ignition Idle"
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hex(n) {
    return '0x' + Number(n).toString(16).toUpperCase();
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
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('read error')); };
      fr.onload = function () { resolve(fr.result); };
      if (asText) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }

  function datasetByName(name) {
    return state.datasets.filter(function (d) { return d.file === name; })[0];
  }

  function addDataset(name, buffer, doc) {
    var ds = {
      id: 'ds' + (++state.seq),
      file: name,
      name: name,
      buffer: buffer,
      doc: doc || null,
      visible: true,
      color: Viewer.colorFor(state.datasets.length, state.theme),
      cache: {}
    };
    state.datasets.push(ds);
    return ds;
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    var jobs = files.map(function (f) {
      var isXdf = /\.xdf$/i.test(f.name);
      return readFile(f, isXdf).then(function (data) {
        return { name: f.name, base: baseName(f.name), isXdf: isXdf, data: data };
      });
    });
    Promise.all(jobs).then(function (loaded) {
      loaded.forEach(function (item) {
        if (item.isXdf) {
          try {
            state.pendingDefs[item.base] = XDF.parse(item.data);
          } catch (e) {
            toast(t('files.bad_xdf', { name: item.base, err: e.message }), 'error');
          }
        }
      });
      loaded.forEach(function (item) {
        if (item.isXdf) return;
        if (datasetByName(item.base)) { toast(t('files.duplicate', { name: item.base })); return; }
        var doc = state.pendingDefs[item.base] || null;
        addDataset(item.base, item.data, doc);
        if (doc) toast(t('files.paired', { name: item.base }));
        else toast(t('files.unpaired_bin', { name: item.base }), 'warn');
      });
      // a definition with no image yet is not an error, just a note
      loaded.forEach(function (item) {
        if (!item.isXdf) return;
        if (!datasetByName(item.base) && state.pendingDefs[item.base]) {
          toast(t('files.unpaired_xdf', { name: item.base }), 'warn');
        }
      });
      refreshTables();
      renderAll();
    }).catch(function (e) {
      toast(String(e && e.message || e), 'error');
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
    if (key && key.charAt(0) === '@') return roleTable(ds, key);
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

    var roleEntries = ROLES.map(function (r) {
      var owners = state.datasets.filter(function (ds) { return ds.doc && roleTable(ds, r.key); });
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
    lastItems = items;
    var visible = items.filter(function (i) { return i.visible; });
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
        camera: Viewer.currentCamera(el.plot)
      });
      window.Plotly.Plots.resize(el.plot);
    }
    renderSlice(items);
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

  function presetOptions(selected) {
    var out = ['<option value="">' + esc(t('ds.preset_none')) + '</option>'];
    Presets.PLATFORMS.forEach(function (p) {
      out.push('<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' +
        esc(p.name) + ' · ' + hex(p.address) + '</option>');
    });
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

      var meta;
      if (!ds.doc) {
        meta = '<select class="preset" aria-label="' + esc(t('ds.preset')) + '">' + presetOptions(ds.presetId) + '</select>';
      } else if (grid) {
        var range = Grid.extent(grid.z) || [0, 0];
        meta = '<span class="mono">' + esc(t('stat.cells', {
          rows: grid.rows, cols: grid.cols, addr: hex(grid.address)
        })) + '</span><span class="mono val">' + esc(t('stat.range', {
          min: Viewer.fmt(range[0], grid.decimals), max: Viewer.fmt(range[1], grid.decimals)
        })) + '</span>';
      } else {
        var err = ds.cache[state.tableKey + ':err'];
        meta = '<span class="warn">' + esc(err ? t('ds.read_error', { err: err }) : t('ds.no_table')) + '</span>';
      }

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
            theme: state.theme, slice: sliceSpec(lastItems)
          });
          renderSlice(lastItems);
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

      var preset = row.querySelector('.preset');
      if (preset) {
        preset.addEventListener('change', function (ev) {
          ds.presetId = ev.target.value;
          ds.doc = ds.presetId ? Presets.docFor(ds.presetId) : null;
          ds.cache = {};
          refreshTables();
          renderAll();
        });
      }

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
    renderBaseSelect();
    renderSidebar();
    renderPlot();
  }

  /* ---------- chrome ---------- */

  function applyLang(lang) {
    window.I18N.setLang(lang);
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      node.title = t(node.getAttribute('data-i18n-title'));
    });
    el.btnLang.textContent = t('lang');
    el.btnTheme.textContent = state.theme === 'dark' ? t('theme.light') : t('theme.dark');
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
      state.contours = ev.target.checked;
      renderPlot();
    });

    el.opacity.addEventListener('input', function (ev) {
      state.opacity = Number(ev.target.value) / 100;
      renderPlot();
    });

    el.sliceSel.addEventListener('change', function (ev) {
      state.sliceAxis = ev.target.value;
      state.sliceIndex = 0;
      renderSlice(lastItems);
    });

    el.sliceRange.addEventListener('input', function (ev) {
      state.sliceIndex = Number(ev.target.value);
      renderSlice(lastItems);
    });

    el.btnReset.addEventListener('click', function () { Viewer.resetCamera(el.plot); });

    el.btnPng.addEventListener('click', function () {
      var name = (state.tableKey || 'map').replace(/^@/, '').replace(/[^\w.-]+/g, '-');
      Viewer.toPng(curveMode ? el.curve : el.plot, 'ecu-' + name);
    });

    el.btnLang.addEventListener('click', function () {
      applyLang(window.I18N.getLang() === 'ru' ? 'en' : 'ru');
    });

    el.btnTheme.addEventListener('click', function () {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    el.btnSide.addEventListener('click', function () {
      document.body.classList.toggle('side-open');
    });
  }

  function init() {
    ['file', 'drop', 'tableSel', 'dsList', 'plot', 'curve', 'empty', 'sliceWrap', 'slicePlot',
      'sliceSel', 'sliceRange', 'sliceValue', 'contours', 'opacity', 'baseSel', 'baseField',
      'btnReset', 'btnPng', 'btnLang', 'btnTheme', 'btnSide', 'toasts'].forEach(function (id) {
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

    var savedTheme = 'dark', savedLang = 'ru';
    try {
      savedTheme = localStorage.getItem('theme') || savedTheme;
      savedLang = localStorage.getItem('lang') || savedLang;
    } catch (e) { /* private mode */ }

    bind();
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    applyLang(savedLang);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
