// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

/**
 * TZL Icons: an open-source SVG icon library with a public website, an HTTP API, a CSS/JS delivery layer and an admin portal.
 * Zero npm dependencies; needs Node 22+ (and git for repository sync). Built on the TZL kit (server/tzl).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cfg = require("./lib/config");
const { Catalog, render, spriteSvg, maskCss } = require("./lib/catalog");
const sync = require("./lib/sync");
const { layout } = require("./views/layout");
const pub = require("./views/public");
const { docsMarkdown } = require("./views/docs-md");
const T = require("./tzl");
const { Kit, Site, Stats, Admin, Core, H, auth, Monitor } = T;

const pkg = JSON.parse(fs.readFileSync(path.join(cfg.ROOT, "package.json"), "utf8"));
const catalog = new Catalog();
const ASSET_V = Date.now().toString(36);
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const read = (...p) => fs.readFileSync(path.join(...p));
const icons = require("./admin-icons")(catalog);

Kit.boot({
  root: cfg.ROOT, data: cfg.DATA_DIR, service: "icons", name: "TechZeeLand Icons", short: "TZL Icons", version: pkg.version,
  tagline: "Free, open-source SVG icons. Fast, cached, and yours to host.",
  description: "Free, open-source SVG icon library with a CSS class, web component and CDN. Host it yourself or use ours.",
  github: cfg.SOURCE_URL || "https://github.com/TechZeeLand",
  defaults: { contact_email: "azlanaziz@rayaz.org" },
  nav: [["Icons", "/icons", "grid"], ["Docs", "/docs", "book-open"], ["About", "/about", "info"]],
  footer_extra: [["Icons", "/icons"], ["Docs", "/docs"], ["License", "/license"], ["Source code", "/source"]],
  sitemap: ["/icons", "/docs", "/license"],
  robots_disallow: ["/_sync"],
  css: ["assets/css/icons.css"], admin_css: ["assets/css/icons-admin.css"], admin_js: ["assets/js/icons-admin.js"],
  admin_menu: icons.menu, admin_routes: icons.routes, dashboard: icons.dashboard,
  health_extra: () => ({ icons: catalog.list.length, version: catalog.version, commit: sync.state.rev || null, sync: sync.state.mode }),
  page_extra: {
    "privacy-policy": "- **Icon caching on other sites.** If a website uses `icons.js`, icon files are cached in that visitor's browser (localStorage) for a few days. It stores icon markup and timestamps only, never personal data.",
  },
});

/** Old code reads ctx.settings.*; keep that shape, backed by the kit's site settings. */
const legacySettings = () => ({
  site_name: Site.get("site_name"), tagline: Site.get("tagline"), contact_email: Site.get("contact_email"), repo_url: Site.get("github_url"),
  license_note: Site.get("license_note") || "", cache_max_age: Site.get("cache_max_age") || 0,
});
function makeCtx(req, pathname) {
  return { req, path: pathname, catalog, settings: legacySettings(), base: Kit.baseUrl(req), assetV: ASSET_V, cacheMaxAge: cfg.CACHE_MAX_AGE, session: null };
}
const maxAge = () => Number(Site.get("cache_max_age")) || cfg.CACHE_MAX_AGE;
const sendPage = (req, res, ctx, status, page) => H.html(req, res, status, layout(ctx, page));
const notFound = (req, res, ctx) => (/text\/html/.test(req.headers.accept || "") ? Core.errorPage(req, res, ctx, 404) : H.text(req, res, 404, "Not found"));

const parseNames = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter((s) => cfg.NAME_RE.test(s)).slice(0, 2000) : null);
/** ?names=a,b  ?set=ui (folder)  ?category=social. Without filters: everything, minus the fixed-colour "other" artwork when maskable=true. */
function pickEntries(params, maskable) {
  const names = parseNames(params.get("names"));
  const set = params.get("set"), category = params.get("category");
  if ((set && !cfg.NAME_RE.test(set)) || (category && !cfg.NAME_RE.test(category))) return null;
  if (names) return [...new Set(names)].map((n) => catalog.find(set, n)).filter(Boolean);
  return catalog.list.filter((e) => (!set || e.set === set) && (!category || e.category === category) && !(maskable && !set && !category && e.set === "other"));
}

const PAGES = { "/": pub.home, "/icons": pub.iconsPage, "/docs": pub.docs, "/license": pub.license };
const SVG_CSP = { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
const ICON_ROUTE = /^\/i\/(?:([a-z0-9-]+)\/)?([a-z0-9-]+?)(?:\.svg)?$/;

async function publicRoutes(req, res, ctx, url) {
  const p = url.pathname;

  if (req.method === "POST" && p === "/_sync") {
    if (!cfg.SYNC_TOKEN) return H.text(req, res, 404, "Not found");
    const body = await H.readBody(req);
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const mac = crypto.createHmac("sha256", cfg.SYNC_TOKEN).update(body).digest("hex");
    const sig = String(req.headers["x-hub-signature-256"] || "").replace(/^sha256=/, "") || String(req.headers["x-gitea-signature"] || req.headers["x-forgejo-signature"] || "");
    if (!((bearer && auth.safeEqual(bearer, cfg.SYNC_TOKEN)) || (sig && auth.safeEqual(sig, mac)))) return H.text(req, res, 401, "Unauthorised");
    const result = await sync.run(catalog);
    return H.json(req, res, result.error ? 502 : 200, result);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return H.text(req, res, 405, "Method not allowed", { Allow: "GET, HEAD, OPTIONS" });

  const m = ICON_ROUTE.exec(p);
  if (m) {
    const entry = catalog.find(m[1], m[2]);
    if (!entry) return H.text(req, res, 404, "Icon not found", { "Cache-Control": "public, max-age=60" });
    const svg = render(entry, url.searchParams);
    if (svg === null) return H.text(req, res, 400, "Invalid size, stroke or color parameter");
    Stats.event("icon", entry.key);
    return H.sendCached(req, res, svg, "image/svg+xml; charset=utf-8", `${entry.key}|${url.search}`, { maxAge: maxAge(), extra: SVG_CSP });
  }

  switch (p) {
    case "/healthz":
      return H.json(req, res, 200, Monitor.health({ icons: catalog.list.length, version: catalog.version, commit: sync.state.rev || null, sync: sync.state.mode }), { "Cache-Control": "no-store" });
    case "/api/version":
      return H.json(req, res, 200, { version: catalog.version, total: catalog.list.length }, { "Cache-Control": "public, max-age=60" });
    case "/api/manifest":
      return H.json(req, res, 200, catalog.manifest(), { "Cache-Control": "public, max-age=60" });
    case "/api/icons": {
      const icons2 = catalog.search(url.searchParams.get("q"), { set: url.searchParams.get("set") || "", category: url.searchParams.get("category") || "" }).map((e) => ({ set: e.set, name: e.name, category: e.category, tags: e.tags }));
      const categories = catalog.categories().filter((c) => c.count > 0).map((c) => ({ id: c.id, label: c.label, count: c.count }));
      return H.json(req, res, 200, { version: catalog.version, commit: sync.state.rev || null, total: catalog.list.length, categories, sets: catalog.sets(), icons: icons2 }, { "Cache-Control": "public, max-age=60" });
    }
    case "/sprite.svg": {
      const list = pickEntries(url.searchParams, false);
      if (!list) return H.text(req, res, 400, "Bad set");
      return H.sendCached(req, res, spriteSvg(list), "image/svg+xml; charset=utf-8", `sprite|${catalog.version}|${url.search}`, { maxAge: maxAge(), extra: SVG_CSP });
    }
    case "/zi.css": {
      const list = pickEntries(url.searchParams, true);
      if (!list) return H.text(req, res, 400, "Bad set");
      return H.sendCached(req, res, maskCss(list), "text/css; charset=utf-8", `zi|${catalog.version}|${url.search}`, { maxAge: maxAge() });
    }
    case "/icons.js":
      return H.sendCached(req, res, read(cfg.CLIENT_DIR, "icons.js"), "text/javascript; charset=utf-8", "client", { maxAge: Math.min(maxAge(), 3600) });
    case "/docs.md": {
      const md = docsMarkdown(ctx);
      const slug = Kit.slugify(String(ctx.settings.site_name)) || "icons";
      return H.send(req, res, 200, md, { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-docs.md"`, "Cache-Control": "no-cache" });
    }
    case "/tools/icons-sync.mjs": {
      const src = read(cfg.TOOLS_DIR, "icons-sync.mjs").toString("utf8").replace(/__DEFAULT_ORIGIN__/g, ctx.base);
      return H.send(req, res, 200, src, { "Content-Type": "text/javascript; charset=utf-8", "Content-Disposition": 'inline; filename="icons-sync.mjs"', "Cache-Control": "public, max-age=3600" });
    }
    case "/tools/RemoteIcon.php":
      return H.send(req, res, 200, read(cfg.CLIENT_DIR, "php", "RemoteIcon.php"), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    case "/source": {
      const target = Site.get("github_url") || cfg.SOURCE_URL;
      if (!target) return H.text(req, res, 404, "No source URL configured");
      return H.redirect(res, target, 302);
    }
    default:
  }

  if (p.startsWith("/assets/")) {
    if (H.serveStatic(req, res, p.slice(1))) return;
    return H.text(req, res, 404, "Not found");
  }

  // pages (everything below is HTML, so maintenance mode applies)
  if (Site.on("maintenance_on")) return Core.errorPage(req, res, ctx, 503);
  const key = p.length > 1 ? p.replace(/\/+$/, "") : p;
  const page = PAGES[key];
  if (page) return sendPage(req, res, ctx, 200, page(ctx));
  if (Core.handle(req, res, ctx, url)) return;
  return notFound(req, res, ctx);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, H.baseHeaders({ "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" }));
    return res.end();
  }
  const pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, "/");
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const ctx = makeCtx(req, clean);
  const started = Date.now();
  const isAdmin = clean === "/admin" || clean.startsWith("/admin/");
  res.on("finish", () => {
    let ref = "";
    try { ref = new URL(String(req.headers.referer || "")).host.toLowerCase().slice(0, 80); } catch { /* none */ }
    Stats.record({ path: clean, method: req.method, status: res.statusCode, ms: Date.now() - started, ref, ua: String(req.headers["user-agent"] || ""), host: String(req.headers.host || ""), admin: isAdmin });
  });
  if (isAdmin) {
    if (!cfg.ADMIN_ENABLED) return notFound(req, res, ctx);
    if (!(await Admin.handle(req, res, ctx, url))) return Core.errorPage(req, res, ctx, 404);
    return;
  }
  return publicRoutes(req, res, ctx, url);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    Monitor.logError(`${req.method} ${req.url}: ${e.stack || e.message}`);
    if (res.headersSent) return res.end();
    const status = e.status || 500;
    try {
      if (status === 500 && /text\/html/.test(req.headers.accept || "")) Core.errorPage(req, res, makeCtx(req, "/error"), 500);
      else H.text(req, res, status, status === 500 ? "Internal error" : e.message);
    } catch { res.end(); }
  });
});
server.headersTimeout = 15000;
server.requestTimeout = 30000;

(async () => {
  if (cfg.ADMIN_ENABLED) await auth.admin.init();
  sync.start(catalog);
  server.listen(cfg.PORT, () => log(`listening on :${cfg.PORT} (${catalog.list.length} icons, mode ${sync.state.mode}${cfg.ADMIN_ENABLED ? ", admin enabled" : ", admin disabled"})`));
})();

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { Stats.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
