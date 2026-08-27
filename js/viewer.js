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
    var traces = items.map(function (i) { return surfaceTrace(i, opts); });
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
    return window.Plotly.restyle(el, { visible: visible }, [index]).then(function () {
      return window.Plotly.relayout(el, { 'scene.zaxis.range': visibleRange(items) });
    });
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
    draw: draw, drawSlice: drawSlice, setVisible: setVisible, toPng: toPng,
    colorFor: colorFor, ramp: ramp, mix: mix, visibleRange: visibleRange,
    currentCamera: currentCamera, resetCamera: resetCamera, fmt: fmt, SERIES: SERIES
  };
});
