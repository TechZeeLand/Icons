// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

/**
 * Icon service: an open-source SVG icon library with a public website, an HTTP API, a CSS/JS delivery layer
 * and an admin portal. Zero npm dependencies; needs Node 22+ (and git for repository sync).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cfg = require("./lib/config");
const H = require("./lib/http");
const { settings } = require("./lib/store");
const { Catalog, render, spriteSvg, maskCss } = require("./lib/catalog");
const sync = require("./lib/sync");
const stats = require("./lib/stats");
const { admin, session, throttle, safeEqual } = require("./lib/auth");
const { sanitize } = require("./lib/sanitize");
const { zip } = require("./lib/zip");
const { layout } = require("./views/layout");
const pub = require("./views/public");
const { docsMarkdown } = require("./views/docs-md");
const adminViews = require("./views/admin");

const catalog = new Catalog();
const ASSET_V = Date.now().toString(36);
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const read = (...p) => fs.readFileSync(path.join(...p));

const PAGES = {
  "/": pub.home, "/icons": pub.iconsPage, "/docs": pub.docs, "/about": pub.about, "/contact": pub.contact,
  "/privacy-policy": pub.privacy, "/terms-and-conditions": pub.terms, "/cookie-policy": pub.cookies, "/license": pub.license,
};

function makeCtx(req, pathname) {
  return {
    req, path: pathname, nonce: crypto.randomBytes(16).toString("base64"), settings: settings.all(), catalog,
    base: H.baseUrl(req), assetV: ASSET_V, cacheMaxAge: cfg.CACHE_MAX_AGE, session: null,
  };
}
const maxAge = () => Number(settings.get("cache_max_age")) || cfg.CACHE_MAX_AGE;

function sendHtml(req, res, status, ctx, html, { isAdmin = false } = {}) {
  H.send(req, res, status, html, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": H.csp(ctx.nonce),
    "X-Frame-Options": "DENY",
    "Cache-Control": isAdmin ? "no-store" : "no-cache",
    ...(isAdmin ? { "X-Robots-Tag": "noindex, nofollow", "Access-Control-Allow-Origin": null, "Cross-Origin-Resource-Policy": "same-origin" } : {}),
  });
}

function sendPage(req, res, ctx, status, page) {
  sendHtml(req, res, status, ctx, layout(ctx, page));
}

function notFound(req, res, ctx) {
  if (/text\/html/.test(req.headers.accept || "")) return sendPage(req, res, ctx, 404, pub.errorPage(ctx, 404));
  return H.text(req, res, 404, "Not found");
}

const parseNames = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter((s) => cfg.NAME_RE.test(s)).slice(0, 2000) : null);

/** ?names=a,b  ?set=ui (folder)  ?category=social. Without filters: everything, minus the fixed-colour "other" artwork when maskable=true. */
function pickEntries(params, maskable) {
  const names = parseNames(params.get("names"));
  const set = params.get("set");
  const category = params.get("category");
  if ((set && !cfg.NAME_RE.test(set)) || (category && !cfg.NAME_RE.test(category))) return null;
  if (names) return [...new Set(names)].map((n) => catalog.find(set, n)).filter(Boolean);
  return catalog.list.filter((e) => (!set || e.set === set) && (!category || e.category === category) && !(maskable && !set && !category && e.set === "other"));
}

// ------------------------------------------------------------------ public routes
const ICON_ROUTE = /^\/i\/(?:([a-z0-9-]+)\/)?([a-z0-9-]+?)(?:\.svg)?$/;

async function publicRoutes(req, res, ctx, url) {
  const p = url.pathname;

  if (req.method === "POST" && p === "/_sync") {
    if (!cfg.SYNC_TOKEN) return H.text(req, res, 404, "Not found");
    const body = await H.readBody(req);
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const mac = crypto.createHmac("sha256", cfg.SYNC_TOKEN).update(body).digest("hex");
    const sig = String(req.headers["x-hub-signature-256"] || "").replace(/^sha256=/, "") || String(req.headers["x-gitea-signature"] || req.headers["x-forgejo-signature"] || "");
    if (!((bearer && safeEqual(bearer, cfg.SYNC_TOKEN)) || (sig && safeEqual(sig, mac)))) return H.text(req, res, 401, "Unauthorised");
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
    stats.bump("icons", entry.key);
    return H.sendCached(req, res, svg, "image/svg+xml; charset=utf-8", `${entry.key}|${url.search}`, {
      maxAge: maxAge(), extra: { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
    });
  }

  switch (p) {
    case "/healthz":
      return H.json(req, res, 200, { ok: true, icons: catalog.list.length, version: catalog.version, commit: sync.state.rev || null, sync: sync.state.mode }, { "Cache-Control": "no-store" });
    case "/api/version":
      stats.bump("api");
      return H.json(req, res, 200, { version: catalog.version, total: catalog.list.length }, { "Cache-Control": "public, max-age=60" });
    case "/api/manifest":
      stats.bump("api");
      return H.json(req, res, 200, catalog.manifest(), { "Cache-Control": "public, max-age=60" });
    case "/api/icons": {
      stats.bump("api");
      const icons = catalog.search(url.searchParams.get("q"), { set: url.searchParams.get("set") || "", category: url.searchParams.get("category") || "" })
        .map((e) => ({ set: e.set, name: e.name, category: e.category, tags: e.tags }));
      const categories = catalog.categories().filter((c) => c.count > 0).map((c) => ({ id: c.id, label: c.label, count: c.count }));
      return H.json(req, res, 200, { version: catalog.version, commit: sync.state.rev || null, total: catalog.list.length, categories, sets: catalog.sets(), icons }, { "Cache-Control": "public, max-age=60" });
    }
    case "/sprite.svg": {
      const list = pickEntries(url.searchParams, false);
      if (!list) return H.text(req, res, 400, "Bad set");
      stats.bump("api");
      return H.sendCached(req, res, spriteSvg(list), "image/svg+xml; charset=utf-8", `sprite|${catalog.version}|${url.search}`, { maxAge: maxAge(), extra: { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
    }
    case "/zi.css": {
      const list = pickEntries(url.searchParams, true);
      if (!list) return H.text(req, res, 400, "Bad set");
      stats.bump("api");
      return H.sendCached(req, res, maskCss(list), "text/css; charset=utf-8", `zi|${catalog.version}|${url.search}`, { maxAge: maxAge() });
    }
    case "/icons.js":
      stats.bump("api");
      return H.sendCached(req, res, read(cfg.CLIENT_DIR, "icons.js"), "text/javascript; charset=utf-8", "client", { maxAge: Math.min(maxAge(), 3600) });
    case "/docs.md": {
      const md = docsMarkdown(ctx);
      const slug = String(ctx.settings.site_name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "icons";
      return H.send(req, res, 200, md, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-docs.md"`,
        "Cache-Control": "no-cache",
      });
    }
    case "/tools/icons-sync.mjs": {
      const src = read(cfg.TOOLS_DIR, "icons-sync.mjs").toString("utf8").replace(/__DEFAULT_ORIGIN__/g, ctx.base);
      return H.send(req, res, 200, src, { "Content-Type": "text/javascript; charset=utf-8", "Content-Disposition": 'inline; filename="icons-sync.mjs"', "Cache-Control": "public, max-age=3600" });
    }
    case "/tools/RemoteIcon.php":
      return H.send(req, res, 200, read(cfg.CLIENT_DIR, "php", "RemoteIcon.php"), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    case "/source": {
      const target = settings.get("repo_url") || cfg.SOURCE_URL;
      if (!target) return H.text(req, res, 404, "No source URL configured");
      return H.redirect(res, target, 302);
    }
    case "/robots.txt":
      return H.text(req, res, 200, `User-agent: *\nDisallow: /admin\nAllow: /\nSitemap: ${ctx.base}/sitemap.xml\n`, { "Cache-Control": "public, max-age=3600" });
    case "/sitemap.xml": {
      const urls = Object.keys(PAGES).map((k) => `<url><loc>${H.esc(ctx.base + (k === "/" ? "" : k))}</loc></url>`).join("");
      return H.send(req, res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    }
    case "/favicon.ico":
      if (H.serveStatic(req, res, "assets/favicon/favicon.ico")) return;
      break;
    default:
  }

  if (p.startsWith("/assets/")) {
    if (H.serveStatic(req, res, p.slice(1))) return;
    return H.text(req, res, 404, "Not found");
  }

  const page = PAGES[p.length > 1 ? p.replace(/\/+$/, "") : p];
  if (page) {
    stats.bump("pages");
    return sendPage(req, res, ctx, 200, page(ctx));
  }
  return notFound(req, res, ctx);
}

// ------------------------------------------------------------------ admin routes
const COOKIE = "zi_admin";
const LOGIN_COOKIE = "zi_lc";
const redirectTo = (res, base, kind, msg) => H.redirect(res, `${base}${base.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const expected = String((cfg.TRUST_PROXY && req.headers["x-forwarded-host"]) || req.headers.host || "").split(",")[0].trim();
    return new URL(origin).host === expected;
  } catch { return false; }
}

async function adminRoutes(req, res, ctx, url) {
  if (!cfg.ADMIN_ENABLED) return notFound(req, res, ctx);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const secure = H.isHttps(req);
  const cookies = H.parseCookies(req);
  const ip = H.clientIp(req);
  const isPost = req.method === "POST";
  if (isPost && !sameOrigin(req)) return H.text(req, res, 403, "Cross-site request blocked");
  const query = Object.fromEntries(url.searchParams);

  // ---- signed-out: login & first-run setup
  const loginToken = () => {
    let t = cookies[LOGIN_COOKIE];
    if (!t || !/^[\w-]{20,}$/.test(t)) t = crypto.randomBytes(18).toString("base64url");
    H.setCookie(res, LOGIN_COOKIE, t, { path: "/admin", secure, maxAge: 1800 });
    return t;
  };
  const sess = cookies[COOKIE] ? session.get(cookies[COOKIE]) : null;

  if (p === "/admin/login" || p === "/admin/setup") {
    const isSetup = p === "/admin/setup";
    if (sess) return H.redirect(res, "/admin");
    if (isSetup && admin.exists()) return H.redirect(res, "/admin/login");
    if (!isSetup && !admin.exists()) return H.redirect(res, "/admin/setup");
    ctx.loginCsrf = loginToken();
    if (!isPost) return sendHtml(req, res, 200, ctx, (isSetup ? adminViews.setup : adminViews.login)(ctx, {}), { isAdmin: true });
    const body = await H.readForm(req);
    if (!cookies[LOGIN_COOKIE] || !safeEqual(String(body._csrf || ""), cookies[LOGIN_COOKIE])) {
      return sendHtml(req, res, 400, ctx, (isSetup ? adminViews.setup : adminViews.login)(ctx, { error: "The form expired. Please try again." }), { isAdmin: true });
    }
    if (isSetup) {
      const fail = (error) => sendHtml(req, res, 400, ctx, adminViews.setup(ctx, { error }), { isAdmin: true });
      if (throttle.locked(ip)) return fail("Too many attempts. Wait 15 minutes.");
      if (!admin.setupTokenOk(body.token)) { throttle.fail(ip); return fail("That setup token is not valid."); }
      if (!/^[A-Za-z0-9_.-]{3,32}$/.test(body.username || "")) return fail("Username: 3 to 32 letters, numbers, dots, dashes or underscores.");
      if ((body.password || "").length < 10) return fail("The password must be at least 10 characters.");
      if (body.password !== body.password2) return fail("The passwords do not match.");
      await admin.create(body.username, body.password);
      throttle.ok(ip);
      log(`admin account created`);
      return H.redirect(res, "/admin/login");
    }
    if (throttle.locked(ip)) return sendHtml(req, res, 429, ctx, adminViews.login(ctx, { error: "Too many failed attempts. Please wait 15 minutes.", locked: true }), { isAdmin: true });
    if (await admin.verify(body.username || "", body.password || "")) {
      throttle.ok(ip);
      const s = session.create(admin.username());
      H.setCookie(res, COOKIE, s.sid, { path: "/admin", secure, maxAge: 12 * 3600 });
      return H.redirect(res, "/admin");
    }
    throttle.fail(ip);
    return sendHtml(req, res, 401, ctx, adminViews.login(ctx, { error: throttle.locked(ip) ? "Too many failed attempts. Please wait 15 minutes." : "Incorrect username or password.", locked: throttle.locked(ip) }), { isAdmin: true });
  }

  // ---- everything below needs a session
  if (!sess) return p.startsWith("/admin/api/") ? H.json(req, res, 401, { error: "Not signed in" }) : H.redirect(res, admin.exists() ? "/admin/login" : "/admin/setup");
  ctx.session = sess;
  const done = (to, kind, msg) => redirectTo(res, to, kind, msg);
  const styleOf = (catId) => ({ line: "ui", brand: "social", free: "other" })[(catalog.category(catId) || {}).kind] || "other";

  let body = {};
  const isApi = p.startsWith("/admin/api/");
  if (isPost) {
    const token = isApi ? req.headers["x-csrf-token"] : null;
    if (isApi) body = await H.readJson(req, 4 * 1024 * 1024);
    else body = await H.readForm(req, 256 * 1024);
    const sent = String(token || body._csrf || "");
    if (!safeEqual(sent, sess.csrf)) return isApi ? H.json(req, res, 403, { error: "Session expired. Reload the page." }) : H.text(req, res, 403, "Invalid CSRF token");
  }
  const page = (html) => sendHtml(req, res, 200, ctx, html, { isAdmin: true });
  const noStore = { "Cache-Control": "no-store" };

  switch (`${req.method === "HEAD" ? "GET" : req.method} ${p}`) {
    case "POST /admin/logout":
      session.destroy(sess.sid);
      H.setCookie(res, COOKIE, "", { path: "/admin", secure, maxAge: 0 });
      return H.redirect(res, "/admin/login");

    case "GET /admin":
      return page(adminViews.dashboard(ctx, { stats: stats.summary(14), sync: sync.state, query }));

    case "GET /admin/icons": {
      const q = (query.q || "").toLowerCase().trim();
      const category = query.category || "";
      const source = query.source || "";
      const terms = q.split(/[\s,]+/).filter(Boolean);
      const entries = catalog.all.filter((e) =>
        (!category || e.category === category) &&
        (!source || (source === "hidden" ? e.hidden : e.source === source)) &&
        terms.every((t) => e.name.includes(t) || e.tags.some((x) => x.includes(t))));
      return page(adminViews.iconsList(ctx, { entries, q, category, source, page: parseInt(query.page, 10) || 1, query }));
    }

    case "GET /admin/icons/edit": {
      const entry = catalog.byKey.get(query.key || "");
      if (!entry) return done("/admin/icons", "err", "Icon not found");
      return page(adminViews.editIcon(ctx, { entry, query }));
    }

    case "POST /admin/icons/save": {
      const entry = catalog.byKey.get(body.key || "");
      if (!entry) return done("/admin/icons", "err", "Icon not found");
      const back = `/admin/icons/edit?key=${encodeURIComponent(entry.key)}`;
      const src = String(body.svg || "");
      if (src.trim() && src.trim() !== entry.svg.trim()) {
        const out = sanitize(src, { set: styleOf(entry.category) });
        if (out.errors.length) return done(back, "err", out.errors[0]);
        catalog.saveCustom(entry.set, entry.name, out.svg);
      }
      catalog.setTags(entry.key, String(body.tags || "").split(","));
      if (body.category && body.category !== entry.category && catalog.category(body.category)) catalog.setCategory(entry.key, body.category);
      return done(back, "ok", "Saved");
    }

    case "POST /admin/icons/visibility": {
      const entry = catalog.byKey.get(body.key || "");
      if (!entry) return done("/admin/icons", "err", "Icon not found");
      catalog.setHidden(entry.key, body.hidden === "1");
      return done(`/admin/icons/edit?key=${encodeURIComponent(entry.key)}`, "ok", body.hidden === "1" ? "Icon hidden from the site" : "Icon is visible again");
    }

    case "POST /admin/icons/delete": {
      const key = body.key || "";
      const entry = catalog.byKey.get(key);
      if (!entry || !catalog.deleteCustom(key)) return done("/admin/icons", "err", "Only icons added or edited here can be deleted");
      return done(catalog.byKey.has(key) ? `/admin/icons/edit?key=${encodeURIComponent(key)}` : "/admin/icons", "ok", catalog.byKey.has(key) ? "Reverted to the repository version" : "Icon deleted");
    }

    case "GET /admin/add":
      return page(adminViews.addIcons(ctx, { categories: catalog.categoryList(), query }));

    case "POST /admin/api/icons/check":
    case "POST /admin/api/icons": {
      const saving = p === "/admin/api/icons";
      const cat = catalog.category(String(body.category || ""));
      if (!cat) return H.json(req, res, 400, { error: "Unknown category" });
      const set = cat.id; // new icons are stored in a folder named after their category
      const style = styleOf(cat.id);
      const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
      const results = items.map((it) => {
        const name = String(it.name || "");
        const r = { name, warnings: [], errors: [], svg: "", exists: false, nameError: "" };
        if (!cfg.NAME_RE.test(name)) { r.nameError = "Use lower-case letters, numbers and dashes (max 64)."; return r; }
        const clash = catalog.all.find((e) => e.name === name && e.set !== set);
        if (clash) r.nameError = `The name is already used by ${clash.key}. Names are unique across categories; edit that icon from the Icons page instead.`;
        r.exists = catalog.byKey.has(`${set}/${name}`);
        const out = sanitize(String(it.svg || ""), { set: style });
        Object.assign(r, { svg: out.svg, warnings: out.warnings, errors: out.errors });
        return r;
      });
      if (!saving) return H.json(req, res, 200, { items: results });
      const saved = [], failed = [];
      for (const r of results) {
        if (r.nameError || r.errors.length || !r.svg) failed.push({ name: r.name, error: r.nameError || r.errors[0] || "Invalid" });
        else if (r.exists && !body.overwrite) failed.push({ name: r.name, error: "Already exists" });
        else { try { catalog.saveCustom(set, r.name, r.svg); saved.push(r.name); } catch (e) { failed.push({ name: r.name, error: e.message }); } }
      }
      if (saved.length) log(`admin saved ${saved.length} icon(s) to ${set}`);
      return H.json(req, res, 200, { saved, failed });
    }

    case "GET /admin/sync":
      return page(adminViews.syncPage(ctx, { sync: sync.state, cfg, customCount: catalog.customEntries().length, query }));

    case "POST /admin/sync/run": {
      const r = await sync.run(catalog);
      if (r.error) return done("/admin/sync", "err", `Sync failed: ${r.error}`);
      return done("/admin/sync", "ok", r.skipped ? r.skipped : r.changed ? `Synced. ${catalog.list.length} icons are now live.` : "Already up to date.");
    }

    case "GET /admin/export.zip": {
      const all = query.scope === "all";
      const entries = all ? catalog.list : catalog.customEntries();
      const files = entries.map((e) => ({ name: `icons/${e.set}/${e.name}.svg`, data: e.svg }));
      if (files.length) files.push({ name: "categories.json", data: JSON.stringify({ categories: catalog.categoryList().map(({ id, label, kind }) => ({ id, label, kind })), assignments: Object.fromEntries(entries.map((e) => [e.key, e.category])) }, null, 2) });
      if (!files.length) return done("/admin/sync", "err", "There are no added or edited icons to export");
      return H.send(req, res, 200, zip(files), { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="icons-${all ? "all" : "custom"}-${new Date().toISOString().slice(0, 10)}.zip"`, ...noStore, "Access-Control-Allow-Origin": null }, { compress: false });
    }

    case "GET /admin/categories":
      return page(adminViews.categoriesPage(ctx, { categories: catalog.categories(), query }));

    case "POST /admin/categories/add": {
      try { const id = catalog.addCategory(body.label, body.kind); return done("/admin/categories", "ok", `Category "${catalog.category(id).label}" created`); }
      catch (e) { return done("/admin/categories", "err", e.message); }
    }

    case "POST /admin/categories/update": {
      try { catalog.updateCategory(body.id, body.label, body.kind); return done("/admin/categories", "ok", "Category updated"); }
      catch (e) { return done("/admin/categories", "err", e.message); }
    }

    case "POST /admin/categories/remove": {
      try {
        const label = (catalog.category(body.id) || {}).label;
        const n = catalog.removeCategory(body.id);
        return done("/admin/categories", "ok", `Category "${label}" removed. ${n} icon${n === 1 ? "" : "s"} moved to Extras.`);
      } catch (e) { return done("/admin/categories", "err", e.message); }
    }

    case "GET /admin/settings":
      return page(adminViews.settingsPage(ctx, { s: settings.all(), query }));

    case "POST /admin/settings": {
      const str = (k, max) => String(body[k] ?? "").trim().slice(0, max);
      const repo = str("repo_url", 200);
      if (repo && !/^https?:\/\/[^\s]+$/i.test(repo)) return done("/admin/settings", "err", "Repository URL must start with http:// or https://");
      const email = str("contact_email", 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return done("/admin/settings", "err", "That email address does not look valid");
      if (!str("site_name", 60)) return done("/admin/settings", "err", "Site name is required");
      settings.set({
        site_name: str("site_name", 60), tagline: str("tagline", 160), contact_email: email, repo_url: repo,
        announcement_enabled: body.announcement_enabled === "1", announcement_text: str("announcement_text", 200),
        cookie_banner_enabled: body.cookie_banner_enabled === "1", license_note: str("license_note", 1000),
        cache_max_age: Math.min(31536000, Math.max(0, parseInt(body.cache_max_age, 10) || 0)),
      });
      return done("/admin/settings", "ok", "Settings saved");
    }

    case "GET /admin/account":
      return page(adminViews.accountPage(ctx, { username: admin.username(), query }));

    case "POST /admin/account": {
      if (throttle.locked(ip)) return done("/admin/account", "err", "Too many attempts. Try again later.");
      if (!(await admin.checkPassword(body.current || ""))) { throttle.fail(ip); return done("/admin/account", "err", "Current password is incorrect"); }
      if (!/^[A-Za-z0-9_.-]{3,32}$/.test(body.username || "")) return done("/admin/account", "err", "Username: 3 to 32 letters, numbers, dots, dashes or underscores");
      if (body.password && (body.password.length < 10 || body.password !== body.password2)) return done("/admin/account", "err", "New passwords must match and be at least 10 characters");
      throttle.ok(ip);
      await admin.change(body.username, body.password || "");
      H.setCookie(res, COOKIE, "", { path: "/admin", secure, maxAge: 0 });
      return H.redirect(res, "/admin/login");
    }

    default:
      return notFound(req, res, ctx);
  }
}

// ------------------------------------------------------------------ server
async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, H.baseHeaders({ "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" }));
    return res.end();
  }
  const ctx = makeCtx(req, url.pathname);
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    if (url.pathname === "/admin/" ) return H.redirect(res, "/admin");
    return adminRoutes(req, res, ctx, url);
  }
  return publicRoutes(req, res, ctx, url);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log(`error ${req.method} ${req.url}: ${e.stack || e.message}`);
    if (res.headersSent) return res.end();
    const status = e.status || 500;
    try {
      if (status === 500 && /text\/html/.test(req.headers.accept || "")) sendPage(req, res, makeCtx(req, "/error"), 500, pub.errorPage(makeCtx(req, "/error"), 500));
      else H.text(req, res, status, status === 500 ? "Internal error" : e.message);
    } catch { res.end(); }
  });
});
server.headersTimeout = 15000;
server.requestTimeout = 30000;

(async () => {
  if (cfg.ADMIN_ENABLED) await admin.init();
  sync.start(catalog);
  server.listen(cfg.PORT, () => {
    log(`listening on :${cfg.PORT} (${catalog.list.length} icons, mode ${sync.state.mode}${cfg.ADMIN_ENABLED ? ", admin enabled" : ", admin disabled"})`);
  });
})();

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { stats.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
