/*
 * XDF (TunerPro definition) -> table model, and table + firmware image -> grid.
 *
 * Only what a viewer needs is modelled: titles, categories, the three axes and
 * their value sources. Axis values come from one of four places, in the order
 * TunerPro itself resolves them:
 *   1. <embedinfo linkobjid="..."> -- the axis IS another table (a "legend"
 *      table); this is how the 5AM files store the RPM and TPS breakpoints.
 *   2. the axis' own EMBEDDEDDATA address -- read straight from the image.
 *   3. <LABEL index= value=> entries -- static text in the definition.
 *   4. nothing at all -- fall back to the cell index.
 */
(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./xml.js') : root.XML,
    typeof require === 'function' ? require('./expr.js') : root.Expr,
    typeof require === 'function' ? require('./binio.js') : root.BinIO
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XDF = api;
})(typeof self !== 'undefined' ? self : this, function (XML, Expr, BinIO) {
  'use strict';

  function num(v, fallback) {
    if (v === undefined || v === null || v === '') return fallback;
    var s = String(v).trim();
    var n = /^0[xX]/.test(s) ? parseInt(s, 16) : Number(s);
    return isNaN(n) ? fallback : n;
  }

  function parseAxis(el, defaults) {
    var ed = XML.child(el, 'EMBEDDEDDATA') || { attr: {} };
    var info = XML.child(el, 'embedinfo');
    var flags = num(ed.attr.mmedtypeflags, null);
    if (flags === null) {
      flags = (defaults.signed ? BinIO.SIGNED : 0) |
              (defaults.lsbfirst ? BinIO.LSB_FIRST : 0) |
              (defaults.float ? BinIO.FLOATING : 0);
    }
    var labels = XML.children(el, 'LABEL').map(function (l) {
      return { index: num(l.attr.index, 0), value: l.attr.value };
    }).sort(function (a, b) { return a.index - b.index; });

    return {
      id: el.attr.id || '',
      address: num(ed.attr.mmedaddress, null),
      sizeBits: num(ed.attr.mmedelementsizebits, defaults.datasizeinbits),
      flags: flags,
      rows: num(ed.attr.mmedrowcount, null),
      cols: num(ed.attr.mmedcolcount, null),
      majorStrideBits: num(ed.attr.mmedmajorstridebits, 0),
      minorStrideBits: num(ed.attr.mmedminorstridebits, 0),
      indexCount: num(XML.childText(el, 'indexcount', ''), null),
      decimals: num(XML.childText(el, 'decimalpl', ''), 2),
      units: XML.childText(el, 'units', ''),
      min: num(XML.childText(el, 'min', ''), null),
      max: num(XML.childText(el, 'max', ''), null),
      linkId: info ? num(info.attr.linkobjid, null) : null,
      embedType: info ? num(info.attr.type, null) : null,
      labels: labels,
      equation: (XML.child(el, 'MATH') || { attr: {} }).attr.equation || 'X'
    };
  }

  function tableShape(t) {
    var z = t.z || {};
    var rows = z.rows || (t.y && t.y.indexCount) || 1;
    var cols = z.cols || (t.x && t.x.indexCount) || 1;
    // A 1-D table stores its N cells as N rows; keep the long side as rows.
    if (cols === 1 && rows === 1) rows = z.rows || 1;
    return { rows: rows, cols: cols };
  }

  function parse(text) {
    var root = XML.parse(text);
    if (root.tag !== 'XDFFORMAT') throw new Error('not an XDF file (root <' + root.tag + '>)');
    var header = XML.child(root, 'XDFHEADER') || { children: [], attr: {} };
    var def = XML.child(header, 'DEFAULTS') || { attr: {} };
    var defaults = {
      datasizeinbits: num(def.attr.datasizeinbits, 16),
      signed: !!num(def.attr.signed, 0),
      lsbfirst: num(def.attr.lsbfirst, 1) !== 0,
      float: !!num(def.attr.float, 0)
    };
    var baseOffsetEl = XML.child(header, 'BASEOFFSET');
    var baseOffset = baseOffsetEl
      ? num(baseOffsetEl.attr.offset, 0) * (num(baseOffsetEl.attr.subtract, 0) ? -1 : 1)
      : num(XML.childText(header, 'baseoffset', ''), 0);

    var categories = {};
    XML.children(header, 'CATEGORY').forEach(function (c) {
      categories[num(c.attr.index, 0)] = c.attr.name || '';
    });

    var tables = [], byId = {};
    XML.children(root, 'XDFTABLE').forEach(function (el, i) {
      var axes = {};
      XML.children(el, 'XDFAXIS').forEach(function (a) {
        axes[(a.attr.id || '').toLowerCase()] = parseAxis(a, defaults);
      });
      if (!axes.z) return; // a table without a z axis holds no data
      var t = {
        index: i,
        uniqueId: num(el.attr.uniqueid, null),
        title: XML.childText(el, 'title', '(untitled)'),
        description: XML.childText(el, 'description', ''),
        categories: XML.children(el, 'CATEGORYMEM').map(function (c) {
          // category="1" refers to CATEGORY index 0 -- TunerPro stores it 1-based here
          return categories[num(c.attr.category, 1) - 1] || '';
        }).filter(Boolean),
        x: axes.x || null,
        y: axes.y || null,
        z: axes.z
      };
      var shape = tableShape(t);
      t.rows = shape.rows;
      t.cols = shape.cols;
      t.is3d = t.rows > 1 && t.cols > 1;
      tables.push(t);
      if (t.uniqueId !== null) byId[t.uniqueId] = t;
    });

    return {
      version: root.attr.version || '',
      title: XML.childText(header, 'deftitle', ''),
      description: XML.childText(header, 'description', ''),
      author: XML.childText(header, 'author', ''),
      baseOffset: baseOffset,
      defaults: defaults,
      categories: categories,
      tables: tables,
      byId: byId
    };
  }

  function scaleGrid(raw, equation) {
    var f = Expr.compile(equation);
    return raw.map(function (row) {
      return row.map(function (v) { return f(v); });
    });
  }

  /* Values of one axis, resolved through the link/embedded/label chain. */
  function axisValues(doc, axis, count, buffer, depth) {
    var n = Math.max(1, count | 0);
    var eq = Expr.compile(axis && axis.equation);
    var out = null;

    if (axis && axis.linkId !== null && axis.linkId !== undefined && (depth || 0) < 4) {
      var linked = doc.byId[axis.linkId];
      if (linked && linked.z && linked.z.address !== null && buffer) {
        var grid = readTable(doc, linked, buffer, (depth || 0) + 1);
        out = [];
        for (var r = 0; r < grid.z.length && out.length < n; r++) {
          for (var c = 0; c < grid.z[r].length && out.length < n; c++) out.push(grid.z[r][c]);
        }
      }
    }
    if (!out && axis && axis.address !== null && buffer) {
      var rows = axis.rows || n, cols = axis.cols || 1;
      if (rows * cols < n) { rows = n; cols = 1; }
      var cells = BinIO.readGrid(buffer, {
        address: axis.address + doc.baseOffset,
        sizeBits: axis.sizeBits, flags: axis.flags,
        rows: rows, cols: cols,
        majorStrideBits: axis.majorStrideBits, minorStrideBits: axis.minorStrideBits
      });
      out = [];
      for (var rr = 0; rr < cells.length && out.length < n; rr++) {
        for (var cc = 0; cc < cells[rr].length && out.length < n; cc++) out.push(cells[rr][cc]);
      }
    }
    if (out) out = out.map(function (v) { return eq(v); });

    if (!out && axis && axis.labels.length) {
      out = [];
      for (var i = 0; i < n; i++) {
        var lab = axis.labels[i];
        var v = lab === undefined ? i : Number(String(lab.value).replace(',', '.'));
        out.push(isNaN(v) ? i : v);
      }
    }
    if (!out) { out = []; for (var k = 0; k < n; k++) out.push(k); }
    while (out.length < n) out.push(out.length ? out[out.length - 1] + 1 : 0);
    return out.slice(0, n);
  }

  /*
   * Read one table out of a firmware image.
   * Returns { x, y, z, rows, cols, title, units, decimals }; z is row-major,
   * one row per y (RPM) point, one column per x (TPS) point.
   */
  function readTable(doc, table, buffer, depth) {
    if (table.z.address === null) throw new Error('table "' + table.title + '" has no address');
    var raw = BinIO.readGrid(buffer, {
      address: table.z.address + doc.baseOffset,
      sizeBits: table.z.sizeBits,
      flags: table.z.flags,
      rows: table.rows,
      cols: table.cols,
      majorStrideBits: table.z.majorStrideBits,
      minorStrideBits: table.z.minorStrideBits
    });
    var z = scaleGrid(raw, table.z.equation);
    return {
      title: table.title,
      rows: table.rows,
      cols: table.cols,
      x: axisValues(doc, table.x, table.cols, buffer, depth),
      y: axisValues(doc, table.y, table.rows, buffer, depth),
      z: z,
      raw: raw,
      units: table.z.units,
      decimals: table.z.decimals,
      xUnits: table.x ? table.x.units : '',
      yUnits: table.y ? table.y.units : ''
    };
  }

  return { parse: parse, readTable: readTable, axisValues: axisValues, num: num };
});
