/*
 * The Plotly layer: surfaces, contours on all three planes, and the axis /
 * colour-range bookkeeping.
 *
 * Two range rules matter here, both learned from the earlier prototype:
 *   - the shared z axis is computed from the VISIBLE datasets only, so hiding
 *     a map actually rescales the scene (a hump on one surface used to vanish
 *     because a hidden map was still stretching the axis);
 *   - every surface pins its own cmin/cmax, so toggling one dataset never
 *     repaints the colours of the others.
 */
(function (root, factory) {
  var api = factory(root.Grid, root.I18N);
  root.Viewer = api;
})(typeof self !== 'undefined' ? self : this, function (Grid, I18N) {
  'use strict';

  var t = I18N.t;

  // Categorical slots, in fixed order -- a dataset keeps its colour for life,
  // no matter how many others are visible.
  var SERIES = {
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#00a300', '#9085e9', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
  };

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function mix(hex, target, amount) {
    var a = hexToRgb(hex), b = hexToRgb(target);
    return 'rgb(' + a.map(function (v, i) {
      return Math.round(v + (b[i] - v) * amount);
    }).join(',') + ')';
  }

  /* One-hue sequential ramp: low values pale, high values saturated. */
  function ramp(hex, theme) {
    var pale = theme === 'dark' ? '#0e1014' : '#ffffff';
    var deep = theme === 'dark' ? '#ffffff' : '#101318';
    return [
      [0.0, mix(hex, pale, 0.72)],
      [0.35, mix(hex, pale, 0.35)],
      [0.7, hex],
      [1.0, mix(hex, deep, 0.35)]
    ];
  }

  /* Diverging ramp for difference mode: two poles, neutral grey midpoint. */
  function divergingRamp(theme) {
    var mid = theme === 'dark' ? '#767b84' : '#b9bcc2';
    return [
      [0.0, theme === 'dark' ? '#3987e5' : '#2a78d6'],
      [0.25, mix(theme === 'dark' ? '#3987e5' : '#2a78d6', mid, 0.55)],
      [0.5, mid],
      [0.75, mix(theme === 'dark' ? '#d95926' : '#eb6834', mid, 0.55)],
      [1.0, theme === 'dark' ? '#d95926' : '#eb6834']
    ];
  }

  function colorFor(index, theme) {
    var list = SERIES[theme === 'light' ? 'light' : 'dark'];
    return list[index % list.length];
  }

  function themeTokens(theme) {
    return theme === 'light'
      ? { paper: 'rgba(0,0,0,0)', ink: '#1b1f26', muted: '#5c636e', grid: '#d7dae0', zero: '#a9aeb8' }
      : { paper: 'rgba(0,0,0,0)', ink: '#e8e6df', muted: '#8d95a1', grid: '#2b323b', zero: '#3d4650' };
  }

  function fmt(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toFixed(digits === undefined ? 1 : digits);
  }

  /*
   * item: { name, color, grid: {x,y,z}, visible, digits, units }
   * opts: { theme, contours, opacity, diff: {baseName} | null }
   */
  function surfaceTrace(item, opts) {
    var range = Grid.extent(item.grid.z) || [0, 1];
    var cmin = range[0], cmax = range[1];
    if (cmax - cmin < 1e-9) { cmin -= 0.5; cmax += 0.5; }
    if (opts.diff) {
      var span = Math.max(Math.abs(cmin), Math.abs(cmax), 0.1);
      cmin = -span; cmax = span;
    }
    // Wall projections in the dataset's own hue. In difference mode the fill is a
    // shared diverging ramp (it has to be: the colour means the sign), so the
    // contour lines are the only thing left that says which map a surface is.
    var lineColor = mix(item.color, opts.theme === 'light' ? '#101318' : '#ffffff', 0.2);
    var unit = item.units ? ' ' + item.units : '';
    return {
      type: 'surface',
      name: item.name,
      x: item.grid.x,
      y: item.grid.y,
      z: item.grid.z,
      visible: item.visible,
      opacity: opts.opacity === undefined ? 0.95 : opts.opacity,
      showscale: false,
      colorscale: opts.diff ? divergingRamp(opts.theme) : ramp(item.color, opts.theme),
      cauto: false,
      cmin: cmin,
      cmax: cmax,
      // contours on the surface itself plus a projection onto each wall:
      // floor (rpm x tps), back wall (tps x value), side wall (rpm x value)
      contours: {
        x: { show: !!opts.contours, project: { x: !!opts.contours }, color: lineColor, width: 1, highlight: false },
        y: { show: !!opts.contours, project: { y: !!opts.contours }, color: lineColor, width: 1, highlight: false },
        z: { show: !!opts.contours, project: { z: !!opts.contours }, usecolormap: true, width: 2, highlight: false }
      },
      hovertemplate: '<b>' + item.name + '</b><br>' +
        t('axis.rpm') + ': %{y:.0f}<br>' +
        t('axis.tps') + ': %{x}<br>' +
        (opts.diff ? 'Δ' : t('axis.value')) + ': %{z:.' + (item.digits === undefined ? 1 : item.digits) + 'f}' + unit +
        '<extra></extra>'
    };
  }

  function sceneLayout(opts, zRange, zTitle) {
    var c = themeTokens(opts.theme);
    var ax = {
      gridcolor: c.grid,
      zerolinecolor: c.zero,
      color: c.muted,
      titlefont: { size: 11, color: c.muted },
      tickfont: { size: 10, color: c.muted },
      showbackground: false
    };
    return {
      xaxis: Object.assign({ title: { text: t('axis.tps') } }, ax),
      yaxis: Object.assign({ title: { text: t('axis.rpm') } }, ax),
      zaxis: Object.assign({ title: { text: zTitle }, range: zRange || undefined }, ax),
      aspectmode: 'manual',
      aspectratio: { x: 1.05, y: 1.35, z: 0.7 },
      camera: opts.camera || { eye: { x: 1.65, y: -1.75, z: 0.95 } },
      hovermode: 'closest'
    };
  }

  function baseLayout(opts, zRange, zTitle) {
    var c = themeTokens(opts.theme);
    return {
      paper_bgcolor: c.paper,
      plot_bgcolor: c.paper,
      margin: { l: 0, r: 0, t: 8, b: 0 },
      showlegend: false,
      font: { family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: c.ink },
      scene: sceneLayout(opts, zRange, zTitle),
      hoverlabel: {
        bgcolor: opts.theme === 'light' ? '#ffffff' : '#1b1f25',
        bordercolor: c.grid,
        font: { family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', size: 12, color: c.ink }
      }
    };
  }

  /*
   * The cross-section drawn onto the surfaces themselves: one polyline per
   * dataset, following the map at the chosen rpm (or TPS). Emitted for every
   * item, visible or not, so trace indices stay parallel to the surfaces and a
   * checkbox can still restyle in place.
   */
  function sliceTrace(item, opts) {
    var on = !!(opts.slice && item.visible);
    var geom = on ? sliceGeometry(item, opts.slice) : { x: [], y: [], z: [] };
    var unit = item.units ? ' ' + item.units : '';
    return {
      type: 'scatter3d',
      mode: 'lines',
      name: item.name,
      x: geom.x, y: geom.y, z: geom.z,
      visible: on,
      showlegend: false,
      // enough lift toward the theme's extreme to read against the surface,
      // not so much that two cuts turn into the same pale line
      line: { color: mix(item.color, opts.theme === 'light' ? '#101318' : '#ffffff', 0.22), width: 7 },
      hovertemplate: '<b>' + item.name + '</b><br>' +
        t('axis.rpm') + ': %{y:.0f}<br>' +
        t('axis.tps') + ': %{x}<br>' +
        (opts.diff ? 'Δ' : t('axis.value')) + ': %{z:.' + (item.digits === undefined ? 1 : item.digits) + 'f}' + unit +
        '<extra></extra>'
    };
  }

  /* slice: { axis: 'rpm' | 'tps', value, lift } */
  function sliceGeometry(item, slice) {
    // The slider walks the first visible map's axis, but breakpoints differ
    // between platforms (2.4 deg vs 3.0 deg at the first TPS point). Pin the
    // line to this map's own axis, or it hangs in the air beside the surface.
    var axis = slice.axis === 'rpm' ? item.grid.y : item.grid.x;
    var at = Math.min(Math.max(slice.value, axis[0]), axis[axis.length - 1]);
    var cut = Grid.slice(item.grid, slice.axis === 'rpm' ? 'y' : 'x', at, 120);
    var lift = slice.lift || 0;
    var x = [], y = [], z = [];
    for (var i = 0; i < cut.at.length; i++) {
      if (slice.axis === 'rpm') { x.push(cut.at[i]); y.push(at); }
      else { x.push(at); y.push(cut.at[i]); }
      // a hair above the surface, otherwise the line disappears into it
      z.push(cut.values[i] + lift);
    }
    return { x: x, y: y, z: z };
  }

  /* How far to lift the line so it reads on top of the surface it follows. */
  function sliceLift(items) {
    var r = visibleRange(items);
    return r ? (r[1] - r[0]) * 0.004 : 0;
  }

  var CONFIG = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['toImage'],
    toImageButtonOptions: { format: 'png', scale: 2 }
  };

  /* z range across the visible items only -- the rule this tool exists to honour. */
  function visibleRange(items) {
    var grids = items.filter(function (i) { return i.visible; })
      .map(function (i) { return i.grid.z; });
    return Grid.padded(Grid.extentOf(grids), 0.06);
  }

  function draw(el, items, opts) {
    if (opts.slice) opts.slice.lift = sliceLift(items);
    var traces = items.map(function (i) { return surfaceTrace(i, opts); })
      .concat(items.map(function (i) { return sliceTrace(i, opts); }));
    // a single visible surface can afford a colour bar; several would fight
    var vis = items.filter(function (i) { return i.visible; });
    if (vis.length === 1) {
      var idx = items.indexOf(vis[0]);
      traces[idx].showscale = true;
      traces[idx].colorbar = {
        thickness: 10, len: 0.55, outlinewidth: 0, x: 1,
        tickfont: { size: 10, color: themeTokens(opts.theme).muted }
      };
    }
    var layout = baseLayout(opts, visibleRange(items), opts.zTitle || t('axis.value'));
    return window.Plotly.react(el, traces, layout, CONFIG);
  }

  /*
   * Toggle one dataset and rescale the axis to what is left visible.
   * Kept separate from draw() so a checkbox does not rebuild every surface.
   */
  function setVisible(el, items, index, visible, opts) {
    items[index].visible = visible;
    var lineIndex = items.length + index;
    var lineOn = visible && !!(opts && opts.slice);
    return window.Plotly.restyle(el, { visible: [visible, lineOn] }, [index, lineIndex])
      .then(function () {
        // the line has to be re-cut: the lift follows the rescaled axis
        if (lineOn) return updateSlice(el, items, opts.slice, opts);
      })
      .then(function () {
        return window.Plotly.relayout(el, { 'scene.zaxis.range': visibleRange(items) });
      });
  }

  /*
   * Move the cross-section without rebuilding the scene -- this runs on every
   * step of the slider, so it restyles the existing traces instead of redrawing.
   * slice === null hides the lines.
   */
  function updateSlice(el, items, slice, opts) {
    if (!el || !el.data) return Promise.resolve();
    var indices = [], x = [], y = [], z = [], vis = [];
    var lift = slice ? sliceLift(items) : 0;
    items.forEach(function (item, i) {
      var on = !!slice && item.visible;
      var geom = on ? sliceGeometry(item, { axis: slice.axis, value: slice.value, lift: lift }) : { x: [], y: [], z: [] };
      indices.push(items.length + i);
      x.push(geom.x); y.push(geom.y); z.push(geom.z); vis.push(on);
    });
    if (!indices.length) return Promise.resolve();
    return window.Plotly.restyle(el, { x: x, y: y, z: z, visible: vis }, indices);
  }

  function currentCamera(el) {
    return el && el._fullLayout && el._fullLayout.scene ? el._fullLayout.scene.camera : null;
  }

  function resetCamera(el) {
    return window.Plotly.relayout(el, { 'scene.camera': { eye: { x: 1.65, y: -1.75, z: 0.95 } } });
  }

  /* 2-D cross-section chart: one line per visible dataset. */
  function drawSlice(el, series, opts) {
    var c = themeTokens(opts.theme);
    var traces = series.map(function (s) {
      return {
        type: 'scatter', mode: 'lines+markers', name: s.name,
        x: s.at, y: s.values,
        line: { color: s.color, width: 2, shape: 'spline', smoothing: 0.6 },
        marker: { size: 5, color: s.color },
        hovertemplate: '<b>' + s.name + '</b><br>%{x}<br>%{y:.2f}<extra></extra>'
      };
    });
    var layout = {
      paper_bgcolor: c.paper,
      plot_bgcolor: c.paper,
      margin: { l: 48, r: 12, t: 10, b: 34 },
      showlegend: false,
      font: { family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', size: 11, color: c.muted },
      xaxis: { title: { text: opts.xTitle, font: { size: 11 } }, gridcolor: c.grid, zerolinecolor: c.zero, color: c.muted },
      yaxis: { title: { text: opts.yTitle, font: { size: 11 } }, gridcolor: c.grid, zerolinecolor: c.zero, color: c.muted },
      hovermode: 'x unified',
      hoverlabel: {
        bgcolor: opts.theme === 'light' ? '#ffffff' : '#1b1f25',
        bordercolor: c.grid,
        font: { family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', size: 11, color: c.ink }
      }
    };
    return window.Plotly.react(el, traces, layout, { displaylogo: false, responsive: true, displayModeBar: false });
  }

  function toPng(el, name) {
    return window.Plotly.downloadImage(el, {
      format: 'png', scale: 2, width: el.clientWidth * 1.5, height: el.clientHeight * 1.5,
      filename: name || 'ecu-map'
    });
  }

  return {
    draw: draw, drawSlice: drawSlice, setVisible: setVisible, updateSlice: updateSlice, toPng: toPng,
    colorFor: colorFor, ramp: ramp, mix: mix, visibleRange: visibleRange,
    currentCamera: currentCamera, resetCamera: resetCamera, fmt: fmt, SERIES: SERIES
  };
});
