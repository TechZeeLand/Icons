// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const cfg = require("./config");

const MIME = {
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg|application\/manifest|application\/javascript)/;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isHttps(req) {
  if (cfg.COOKIE_SECURE !== "auto") return cfg.COOKIE_SECURE;
  return Boolean(req.socket.encrypted) || (cfg.TRUST_PROXY && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
}

function clientIp(req) {
  if (cfg.TRUST_PROXY) {
    const x = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (x) return x;
  }
  return req.socket.remoteAddress || "unknown";
}

/** Public base URL used in documentation snippets and canonical links. */
function baseUrl(req) {
  if (cfg.PUBLIC_URL) return cfg.PUBLIC_URL;
  const proto = isHttps(req) ? "https" : "http";
  let host = (cfg.TRUST_PROXY && req.headers["x-forwarded-host"]) || req.headers.host || "localhost";
  host = String(host).split(",")[0].trim();
  if (!/^[a-z0-9.\-:[\]]+$/i.test(host)) host = "localhost";
  return `${proto}://${host}`;
}

function setCookie(res, name, value, { maxAge, path: p = "/", secure = false, httpOnly = true, sameSite = "Strict" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, parts.join("; ")) : parts.join("; "));
}

function baseHeaders(extra) {
  const h = {
    "Access-Control-Allow-Origin": cfg.CORS_ORIGIN,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...extra,
  };
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k]; // pass null to drop a default header
  return h;
}

function send(req, res, status, body, headers = {}, { compress = true } = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body ?? "");
  const type = String(headers["Content-Type"] || "");
  const h = { ...headers };
  if (compress && buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    buf = zlib.gzipSync(buf, { level: 6 });
    h["Content-Encoding"] = "gzip";
    h.Vary = h.Vary ? `${h.Vary}, Accept-Encoding` : "Accept-Encoding";
  }
  h["Content-Length"] = buf.length;
  res.writeHead(status, baseHeaders(h));
  res.end(req.method === "HEAD" ? undefined : buf);
}

const text = (req, res, status, msg, extra = {}) => send(req, res, status, msg, { "Content-Type": "text/plain; charset=utf-8", ...extra });
const json = (req, res, status, obj, extra = {}) => send(req, res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", ...extra });

function redirect(res, location, status = 303) {
  res.writeHead(status, baseHeaders({ Location: location, "Content-Length": 0 }));
  res.end();
}

/** Conditional GET helper: serves 304 when the ETag matches. */
function sendCached(req, res, body, type, etagSeed, { maxAge = cfg.CACHE_MAX_AGE, extra = {} } = {}) {
  const etag = '"' + crypto.createHash("sha1").update(String(etagSeed)).update(body).digest("hex").slice(0, 20) + '"';
  const cache = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 7}`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, baseHeaders({ ETag: etag, "Cache-Control": cache }));
    return res.end();
  }
  send(req, res, 200, body, { "Content-Type": type, ETag: etag, "Cache-Control": cache, ...extra });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) { reject(Object.assign(new Error("Request body too large"), { status: 413 })); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readForm(req, limit = 64 * 1024) {
  const p = new URLSearchParams((await readBody(req, limit)).toString("utf8"));
  const o = {};
  for (const [k, v] of p) o[k] = v;
  return o;
}
async function readJson(req, limit = 4 * 1024 * 1024) {
  try { return JSON.parse((await readBody(req, limit)).toString("utf8") || "{}"); } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function serveStatic(req, res, relPath) {
  const full = path.resolve(cfg.PUBLIC_DIR, "." + path.posix.normalize("/" + relPath));
  if (!full.startsWith(cfg.PUBLIC_DIR + path.sep)) return false;
  let st;
  try { st = fs.statSync(full); } catch { return false; }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(full).toLowerCase()];
  if (!type) return false;
  const body = fs.readFileSync(full);
  const versioned = /[?&]v=/.test(req.url);
  const cache = versioned ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, baseHeaders({ ETag: etag, "Cache-Control": cache })); res.end(); return true; }
  send(req, res, 200, body, { "Content-Type": type, ETag: etag, "Cache-Control": cache });
  return true;
}

function csp(nonce) {
  return [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}'`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
    "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
}

module.exports = { esc, parseCookies, setCookie, isHttps, clientIp, baseUrl, send, text, json, redirect, sendCached, readBody, readForm, readJson, serveStatic, csp, baseHeaders, MIME };
