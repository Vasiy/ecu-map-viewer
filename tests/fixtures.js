'use strict';
/* Synthetic definition and image, shared by the offline suites.
   Nothing here needs testdata/: firmware images are not committed. */

var SAMPLE_XDF = [
  '<XDFFORMAT version="1.50"><XDFHEADER><baseoffset>0</baseoffset>',
  '<DEFAULTS datasizeinbits="16" signed="0" lsbfirst="1" float="0"/>',
  '<CATEGORY index="0x0" name="Maps"/></XDFHEADER>',
  '<XDFTABLE uniqueid="0x10"><title>TPS legend</title>',
  '<XDFAXIS id="x"><indexcount>1</indexcount><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="y"><indexcount>3</indexcount><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="z"><EMBEDDEDDATA mmedtypeflags="0x02" mmedaddress="0x200" mmedelementsizebits="16" mmedrowcount="3"/>',
  '<MATH equation="X/100"/></XDFAXIS></XDFTABLE>',
  '<XDFTABLE uniqueid="0x20" flags="0x0"><title>Ignition Main advance</title>',
  '<CATEGORYMEM index="0" category="1"/>',
  '<XDFAXIS id="x"><indexcount>3</indexcount><embedinfo type="3" linkobjid="0x10"/><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="y"><indexcount>2</indexcount><LABEL index="0" value="1000"/><LABEL index="1" value="2000"/><MATH equation="X"/></XDFAXIS>',
  '<XDFAXIS id="z"><EMBEDDEDDATA mmedtypeflags="0x02" mmedaddress="0x100" mmedelementsizebits="16" mmedrowcount="2" mmedcolcount="3"/>',
  '<decimalpl>1</decimalpl><units>deg</units><MATH equation="X/10"/></XDFAXIS></XDFTABLE></XDFFORMAT>'
].join('');

/* `bias` shifts every cell, so two images built from it read as different
   calibrations without needing two definitions. */
function sampleImage(bias) {
  bias = bias || 0;
  var buf = new ArrayBuffer(0x1000);
  var v = new DataView(buf);
  [100, 200, 300, 400, 500, 600].forEach(function (n, i) { v.setUint16(0x100 + i * 2, n + bias, true); });
  [240, 500, 810].forEach(function (n, i) { v.setUint16(0x200 + i * 2, n, true); });
  return buf;
}

module.exports = { SAMPLE_XDF: SAMPLE_XDF, sampleImage: sampleImage };
