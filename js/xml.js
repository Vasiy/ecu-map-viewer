/*
 * Minimal XML reader.
 *
 * XDF files are plain, attribute-heavy XML with no namespaces, CDATA or DTDs,
 * so a hand-rolled tokenizer is both enough and portable: the very same file
 * runs in the browser (no DOMParser dependency, works from file://) and under
 * node for the offline tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XML = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function decode(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, function (m, body) {
      if (body[0] === '#') {
        var code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        return isNaN(code) ? m : String.fromCharCode(code);
      }
      return body in ENTITIES ? ENTITIES[body] : m;
    });
  }

  function node(tag) {
    return { tag: tag, attr: {}, children: [], text: '' };
  }

  /* Returns the root element, or throws on malformed input. */
  function parse(text) {
    var i = 0, len = text.length;
    var root = node('#document');
    var stack = [root];

    while (i < len) {
      var lt = text.indexOf('<', i);
      if (lt < 0) break;
      if (lt > i) {
        var chunk = text.slice(i, lt);
        if (chunk.trim()) stack[stack.length - 1].text += decode(chunk);
      }
      // comments, declarations and processing instructions carry nothing we need
      if (text.startsWith('<!--', lt)) {
        var end = text.indexOf('-->', lt);
        i = end < 0 ? len : end + 3;
        continue;
      }
      if (text.startsWith('<?', lt) || text.startsWith('<!', lt)) {
        var gt0 = text.indexOf('>', lt);
        i = gt0 < 0 ? len : gt0 + 1;
        continue;
      }
      if (text.startsWith('</', lt)) {
        var gt1 = text.indexOf('>', lt);
        if (gt1 < 0) throw new Error('unterminated closing tag');
        if (stack.length > 1) stack.pop();
        i = gt1 + 1;
        continue;
      }

      // opening tag: scan to '>' that is not inside a quoted attribute value
      var j = lt + 1, quote = 0;
      while (j < len) {
        var c = text[j];
        if (quote) { if (c === quote) quote = 0; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      if (j >= len) throw new Error('unterminated tag');
      var raw = text.slice(lt + 1, j);
      var selfClosing = raw.endsWith('/');
      if (selfClosing) raw = raw.slice(0, -1);

      var nameMatch = /^([\w:.-]+)/.exec(raw);
      if (!nameMatch) throw new Error('bad tag name at ' + lt);
      var el = node(nameMatch[1]);
      var attrRe = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, m;
      attrRe.lastIndex = nameMatch[1].length;
      while ((m = attrRe.exec(raw))) {
        el.attr[m[1]] = decode(m[3] !== undefined ? m[3] : m[4]);
      }
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }

    var top = root.children.filter(function (c) { return c.tag !== '#document'; });
    if (!top.length) throw new Error('no root element');
    return top[0];
  }

  function children(el, tag) {
    if (!el) return [];
    return el.children.filter(function (c) { return c.tag === tag; });
  }

  function child(el, tag) {
    var list = children(el, tag);
    return list.length ? list[0] : null;
  }

  /* Text of a direct child element, e.g. <title>Ignition Main</title>. */
  function childText(el, tag, fallback) {
    var c = child(el, tag);
    return c ? c.text.trim() : (fallback === undefined ? '' : fallback);
  }

  return { parse: parse, children: children, child: child, childText: childText, decode: decode };
});
