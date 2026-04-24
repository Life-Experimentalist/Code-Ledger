// node_modules/preact/dist/preact.module.js
var n;
var l;
var u;
var t;
var i;
var r;
var o;
var e;
var f;
var c;
var s;
var a;
var h;
var p;
var v;
var y;
var d = {};
var w = [];
var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
var g = Array.isArray;
function m(n3, l3) {
  for (var u3 in l3) n3[u3] = l3[u3];
  return n3;
}
function b(n3) {
  n3 && n3.parentNode && n3.parentNode.removeChild(n3);
}
function k(l3, u3, t4) {
  var i3, r3, o3, e3 = {};
  for (o3 in u3) "key" == o3 ? i3 = u3[o3] : "ref" == o3 ? r3 = u3[o3] : e3[o3] = u3[o3];
  if (arguments.length > 2 && (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t4), "function" == typeof l3 && null != l3.defaultProps) for (o3 in l3.defaultProps) void 0 === e3[o3] && (e3[o3] = l3.defaultProps[o3]);
  return x(l3, e3, i3, r3, null);
}
function x(n3, t4, i3, r3, o3) {
  var e3 = { type: n3, props: t4, key: i3, ref: r3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o3 ? ++u : o3, __i: -1, __u: 0 };
  return null == o3 && null != l.vnode && l.vnode(e3), e3;
}
function M() {
  return { current: null };
}
function S(n3) {
  return n3.children;
}
function C(n3, l3) {
  this.props = n3, this.context = l3;
}
function $(n3, l3) {
  if (null == l3) return n3.__ ? $(n3.__, n3.__i + 1) : null;
  for (var u3; l3 < n3.__k.length; l3++) if (null != (u3 = n3.__k[l3]) && null != u3.__e) return u3.__e;
  return "function" == typeof n3.type ? $(n3) : null;
}
function I(n3) {
  if (n3.__P && n3.__d) {
    var u3 = n3.__v, t4 = u3.__e, i3 = [], r3 = [], o3 = m({}, u3);
    o3.__v = u3.__v + 1, l.vnode && l.vnode(o3), q(n3.__P, o3, u3, n3.__n, n3.__P.namespaceURI, 32 & u3.__u ? [t4] : null, i3, null == t4 ? $(u3) : t4, !!(32 & u3.__u), r3), o3.__v = u3.__v, o3.__.__k[o3.__i] = o3, D(i3, o3, r3), u3.__e = u3.__ = null, o3.__e != t4 && P(o3);
  }
}
function P(n3) {
  if (null != (n3 = n3.__) && null != n3.__c) return n3.__e = n3.__c.base = null, n3.__k.some(function(l3) {
    if (null != l3 && null != l3.__e) return n3.__e = n3.__c.base = l3.__e;
  }), P(n3);
}
function A(n3) {
  (!n3.__d && (n3.__d = true) && i.push(n3) && !H.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(H);
}
function H() {
  try {
    for (var n3, l3 = 1; i.length; ) i.length > l3 && i.sort(e), n3 = i.shift(), l3 = i.length, I(n3);
  } finally {
    i.length = H.__r = 0;
  }
}
function L(n3, l3, u3, t4, i3, r3, o3, e3, f3, c3, s3) {
  var a3, h3, p3, v3, y3, _3, g3, m3 = t4 && t4.__k || w, b3 = l3.length;
  for (f3 = T(u3, l3, m3, f3, b3), a3 = 0; a3 < b3; a3++) null != (p3 = u3.__k[a3]) && (h3 = -1 != p3.__i && m3[p3.__i] || d, p3.__i = a3, _3 = q(n3, p3, h3, i3, r3, o3, e3, f3, c3, s3), v3 = p3.__e, p3.ref && h3.ref != p3.ref && (h3.ref && J(h3.ref, null, p3), s3.push(p3.ref, p3.__c || v3, p3)), null == y3 && null != v3 && (y3 = v3), (g3 = !!(4 & p3.__u)) || h3.__k === p3.__k ? (f3 = j(p3, f3, n3, g3), g3 && h3.__e && (h3.__e = null)) : "function" == typeof p3.type && void 0 !== _3 ? f3 = _3 : v3 && (f3 = v3.nextSibling), p3.__u &= -7);
  return u3.__e = y3, f3;
}
function T(n3, l3, u3, t4, i3) {
  var r3, o3, e3, f3, c3, s3 = u3.length, a3 = s3, h3 = 0;
  for (n3.__k = new Array(i3), r3 = 0; r3 < i3; r3++) null != (o3 = l3[r3]) && "boolean" != typeof o3 && "function" != typeof o3 ? ("string" == typeof o3 || "number" == typeof o3 || "bigint" == typeof o3 || o3.constructor == String ? o3 = n3.__k[r3] = x(null, o3, null, null, null) : g(o3) ? o3 = n3.__k[r3] = x(S, { children: o3 }, null, null, null) : void 0 === o3.constructor && o3.__b > 0 ? o3 = n3.__k[r3] = x(o3.type, o3.props, o3.key, o3.ref ? o3.ref : null, o3.__v) : n3.__k[r3] = o3, f3 = r3 + h3, o3.__ = n3, o3.__b = n3.__b + 1, e3 = null, -1 != (c3 = o3.__i = O(o3, u3, f3, a3)) && (a3--, (e3 = u3[c3]) && (e3.__u |= 2)), null == e3 || null == e3.__v ? (-1 == c3 && (i3 > s3 ? h3-- : i3 < s3 && h3++), "function" != typeof o3.type && (o3.__u |= 4)) : c3 != f3 && (c3 == f3 - 1 ? h3-- : c3 == f3 + 1 ? h3++ : (c3 > f3 ? h3-- : h3++, o3.__u |= 4))) : n3.__k[r3] = null;
  if (a3) for (r3 = 0; r3 < s3; r3++) null != (e3 = u3[r3]) && 0 == (2 & e3.__u) && (e3.__e == t4 && (t4 = $(e3)), K(e3, e3));
  return t4;
}
function j(n3, l3, u3, t4) {
  var i3, r3;
  if ("function" == typeof n3.type) {
    for (i3 = n3.__k, r3 = 0; i3 && r3 < i3.length; r3++) i3[r3] && (i3[r3].__ = n3, l3 = j(i3[r3], l3, u3, t4));
    return l3;
  }
  n3.__e != l3 && (t4 && (l3 && n3.type && !l3.parentNode && (l3 = $(n3)), u3.insertBefore(n3.__e, l3 || null)), l3 = n3.__e);
  do {
    l3 = l3 && l3.nextSibling;
  } while (null != l3 && 8 == l3.nodeType);
  return l3;
}
function F(n3, l3) {
  return l3 = l3 || [], null == n3 || "boolean" == typeof n3 || (g(n3) ? n3.some(function(n4) {
    F(n4, l3);
  }) : l3.push(n3)), l3;
}
function O(n3, l3, u3, t4) {
  var i3, r3, o3, e3 = n3.key, f3 = n3.type, c3 = l3[u3], s3 = null != c3 && 0 == (2 & c3.__u);
  if (null === c3 && null == e3 || s3 && e3 == c3.key && f3 == c3.type) return u3;
  if (t4 > (s3 ? 1 : 0)) {
    for (i3 = u3 - 1, r3 = u3 + 1; i3 >= 0 || r3 < l3.length; ) if (null != (c3 = l3[o3 = i3 >= 0 ? i3-- : r3++]) && 0 == (2 & c3.__u) && e3 == c3.key && f3 == c3.type) return o3;
  }
  return -1;
}
function z(n3, l3, u3) {
  "-" == l3[0] ? n3.setProperty(l3, null == u3 ? "" : u3) : n3[l3] = null == u3 ? "" : "number" != typeof u3 || _.test(l3) ? u3 : u3 + "px";
}
function N(n3, l3, u3, t4, i3) {
  var r3, o3;
  n: if ("style" == l3) if ("string" == typeof u3) n3.style.cssText = u3;
  else {
    if ("string" == typeof t4 && (n3.style.cssText = t4 = ""), t4) for (l3 in t4) u3 && l3 in u3 || z(n3.style, l3, "");
    if (u3) for (l3 in u3) t4 && u3[l3] == t4[l3] || z(n3.style, l3, u3[l3]);
  }
  else if ("o" == l3[0] && "n" == l3[1]) r3 = l3 != (l3 = l3.replace(a, "$1")), o3 = l3.toLowerCase(), l3 = o3 in n3 || "onFocusOut" == l3 || "onFocusIn" == l3 ? o3.slice(2) : l3.slice(2), n3.l || (n3.l = {}), n3.l[l3 + r3] = u3, u3 ? t4 ? u3[s] = t4[s] : (u3[s] = h, n3.addEventListener(l3, r3 ? v : p, r3)) : n3.removeEventListener(l3, r3 ? v : p, r3);
  else {
    if ("http://www.w3.org/2000/svg" == i3) l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
    else if ("width" != l3 && "height" != l3 && "href" != l3 && "list" != l3 && "form" != l3 && "tabIndex" != l3 && "download" != l3 && "rowSpan" != l3 && "colSpan" != l3 && "role" != l3 && "popover" != l3 && l3 in n3) try {
      n3[l3] = null == u3 ? "" : u3;
      break n;
    } catch (n4) {
    }
    "function" == typeof u3 || (null == u3 || false === u3 && "-" != l3[4] ? n3.removeAttribute(l3) : n3.setAttribute(l3, "popover" == l3 && 1 == u3 ? "" : u3));
  }
}
function V(n3) {
  return function(u3) {
    if (this.l) {
      var t4 = this.l[u3.type + n3];
      if (null == u3[c]) u3[c] = h++;
      else if (u3[c] < t4[s]) return;
      return t4(l.event ? l.event(u3) : u3);
    }
  };
}
function q(n3, u3, t4, i3, r3, o3, e3, f3, c3, s3) {
  var a3, h3, p3, v3, y3, d3, _3, k3, x3, M2, $2, I2, P3, A3, H2, T3 = u3.type;
  if (void 0 !== u3.constructor) return null;
  128 & t4.__u && (c3 = !!(32 & t4.__u), o3 = [f3 = u3.__e = t4.__e]), (a3 = l.__b) && a3(u3);
  n: if ("function" == typeof T3) try {
    if (k3 = u3.props, x3 = T3.prototype && T3.prototype.render, M2 = (a3 = T3.contextType) && i3[a3.__c], $2 = a3 ? M2 ? M2.props.value : a3.__ : i3, t4.__c ? _3 = (h3 = u3.__c = t4.__c).__ = h3.__E : (x3 ? u3.__c = h3 = new T3(k3, $2) : (u3.__c = h3 = new C(k3, $2), h3.constructor = T3, h3.render = Q), M2 && M2.sub(h3), h3.state || (h3.state = {}), h3.__n = i3, p3 = h3.__d = true, h3.__h = [], h3._sb = []), x3 && null == h3.__s && (h3.__s = h3.state), x3 && null != T3.getDerivedStateFromProps && (h3.__s == h3.state && (h3.__s = m({}, h3.__s)), m(h3.__s, T3.getDerivedStateFromProps(k3, h3.__s))), v3 = h3.props, y3 = h3.state, h3.__v = u3, p3) x3 && null == T3.getDerivedStateFromProps && null != h3.componentWillMount && h3.componentWillMount(), x3 && null != h3.componentDidMount && h3.__h.push(h3.componentDidMount);
    else {
      if (x3 && null == T3.getDerivedStateFromProps && k3 !== v3 && null != h3.componentWillReceiveProps && h3.componentWillReceiveProps(k3, $2), u3.__v == t4.__v || !h3.__e && null != h3.shouldComponentUpdate && false === h3.shouldComponentUpdate(k3, h3.__s, $2)) {
        u3.__v != t4.__v && (h3.props = k3, h3.state = h3.__s, h3.__d = false), u3.__e = t4.__e, u3.__k = t4.__k, u3.__k.some(function(n4) {
          n4 && (n4.__ = u3);
        }), w.push.apply(h3.__h, h3._sb), h3._sb = [], h3.__h.length && e3.push(h3);
        break n;
      }
      null != h3.componentWillUpdate && h3.componentWillUpdate(k3, h3.__s, $2), x3 && null != h3.componentDidUpdate && h3.__h.push(function() {
        h3.componentDidUpdate(v3, y3, d3);
      });
    }
    if (h3.context = $2, h3.props = k3, h3.__P = n3, h3.__e = false, I2 = l.__r, P3 = 0, x3) h3.state = h3.__s, h3.__d = false, I2 && I2(u3), a3 = h3.render(h3.props, h3.state, h3.context), w.push.apply(h3.__h, h3._sb), h3._sb = [];
    else do {
      h3.__d = false, I2 && I2(u3), a3 = h3.render(h3.props, h3.state, h3.context), h3.state = h3.__s;
    } while (h3.__d && ++P3 < 25);
    h3.state = h3.__s, null != h3.getChildContext && (i3 = m(m({}, i3), h3.getChildContext())), x3 && !p3 && null != h3.getSnapshotBeforeUpdate && (d3 = h3.getSnapshotBeforeUpdate(v3, y3)), A3 = null != a3 && a3.type === S && null == a3.key ? E(a3.props.children) : a3, f3 = L(n3, g(A3) ? A3 : [A3], u3, t4, i3, r3, o3, e3, f3, c3, s3), h3.base = u3.__e, u3.__u &= -161, h3.__h.length && e3.push(h3), _3 && (h3.__E = h3.__ = null);
  } catch (n4) {
    if (u3.__v = null, c3 || null != o3) if (n4.then) {
      for (u3.__u |= c3 ? 160 : 128; f3 && 8 == f3.nodeType && f3.nextSibling; ) f3 = f3.nextSibling;
      o3[o3.indexOf(f3)] = null, u3.__e = f3;
    } else {
      for (H2 = o3.length; H2--; ) b(o3[H2]);
      B(u3);
    }
    else u3.__e = t4.__e, u3.__k = t4.__k, n4.then || B(u3);
    l.__e(n4, u3, t4);
  }
  else null == o3 && u3.__v == t4.__v ? (u3.__k = t4.__k, u3.__e = t4.__e) : f3 = u3.__e = G(t4.__e, u3, t4, i3, r3, o3, e3, c3, s3);
  return (a3 = l.diffed) && a3(u3), 128 & u3.__u ? void 0 : f3;
}
function B(n3) {
  n3 && (n3.__c && (n3.__c.__e = true), n3.__k && n3.__k.some(B));
}
function D(n3, u3, t4) {
  for (var i3 = 0; i3 < t4.length; i3++) J(t4[i3], t4[++i3], t4[++i3]);
  l.__c && l.__c(u3, n3), n3.some(function(u4) {
    try {
      n3 = u4.__h, u4.__h = [], n3.some(function(n4) {
        n4.call(u4);
      });
    } catch (n4) {
      l.__e(n4, u4.__v);
    }
  });
}
function E(n3) {
  return "object" != typeof n3 || null == n3 || n3.__b > 0 ? n3 : g(n3) ? n3.map(E) : m({}, n3);
}
function G(u3, t4, i3, r3, o3, e3, f3, c3, s3) {
  var a3, h3, p3, v3, y3, w3, _3, m3 = i3.props || d, k3 = t4.props, x3 = t4.type;
  if ("svg" == x3 ? o3 = "http://www.w3.org/2000/svg" : "math" == x3 ? o3 = "http://www.w3.org/1998/Math/MathML" : o3 || (o3 = "http://www.w3.org/1999/xhtml"), null != e3) {
    for (a3 = 0; a3 < e3.length; a3++) if ((y3 = e3[a3]) && "setAttribute" in y3 == !!x3 && (x3 ? y3.localName == x3 : 3 == y3.nodeType)) {
      u3 = y3, e3[a3] = null;
      break;
    }
  }
  if (null == u3) {
    if (null == x3) return document.createTextNode(k3);
    u3 = document.createElementNS(o3, x3, k3.is && k3), c3 && (l.__m && l.__m(t4, e3), c3 = false), e3 = null;
  }
  if (null == x3) m3 === k3 || c3 && u3.data == k3 || (u3.data = k3);
  else {
    if (e3 = e3 && n.call(u3.childNodes), !c3 && null != e3) for (m3 = {}, a3 = 0; a3 < u3.attributes.length; a3++) m3[(y3 = u3.attributes[a3]).name] = y3.value;
    for (a3 in m3) y3 = m3[a3], "dangerouslySetInnerHTML" == a3 ? p3 = y3 : "children" == a3 || a3 in k3 || "value" == a3 && "defaultValue" in k3 || "checked" == a3 && "defaultChecked" in k3 || N(u3, a3, null, y3, o3);
    for (a3 in k3) y3 = k3[a3], "children" == a3 ? v3 = y3 : "dangerouslySetInnerHTML" == a3 ? h3 = y3 : "value" == a3 ? w3 = y3 : "checked" == a3 ? _3 = y3 : c3 && "function" != typeof y3 || m3[a3] === y3 || N(u3, a3, y3, m3[a3], o3);
    if (h3) c3 || p3 && (h3.__html == p3.__html || h3.__html == u3.innerHTML) || (u3.innerHTML = h3.__html), t4.__k = [];
    else if (p3 && (u3.innerHTML = ""), L("template" == t4.type ? u3.content : u3, g(v3) ? v3 : [v3], t4, i3, r3, "foreignObject" == x3 ? "http://www.w3.org/1999/xhtml" : o3, e3, f3, e3 ? e3[0] : i3.__k && $(i3, 0), c3, s3), null != e3) for (a3 = e3.length; a3--; ) b(e3[a3]);
    c3 || (a3 = "value", "progress" == x3 && null == w3 ? u3.removeAttribute("value") : null != w3 && (w3 !== u3[a3] || "progress" == x3 && !w3 || "option" == x3 && w3 != m3[a3]) && N(u3, a3, w3, m3[a3], o3), a3 = "checked", null != _3 && _3 != u3[a3] && N(u3, a3, _3, m3[a3], o3));
  }
  return u3;
}
function J(n3, u3, t4) {
  try {
    if ("function" == typeof n3) {
      var i3 = "function" == typeof n3.__u;
      i3 && n3.__u(), i3 && null == u3 || (n3.__u = n3(u3));
    } else n3.current = u3;
  } catch (n4) {
    l.__e(n4, t4);
  }
}
function K(n3, u3, t4) {
  var i3, r3;
  if (l.unmount && l.unmount(n3), (i3 = n3.ref) && (i3.current && i3.current != n3.__e || J(i3, null, u3)), null != (i3 = n3.__c)) {
    if (i3.componentWillUnmount) try {
      i3.componentWillUnmount();
    } catch (n4) {
      l.__e(n4, u3);
    }
    i3.base = i3.__P = null;
  }
  if (i3 = n3.__k) for (r3 = 0; r3 < i3.length; r3++) i3[r3] && K(i3[r3], u3, t4 || "function" != typeof n3.type);
  t4 || b(n3.__e), n3.__c = n3.__ = n3.__e = void 0;
}
function Q(n3, l3, u3) {
  return this.constructor(n3, u3);
}
function R(u3, t4, i3) {
  var r3, o3, e3, f3;
  t4 == document && (t4 = document.documentElement), l.__ && l.__(u3, t4), o3 = (r3 = "function" == typeof i3) ? null : i3 && i3.__k || t4.__k, e3 = [], f3 = [], q(t4, u3 = (!r3 && i3 || t4).__k = k(S, null, [u3]), o3 || d, d, t4.namespaceURI, !r3 && i3 ? [i3] : o3 ? null : t4.firstChild ? n.call(t4.childNodes) : null, e3, !r3 && i3 ? i3 : o3 ? o3.__e : t4.firstChild, r3, f3), D(e3, u3, f3);
}
function U(n3, l3) {
  R(n3, l3, U);
}
function W(l3, u3, t4) {
  var i3, r3, o3, e3, f3 = m({}, l3.props);
  for (o3 in l3.type && l3.type.defaultProps && (e3 = l3.type.defaultProps), u3) "key" == o3 ? i3 = u3[o3] : "ref" == o3 ? r3 = u3[o3] : f3[o3] = void 0 === u3[o3] && null != e3 ? e3[o3] : u3[o3];
  return arguments.length > 2 && (f3.children = arguments.length > 3 ? n.call(arguments, 2) : t4), x(l3.type, f3, i3 || l3.key, r3 || l3.ref, null);
}
function X(n3) {
  function l3(n4) {
    var u3, t4;
    return this.getChildContext || (u3 = /* @__PURE__ */ new Set(), (t4 = {})[l3.__c] = this, this.getChildContext = function() {
      return t4;
    }, this.componentWillUnmount = function() {
      u3 = null;
    }, this.shouldComponentUpdate = function(n5) {
      this.props.value != n5.value && u3.forEach(function(n6) {
        n6.__e = true, A(n6);
      });
    }, this.sub = function(n5) {
      u3.add(n5);
      var l4 = n5.componentWillUnmount;
      n5.componentWillUnmount = function() {
        u3 && u3.delete(n5), l4 && l4.call(n5);
      };
    }), n4.children;
  }
  return l3.__c = "__cC" + y++, l3.__ = n3, l3.Provider = l3.__l = (l3.Consumer = function(n4, l4) {
    return n4.children(l4);
  }).contextType = l3, l3;
}
n = w.slice, l = { __e: function(n3, l3, u3, t4) {
  for (var i3, r3, o3; l3 = l3.__; ) if ((i3 = l3.__c) && !i3.__) try {
    if ((r3 = i3.constructor) && null != r3.getDerivedStateFromError && (i3.setState(r3.getDerivedStateFromError(n3)), o3 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n3, t4 || {}), o3 = i3.__d), o3) return i3.__E = i3;
  } catch (l4) {
    n3 = l4;
  }
  throw n3;
} }, u = 0, t = function(n3) {
  return null != n3 && void 0 === n3.constructor;
}, C.prototype.setState = function(n3, l3) {
  var u3;
  u3 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m({}, this.state), "function" == typeof n3 && (n3 = n3(m({}, u3), this.props)), n3 && m(u3, n3), null != n3 && this.__v && (l3 && this._sb.push(l3), A(this));
}, C.prototype.forceUpdate = function(n3) {
  this.__v && (this.__e = true, n3 && this.__h.push(n3), A(this));
}, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n3, l3) {
  return n3.__v.__b - l3.__v.__b;
}, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, s = "__a" + f, a = /(PointerCapture)$|Capture$/i, h = 0, p = V(false), v = V(true), y = 0;

// node_modules/preact/hooks/dist/hooks.module.js
var t2;
var r2;
var u2;
var i2;
var o2 = 0;
var f2 = [];
var c2 = l;
var e2 = c2.__b;
var a2 = c2.__r;
var v2 = c2.diffed;
var l2 = c2.__c;
var m2 = c2.unmount;
var s2 = c2.__;
function p2(n3, t4) {
  c2.__h && c2.__h(r2, n3, o2 || t4), o2 = 0;
  var u3 = r2.__H || (r2.__H = { __: [], __h: [] });
  return n3 >= u3.__.length && u3.__.push({}), u3.__[n3];
}
function d2(n3) {
  return o2 = 1, h2(D2, n3);
}
function h2(n3, u3, i3) {
  var o3 = p2(t2++, 2);
  if (o3.t = n3, !o3.__c && (o3.__ = [i3 ? i3(u3) : D2(void 0, u3), function(n4) {
    var t4 = o3.__N ? o3.__N[0] : o3.__[0], r3 = o3.t(t4, n4);
    t4 !== r3 && (o3.__N = [r3, o3.__[1]], o3.__c.setState({}));
  }], o3.__c = r2, !r2.__f)) {
    var f3 = function(n4, t4, r3) {
      if (!o3.__c.__H) return true;
      var u4 = o3.__c.__H.__.filter(function(n5) {
        return n5.__c;
      });
      if (u4.every(function(n5) {
        return !n5.__N;
      })) return !c3 || c3.call(this, n4, t4, r3);
      var i4 = o3.__c.props !== n4;
      return u4.some(function(n5) {
        if (n5.__N) {
          var t5 = n5.__[0];
          n5.__ = n5.__N, n5.__N = void 0, t5 !== n5.__[0] && (i4 = true);
        }
      }), c3 && c3.call(this, n4, t4, r3) || i4;
    };
    r2.__f = true;
    var c3 = r2.shouldComponentUpdate, e3 = r2.componentWillUpdate;
    r2.componentWillUpdate = function(n4, t4, r3) {
      if (this.__e) {
        var u4 = c3;
        c3 = void 0, f3(n4, t4, r3), c3 = u4;
      }
      e3 && e3.call(this, n4, t4, r3);
    }, r2.shouldComponentUpdate = f3;
  }
  return o3.__N || o3.__;
}
function y2(n3, u3) {
  var i3 = p2(t2++, 3);
  !c2.__s && C2(i3.__H, u3) && (i3.__ = n3, i3.u = u3, r2.__H.__h.push(i3));
}
function _2(n3, u3) {
  var i3 = p2(t2++, 4);
  !c2.__s && C2(i3.__H, u3) && (i3.__ = n3, i3.u = u3, r2.__h.push(i3));
}
function A2(n3) {
  return o2 = 5, T2(function() {
    return { current: n3 };
  }, []);
}
function F2(n3, t4, r3) {
  o2 = 6, _2(function() {
    if ("function" == typeof n3) {
      var r4 = n3(t4());
      return function() {
        n3(null), r4 && "function" == typeof r4 && r4();
      };
    }
    if (n3) return n3.current = t4(), function() {
      return n3.current = null;
    };
  }, null == r3 ? r3 : r3.concat(n3));
}
function T2(n3, r3) {
  var u3 = p2(t2++, 7);
  return C2(u3.__H, r3) && (u3.__ = n3(), u3.__H = r3, u3.__h = n3), u3.__;
}
function q2(n3, t4) {
  return o2 = 8, T2(function() {
    return n3;
  }, t4);
}
function x2(n3) {
  var u3 = r2.context[n3.__c], i3 = p2(t2++, 9);
  return i3.c = n3, u3 ? (null == i3.__ && (i3.__ = true, u3.sub(r2)), u3.props.value) : n3.__;
}
function P2(n3, t4) {
  c2.useDebugValue && c2.useDebugValue(t4 ? t4(n3) : n3);
}
function b2(n3) {
  var u3 = p2(t2++, 10), i3 = d2();
  return u3.__ = n3, r2.componentDidCatch || (r2.componentDidCatch = function(n4, t4) {
    u3.__ && u3.__(n4, t4), i3[1](n4);
  }), [i3[0], function() {
    i3[1](void 0);
  }];
}
function g2() {
  var n3 = p2(t2++, 11);
  if (!n3.__) {
    for (var u3 = r2.__v; null !== u3 && !u3.__m && null !== u3.__; ) u3 = u3.__;
    var i3 = u3.__m || (u3.__m = [0, 0]);
    n3.__ = "P" + i3[0] + "-" + i3[1]++;
  }
  return n3.__;
}
function j2() {
  for (var n3; n3 = f2.shift(); ) {
    var t4 = n3.__H;
    if (n3.__P && t4) try {
      t4.__h.some(z2), t4.__h.some(B2), t4.__h = [];
    } catch (r3) {
      t4.__h = [], c2.__e(r3, n3.__v);
    }
  }
}
c2.__b = function(n3) {
  r2 = null, e2 && e2(n3);
}, c2.__ = function(n3, t4) {
  n3 && t4.__k && t4.__k.__m && (n3.__m = t4.__k.__m), s2 && s2(n3, t4);
}, c2.__r = function(n3) {
  a2 && a2(n3), t2 = 0;
  var i3 = (r2 = n3.__c).__H;
  i3 && (u2 === r2 ? (i3.__h = [], r2.__h = [], i3.__.some(function(n4) {
    n4.__N && (n4.__ = n4.__N), n4.u = n4.__N = void 0;
  })) : (i3.__h.some(z2), i3.__h.some(B2), i3.__h = [], t2 = 0)), u2 = r2;
}, c2.diffed = function(n3) {
  v2 && v2(n3);
  var t4 = n3.__c;
  t4 && t4.__H && (t4.__H.__h.length && (1 !== f2.push(t4) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t4.__H.__.some(function(n4) {
    n4.u && (n4.__H = n4.u), n4.u = void 0;
  })), u2 = r2 = null;
}, c2.__c = function(n3, t4) {
  t4.some(function(n4) {
    try {
      n4.__h.some(z2), n4.__h = n4.__h.filter(function(n5) {
        return !n5.__ || B2(n5);
      });
    } catch (r3) {
      t4.some(function(n5) {
        n5.__h && (n5.__h = []);
      }), t4 = [], c2.__e(r3, n4.__v);
    }
  }), l2 && l2(n3, t4);
}, c2.unmount = function(n3) {
  m2 && m2(n3);
  var t4, r3 = n3.__c;
  r3 && r3.__H && (r3.__H.__.some(function(n4) {
    try {
      z2(n4);
    } catch (n5) {
      t4 = n5;
    }
  }), r3.__H = void 0, t4 && c2.__e(t4, r3.__v));
};
var k2 = "function" == typeof requestAnimationFrame;
function w2(n3) {
  var t4, r3 = function() {
    clearTimeout(u3), k2 && cancelAnimationFrame(t4), setTimeout(n3);
  }, u3 = setTimeout(r3, 35);
  k2 && (t4 = requestAnimationFrame(r3));
}
function z2(n3) {
  var t4 = r2, u3 = n3.__c;
  "function" == typeof u3 && (n3.__c = void 0, u3()), r2 = t4;
}
function B2(n3) {
  var t4 = r2;
  n3.__c = n3.__(), r2 = t4;
}
function C2(n3, t4) {
  return !n3 || n3.length !== t4.length || t4.some(function(t5, r3) {
    return t5 !== n3[r3];
  });
}
function D2(n3, t4) {
  return "function" == typeof t4 ? t4(n3) : t4;
}

// node_modules/htm/dist/htm.module.js
var n2 = function(t4, s3, r3, e3) {
  var u3;
  s3[0] = 0;
  for (var h3 = 1; h3 < s3.length; h3++) {
    var p3 = s3[h3++], a3 = s3[h3] ? (s3[0] |= p3 ? 1 : 2, r3[s3[h3++]]) : s3[++h3];
    3 === p3 ? e3[0] = a3 : 4 === p3 ? e3[1] = Object.assign(e3[1] || {}, a3) : 5 === p3 ? (e3[1] = e3[1] || {})[s3[++h3]] = a3 : 6 === p3 ? e3[1][s3[++h3]] += a3 + "" : p3 ? (u3 = t4.apply(a3, n2(t4, a3, r3, ["", null])), e3.push(u3), a3[0] ? s3[0] |= 2 : (s3[h3 - 2] = 0, s3[h3] = u3)) : e3.push(a3);
  }
  return e3;
};
var t3 = /* @__PURE__ */ new Map();
function htm_module_default(s3) {
  var r3 = t3.get(this);
  return r3 || (r3 = /* @__PURE__ */ new Map(), t3.set(this, r3)), (r3 = n2(this, r3.get(s3) || (r3.set(s3, r3 = (function(n3) {
    for (var t4, s4, r4 = 1, e3 = "", u3 = "", h3 = [0], p3 = function(n4) {
      1 === r4 && (n4 || (e3 = e3.replace(/^\s*\n\s*|\s*\n\s*$/g, ""))) ? h3.push(0, n4, e3) : 3 === r4 && (n4 || e3) ? (h3.push(3, n4, e3), r4 = 2) : 2 === r4 && "..." === e3 && n4 ? h3.push(4, n4, 0) : 2 === r4 && e3 && !n4 ? h3.push(5, 0, true, e3) : r4 >= 5 && ((e3 || !n4 && 5 === r4) && (h3.push(r4, 0, e3, s4), r4 = 6), n4 && (h3.push(r4, n4, 0, s4), r4 = 6)), e3 = "";
    }, a3 = 0; a3 < n3.length; a3++) {
      a3 && (1 === r4 && p3(), p3(a3));
      for (var l3 = 0; l3 < n3[a3].length; l3++) t4 = n3[a3][l3], 1 === r4 ? "<" === t4 ? (p3(), h3 = [h3], r4 = 3) : e3 += t4 : 4 === r4 ? "--" === e3 && ">" === t4 ? (r4 = 1, e3 = "") : e3 = t4 + e3[0] : u3 ? t4 === u3 ? u3 = "" : e3 += t4 : '"' === t4 || "'" === t4 ? u3 = t4 : ">" === t4 ? (p3(), r4 = 1) : r4 && ("=" === t4 ? (r4 = 5, s4 = e3, e3 = "") : "/" === t4 && (r4 < 5 || ">" === n3[a3][l3 + 1]) ? (p3(), 3 === r4 && (h3 = h3[0]), r4 = h3, (h3 = h3[0]).push(2, 0, r4), r4 = 0) : " " === t4 || "	" === t4 || "\n" === t4 || "\r" === t4 ? (p3(), r4 = 2) : e3 += t4), 3 === r4 && "!--" === e3 && (r4 = 4, h3 = h3[0]);
    }
    return p3(), h3;
  })(s3)), r3), arguments, [])).length > 1 ? r3 : r3[0];
}

// src/vendor/preact-entry.js
var preact_entry_default = htm_module_default;
export {
  C as Component,
  S as Fragment,
  W as cloneElement,
  X as createContext,
  k as createElement,
  M as createRef,
  preact_entry_default as default,
  k as h,
  htm_module_default as htm,
  U as hydrate,
  t as isValidElement,
  l as options,
  R as render,
  F as toChildArray,
  q2 as useCallback,
  x2 as useContext,
  P2 as useDebugValue,
  y2 as useEffect,
  b2 as useErrorBoundary,
  g2 as useId,
  F2 as useImperativeHandle,
  _2 as useLayoutEffect,
  T2 as useMemo,
  h2 as useReducer,
  A2 as useRef,
  d2 as useState
};
