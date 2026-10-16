// Anonymous aggregate counters only: no IPs, no stored user agents, no cookies. data/stats.json (same shape as the PHP kit).
"use strict";
const store = require("./store");
const Site = require("./site");

let buf = []; // pending records
const day = () => new Date().toISOString().slice(0, 10);
const device = (ua) => {
  if (!ua) return "unknown";
  if (/bot|crawl|spider|slurp|facebookexternalhit|curl|wget|python-requests|headless/i.test(ua)) return "bot";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
};
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/** A request finished. */
function record({ path, method, status, ms, ref, ua, host, admin }) {
  if (!Site.on("stats_on")) return;
  buf.push({ type: "req", path, method, status, ms, ref, dev: device(ua), host, admin });
}
/** Count a project event, e.g. event("icon", "ui/home"). */
function event(kind, key) {
  if (!Site.on("stats_on")) return;
  kind = String(kind).replace(/[^a-z0-9_.:-]/gi, "").slice(0, 40);
  if (kind) buf.push({ type: "ev", kind, key: key ? String(key).slice(0, 80) : null });
}

function flush() {
  if (!buf.length) return;
  const items = buf; buf = [];
  try {
    store.update("stats.json", (s) => {
      s = s && s.days ? s : { days: {} };
      const d = (s.days[day()] ||= {});
      for (const r of items) {
        if (r.type === "ev") {
          d.ev ||= {}; inc(d.ev, r.kind);
          if (r.key) { d.evk ||= {}; d.evk[r.kind] ||= {}; inc(d.evk[r.kind], r.key); }
          continue;
        }
        if (r.admin || r.method !== "GET") continue;
        const p = r.path.slice(0, 120);
        if (r.status === 404) { d.nf ||= {}; if (Object.keys(d.nf).length < 100 || d.nf[p]) inc(d.nf, p); }
        else if (r.status >= 500) inc(d, "err");
        else if (r.status < 400) {
          if (/^\/(api|css2?|i|f|download|health|healthz|embed|zi\.css|icons\.js|sprite\.svg|tools|_)(\/|\.|$)/.test(r.path)) inc(d, "api");
          else if (r.dev !== "bot") {
            inc(d, "pv"); d.p ||= {}; if (Object.keys(d.p).length < 150 || d.p[p]) inc(d.p, p);
            if (r.ref && r.ref !== r.host) { d.r ||= {}; inc(d.r, r.ref); }
            d.d ||= {}; inc(d.d, r.dev);
          } else inc(d, "bot");
        }
        d.ms = [(d.ms ? d.ms[0] : 0) + r.ms, (d.ms ? d.ms[1] : 0) + 1];
      }
      const keys = Object.keys(s.days).sort();
      if (keys.length > 100) for (const k of keys.slice(0, keys.length - 90)) delete s.days[k];
      return s;
    }, { days: {} });
  } catch (e) { console.error("[stats] save failed:", e.message); }
}
setInterval(flush, 30000).unref();
process.on("exit", flush);

const raw = () => (store.read("stats.json", { days: {} }) || {}).days || {};
function days(n = 14) {
  flush();
  const all = raw(), out = {};
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); out[d] = all[d] || {}; }
  return out;
}
const sum = (ds, f) => Object.values(ds).reduce((t, r) => t + (r[f] || 0), 0);
const sumEvent = (ds, k) => Object.values(ds).reduce((t, r) => t + ((r.ev || {})[k] || 0), 0);
function top(ds, f, limit = 10) {
  const tot = {};
  for (const r of Object.values(ds)) for (const [k, n] of Object.entries(r[f] || {})) inc(tot, k, n);
  return Object.fromEntries(Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, limit));
}
function topEventKeys(ds, kind, limit = 10) {
  const tot = {};
  for (const r of Object.values(ds)) for (const [k, n] of Object.entries(((r.evk || {})[kind]) || {})) inc(tot, k, n);
  return Object.fromEntries(Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, limit));
}
function avgMs(ds) {
  let s = 0, c = 0;
  for (const r of Object.values(ds)) { s += r.ms ? r.ms[0] : 0; c += r.ms ? r.ms[1] : 0; }
  return c ? Math.round(s / c) : 0;
}
const clear = () => { buf = []; store.write("stats.json", { days: {} }); };
module.exports = { record, event, flush, days, sum, sumEvent, top, topEventKeys, avgMs, clear };
