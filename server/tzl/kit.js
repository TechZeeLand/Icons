// TZL Kit (Node edition). Mirrors the PHP kit: same setting keys, same URLs, same markup.
"use strict";
const fs = require("fs");
const path = require("path");
const env = process.env;

const VERSION = "1.0.0";
const SERVICES = {
  fonts: { name: "TZL Fonts", sub: "fonts", icon: "font", desc: "Free commercial fonts you can cache on your own server", health: "/health" },
  icons: { name: "TZL Icons", sub: "icons", icon: "sparkles", desc: "Open-source SVG icon library with a CDN", health: "/healthz" },
  qr: { name: "QR & Barcode Generator", sub: "qrcode", icon: "qr-code", desc: "Customizable QR codes and barcodes, no tracking", health: "/health" },
  cover: { name: "Assignment Cover Generator", sub: "assignmentcovergenerator", icon: "file-pdf", desc: "Print-ready assignment cover pages as PDF", health: "/health" },
};
const DEFAULT_ROOT_DOMAIN = "rayaz.org";

const K = { VERSION, SERVICES, DEFAULT_ROOT_DOMAIN, root: "", data: "", cfg: {} };
let siteGet = () => "";
K.bindSite = (fn) => { siteGet = fn; };

K.boot = (cfg) => {
  K.cfg = cfg;
  K.root = cfg.root.replace(/\/+$/, "");
  K.data = (cfg.data || env.TZL_DATA_DIR || env.DATA_DIR || path.join(K.root, "data")).replace(/\/+$/, "");
  for (const sub of ["", "/uploads", "/site-history"]) fs.mkdirSync(K.data + sub, { recursive: true });
  const first = path.join(K.data, "first-run.txt");
  if (!fs.existsSync(first)) fs.writeFileSync(first, K.now());
};
K.c = (key, def = "") => (K.cfg[key] !== undefined ? K.cfg[key] : def);
K.env = (key, def = "") => (env[key] ? String(env[key]) : def);

/* ---------- escaping and small helpers ---------- */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
K.e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
K.icon = (name, extra = "") => `<i class="zi zi-${String(name).toLowerCase().replace(/[^a-z0-9-]/g, "")}${extra ? " " + K.e(extra) : ""}" aria-hidden="true"></i>`;
K.now = () => new Date().toISOString();
K.slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
K.bytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 102.4) / 10} KB` : b < 1073741824 ? `${Math.round(b / 104857.6) / 10} MB` : `${Math.round(b / 10737418.24) / 100} GB`);
K.number = (n) => Number(n || 0).toLocaleString("en-US");
K.ago = (iso) => {
  const t = Date.parse(iso);
  if (!t) return "";
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} d ago`;
  return new Date(t).toISOString().slice(0, 10);
};

/* ---------- request helpers ---------- */
K.trustProxy = () => K.env("TZL_TRUST_PROXY") === "1" || /^(true|yes|on)$/i.test(K.env("TZL_TRUST_PROXY"));
K.isHttps = (req) => Boolean(req && req.socket && req.socket.encrypted) || (K.trustProxy() && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
K.clientIp = (req) => {
  if (K.trustProxy()) { const x = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(); if (x) return x; }
  return req.socket.remoteAddress || "unknown";
};
K.origin = (req) => {
  let host = (K.trustProxy() && req.headers["x-forwarded-host"]) || req.headers.host || "localhost";
  host = String(host).split(",")[0].trim();
  if (!/^[a-z0-9.\-:[\]]+$/i.test(host)) host = "localhost";
  return `${K.isHttps(req) ? "https" : "http"}://${host}`;
};

/* ---------- domains and service URLs: change the domain in ONE place ---------- */
K.rootDomain = () => {
  let d = String(siteGet("root_domain") || "").trim();
  if (!d) d = K.env("TZL_ROOT_DOMAIN", DEFAULT_ROOT_DOMAIN);
  d = d.toLowerCase().replace(/^https?:\/\//, "").replace(/^[/\s]+|[/\s]+$/g, "");
  return /^[a-z0-9.\-]+$/.test(d) ? d : DEFAULT_ROOT_DOMAIN;
};
K.service = (key) => {
  const over = String(siteGet("svc_" + key) || "").trim();
  if (over) return over.replace(/\/+$/, "");
  const eo = K.env("TZL_URL_" + key.toUpperCase());
  if (eo) return eo.replace(/\/+$/, "");
  return `https://${(SERVICES[key] || {}).sub || key}.${K.rootDomain()}`;
};
K.iconCssUrl = () => (K.c("service") === "icons" ? "" : K.service("icons")) + "/zi.css";
K.fontCssUrl = (families = "Alata") => {
  const q = families.split("|").map((f) => "family=" + encodeURIComponent(f.trim())).join("&");
  return (K.c("service") === "fonts" ? "" : K.service("fonts")) + "/css2?" + q + "&display=swap";
};
K.origins = () => {
  const o = {};
  for (const k of ["icons", "fonts"]) {
    if (k === K.c("service")) continue;
    try { const u = new URL(K.service(k)); o[k] = u.origin; } catch { /* ignore */ }
  }
  return o;
};
K.baseUrl = (req) => {
  let b = String(siteGet("base_url") || "").trim() || K.env("TZL_BASE_URL");
  if (!b && req) b = K.origin(req);
  return b.replace(/\/+$/, "");
};
K.url = (req, p = "/") => K.baseUrl(req) + "/" + String(p).replace(/^\/+/, "");

/* ---------- security headers / CSP ---------- */
K.csp = (extra = {}) => {
  const ext = Object.values(K.origins()).join(" ");
  const sp = (s) => (ext ? s + " " + ext : s);
  const csp = {
    "default-src": "'self'", "img-src": sp("'self' data:"), "style-src": sp("'self' 'unsafe-inline'"), "font-src": sp("'self' data:"),
    "script-src": "'self'", "connect-src": "'self'", "object-src": "'none'", "base-uri": "'self'", "form-action": "'self'", "frame-ancestors": "'self'",
  };
  for (const [k, v] of Object.entries(extra)) csp[k] = csp[k] ? csp[k] + " " + v : v;
  return Object.entries(csp).map(([k, v]) => `${k} ${v}`).join("; ");
};
K.securityHeaders = (req, extra = {}) => {
  const h = {
    "Content-Security-Policy": K.csp(extra), "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()", "X-Frame-Options": "SAMEORIGIN",
  };
  if (K.isHttps(req)) h["Strict-Transport-Security"] = "max-age=15552000";
  return h;
};
K.asset = (p) => {
  const f = path.join(K.root, "public", p.replace(/^\/+/, ""));
  let v = "";
  try { v = "?v=" + Math.floor(fs.statSync(f).mtimeMs / 1000); } catch { /* missing */ }
  return "/" + p.replace(/^\/+/, "") + v;
};

module.exports = K;
