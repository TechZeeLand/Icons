/*! icon-service browser client | SPDX-License-Identifier: AGPL-3.0-or-later
 *
 *   <script src="https://icons.example.com/icons.js" defer></script>
 *
 *   <svg-icon name="home"></svg-icon>                       inherits text colour (currentColor)
 *   <svg-icon name="github" set="social" size="20"></svg-icon>
 *   <svg-icon name="settings" size="18" stroke="1.5" label="Settings"></svg-icon>
 *
 *   Icons.svg('home')            -> Promise<string>      SVG markup
 *   Icons.el('home', {size: 20}) -> Promise<SVGElement>  detached element
 *   Icons.url('home', {size: 24, color: 'ff0000'})  -> URL for <img src> (an <img> cannot inherit colour)
 *   Icons.refresh()              -> Promise<boolean>     re-check the server; true if icons changed
 *   Icons.clearCache()
 *
 * Caching: icons are kept in localStorage for 7 days (change with data-ttl="seconds" on the script tag).
 * Inside that window an icon costs no network request. After it, the stored copy is used immediately and
 * refreshed in the background.
 *
 * Freshness: at most every 5 minutes (data-check="seconds") the page asks /api/version whether any icon changed.
 * If so, stored copies are marked stale: each one is shown instantly, re-checked in the background, and replaced
 * on screen when it changed. An icon that was removed from the service is NOT dropped: its stored copy keeps
 * working, so your pages survive the service being down or an icon being deleted by mistake.
 * New icons are never stored until they exist, so they show up as soon as the service has them.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var BASE = script && script.src ? new URL('.', script.src).href.replace(/\/$/, '') : '';
  var ttl = script && script.getAttribute('data-ttl');
  var TTL = (ttl !== null && ttl !== '' && !isNaN(+ttl) ? +ttl : 7 * 86400) * 1000;
  var chk = script && script.getAttribute('data-check');
  var CHECK = (chk !== null && chk !== '' && !isNaN(+chk) ? +chk : 300) * 1000;
  var PREFIX = 'zi-icons:' + BASE + '|';
  var VERSION_KEY = PREFIX + '#version';
  var mem = new Map();

  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { clearCache(); try { localStorage.setItem(k, JSON.stringify(v)); } catch (e2) { /* storage full or blocked */ } }
  }
  function clearCache() {
    mem.clear();
    try {
      var drop = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(PREFIX) === 0 && k !== VERSION_KEY) drop.push(k); }
      drop.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  function key(name, set) { return set ? set + '/' + name : name; }

  function url(name, opts) {
    opts = opts || {};
    var q = new URLSearchParams();
    ['size', 'stroke', 'color'].forEach(function (k) {
      if (opts[k] != null && opts[k] !== '') q.set(k, String(opts[k]).replace(/^#/, ''));
    });
    var s = q.toString();
    return BASE + '/i/' + key(name, opts.set) + '.svg' + (s ? '?' + s : '');
  }

  function download(k, revalidate) {
    return fetch(BASE + '/i/' + k + '.svg', revalidate ? { cache: 'no-cache' } : undefined).then(function (r) {
      if (!r.ok) throw new Error('icon "' + k + '" not found (' + r.status + ')');
      return r.text();
    }).then(function (text) { lsSet(PREFIX + k, { t: Date.now(), v: text }); return text; });
  }

  // Re-check a stored icon. Keeps the stored copy on any failure (offline, 404, 5xx); when the icon changed, updates the
  // in-memory copy and redraws the <svg-icon> elements that use it.
  function revalidate(k, old) {
    return download(k, true).then(function (text) {
      if (text !== old) {
        mem.set(k, Promise.resolve(text));
        Array.prototype.forEach.call(document.querySelectorAll('svg-icon'), function (n) {
          var nm = n.getAttribute('name'), st = n.getAttribute('set');
          if (nm && key(nm, st) === k && n.isConnected) n._render();
        });
      }
    }).catch(function () { /* keep the stored copy */ });
  }

  function raw(name, set) {
    var k = key(name, set);
    if (mem.has(k)) return mem.get(k);
    var hit = lsGet(PREFIX + k), p;
    if (hit && typeof hit.v === 'string') {
      p = Promise.resolve(hit.v);
      if (Date.now() - hit.t >= TTL) revalidate(k, hit.v);
    } else {
      p = download(k, false);
      p.catch(function () { mem.delete(k); });
    }
    mem.set(k, p);
    return p;
  }

  // Mark every stored icon stale (t = 0) without deleting it, then re-check the ones this page is showing.
  function markStale(alsoShown) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(PREFIX) !== 0 || k === VERSION_KEY) continue;
        var e = lsGet(k);
        if (e && typeof e.v === 'string') { e.t = 0; try { localStorage.setItem(k, JSON.stringify(e)); } catch (x) { /* ignore */ } }
      }
    } catch (e) { /* ignore */ }
    if (alsoShown) mem.forEach(function (p, k) { p.then(function (text) { revalidate(k, text); }, function () {}); });
  }

  function refresh() {
    return fetch(BASE + '/api/version', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) {
      var prev = lsGet(VERSION_KEY);
      lsSet(VERSION_KEY, { t: Date.now(), v: j.version });
      if (prev && prev.v !== j.version) { markStale(true); return true; }
      if (!prev) markStale(false); // first check on this browser: copies stored earlier are of unknown age
      return false;
    }).catch(function () { return false; });
  }

  // Ask about changes now and then (every CHECK seconds at most), without blocking rendering.
  (function () {
    var v = lsGet(VERSION_KEY);
    if (!v || Date.now() - v.t >= CHECK) (window.requestIdleCallback || setTimeout)(function () { refresh(); }, 1500);
  })();

  function parse(text) {
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    var svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('invalid SVG');
    svg.querySelectorAll('script, foreignObject').forEach(function (n) { n.remove(); });
    [svg].concat(Array.from(svg.querySelectorAll('*'))).forEach(function (n) {
      Array.from(n.attributes).forEach(function (a) { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
    });
    return svg;
  }

  function el(name, opts) {
    opts = opts || {};
    return raw(name, opts.set).then(function (text) {
      var svg = document.importNode(parse(text), true);
      if (opts.size) { svg.setAttribute('width', opts.size); svg.setAttribute('height', opts.size); }
      if (opts.stroke && svg.hasAttribute('stroke-width')) svg.setAttribute('stroke-width', opts.stroke);
      if (opts.color) svg.style.color = opts.color;
      if (opts.label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label); }
      else svg.setAttribute('aria-hidden', 'true');
      return svg;
    });
  }

  function svg(name, opts) {
    return el(name, opts).then(function (n) { return new XMLSerializer().serializeToString(n); });
  }

  class SvgIcon extends HTMLElement {
    static get observedAttributes() { return ['name', 'set', 'size', 'stroke', 'color', 'label']; }
    connectedCallback() {
      if (!this.style.display) this.style.display = 'inline-flex';
      if (!this.style.verticalAlign) this.style.verticalAlign = 'middle';
      this._render();
    }
    attributeChangedCallback() { if (this.isConnected) this._render(); }
    _render() {
      var self = this, name = this.getAttribute('name');
      if (!name) return this.replaceChildren();
      var token = (this._token = {});
      var size = this.getAttribute('size') || '1em';
      el(name, {
        set: this.getAttribute('set'), size: /^\d+(\.\d+)?$/.test(size) ? size : size,
        stroke: this.getAttribute('stroke'), color: this.getAttribute('color'), label: this.getAttribute('label'),
      }).then(function (node) {
        if (self._token === token) self.replaceChildren(node);
      }).catch(function (e) { console.warn('[icons]', e.message); self.title = e.message; });
    }
  }
  if (!customElements.get('svg-icon')) customElements.define('svg-icon', SvgIcon);

  window.Icons = { base: BASE, url: url, svg: svg, el: el, refresh: refresh, clearCache: clearCache };
})();
