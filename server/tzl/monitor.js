// Health checks and system information for /health and the admin System page.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const K = require("./kit");
const Site = require("./site");
const store = require("./store");

function folderSize(dir, depth = 0) {
  if (depth > 6) return 0;
  let t = 0;
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isSymbolicLink()) continue;
      t += f.isDirectory() ? folderSize(p, depth + 1) : fs.statSync(p).size;
    }
  } catch { /* ignore */ }
  return t;
}
const writable = () => { try { fs.accessSync(K.data, fs.constants.W_OK); return true; } catch { return false; } };
function diskFree() { try { const s = fs.statfsSync(K.data); return s.bavail * s.bsize; } catch { return null; } }
const errorLogTail = (n = 40) => {
  try {
    const f = store.P("error.log");
    const size = fs.statSync(f).size;
    if (!size) return [];
    const fd = fs.openSync(f, "r"); const len = Math.min(size, 20000); const b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, size - len); fs.closeSync(fd);
    return b.toString("utf8").split("\n").filter((l) => l.trim()).slice(-n);
  } catch { return []; }
};
const clearErrorLog = () => { try { fs.writeFileSync(store.P("error.log"), ""); } catch { /* ignore */ } };
/** Service code calls this for unexpected errors; shown in Admin > System. */
const logError = (msg) => { try { fs.appendFileSync(store.P("error.log"), `${K.now()} ${msg}\n`); } catch { /* ignore */ } console.error(msg); };

function checks(req, auth) {
  const c = [];
  c.push(["Data folder is writable", writable(), `Make ${K.data} writable by the container user.`]);
  const free = diskFree();
  c.push(["Disk space available", free === null || free > 200 * 1048576, "Less than 200 MB free. Free some space or enlarge the volume."]);
  c.push(["Served over HTTPS", K.isHttps(req), "Put the service behind HTTPS. If a reverse proxy terminates TLS, set TZL_TRUST_PROXY=1."]);
  c.push(["Public URL is set", Boolean(String(Site.get("base_url")).trim() || K.env("TZL_BASE_URL")), "Set it in Admin > Site so canonical links, sitemap and embeds use the right domain."]);
  c.push(["Contact email is set", Boolean(String(Site.get("contact_email")).trim()), "Add one in Admin > Site."]);
  c.push(["Search engines can index the site", Site.on("robots_index"), "Indexing is switched off in Admin > SEO."]);
  c.push(["Maintenance mode is off", !Site.on("maintenance_on"), "Visitors currently see the maintenance page."]);
  c.push(["No recent server errors", errorLogTail(1).length === 0, "See Admin > System for the error log."]);
  for (const fn of K.c("checks", [])) for (const row of fn(req) || []) c.push(row);
  return c;
}

function system(req) {
  let since = "";
  try { since = fs.readFileSync(store.P("first-run.txt"), "utf8").trim(); } catch { /* ignore */ }
  const free = diskFree();
  return {
    Service: `${K.c("name")} (${K.c("service")})`, "Kit version": K.VERSION + " (Node)", "App version": String(K.c("version", "-")),
    Node: process.version, Platform: `${os.platform()} ${os.arch()}`, "Memory (RSS)": K.bytes(process.memoryUsage().rss), Uptime: `${Math.round(process.uptime() / 60)} min`,
    "Data folder": `${K.data} (${K.bytes(folderSize(K.data))})`, "Disk free": free === null ? "-" : K.bytes(free),
    "Installed since": since ? `${since} (${K.ago(since)})` : "-", "Root domain": K.rootDomain(), "Public URL": K.baseUrl(req) || "-",
    HTTPS: K.isHttps(req) ? "yes" : "no", "Reverse proxy": K.trustProxy() ? "trusted" : "not trusted",
  };
}

/** Ping the other TZL services' health endpoints (only when the admin asks). */
async function ecosystem() {
  const out = {};
  await Promise.all(Object.entries(K.SERVICES).map(async ([k, s]) => {
    const url = K.service(k) + s.health;
    const t = Date.now();
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "TZL-Monitor" }, redirect: "manual" });
      clearTimeout(timer);
      out[k] = { ok: r.status >= 200 && r.status < 400, ms: Date.now() - t, note: "HTTP " + r.status };
    } catch { out[k] = { ok: false, ms: Date.now() - t, note: "unreachable" }; }
  }));
  return out;
}
const health = (extra = {}) => ({ ok: writable(), service: K.c("service"), name: K.c("name"), version: K.c("version", K.VERSION), time: K.now(), ...extra });

module.exports = { checks, system, ecosystem, health, errorLogTail, clearErrorLog, logError, folderSize };
