/*
 * Decoded drive logs (onboard-logger's CSV export) -> channel time series, and
 * channel time series -> a replay of a calibration table's own lookup.
 *
 * onboard-logger already scales its CSV values to physical units before
 * writing them (raw * scale + bias), so nothing here re-scales a cell -- a
 * "throttle" column is already in the same degrees an XDF's TPS breakpoints
 * are. Every channel selected for a ride is polled and written every row, so
 * there is no forward-fill to do: a blank cell means that one poll failed,
 * not "not sampled yet".
 */
(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./grid.js') : root.Grid);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Log = api;
})(typeof self !== 'undefined' ? self : this, function (Grid) {
  'use strict';

  /* One row of a decoded CSV -> { columns, time, channels, rows }. Column
     order follows the header, which is whatever channels that ride selected. */
  function parse(text) {
    var lines = String(text || '').split(/\r\n|\n/);
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (!lines.length) return { columns: [], time: [], channels: {}, rows: 0 };

    var header = lines[0].split(',');
    var columns = header.slice(1);
    var channels = {};
    columns.forEach(function (c) { channels[c] = []; });
    var time = [];
    var t0 = null;

    for (var i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      var cells = lines[i].split(',');
      var ms = Date.parse(cells[0]);
      if (isNaN(ms)) continue;   // a corrupt timestamp: drop the row outright
      if (t0 === null) t0 = ms;
      time.push((ms - t0) / 1000);
      for (var c = 0; c < columns.length; c++) {
        var raw = cells[c + 1];
        var v = raw === undefined || raw === '' ? null : Number(raw);
        channels[columns[c]].push(v === null || isNaN(v) ? null : v);
      }
    }
    return { columns: columns, time: time, channels: channels, rows: time.length };
  }

  /* Only the two main maps have a documented X=TPS/Y=RPM axis convention;
     every other role starts unmapped and needs a manual channel choice. */
  function defaultAxisChannels(tableKey, columns) {
    if (tableKey === '@ign-main' || tableKey === '@fuel-main') {
      var hasRpm = columns.indexOf('rpm') >= 0;
      var hasThrottle = columns.indexOf('throttle') >= 0;
      if (hasRpm && hasThrottle) return { x: 'throttle', y: 'rpm' };
    }
    return { x: '', y: '' };
  }

  /* The log's own "what actually happened" channel to compare a table's
     replayed value against, per role. advance2 is live; advance latches when
     the engine stops, so it is only the fallback. The transient roles
     (@ign-delta/@fuel-delta) get no default: they are not a static lookup in
     the real firmware and forcing a comparison here would be misleading. */
  var ROLE_COMPARE = {
    '@ign-main': ['advance2', 'advance'],
    '@ign-engine': ['advance2', 'advance'],
    '@ign-air': ['advance2', 'advance'],
    '@fuel-main': ['inj_period'],
    '@fuel-engine': ['inj_period'],
    '@fuel-warm': ['inj_period'],
    '@fuel-phase': ['inj_period'],
    '@fuel-air': ['inj_period']
  };

  function defaultCompareChannel(tableKey, columns) {
    var candidates = ROLE_COMPARE[tableKey] || [];
    for (var i = 0; i < candidates.length; i++) {
      if (columns.indexOf(candidates[i]) >= 0) return candidates[i];
    }
    return '';
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function zeros(rows, cols) {
    var out = [];
    for (var r = 0; r < rows; r++) out.push(new Array(cols).fill(0));
    return out;
  }

  /* Replay a log through one table's grid: a predicted value per row, a
     dwell-seconds grid shaped like the table, and the sample points a 3-D
     path overlay would plot. mapping = { x, y } -- the log channels driving
     the table's two axes. */
  function replay(grid, log, mapping) {
    var xs = (mapping.x && log.channels[mapping.x]) || [];
    var ys = (mapping.y && log.channels[mapping.y]) || [];
    var time = log.time || [];
    var predicted = [];
    var path = { x: [], y: [], z: [] };
    var dwell = zeros(grid.rows, grid.cols);
    var diffs = [];
    for (var d = 1; d < time.length; d++) diffs.push(time[d] - time[d - 1]);
    var medianDt = median(diffs);
    var cap = medianDt * 3;
    var inside = 0, total = 0;

    for (var i = 0; i < time.length; i++) {
      var xv = xs[i], yv = ys[i];
      if (xv === null || xv === undefined || yv === null || yv === undefined || isNaN(xv) || isNaN(yv)) {
        predicted.push(null);
        continue;
      }
      total++;
      var v = Grid.sample(grid.x, grid.y, grid.z, xv, yv);
      predicted.push(v);
      path.x.push(xv); path.y.push(yv); path.z.push(v);

      if (xv >= grid.x[0] && xv <= grid.x[grid.x.length - 1] &&
          yv >= grid.y[0] && yv <= grid.y[grid.y.length - 1]) inside++;

      var bx = Grid.locate(grid.x, xv), by = Grid.locate(grid.y, yv);
      var dt = i > 0 ? Math.min(time[i] - time[i - 1], cap) : medianDt;
      var row = by.t < 0.5 ? by.i : by.j;
      var col = bx.t < 0.5 ? bx.i : bx.j;
      dwell[row][col] += Math.max(dt, 0);
    }

    return {
      chart: { time: time, predicted: predicted },
      dwell: { rows: grid.rows, cols: grid.cols, seconds: dwell },
      path: path,
      coverage: total ? inside / total : null
    };
  }

  return {
    parse: parse,
    defaultAxisChannels: defaultAxisChannels,
    defaultCompareChannel: defaultCompareChannel,
    ROLE_COMPARE: ROLE_COMPARE,
    replay: replay
  };
});
