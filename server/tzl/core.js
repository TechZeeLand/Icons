// Routes every TZL service has: /health, content pages, robots.txt, sitemap.xml, ads.txt, manifest, brand logo, favicon.
"use strict";
const fs = require("fs");
const path = require("path");
const K = require("./kit");
const Site = require("./site");
const Pages = require("./pages");
const Monitor = require("./monitor");
const Layout = require("./layout");
const H = require("./http");
const store = require("./store");

const MIME = { svg: "image/svg+xml", png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };

function errorPage(req, res, ctx, code) {
  const map = {
    404: ["search", "Page not found", "We could not find that page. It may have moved or never existed."], 403: ["lock", "Access denied", "You do not have permission to view this page."],
    405: ["ban", "Method not allowed", "That action is not available here."], 503: ["wrench", "Back soon", String(Site.get("maintenance_message"))],
    500: ["alert-triangle", "Something went wrong", "The server hit an unexpected problem. Please try again in a moment."],
  };
  const [ic, t, d] = map[code] || map[500];
  H.html(req, res, code, Layout.error(ctx, code, ic, t, d, code !== 503 && code !== 500), { extra: code === 503 ? { "Retry-After": "600" } : {} });
}

/** Returns true when handled. */
function handle(req, res, ctx, url) {
  const p = ctx.path;
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (p === "/health") { H.json(req, res, 200, Monitor.health(K.c("health_extra", () => ({}))()), { "Cache-Control": "no-store" }); return true; }
  const m = /^\/([a-z-]+)$/.exec(p);
  if (m && Pages.slugs()[m[1]]) {
    const pg = Pages.render(m[1], req);
    if (!pg) return false;
    H.html(req, res, 200, Layout.page(ctx, { title: pg.title, desc: pg.desc, h1: pg.title, html: pg.html }));
    return true;
  }
  if (p === "/robots.txt") {
    let t = "User-agent: *\nDisallow: /\n";
    if (Site.on("robots_index")) {
      t = "User-agent: *\nAllow: /\nDisallow: /admin\n" + K.c("robots_disallow", []).map((d) => `Disallow: ${d}\n`).join("");
      const x = String(Site.get("robots_extra")).trim();
      if (x) t += x + "\n";
      t += `Sitemap: ${K.url(req, "/sitemap.xml")}\n`;
    }
    H.text(req, res, 200, t, { "Cache-Control": "public, max-age=3600" }); return true;
  }
  if (p === "/sitemap.xml") {
    const urls = new Map([["/", 1.0]]);
    for (const u of K.c("sitemap", ["/"])) urls.set(u, u === "/" ? 1.0 : 0.7);
    for (const s of Object.keys(Pages.slugs())) urls.set("/" + s, 0.3);
    const fn = K.c("sitemap_fn", null);
    if (fn) for (const u of fn()) urls.set(u, 0.6);
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + [...urls].map(([u, pr]) => `<url><loc>${K.e(K.url(req, u))}</loc><priority>${pr.toFixed(1)}</priority></url>`).join("\n") + "\n</urlset>";
    H.send(req, res, 200, body, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }); return true;
  }
  if (p === "/ads.txt") {
    const t = String(Site.get("ads_txt")).trim();
    if (!t) { H.text(req, res, 404, "Not found\n"); return true; }
    H.text(req, res, 200, t + "\n"); return true;
  }
  if (p === "/manifest.webmanifest") {
    const icons = [{ src: Layout.logoUrl(), sizes: "any", type: "image/svg+xml" }];
    for (const [f, sz] of [["icon-192.png", "192x192"], ["icon-512.png", "512x512"]]) if (fs.existsSync(path.join(K.root, "public/assets/favicon", f))) icons.push({ src: "/assets/favicon/" + f, sizes: sz, type: "image/png" });
    H.send(req, res, 200, JSON.stringify({ name: Site.get("site_name"), short_name: Site.get("short_name"), description: Site.get("tagline"), start_url: "/", scope: "/", display: "standalone", theme_color: Site.cleanColor(String(Site.get("accent"))), background_color: "#0c1513", icons }), { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" }); return true;
  }
  if (p === "/brand/logo") {
    const rel = String(Site.get("logo_path"));
    const f = rel ? store.P("uploads/" + path.basename(rel)) : "";
    if (!f || !fs.existsSync(f)) { H.redirect(res, "/assets/img/logo.svg", 302); return true; }
    const ext = path.extname(f).slice(1).toLowerCase();
    H.send(req, res, 200, fs.readFileSync(f), { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=3600", ...(ext === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}) }); return true;
  }
  if (p === "/favicon.ico") { if (H.serveStatic(req, res, "favicon.ico")) return true; H.redirect(res, Layout.logoUrl(), 302); return true; }
  return false;
}
module.exports = { handle, errorPage };
