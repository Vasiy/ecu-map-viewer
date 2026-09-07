'use strict';
/*
 * Headless DOM stub for driving js/app.js.
 *
 * app.js is an IIFE, so unlike every other module it exports nothing and cannot
 * be required -- and it was the one file the offline suite never touched. It is
 * evaluated whole inside a vm context on this stub instead, and a harness drives
 * it the way a person does: through the handlers it binds to the DOM. Nothing is
 * reached into; if a path is not wired to a control, this cannot test it.
 *
 * Plotly is stubbed to no-ops: the scene is not what these tests are about, and
 * the real one needs a GL context.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function matchesSel(node, sel) {
  const m = String(sel).trim().match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)((?:\[[^\]]+\])*)$/);
  if (!m) return false;
  const [, tag, cls, attrs] = m;
  if (tag && node.tagName !== tag) return false;
  for (const c of (cls || '').match(/[.#][\w-]+/g) || []) {
    if (c[0] === '.') { if (!node.classList.contains(c.slice(1))) return false; }
    else if (node.attrs.id !== c.slice(1)) return false;
  }
  for (const a of (attrs || '').match(/\[[^\]]+\]/g) || []) {
    const i = a.indexOf('=');
    const k = (i < 0 ? a.slice(1, -1) : a.slice(1, i)).trim();
    const want = i < 0 ? undefined : a.slice(i + 1, -1).replace(/^["']|["']$/g, '');
    let have = node.attrs[k];
    if (have === undefined && k.startsWith('data-')) {
      have = node.dataset[k.slice(5).replace(/-(\w)/g, (_, ch) => ch.toUpperCase())];
    }
    if (want === undefined ? have === undefined : String(have) !== want) return false;
  }
  return true;
}

/* One fake picked file. app.js reads .xdf as text and .bin as an ArrayBuffer. */
function file(name, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return {
    name,
    arrayBuffer: () => Promise.resolve(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    text: () => Promise.resolve(buf.toString('utf8')),
  };
}

function makeSandbox(opts = {}) {
  const created = [];

  function el(tag = 'div') {
    const node = {
      tagName: tag,
      children: [],
      parentNode: null,
      handlers: {},
      dataset: {},
      style: { setProperty() {} },
      attrs: {},
      value: '',
      textContent: '',
      hidden: false,
      disabled: false,
      classList: {
        _s: new Set(),
        add(...c) { c.forEach((x) => this._s.add(x)); },
        remove(...c) { c.forEach((x) => this._s.delete(x)); },
        toggle(c, on) {
          const want = on === undefined ? !this._s.has(c) : !!on;
          if (want) this._s.add(c); else this._s.delete(c);
        },
        contains(c) { return this._s.has(c); },
      },
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      removeEventListener() {},
      /* fire('change') on the node a harness holds -- the same call the browser
         makes, so a handler that was never bound simply does nothing */
      fire(type, ev) {
        (this.handlers[type] || []).forEach((fn) => fn(ev || { target: this,
          preventDefault() {}, stopPropagation() {} }));
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c, ref) {
        c.parentNode = this;
        const i = this.children.indexOf(ref);
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        return c;
      },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); },
      remove() {
        if (node.parentNode) node.parentNode.removeChild(node);
        node.parentNode = null;
      },
      // the card thumbnail is a canvas; a null context would take the whole
      // row render down, which is not what any of these tests are about
      getContext: () => ({
        fillStyle: '', strokeStyle: '', lineWidth: 0,
        clearRect() {}, fillRect() {}, beginPath() {}, lineTo() {}, stroke() {},
      }),
      _bySel: null,
      _descendants(out = []) {
        for (const c of this.children) { out.push(c); if (c._descendants) c._descendants(out); }
        return out;
      },
      querySelectorAll(sel) {
        return sel ? this._descendants().filter((n) => matchesSel(n, sel)) : [];
      },
      /* Rows are built with innerHTML, so their controls are not nodes here.
         One stable stub per selector keeps a handler bound to `.defsel` and the
         later lookup of `.defsel` talking about the same element. */
      querySelector(sel) {
        const hit = this.querySelectorAll(sel)[0];
        if (hit) return hit;
        this._bySel ||= new Map();
        if (!this._bySel.has(sel)) this._bySel.set(sel, el());
        return this._bySel.get(sel);
      },
      closest(sel) {
        let n = this;
        while (n) { if (matchesSel(n, sel)) return n; n = n.parentNode; }
        return null;
      },
      focus() {}, blur() {}, click() {},
    };
    let html = '';
    Object.defineProperty(node, 'innerHTML', {
      get() { return html; },
      set(v) { html = String(v); if (html === '') node.children = []; },
    });
    Object.defineProperty(node, 'className', {
      get() { return [...node.classList._s].join(' '); },
      set(v) { node.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    });
    Object.defineProperty(node, 'nextSibling', {
      get() {
        const sibs = node.parentNode ? node.parentNode.children : [];
        return sibs[sibs.indexOf(node) + 1] || null;
      },
    });
    created.push(node);
    return node;
  }

  const byId = new Map();
  const body = el('body');
  const document = {
    documentElement: el('html'),
    body,
    readyState: 'complete',
    getElementById(id) {
      if (!byId.has(id)) {
        const n = el(id === 'file' ? 'input' : 'div');
        n.attrs.id = id;
        body.appendChild(n);
        byId.set(id, n);
      }
      return byId.get(id);
    },
    querySelector(sel) { return body.querySelector(sel); },
    querySelectorAll() { return []; },
    createElement(tag) { return el(tag); },
    addEventListener() {}, removeEventListener() {},
  };

  const sandbox = {
    console,
    document,
    created,
    location: { protocol: 'http:', host: '127.0.0.1:8123', search: opts.search || '' },
    localStorage: {
      s: { ...(opts.storage || {}) },
      getItem(k) { return k in this.s ? this.s[k] : null; },
      setItem(k, v) { this.s[k] = String(v); },
      removeItem(k) { delete this.s[k]; },
    },
    // toasts auto-dismiss on a timer that would keep node alive past the asserts
    setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: (fn) => { fn(); return 0; },
    navigator: { languages: ['en'] },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    fetch: opts.fetch || (() => Promise.reject(new Error('offline'))),
    Plotly: {
      react: () => Promise.resolve(), update: () => Promise.resolve(),
      restyle: () => Promise.resolve(), relayout: () => Promise.resolve(),
      downloadImage: () => Promise.resolve(),
      Plots: { resize: () => {} },
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const src of ['js/xml.js', 'js/expr.js', 'js/binio.js', 'js/xdf.js',
    'js/presets.js', 'js/links.js', 'js/roles.js', 'js/grid.js', 'js/i18n.js',
    'js/viewer.js', 'js/app.js']) {
    vm.runInContext(read(src), sandbox, { filename: path.basename(src) });
  }
  return sandbox;
}

/* Hand the app a set of picked files and wait for it to settle: handleFiles
   reads them asynchronously, so a harness has to yield before asserting. */
function drop(sandbox, files) {
  sandbox.document.getElementById('file').fire('change', {
    target: { files, value: '' },
  });
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

module.exports = { makeSandbox, drop, file, read, ROOT };
