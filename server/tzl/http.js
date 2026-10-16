// HTTP helpers shared by TZL Node services: responses, cookies, caching, body parsing (form, JSON, multipart), static files.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const K = require("./kit");
const Site = require("./site");

const MIME = {
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".woff2": "font/woff2",
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg|application\/manifest|application\/javascript)/;
const esc = K.e;

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bad cookie */ } }
  }
  return out;
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
    "Access-Control-Allow-Origin": String(Site.get("cors_origin") || "*"), "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", ...extra,
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
function redirect(res, location, status = 303) { res.writeHead(status, baseHeaders({ Location: location, "Content-Length": 0 })); res.end(); }

/** Send a page built by layout.render(): {html, csp}. */
function html(req, res, status, page, { admin = false, extra = {} } = {}) {
  send(req, res, status, page.html, {
    "Content-Type": "text/html; charset=utf-8", ...K.securityHeaders(req), "Content-Security-Policy": page.csp,
    "Cache-Control": admin ? "no-store" : "no-cache",
    ...(admin ? { "X-Robots-Tag": "noindex, nofollow", "Access-Control-Allow-Origin": null, "Cross-Origin-Resource-Policy": "same-origin" } : {}), ...extra,
  });
}
function sendCached(req, res, body, type, etagSeed, { maxAge = 86400, extra = {} } = {}) {
  const etag = '"' + crypto.createHash("sha1").update(String(etagSeed)).update(body).digest("hex").slice(0, 20) + '"';
  const cache = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 7}`;
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, baseHeaders({ ETag: etag, "Cache-Control": cache })); return res.end(); }
  send(req, res, 200, body, { "Content-Type": type, ETag: etag, "Cache-Control": cache, ...extra });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error("Request body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readForm(req, limit = 256 * 1024) {
  const p = new URLSearchParams((await readBody(req, limit)).toString("utf8"));
  return nest(p);
}
/** a[0][label]=x style names become nested objects, plain names stay flat. */
function nest(pairs) {
  const o = {};
  for (const [k, v] of pairs) {
    const m = k.match(/^([^[\]]+)((?:\[[^\]]*\])*)$/);
    if (!m || !m[2]) { o[k] = v; continue; }
    const keys = [m[1], ...[...m[2].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1])];
    let cur = o;
    keys.forEach((key, i) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return;
      if (i === keys.length - 1) cur[key] = v;
      else cur = (cur[key] = typeof cur[key] === "object" && cur[key] ? cur[key] : {});
    });
  }
  return o;
}
async function readJson(req, limit = 4 * 1024 * 1024) {
  try { return JSON.parse((await readBody(req, limit)).toString("utf8") || "{}"); } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}
/** Small multipart/form-data parser. Returns { fields, files: { name: {filename, type, data} } }. */
async function readMultipart(req, limit = 3 * 1024 * 1024) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(req.headers["content-type"] || "");
  if (!m) throw Object.assign(new Error("Not a multipart request"), { status: 400 });
  const body = await readBody(req, limit);
  const delim = Buffer.from("--" + (m[1] || m[2]));
  const fields = new URLSearchParams(), files = {};
  let pos = body.indexOf(delim);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (body.slice(start, start + 2).toString() === "--") break;
    const next = body.indexOf(delim, start);
    if (next === -1) break;
    const part = body.slice(start + 2, next - 2); // strip CRLF around
    const split = part.indexOf("\r\n\r\n");
    if (split !== -1) {
      const hdr = part.slice(0, split).toString("utf8");
      const data = part.slice(split + 4);
      const name = (/name="([^"]*)"/.exec(hdr) || [])[1];
      const filename = (/filename="([^"]*)"/.exec(hdr) || [])[1];
      if (name) {
        if (filename !== undefined) { if (filename) files[name] = { filename: path.basename(filename), type: ((/Content-Type:\s*([^\r\n]+)/i.exec(hdr) || [])[1] || "").trim(), data }; }
        else fields.append(name, data.toString("utf8"));
      }
    }
    pos = next;
  }
  return { fields: nest(fields), files };
}

function serveStatic(req, res, relPath, dir = path.join(K.root, "public")) {
  const full = path.resolve(dir, "." + path.posix.normalize("/" + relPath));
  if (!full.startsWith(dir + path.sep)) return false;
  let st;
  try { st = fs.statSync(full); } catch { return false; }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(full).toLowerCase()];
  if (!type) return false;
  const cache = /[?&]v=/.test(req.url) ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, baseHeaders({ ETag: etag, "Cache-Control": cache })); res.end(); return true; }
  send(req, res, 200, fs.readFileSync(full), { "Content-Type": type, ETag: etag, "Cache-Control": cache });
  return true;
}
module.exports = { esc, MIME, parseCookies, setCookie, baseHeaders, send, text, json, redirect, html, sendCached, readBody, readForm, readJson, readMultipart, serveStatic, isHttps: K.isHttps, clientIp: K.clientIp, baseUrl: K.baseUrl };
