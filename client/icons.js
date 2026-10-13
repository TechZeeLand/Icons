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
 * refreshed in the background. A version check (/api/version) drops outdated copies when icons change.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var BASE = script && script.src ? new URL('.', script.src).href.replace(/\/$/, '') : '';
  var ttl = script && script.getAttribute('data-ttl');
  var TTL = (ttl !== null && ttl !== '' && !isNaN(+ttl) ? +ttl : 7 * 86400) * 1000;
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

  function raw(name, set) {
    var k = key(name, set);
    if (mem.has(k)) return mem.get(k);
    var hit = lsGet(PREFIX + k), p;
    if (hit && typeof hit.v === 'string') {
      p = Promise.resolve(hit.v);
      if (Date.now() - hit.t >= TTL) download(k, true).catch(function () { /* offline: keep the stored copy */ });
    } else {
      p = download(k, false);
      p.catch(function () { mem.delete(k); });
    }
    mem.set(k, p);
    return p;
  }

  function refresh() {
    return fetch(BASE + '/api/version', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) {
      var prev = lsGet(VERSION_KEY);
      lsSet(VERSION_KEY, { t: Date.now(), v: j.version });
      if (prev && prev.v !== j.version) { clearCache(); return true; }
      return false;
    }).catch(function () { return false; });
  }

  // Check for updates at most once per TTL window, without blocking rendering.
  (function () {
    var v = lsGet(VERSION_KEY);
    if (!v || Date.now() - v.t >= TTL) (window.requestIdleCallback || setTimeout)(function () { refresh(); }, 1500);
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
