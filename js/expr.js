/*
 * Evaluator for the <MATH equation="..."> expressions XDF uses to turn a raw
 * cell into an engineering value ("X/10", "(X-128)*0.75", "X&0x7F").
 *
 * Written as a shunting-yard parser rather than new Function() so that an
 * arbitrary XDF from the internet cannot execute code in the page.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Expr = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FUNCS = {
    ABS: Math.abs, SQRT: Math.sqrt, EXP: Math.exp, LN: Math.log,
    LOG: function (v) { return Math.log(v) / Math.LN10; },
    SIN: Math.sin, COS: Math.cos, TAN: Math.tan,
    ASIN: Math.asin, ACOS: Math.acos, ATAN: Math.atan,
    ROUND: Math.round, FLOOR: Math.floor, CEIL: Math.ceil,
    MIN: Math.min, MAX: Math.max
  };
  var CONSTS = { PI: Math.PI, E: Math.E };

  // precedence, associativity ('L'/'R'), arity
  var OPS = {
    '|': { p: 1, a: 'L' }, '^^': { p: 2, a: 'L' }, '&': { p: 3, a: 'L' },
    '<<': { p: 4, a: 'L' }, '>>': { p: 4, a: 'L' },
    '+': { p: 5, a: 'L' }, '-': { p: 5, a: 'L' },
    '*': { p: 6, a: 'L' }, '/': { p: 6, a: 'L' }, '%': { p: 6, a: 'L' },
    '^': { p: 7, a: 'R' },
    'u-': { p: 8, a: 'R' }, 'u+': { p: 8, a: 'R' }
  };

  function tokenize(src) {
    var out = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var m = /^(0[xX][0-9a-fA-F]+|[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/.exec(src.slice(i));
        if (!m) throw new Error('bad number at ' + i);
        out.push({ t: 'num', v: Number(m[1]) });
        i += m[1].length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        out.push({ t: 'name', v: w });
        i += w.length;
        continue;
      }
      var two = src.substr(i, 2);
      if (two === '<<' || two === '>>') { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%^&|'.indexOf(c) >= 0) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
      if (c === ',') { out.push({ t: ',' }); i++; continue; }
      throw new Error('unexpected "' + c + '" at ' + i);
    }
    return out;
  }

  function toRpn(tokens) {
    var out = [], stack = [], prev = null;
    function isValueEnd(tk) {
      return tk && (tk.t === 'num' || tk.t === 'name' || tk.t === ')');
    }
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.t === 'num') { out.push(tk); }
      else if (tk.t === 'name') {
        var upper = tk.v.toUpperCase();
        if (FUNCS[upper] && tokens[i + 1] && tokens[i + 1].t === '(') {
          stack.push({ t: 'func', v: upper, argc: 1 });
        } else {
          out.push({ t: 'var', v: upper });
        }
      } else if (tk.t === ',') {
        while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop());
        for (var k = stack.length - 1; k >= 0; k--) {
          if (stack[k].t === 'func') { stack[k].argc++; break; }
        }
      } else if (tk.t === 'op') {
        var op = tk.v;
        if ((op === '-' || op === '+') && !isValueEnd(prev)) op = 'u' + op;
        var o1 = OPS[op];
        while (stack.length) {
          var top = stack[stack.length - 1];
          if (top.t === 'func') { out.push(stack.pop()); continue; }
          if (top.t !== 'op') break;
          var o2 = OPS[top.v];
          if (o2.p > o1.p || (o2.p === o1.p && o1.a === 'L')) out.push(stack.pop());
          else break;
        }
        stack.push({ t: 'op', v: op });
      } else if (tk.t === '(') {
        stack.push({ t: '(' });
      } else if (tk.t === ')') {
        while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop());
        if (!stack.length) throw new Error('unbalanced )');
        stack.pop();
        if (stack.length && stack[stack.length - 1].t === 'func') out.push(stack.pop());
      }
      prev = tk;
    }
    while (stack.length) {
      var rest = stack.pop();
      if (rest.t === '(') throw new Error('unbalanced (');
      out.push(rest);
    }
    return out;
  }

  function evalRpn(rpn, vars) {
    var st = [];
    for (var i = 0; i < rpn.length; i++) {
      var tk = rpn[i], a, b;
      switch (tk.t) {
        case 'num': st.push(tk.v); break;
        case 'var':
          st.push(tk.v in vars ? vars[tk.v] : (tk.v in CONSTS ? CONSTS[tk.v] : 0));
          break;
        case 'func':
          var args = st.splice(st.length - tk.argc, tk.argc);
          st.push(FUNCS[tk.v].apply(null, args));
          break;
        case 'op':
          if (tk.v === 'u-') { st.push(-st.pop()); break; }
          if (tk.v === 'u+') { break; }
          b = st.pop(); a = st.pop();
          switch (tk.v) {
            case '+': st.push(a + b); break;
            case '-': st.push(a - b); break;
            case '*': st.push(a * b); break;
            case '/': st.push(b === 0 ? 0 : a / b); break;
            case '%': st.push(b === 0 ? 0 : a % b); break;
            case '^': st.push(Math.pow(a, b)); break;
            case '&': st.push((a | 0) & (b | 0)); break;
            case '|': st.push((a | 0) | (b | 0)); break;
            case '<<': st.push((a | 0) << (b | 0)); break;
            case '>>': st.push((a | 0) >> (b | 0)); break;
            default: throw new Error('unknown op ' + tk.v);
          }
          break;
        default: throw new Error('unexpected token in rpn');
      }
    }
    if (st.length !== 1) throw new Error('malformed expression');
    return st[0];
  }

  /*
   * compile("X/10") -> f(x). An equation we cannot parse degrades to identity
   * with .ok === false, so one exotic table never breaks a whole XDF load.
   */
  function compile(equation) {
    var src = (equation || 'X').trim() || 'X';
    var f;
    try {
      var rpn = toRpn(tokenize(src));
      f = function (x) { return evalRpn(rpn, { X: x }); };
      f.ok = true;
    } catch (e) {
      f = function (x) { return x; };
      f.ok = false;
      f.error = String(e && e.message || e);
    }
    f.source = src;
    return f;
  }

  return { compile: compile, tokenize: tokenize };
});
