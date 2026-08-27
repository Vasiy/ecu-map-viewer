/*
 * Grid maths shared by the 3-D scene and the 2-D slice chart.
 *
 * Two firmwares rarely share the exact same breakpoints (a Granpasso starts its
 * TPS axis at 2.4 deg, a Multistrada at 2.2), so anything that compares two maps
 * resamples onto one of them instead of assuming index-for-index alignment.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Grid = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function extent(z) {
    var lo = Infinity, hi = -Infinity;
    for (var r = 0; r < z.length; r++) {
      for (var c = 0; c < z[r].length; c++) {
        var v = z[r][c];
        if (typeof v !== 'number' || isNaN(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return lo === Infinity ? null : [lo, hi];
  }

  /* Extent over several grids -- used for the shared z axis of visible traces. */
  function extentOf(grids) {
    var lo = Infinity, hi = -Infinity;
    grids.forEach(function (g) {
      var e = extent(g);
      if (!e) return;
      if (e[0] < lo) lo = e[0];
      if (e[1] > hi) hi = e[1];
    });
    return lo === Infinity ? null : [lo, hi];
  }

  /* Pad a range so a flat map still gets a visible axis. */
  function padded(range, frac) {
    if (!range) return null;
    var lo = range[0], hi = range[1];
    var span = hi - lo;
    var pad = span > 1e-9 ? span * (frac === undefined ? 0.05 : frac) : Math.max(0.5, Math.abs(hi) * 0.05);
    return [lo - pad, hi + pad];
  }

  /* Position of v inside a monotonically increasing axis: {i, j, t}. */
  function locate(axis, v) {
    var n = axis.length;
    if (n === 0) return { i: 0, j: 0, t: 0 };
    if (n === 1 || v <= axis[0]) return { i: 0, j: 0, t: 0 };
    if (v >= axis[n - 1]) return { i: n - 1, j: n - 1, t: 0 };
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (axis[mid] <= v) lo = mid; else hi = mid;
    }
    var span = axis[hi] - axis[lo];
    return { i: lo, j: hi, t: span ? (v - axis[lo]) / span : 0 };
  }

  /* Bilinear sample of z[y][x] at (xv, yv), clamped at the edges. */
  function sample(x, y, z, xv, yv) {
    var a = locate(x, xv), b = locate(y, yv);
    var z00 = z[b.i][a.i], z01 = z[b.i][a.j];
    var z10 = z[b.j][a.i], z11 = z[b.j][a.j];
    var top = z00 + (z01 - z00) * a.t;
    var bottom = z10 + (z11 - z10) * a.t;
    return top + (bottom - top) * b.t;
  }

  /* Resample grid g onto the axes of target -- the basis for difference mode. */
  function resample(g, targetX, targetY) {
    var out = [];
    for (var r = 0; r < targetY.length; r++) {
      var line = new Array(targetX.length);
      for (var c = 0; c < targetX.length; c++) {
        line[c] = sample(g.x, g.y, g.z, targetX[c], targetY[r]);
      }
      out.push(line);
    }
    return out;
  }

  /* g minus base, expressed on base's axes. */
  function difference(g, base) {
    var re = resample(g, base.x, base.y);
    return re.map(function (row, r) {
      return row.map(function (v, c) { return v - base.z[r][c]; });
    });
  }

  /* One row (fixed y) or one column (fixed x), interpolated at value v. */
  function slice(g, axisName, v, samples) {
    var out = { at: [], values: [] };
    if (axisName === 'y') {
      for (var c = 0; c < g.x.length; c++) {
        out.at.push(g.x[c]);
        out.values.push(sample(g.x, g.y, g.z, g.x[c], v));
      }
    } else {
      for (var r = 0; r < g.y.length; r++) {
        out.at.push(g.y[r]);
        out.values.push(sample(g.x, g.y, g.z, v, g.y[r]));
      }
    }
    if (samples && samples > 1) {
      var lo = out.at[0], hi = out.at[out.at.length - 1], dense = { at: [], values: [] };
      for (var i = 0; i < samples; i++) {
        var t = lo + (hi - lo) * i / (samples - 1);
        dense.at.push(t);
        dense.values.push(axisName === 'y'
          ? sample(g.x, g.y, g.z, t, v)
          : sample(g.x, g.y, g.z, v, t));
      }
      return dense;
    }
    return out;
  }

  function sameShape(a, b) {
    return a.rows === b.rows && a.cols === b.cols;
  }

  return {
    extent: extent, extentOf: extentOf, padded: padded, locate: locate,
    sample: sample, resample: resample, difference: difference,
    slice: slice, sameShape: sameShape
  };
});
