/*
 * Reading raw cells out of a firmware image, following the XDF EMBEDDEDDATA
 * geometry (address, element size, strides, type flags).
 *
 * Type flag bits, as TunerPro writes them:
 *   0x01 signed, 0x02 LSB first (little endian), 0x04 floating point.
 * They are absent on many axes, in which case <DEFAULTS> from the XDF header
 * applies -- this family of files declares 16-bit, unsigned, LSB-first.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BinIO = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIGNED = 0x01, LSB_FIRST = 0x02, FLOATING = 0x04;

  function readOne(view, byteOffset, sizeBits, flags) {
    var signed = !!(flags & SIGNED);
    var le = !!(flags & LSB_FIRST);
    if (flags & FLOATING) {
      return sizeBits >= 64 ? view.getFloat64(byteOffset, le) : view.getFloat32(byteOffset, le);
    }
    switch (sizeBits) {
      case 8: return signed ? view.getInt8(byteOffset) : view.getUint8(byteOffset);
      case 16: return signed ? view.getInt16(byteOffset, le) : view.getUint16(byteOffset, le);
      case 32: return signed ? view.getInt32(byteOffset, le) : view.getUint32(byteOffset, le);
      default: {
        // odd widths (24-bit and friends): assemble byte by byte
        var bytes = Math.ceil(sizeBits / 8), v = 0;
        for (var i = 0; i < bytes; i++) {
          var b = view.getUint8(byteOffset + (le ? i : bytes - 1 - i));
          v += b * Math.pow(256, i);
        }
        if (signed) {
          var half = Math.pow(2, sizeBits - 1);
          if (v >= half) v -= half * 2;
        }
        return v;
      }
    }
  }

  /*
   * spec: { address, sizeBits, flags, rows, cols, majorStrideBits, minorStrideBits }
   * Returns rows x cols of raw numbers. Strides <= 0 mean "packed", which is
   * how every table in the 5AM files is laid out.
   */
  function readGrid(buffer, spec) {
    var view = buffer instanceof DataView ? buffer
      : buffer instanceof ArrayBuffer ? new DataView(buffer)
      : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    var rows = Math.max(1, spec.rows | 0);
    var cols = Math.max(1, spec.cols | 0);
    var sizeBits = spec.sizeBits || 16;
    var minor = spec.minorStrideBits > 0 ? spec.minorStrideBits : sizeBits;
    var major = spec.majorStrideBits > 0 ? spec.majorStrideBits : minor * cols;
    var out = [];
    for (var r = 0; r < rows; r++) {
      var line = new Array(cols);
      for (var c = 0; c < cols; c++) {
        var bitOff = r * major + c * minor;
        var off = spec.address + (bitOff >> 3);
        if (off < 0 || off + Math.ceil(sizeBits / 8) > view.byteLength) {
          throw new RangeError('table at 0x' + spec.address.toString(16) +
            ' runs past the end of the image (' + view.byteLength + ' bytes)');
        }
        line[c] = readOne(view, off, sizeBits, spec.flags);
      }
      out.push(line);
    }
    return out;
  }

  return { readGrid: readGrid, readOne: readOne, SIGNED: SIGNED, LSB_FIRST: LSB_FIRST, FLOATING: FLOATING };
});
