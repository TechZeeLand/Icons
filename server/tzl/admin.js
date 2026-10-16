// The shared admin portal (/admin/*). A service adds its own screens through Kit.boot({ admin_menu, admin_routes }).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const K = require("./kit");
const Site = require("./site");
const Pages = require("./pages");
const Stats = require("./stats");
const Monitor = require("./monitor");
const Layout = require("./layout");
const Ui = require("./ui");
const store = require("./store");
const H = require("./http");
const { admin, session, throttle, safeEqual } = require("./auth");
const { zip } = require("./zip");
const e = K.e;

const COOKIE = "tzl_admin";
const LOGIN_COOKIE = "tzl_lc";
const field = (c) => `<input type="hidden" name="_csrf" value="${e(c.sess.csrf)}">`;
const flash = (c, type, msg) => c.sess.flash.push([type, msg]);
const back = (c, to) => H.redirect(c.res, to);
const str = (c, k, max = 200) => String(c.body[k] ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim().slice(0, max);
const raw = (c, k, max = 20000) => String(c.body[k] ?? "").replace(/\r\n/g, "\n").slice(0, max);
const bool = (c, k) => Boolean(c.body[k]) && c.body[k] !== "0";
const urlOrEmpty = (v) => (v === "" ? "" : /^https?:\/\/[^\s<>"]+$/i.test(v) ? v : null);

function menu() {
  const m = { dashboard: ["/admin", "Dashboard", "dashboard"] };
  for (const [k, v] of Object.entries(K.c("admin_menu", {}))) m[k] = v;
  Object.assign(m, {
    site: ["/admin/site", "Site & domains", "globe"], navigation: ["/admin/navigation", "Header & footer", "menu"], appearance: ["/admin/appearance", "Appearance", "palette"],
    pages: ["/admin/pages", "Pages & policies", "file-text"], seo: ["/admin/seo", "SEO, ads & code", "search"], traffic: ["/admin/traffic", "Traffic", "bar-chart"],
    system: ["/admin/system", "System & backup", "server"], security: ["/admin/security", "Security", "shield-check"], account: ["/admin/account", "Account", "user-lock"], activity: ["/admin/activity", "Activity log", "history"],
  });
  return m;
}
function flashes(c) {
  const list = c.sess.flash.splice(0);
  return list.map(([t, m]) => `<div class="alert alert-${e(t)}" role="status">${K.icon(t === "err" ? "alert-triangle" : t === "info" ? "info" : "check-circle")}<div>${m}</div></div>`).join("");
}
/** Full admin page. body is trusted HTML. Services use this for their own screens too. */
function page(c, title, active, body, actions = "", heading = true) {
  let nav = "";
  for (const [k, [u, l, i]] of Object.entries(menu())) nav += `<a href="${e(u)}"${active === k ? ' class="active" aria-current="page"' : ""}>${K.icon(i)}<span>${e(l)}</span></a>`;
  const main = `<div class="admin-wrap"><aside class="admin-nav" id="admin-nav"><nav aria-label="Admin">${nav}</nav><form method="post" action="/admin/logout" class="admin-logout">${field(c)}<button type="submit" class="btn btn-secondary btn-block">${K.icon("logout")} Sign out</button></form></aside>`
    + `<main id="main-content" class="admin-main">${flashes(c)}${heading ? `<div class="page-head"><h1>${e(title)}</h1>${actions}</div>` : ""}${body}${Ui.iconList()}</main></div>`;
  H.html(c.req, c.res, 200, Layout.render(c.ctx, { title, admin: true, main, css: K.c("admin_css", []) }), { admin: true });
}
const notFound = (c, msg = "That page does not exist.") => H.html(c.req, c.res, 404, Layout.error(c.ctx, 404, "search", "Page not found", msg), { admin: true });

/* ---------- login / setup ---------- */
function loginView(c, error, status = 200, setup = false) {
  const first = !setup && !admin.exists();
  let m = `<main id="main-content" class="login-wrap"><form method="post" action="/admin/${setup ? "setup" : "login"}" class="login-card card" autocomplete="on"><input type="hidden" name="_csrf" value="${e(c.loginCsrf)}">`;
  m += `<span class="login-ico" aria-hidden="true">${K.icon("lock")}</span><h1>${setup ? "Create admin account" : "Admin sign in"}</h1>`;
  if (error) m += `<div class="alert alert-err" role="alert">${K.icon("alert-triangle")}<div>${e(error)}</div></div>`;
  if (setup) {
    m += `<div class="alert alert-info">${K.icon("info")}<div>First run: the one-time setup token is printed in the container log (<code>docker logs</code> or the Portainer log view).</div></div>`;
    m += `<div class="field"><label for="token">Setup token</label><input id="token" name="token" required autofocus autocomplete="off" spellcheck="false"></div>`;
    m += `<div class="field"><label for="username">Username</label><input id="username" name="username" value="admin" required pattern="[A-Za-z0-9_.-]{3,32}" autocomplete="username"></div>`;
    m += `<div class="field"><label for="password">Password (at least 10 characters)</label><input id="password" name="password" type="password" required minlength="10" autocomplete="new-password"></div>`;
    m += `<div class="field"><label for="password2">Repeat password</label><input id="password2" name="password2" type="password" required minlength="10" autocomplete="new-password"></div>`;
    m += `<button class="btn btn-primary btn-block" type="submit">${K.icon("check")} Create account</button>`;
  } else {
    m += `<div class="field"><label for="username">Username</label><input id="username" name="username" autocomplete="username" required autofocus></div>`;
    m += `<div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>`;
    m += `<button class="btn btn-primary btn-block" type="submit">${K.icon("login")} Sign in</button>`;
  }
  m += "</form></main>";
  H.html(c.req, c.res, status, Layout.render(c.ctx, { title: setup ? "Create admin account" : "Sign in", admin: true, noindex: true, main: m }), { admin: true });
}

/* ---------- screens ---------- */
const S = {};

S["GET /admin"] = async (c) => {
  const days = Stats.days(14), dates = Object.keys(days);
  const pv = {}, api = {};
  for (const d of dates) { pv[d] = days[d].pv || 0; api[d] = days[d].api || 0; }
  const today = days[dates[dates.length - 1]] || {};
  let cards = [
    ["eye", K.number(today.pv || 0), "page views today"], ["bar-chart", K.number(Stats.sum(days, "pv")), "page views, 14 days"],
    ["zap", K.number(Stats.sum(days, "api")), "API / asset requests, 14 days"], ["timer", Stats.avgMs(days) + " ms", "average response time"],
    ["alert-triangle", K.number(Stats.sum(days, "err")), "server errors, 14 days"],
  ];
  let extra = "";
  const fn = K.c("dashboard", null);
  if (typeof fn === "function") { const r = (await fn(days, c)) || {}; for (const k of (r.cards || []).slice().reverse()) cards.unshift(k); extra = r.html || ""; }
  let h = '<div class="stat-grid">' + cards.slice(0, 8).map(([i, v, l]) => `<div class="stat"><span class="stat-ico">${K.icon(i)}</span><div><strong>${e(v)}</strong><span>${e(l)}</span></div></div>`).join("") + "</div>";
  h += '<div class="admin-cols">' + Ui.card("Traffic, last 14 days", "bar-chart", Ui.chart(dates, [["page views", pv, "bar-file"], ["API / assets", api, "bar-css"]]) + (!Site.on("stats_on") ? '<p class="hint">Statistics are switched off in Security.</p>' : ""))
    + Ui.card("Top pages (14 days)", "trophy", Ui.rank(Stats.top(days, "p", 8), (k) => `<a href="${e(k)}" target="_blank" rel="noopener">${e(k)}</a>`)) + "</div>" + extra;
  const ck = '<ul class="checks">' + Monitor.checks(c.req).map(([l, ok, help]) => `<li class="${ok ? "ok" : "warn"}">${K.icon(ok ? "check-circle" : "alert-triangle")}<div><strong>${e(l)}</strong>${!ok ? `<small>${e(help)}</small>` : ""}</div></li>`).join("") + "</ul>";
  const acts = store.activity(8);
  const act = '<ul class="activity-mini">' + acts.map((r) => `<li><span>${e(K.ago(r.t))}</span> ${e(r.m)}</li>`).join("") + (!acts.length ? '<li class="muted">Nothing yet.</li>' : "") + "</ul>";
  h += '<div class="admin-cols">' + Ui.card("System health", "shield-check", ck) + Ui.card("Recent activity", "history", act) + "</div>";
  h += Ui.card("Shortcuts", "rocket", `<div class="tool-forms"><a class="btn btn-secondary" href="/admin/site">${K.icon("globe")} Site & domains</a><a class="btn btn-secondary" href="/admin/navigation">${K.icon("menu")} Header & footer</a><a class="btn btn-secondary" href="/admin/pages">${K.icon("file-text")} Edit pages</a><a class="btn btn-secondary" href="/admin/backup.zip">${K.icon("archive")} Download backup</a></div>`);
  page(c, "Dashboard", "dashboard", h, `<a class="btn btn-secondary" href="/" target="_blank" rel="noopener">${K.icon("external-link")} View site</a>`);
};

S["GET /admin/site"] = (c) => {
  const s = Site.all();
  const rows = Object.entries(K.SERVICES).map(([k, sv]) => `<tr><td>${K.icon(sv.icon)} ${e(sv.name)}</td><td><code>${e(K.service(k))}</code></td><td>${Ui.text("", "svc_" + k, s["svc_" + k], { placeholder: "automatic", type: "url" })}</td></tr>`).join("");
  let h = `<form method="post" action="/admin/site" class="admin-form">${field(c)}`;
  h += Ui.card("Identity", "id-card",
    `<div class="field-row">${Ui.text("Site name", "site_name", s.site_name, { maxlength: 60 })}${Ui.text("Short name", "short_name", s.short_name, { maxlength: 30 })}</div>`
    + Ui.text("Tagline", "tagline", s.tagline, { maxlength: 160, hint: "Shown in the footer and used for link previews." })
    + Ui.area("Meta description", "description", s.description, { rows: 2, maxlength: 300, hint: "Default description for search results. Leave empty to use the tagline." })
    + `<div class="field-row">${Ui.text("Contact email", "contact_email", s.contact_email, { type: "email" })}${Ui.text("GitHub repository URL", "github_url", s.github_url, { type: "url" })}</div>`
    + `<div class="field-row">${Ui.text("Owner / brand name", "owner_name", s.owner_name, { maxlength: 60 })}${Ui.text("Owner link", "owner_url", s.owner_url, { type: "url" })}</div>`
    + `<div class="field-row">${Ui.text("License name", "license_name", s.license_name, { maxlength: 30 })}${Ui.text("License URL", "license_url", s.license_url, { type: "url" })}</div>`);
  h += Ui.card("Domain", "globe",
    Ui.text("Public URL of this service", "base_url", s.base_url, { type: "url", placeholder: "https://example.rayaz.org", hint: "Used for canonical links, the sitemap and embed snippets. Leave empty to detect it from the request (set it when behind a proxy)." })
    + Ui.text("Root domain of all TechZeeLand services", "root_domain", s.root_domain, { placeholder: K.DEFAULT_ROOT_DOMAIN, hint: "Moving to a new domain? Change this one value (for example <code>techzeeland.com</code>) in each service. The subdomains <code>fonts</code>, <code>icons</code>, <code>qrcode</code> and <code>assignmentcovergenerator</code> are added automatically and every icon, font and cross-link follows." })
    + `<div class="table-wrap"><table class="data-table"><thead><tr><th>Service</th><th>Resolved URL</th><th>Override (optional)</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p class="hint">Current root domain: <code>${e(K.rootDomain())}</code>. The icon stylesheet is <code>${e(K.iconCssUrl() || "/zi.css")}</code>.</p>`);
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save</button></div></form>`;
  page(c, "Site & domains", "site", h);
};
S["POST /admin/site"] = (c) => {
  const n = { site_name: str(c, "site_name", 60), short_name: str(c, "short_name", 30), tagline: str(c, "tagline", 160), description: str(c, "description", 300), contact_email: str(c, "contact_email", 120), owner_name: str(c, "owner_name", 60), license_name: str(c, "license_name", 30) };
  const errs = [];
  if (!n.site_name) errs.push("Site name cannot be empty.");
  if (n.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.contact_email)) errs.push("Contact email is not valid.");
  for (const k of ["github_url", "owner_url", "license_url", "base_url", "svc_fonts", "svc_icons", "svc_qr", "svc_cover"]) {
    const u = urlOrEmpty(str(c, k, 300));
    if (u === null) errs.push(`${k} must start with http:// or https://.`); else n[k] = u.replace(/\/+$/, "");
  }
  const root = str(c, "root_domain", 120).toLowerCase().replace(/^https?:\/\//, "").replace(/^[/\s]+|[/\s]+$/g, "");
  if (root && !/^[a-z0-9.\-]+$/.test(root)) errs.push("Root domain may only contain letters, numbers, dots and hyphens (e.g. techzeeland.com)."); else n.root_domain = root;
  if (errs.length) { errs.forEach((m) => flash(c, "err", e(m))); return back(c, "/admin/site"); }
  Site.save(n); store.log("Updated site & domain settings", c.sess.user);
  flash(c, "ok", "Site settings saved."); back(c, "/admin/site");
};

S["GET /admin/navigation"] = (c) => {
  const custom = Array.isArray(Site.get("header_links"));
  let h = `<form method="post" action="/admin/navigation" class="admin-form">${field(c)}`;
  h += Ui.card("Header links", "menu", `<p class="hint">${custom ? "You are using a custom menu." : "Using the default menu for this service. Edit and save to customise it."} Use <code>/path</code> for pages on this site and a full <code>https://…</code> address for others.</p>`
    + Ui.linkEditor("header_links", Site.headerLinks())
    + `<div class="switch-list mt">${Ui.check("show_github", "Show the GitHub button in the header", Site.on("show_github"))}</div>`
    + `<div class="field-row mt">${Ui.text("GitHub button label", "github_label", String(Site.get("github_label")), { maxlength: 30 })}</div>`
    + (custom ? '<label class="row-check mt"><input type="checkbox" name="header_reset" value="1"><span class="switch"></span><span class="row-check-label">Reset header links to the default</span></label>' : ""));
  let cols = ""; let i = 0;
  for (const col of Site.footerColumns()) { cols += `<div class="footer-edit"><div class="field"><label>Column title</label><input type="text" name="footer_columns[${i}][title]" value="${e(col.title)}" maxlength="40"></div>${Ui.linkEditor("footer_cols_links_" + i, col.links || [], false, true)}</div>`; i++; }
  h += Ui.card("Footer columns", "layout", `<p class="hint">Up to four columns. Leave a column title empty (or remove all its links) to delete it.</p>${cols}<div class="footer-edit"><div class="field"><label>New column title</label><input type="text" name="footer_columns[${i}][title]" maxlength="40" placeholder="Optional"></div>${Ui.linkEditor("footer_cols_links_" + i, [], false, true)}</div>`
    + (Array.isArray(Site.get("footer_columns")) ? '<label class="row-check mt"><input type="checkbox" name="footer_reset" value="1"><span class="switch"></span><span class="row-check-label">Reset footer columns to the default</span></label>' : ""));
  h += Ui.card("Social & support links", "share", Ui.linkEditor("social_links", Site.socialLinks()) + `<p class="hint">Icon names come from the <a href="${e(K.service("icons"))}/icons" target="_blank" rel="noopener">TechZeeLand Icons</a> library (for example <code>youtube</code>, <code>github</code>, <code>pathaopay</code>).</p>`);
  h += Ui.card("Footer text & services", "file-text", Ui.area("Footer sentence", "footer_text", String(Site.get("footer_text")), { rows: 2, maxlength: 400, hint: "Tokens: <code>{year}</code> <code>{site}</code> <code>{owner}</code> <code>{license}</code>. Leave empty for the default sentence." })
    + `<div class="switch-list">${Ui.check("show_services", "Show links to the other TechZeeLand services (header menu and footer)", Site.on("show_services"))}</div>`
    + `<div class="field-row mt">${Ui.text("Services heading", "services_title", String(Site.get("services_title")), { maxlength: 40 })}</div>`);
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save navigation</button></div></form>`;
  page(c, "Header & footer", "navigation", h);
};
S["POST /admin/navigation"] = (c) => {
  const b = c.body;
  const n = { show_github: bool(c, "show_github"), github_label: str(c, "github_label", 30), show_services: bool(c, "show_services"), services_title: str(c, "services_title", 40), footer_text: str(c, "footer_text", 400), social_links: Site.cleanLinks(b.social_links, 16) };
  n.header_links = bool(c, "header_reset") ? null : Site.cleanLinks(b.header_links, 12);
  if (bool(c, "footer_reset")) n.footer_columns = null;
  else {
    const cols = [];
    for (const [i, col] of Object.entries(b.footer_columns || {})) {
      const title = String((col && col.title) || "").trim();
      const links = Site.cleanLinks(b["footer_cols_links_" + i], 12);
      if (!title || !links.length) continue;
      cols.push({ title: title.slice(0, 40), links });
      if (cols.length >= 4) break;
    }
    n.footer_columns = cols;
  }
  Site.save(n); store.log("Updated header and footer", c.sess.user);
  flash(c, "ok", "Header and footer saved."); back(c, "/admin/navigation");
};

S["GET /admin/appearance"] = (c) => {
  const s = Site.all();
  const logo = `<div class="logo-row"><img src="${e(Layout.logoUrl())}?v=${crypto.createHash("sha1").update(String(s.logo_path)).digest("hex").slice(0, 6)}" alt="Current logo" width="56" height="56"><div><div class="field"><label for="logo">Upload a new logo (SVG, PNG, WebP or JPG, up to 1 MB)</label><input type="file" id="logo" name="logo" accept=".svg,.png,.webp,.jpg,.jpeg,image/*"></div>${s.logo_path ? '<label class="row-check"><input type="checkbox" name="logo_reset" value="1"><span class="switch"></span><span class="row-check-label">Remove the uploaded logo and use the built-in one</span></label>' : ""}</div></div>`;
  let h = `<form method="post" action="/admin/appearance" enctype="multipart/form-data" class="admin-form">${field(c)}`;
  h += Ui.card("Brand", "palette", Ui.color("Accent colour", "accent", s.accent, "Default <code>#6cc6af</code>. Light and dark variants are derived automatically.")
    + Ui.select("Default theme", "default_theme", { auto: "Follow the visitor's system", light: "Light", dark: "Dark" }, s.default_theme, { hint: "Visitors can still switch with the sun/moon button." })
    + logo + Ui.text("Social preview image (Open Graph)", "og_image", s.og_image, { placeholder: "/assets/img/og-image.png", hint: "A path on this site or a full URL. Recommended 1200×630." }));
  h += Ui.card("Announcement bar", "megaphone", `<div class="switch-list">${Ui.check("announcement_on", "Show the announcement above the header", Site.on("announcement_on"))}</div><div class="field-row mt">${Ui.text("Text", "announcement_text", s.announcement_text, { maxlength: 200 })}${Ui.text("Link (optional)", "announcement_link", s.announcement_link, { placeholder: "/docs or https://…" })}</div>`);
  h += Ui.card("Cookie / notice banner", "info", `<div class="switch-list">${Ui.check("cookie_banner_on", "Show a dismissible notice banner", Site.on("cookie_banner_on"), "turn on if you add ads or analytics")}</div>${Ui.area("Banner text", "cookie_banner_text", s.cookie_banner_text, { rows: 2, maxlength: 300 })}`);
  h += Ui.card("Custom CSS", "code", Ui.area("CSS added to every public page", "custom_css", s.custom_css, { rows: 8, mono: true, maxlength: 20000, hint: "Advanced. Override variables such as <code>--accent</code>, <code>--radius</code> or <code>--bg</code>." }));
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save appearance</button></div></form>`;
  page(c, "Appearance", "appearance", h);
};
function saveLogo(f) {
  if (f.data.length > 1048576) return "ERR:The logo is larger than 1 MB.";
  const ext = path.extname(f.filename).slice(1).toLowerCase();
  if (!["svg", "png", "webp", "jpg", "jpeg"].includes(ext)) return "ERR:Logo must be SVG, PNG, WebP or JPG.";
  if (ext === "svg") {
    const svg = f.data.toString("utf8");
    if (!/<svg/i.test(svg) || /<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe/i.test(svg)) return "ERR:That SVG contains scripts or unsafe elements. Use a plain SVG.";
  } else {
    const sig = f.data.slice(0, 12).toString("latin1");
    const okSig = ext === "png" ? sig.startsWith("\x89PNG") : ext === "webp" ? sig.startsWith("RIFF") && sig.slice(8, 12) === "WEBP" : f.data[0] === 0xff && f.data[1] === 0xd8;
    if (!okSig) return "ERR:That file is not a valid image.";
  }
  const name = `logo-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(store.P("uploads/" + name), f.data);
  return name;
}
const dropLogo = () => { const old = String(Site.get("logo_path")); if (old) { try { fs.unlinkSync(store.P("uploads/" + path.basename(old))); } catch { /* gone */ } } };
S["POST /admin/appearance"] = (c) => {
  const n = {
    accent: Site.cleanColor(str(c, "accent", 7)), default_theme: ["auto", "light", "dark"].includes(c.body.default_theme) ? c.body.default_theme : "auto", og_image: str(c, "og_image", 300),
    announcement_on: bool(c, "announcement_on"), announcement_text: str(c, "announcement_text", 200), announcement_link: Site.cleanUrl(str(c, "announcement_link", 300)),
    cookie_banner_on: bool(c, "cookie_banner_on"), cookie_banner_text: str(c, "cookie_banner_text", 300), custom_css: raw(c, "custom_css", 20000).replace(/<\/style/gi, ""),
  };
  if (n.og_image && !Site.cleanUrl(n.og_image)) { n.og_image = ""; flash(c, "err", "The preview image address was not valid and was cleared."); }
  if (bool(c, "logo_reset")) { dropLogo(); n.logo_path = ""; }
  const f = c.files.logo;
  if (f) { const r = saveLogo(f); if (r.startsWith("ERR:")) flash(c, "err", e(r.slice(4))); else { dropLogo(); n.logo_path = r; } }
  Site.save(n); store.log("Updated appearance", c.sess.user);
  flash(c, "ok", "Appearance saved."); back(c, "/admin/appearance");
};

S["GET /admin/pages"] = (c) => {
  const rows = Object.entries(Pages.slugs()).map(([slug, label]) => { const p = Pages.get(slug) || {}; return `<tr><td><a class="strong-link" href="/admin/pages/${slug}">${e(p.title || label)}</a></td><td><code>/${slug}</code></td><td>${p.edited ? '<span class="badge badge-accent">edited</span>' : '<span class="badge badge-soft">default</span>'}</td><td class="right"><a class="icon-btn" href="/${slug}" target="_blank" rel="noopener" aria-label="View">${K.icon("external-link")}</a> <a class="icon-btn" href="/admin/pages/${slug}" aria-label="Edit">${K.icon("square-pen")}</a></td></tr>`; }).join("");
  page(c, "Pages & policies", "pages", Ui.card("Content pages", "file-text", `<p class="hint">Edit the wording of every policy and info page. Pages use Markdown. Tokens such as <code>{site}</code>, <code>{email}</code>, <code>{url}</code> and <code>{github}</code> are replaced automatically, so the text keeps working after a domain change.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Page</th><th>Address</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`));
};
S["GET /admin/pages/:slug"] = (c, slug) => {
  const p = Pages.get(slug);
  if (!p || !Pages.slugs()[slug]) return notFound(c, "Unknown page.");
  const tok = Object.keys(Pages.tokens(c.req)).map((t) => `<code>${e(t)}</code>`).join(" ");
  let h = `<form method="post" action="/admin/pages/${e(slug)}" class="admin-form">${field(c)}`;
  h += Ui.card("Edit page", "file-text", Ui.text("Page title", "title", p.title, { maxlength: 80 }) + Ui.area("Content (Markdown)", "md", p.md, { rows: 22, mono: true, maxlength: 40000, hint: `Headings with <code>##</code>, lists with <code>-</code>, links <code>[text](url)</code>, <strong>**bold**</strong>. Tokens: ${tok}` }));
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save page</button> <button class="btn btn-secondary" type="submit" name="do" value="reset" data-confirm="Restore the default text for this page?">${K.icon("rotate-ccw")} Restore default</button> <a class="btn btn-secondary" href="/admin/pages">Back</a></div></form>`;
  page(c, "Edit: " + p.title, "pages", h);
};
S["POST /admin/pages/:slug"] = (c, slug) => {
  if (!Pages.slugs()[slug]) return notFound(c, "Unknown page.");
  if (c.body.do === "reset") { Pages.reset(slug); store.log("Restored default page: " + slug, c.sess.user); flash(c, "ok", "Default text restored."); }
  else { Pages.save(slug, str(c, "title", 80), raw(c, "md", 40000)); store.log("Edited page: " + slug, c.sess.user); flash(c, "ok", "Page saved."); }
  back(c, "/admin/pages/" + slug);
};

S["GET /admin/seo"] = (c) => {
  const s = Site.all();
  let h = `<form method="post" action="/admin/seo" class="admin-form">${field(c)}`;
  h += Ui.card("Search engines", "search", `<div class="switch-list">${Ui.check("robots_index", "Allow search engines to index this site", Site.on("robots_index"))}</div>` + Ui.area("Extra robots.txt lines", "robots_extra", s.robots_extra, { rows: 3, mono: true, maxlength: 2000, hint: 'Appended to <a href="/robots.txt" target="_blank" rel="noopener">/robots.txt</a>. The sitemap is at <a href="/sitemap.xml" target="_blank" rel="noopener">/sitemap.xml</a>.' }));
  h += Ui.card("Advertising (optional)", "ad", Ui.area("ads.txt", "ads_txt", s.ads_txt, { rows: 4, mono: true, maxlength: 5000, placeholder: "google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0", hint: 'Served at <a href="/ads.txt" target="_blank" rel="noopener">/ads.txt</a>. Empty means no ads.txt.' }));
  h += Ui.card("Analytics & custom code", "code", Ui.area("Extra <head> HTML", "custom_head_html", s.custom_head_html, { rows: 4, mono: true, maxlength: 10000, hint: "Verification meta tags or analytics <code>&lt;script src&gt;</code> tags. Scripts only run if their host is allowed under Security." }) + Ui.area("HTML before </body>", "custom_footer_html", s.custom_footer_html, { rows: 3, mono: true, maxlength: 10000 }) + '<p class="hint">This HTML is inserted as written. Only paste code you trust.</p>');
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save</button></div></form>`;
  page(c, "SEO, ads & code", "seo", h);
};
S["POST /admin/seo"] = (c) => {
  Site.save({ robots_index: bool(c, "robots_index"), robots_extra: raw(c, "robots_extra", 2000), ads_txt: raw(c, "ads_txt", 5000), custom_head_html: raw(c, "custom_head_html", 10000), custom_footer_html: raw(c, "custom_footer_html", 10000) });
  store.log("Updated SEO, ads and custom code", c.sess.user); flash(c, "ok", "Saved."); back(c, "/admin/seo");
};

S["GET /admin/security"] = (c) => {
  const s = Site.all();
  let h = `<form method="post" action="/admin/security" class="admin-form">${field(c)}`;
  h += Ui.card("Privacy & statistics", "sliders", `<div class="switch-list">${Ui.check("stats_on", "Count visits (anonymous daily totals, no IP addresses)", Site.on("stats_on"))}</div>`);
  h += Ui.card("Public API (CORS)", "zap", Ui.text("Allowed origin", "cors_origin", s.cors_origin, { hint: "<code>*</code> lets any website call the public API. Use one origin such as <code>https://example.com</code> to restrict it." }));
  h += Ui.card("Content Security Policy", "shield", `<p class="hint">By default only this site's own scripts run. Add hosts here if you use analytics or ads (for example <code>https://www.googletagmanager.com</code>).</p>`
    + Ui.text("Extra script hosts", "csp_script_hosts", s.csp_script_hosts, { placeholder: "https://www.googletagmanager.com https://pagead2.googlesyndication.com" }) + Ui.text("Extra connect hosts", "csp_connect_hosts", s.csp_connect_hosts, { placeholder: "https://www.google-analytics.com" }) + Ui.text("Extra image hosts", "csp_img_hosts", s.csp_img_hosts, { placeholder: "https://www.google-analytics.com" })
    + `<div class="switch-list">${Ui.check("csp_allow_inline", "Allow inline scripts", Site.on("csp_allow_inline"), "weakens XSS protection; only if a snippet requires it")}</div>`);
  h += Ui.card("Maintenance mode", "wrench", `<div class="switch-list">${Ui.check("maintenance_on", "Show the maintenance page to visitors (admin stays available)", Site.on("maintenance_on"))}</div>` + Ui.area("Message", "maintenance_message", s.maintenance_message, { rows: 2, maxlength: 300 }));
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save</button></div></form>`;
  h += Ui.card("Sign-in protection", "lock", `<p>Failed sign-ins in the last 15 minutes: <strong>${throttle.recent()}</strong>. After six failures from one address, sign-in is locked for 15 minutes.</p><p class="hint">Sessions use a cookie limited to <code>/admin</code> (HttpOnly, SameSite=Strict) and end when the container restarts. Every form is CSRF-protected.</p>`);
  page(c, "Security", "security", h);
};
S["POST /admin/security"] = (c) => {
  const hosts = (k) => str(c, k, 400).replace(/[^a-zA-Z0-9:/.\-*\s]/g, "").trim();
  Site.save({ stats_on: bool(c, "stats_on"), cors_origin: str(c, "cors_origin", 200) || "*", csp_script_hosts: hosts("csp_script_hosts"), csp_connect_hosts: hosts("csp_connect_hosts"), csp_img_hosts: hosts("csp_img_hosts"), csp_allow_inline: bool(c, "csp_allow_inline"), maintenance_on: bool(c, "maintenance_on"), maintenance_message: str(c, "maintenance_message", 300) });
  store.log("Updated security settings" + (bool(c, "maintenance_on") ? " (maintenance mode ON)" : ""), c.sess.user); flash(c, "ok", "Security settings saved."); back(c, "/admin/security");
};

S["GET /admin/traffic"] = (c) => {
  let range = parseInt(c.query.days, 10); if (![7, 14, 30, 90].includes(range)) range = 30;
  const days = Stats.days(range), dates = Object.keys(days);
  const pv = {}, api = {};
  for (const d of dates) { pv[d] = days[d].pv || 0; api[d] = days[d].api || 0; }
  let h = '<p class="range">' + [7, 14, 30, 90].map((n) => `<a class="chip${n === range ? " is-active" : ""}" href="/admin/traffic?days=${n}">${n} days</a>`).join(" ") + "</p>";
  h += Ui.card("Requests per day", "bar-chart", Ui.chart(dates, [["page views", pv, "bar-file"], ["API / assets", api, "bar-css"]], 170));
  h += '<div class="admin-cols">' + Ui.card("Top pages", "trophy", Ui.rank(Stats.top(days, "p", 12))) + Ui.card("Referring sites", "link", Ui.rank(Stats.top(days, "r", 12))) + "</div>";
  h += '<div class="admin-cols">' + Ui.card("Devices", "smartphone", Ui.rank(Stats.top(days, "d", 6))) + Ui.card("Not found (404)", "search", Ui.rank(Stats.top(days, "nf", 12)) + '<p class="hint">Frequent 404s point to broken links or scanners probing the site.</p>') + "</div>";
  const evs = {};
  for (const r of Object.values(days)) for (const [k, n] of Object.entries(r.ev || {})) evs[k] = (evs[k] || 0) + n;
  const sortedEv = Object.fromEntries(Object.entries(evs).sort((a, b) => b[1] - a[1]));
  const errs = Stats.sum(days, "err");
  h += '<div class="admin-cols">' + Ui.card("Feature usage", "activity", Ui.rank(sortedEv))
    + Ui.card("Health of the traffic", "gauge", `<ul class="checks"><li class="ok">${K.icon("timer")}<div><strong>${Stats.avgMs(days)} ms</strong><small>average response time</small></div></li><li class="${errs ? "warn" : "ok"}">${K.icon(errs ? "alert-triangle" : "check-circle")}<div><strong>${errs} server errors</strong><small>HTTP 5xx in this period</small></div></li><li class="ok">${K.icon("scan")}<div><strong>${K.number(Stats.sum(days, "bot"))} bot requests</strong><small>counted separately, not in page views</small></div></li></ul>`) + "</div>";
  page(c, "Traffic", "traffic", h);
};

S["GET /admin/system"] = async (c) => {
  const rows = Object.entries(Monitor.system(c.req)).map(([k, v]) => `<tr><th scope="row">${e(k)}</th><td>${e(v)}</td></tr>`).join("");
  let h = Ui.card("Server", "server", `<div class="table-wrap"><table class="data-table"><tbody>${rows}</tbody></table></div>`);
  let eco = "";
  if (c.query.ping === "1") {
    const r = await Monitor.ecosystem();
    eco = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Service</th><th>URL</th><th>Status</th><th>Time</th></tr></thead><tbody>' + Object.entries(r).map(([k, v]) => `<tr><td>${e(K.SERVICES[k].name)}</td><td><code>${e(K.service(k))}</code></td><td>${v.ok ? '<span class="badge badge-ok">up</span>' : `<span class="badge badge-warn">${e(v.note)}</span>`}</td><td>${v.ms} ms</td></tr>`).join("") + "</tbody></table></div>";
  }
  h += Ui.card("TechZeeLand services status", "activity", `${eco}<p><a class="btn btn-secondary" href="/admin/system?ping=1">${K.icon("refresh")} Check all services now</a></p><p class="hint">Contacts the health endpoint of each service from this server (3 second timeout).</p>`);
  const tools = `<form method="post" action="/admin/tools" class="tool-forms">${field(c)}<a class="btn btn-secondary" href="/admin/backup.zip">${K.icon("archive")} Download backup (.zip)</a><a class="btn btn-secondary" href="/admin/export.json">${K.icon("download")} Export settings (.json)</a><button class="btn btn-secondary" name="do" value="clear_stats" type="submit" data-confirm="Clear all traffic statistics?">${K.icon("trash")} Clear statistics</button><button class="btn btn-secondary" name="do" value="clear_errors" type="submit">${K.icon("trash")} Clear error log</button></form>`
    + `<form method="post" action="/admin/tools" enctype="multipart/form-data" class="inline-form mt">${field(c)}<input type="hidden" name="do" value="import"><input type="file" name="settings" accept=".json,application/json" required><button class="btn btn-secondary" type="submit" data-confirm="Import settings from this file? Current settings will be replaced.">${K.icon("upload")} Import settings</button></form><p class="hint">Backups contain settings, pages, uploads, statistics and added content (never the admin password). Importing a settings export is the quickest way to copy the look of one service to another.</p>`;
  h += Ui.card("Backup & restore", "archive", tools);
  const hist = Site.history().map((f) => `<li><span>${e(f.replace(/^site-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/, "$1-$2-$3 $4:$5:$6 UTC"))}</span><form method="post" action="/admin/tools" class="inline-form">${field(c)}<input type="hidden" name="do" value="restore"><input type="hidden" name="file" value="${e(f)}"><button class="btn btn-secondary btn-sm" type="submit" data-confirm="Restore these settings?">${K.icon("undo")} Restore</button></form></li>`).join("");
  h += Ui.card("Settings history", "history", hist ? `<ul class="history-list">${hist}</ul>` : '<p class="muted">Earlier versions appear here after the first save.</p>', "The last 15 versions of the site settings are kept so you can undo a mistake.");
  const log = Monitor.errorLogTail(40);
  h += Ui.card("Error log", "bug", log.length ? `<pre class="log-view">${e(log.join("\n"))}</pre>` : '<p class="muted">No errors logged.</p>');
  page(c, "System & backup", "system", h);
};
S["POST /admin/tools"] = (c) => {
  const d = String(c.body.do || "");
  if (d === "clear_stats") { Stats.clear(); store.log("Cleared statistics", c.sess.user); flash(c, "ok", "Statistics cleared."); }
  else if (d === "clear_errors") { Monitor.clearErrorLog(); store.log("Cleared error log", c.sess.user); flash(c, "ok", "Error log cleared."); }
  else if (d === "restore") { if (Site.restore(str(c, "file", 60))) { store.log("Restored earlier site settings", c.sess.user); flash(c, "ok", "Settings restored."); } else flash(c, "err", "That version could not be restored."); }
  else if (d === "import") {
    let j = null;
    try { j = JSON.parse(c.files.settings.data.toString("utf8")); } catch { /* invalid */ }
    if (!j || typeof j.site !== "object" || Array.isArray(j.site)) flash(c, "err", "That is not a valid settings export.");
    else {
      const inn = {};
      for (const k of Object.keys(Site.BASE_DEFAULTS)) if (k in j.site && k !== "logo_path") inn[k] = j.site[k];
      Site.save(inn);
      if (j.pages && typeof j.pages === "object") store.write("pages.json", j.pages);
      store.log("Imported settings", c.sess.user);
      flash(c, "ok", "Settings imported. (The logo file is not part of an export; upload it again under Appearance.)");
    }
  }
  back(c, "/admin/system");
};
S["GET /admin/export.json"] = (c) => {
  const site = { ...(store.read("site.json", {}) || {}) }; delete site.logo_path;
  store.log("Exported settings", c.sess.user);
  H.send(c.req, c.res, 200, JSON.stringify({ kit: K.VERSION, service: K.c("service"), exported: K.now(), site, pages: store.read("pages.json", {}) }, null, 2), { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="tzl-settings-${K.c("service")}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json"`, "Cache-Control": "no-store", "Access-Control-Allow-Origin": null });
};
S["GET /admin/backup.zip"] = (c) => {
  const skip = new Set(["admin.json", "throttle.json", "error.log", "secret.key"]);
  const files = [];
  const walk = (dir, rel = "") => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${f.name}` : f.name, p = path.join(dir, f.name);
      if (f.isSymbolicLink() || skip.has(r) || /\.(lock|tmp)$/.test(f.name) || r.startsWith("sessions/") || r.startsWith(".git")) continue;
      if (f.isDirectory()) walk(p, r); else files.push({ name: r, data: fs.readFileSync(p) });
    }
  };
  walk(K.data);
  store.log("Downloaded a backup", c.sess.user);
  H.send(c.req, c.res, 200, zip(files), { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${K.c("service")}-backup-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-")}.zip"`, "Cache-Control": "no-store", "Access-Control-Allow-Origin": null }, { compress: false });
};

S["GET /admin/activity"] = (c) => {
  const rows = store.activity(200).map((r) => `<tr><td class="nowrap" title="${e(r.t)}">${e(K.ago(r.t))}</td><td>${e(r.u)}</td><td>${e(r.m)}</td></tr>`).join("");
  page(c, "Activity log", "activity", Ui.card("Audit log", "history", rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Nothing recorded yet.</p>', "The last 200 admin actions."));
};
S["GET /admin/account"] = (c) => {
  let h = `<form method="post" action="/admin/account" class="admin-form narrow-form">${field(c)}`;
  h += Ui.card("Sign-in details", "user-lock", Ui.text("Username", "username", admin.username(), { maxlength: 40, required: true, autocomplete: "username" })
    + '<div class="field"><label for="current">Current password</label><input type="password" id="current" name="current" autocomplete="current-password" required></div>'
    + '<div class="field"><label for="new">New password</label><input type="password" id="new" name="new" autocomplete="new-password" minlength="10"><p class="hint">At least 10 characters. Leave empty to keep the current one.</p></div>'
    + '<div class="field"><label for="new2">Repeat new password</label><input type="password" id="new2" name="new2" autocomplete="new-password"></div>');
  h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${K.icon("save")} Save</button></div></form><p class="hint">Saving signs out every session, including this one.</p>`;
  if (admin.lastLogin()) h += `<p class="hint">Last sign-in: ${e(K.ago(admin.lastLogin()))}.</p>`;
  page(c, "Account", "account", h);
};
S["POST /admin/account"] = async (c) => {
  const ip = K.clientIp(c.req), user = str(c, "username", 40), cur = String(c.body.current || ""), nw = String(c.body.new || "");
  const err = [];
  if (throttle.locked(ip)) err.push("Too many attempts. Try again later.");
  if (!/^[A-Za-z0-9._@-]{3,40}$/.test(user)) err.push("Username must be 3 to 40 characters: letters, numbers and . _ @ -");
  if (!err.length && !(await admin.checkPassword(cur))) { throttle.fail(ip); err.push("The current password is not correct."); }
  if (nw && nw.length < 10) err.push("The new password must be at least 10 characters.");
  if (nw !== String(c.body.new2 || "")) err.push("The two new passwords do not match.");
  if (err.length) { err.forEach((m) => flash(c, "err", e(m))); return back(c, "/admin/account"); }
  throttle.ok(ip);
  store.log("Changed sign-in details", c.sess.user);
  await admin.change(user, nw);
  H.setCookie(c.res, COOKIE, "", { path: "/admin", secure: K.isHttps(c.req), maxAge: 0 });
  H.redirect(c.res, "/admin/login");
};

/* ---------- dispatcher ---------- */
function matchRoute(routes, key) {
  if (routes[key]) return [routes[key], []];
  const [method, p] = key.split(" ");
  for (const [k, fn] of Object.entries(routes)) {
    if (!k.includes(":")) continue;
    const [m, pat] = k.split(" ");
    if (m !== method) continue;
    const re = new RegExp("^" + pat.replace(/:[a-z]+/g, "([A-Za-z0-9_.-]+)") + "$");
    const r = re.exec(p);
    if (r) return [fn, r.slice(1)];
  }
  return null;
}
/** Handles every /admin request. Returns false when no screen matches (the caller shows its 404). */
async function handle(req, res, ctx, url) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const secure = K.isHttps(req), cookies = H.parseCookies(req), ip = K.clientIp(req), isPost = req.method === "POST";
  const sameOrigin = () => {
    const o = req.headers.origin; if (!o) return true;
    try { return new URL(o).host === String((K.trustProxy() && req.headers["x-forwarded-host"]) || req.headers.host || "").split(",")[0].trim(); } catch { return false; }
  };
  if (isPost && !sameOrigin()) { H.text(req, res, 403, "Cross-site request blocked"); return true; }
  const sess = cookies[COOKIE] ? session.get(cookies[COOKIE]) : null;
  const c = { req, res, ctx, url, query: Object.fromEntries(url.searchParams), body: {}, files: {}, sess };

  if (p === "/admin/login" || p === "/admin/setup") {
    const isSetup = p === "/admin/setup";
    if (sess) { H.redirect(res, "/admin"); return true; }
    if (isSetup && admin.exists()) { H.redirect(res, "/admin/login"); return true; }
    if (!isSetup && !admin.exists()) { H.redirect(res, "/admin/setup"); return true; }
    let t = cookies[LOGIN_COOKIE];
    if (!t || !/^[\w-]{20,}$/.test(t)) t = crypto.randomBytes(18).toString("base64url");
    H.setCookie(res, LOGIN_COOKIE, t, { path: "/admin", secure, maxAge: 1800 });
    c.loginCsrf = t;
    if (!isPost) { loginView(c, "", 200, isSetup); return true; }
    const body = await H.readForm(req);
    if (!cookies[LOGIN_COOKIE] || !safeEqual(String(body._csrf || ""), cookies[LOGIN_COOKIE])) { loginView(c, "The form expired. Please try again.", 400, isSetup); return true; }
    if (isSetup) {
      const fail = (m) => loginView(c, m, 400, true);
      if (throttle.locked(ip)) return fail("Too many attempts. Wait 15 minutes."), true;
      if (!admin.setupTokenOk(body.token)) { throttle.fail(ip); return fail("That setup token is not valid."), true; }
      if (!/^[A-Za-z0-9_.-]{3,32}$/.test(body.username || "")) return fail("Username: 3 to 32 letters, numbers, dots, dashes or underscores."), true;
      if ((body.password || "").length < 10) return fail("The password must be at least 10 characters."), true;
      if (body.password !== body.password2) return fail("The passwords do not match."), true;
      await admin.create(body.username, body.password); throttle.ok(ip); store.log("Admin account created", body.username);
      H.redirect(res, "/admin/login"); return true;
    }
    if (throttle.locked(ip)) { loginView(c, "Too many failed attempts. Please wait 15 minutes.", 429); return true; }
    if (await admin.verify(body.username || "", body.password || "")) {
      throttle.ok(ip); admin.touch();
      const s = session.create(admin.username());
      H.setCookie(res, COOKIE, s.sid, { path: "/admin", secure, maxAge: 12 * 3600 });
      store.log("Signed in", s.user); H.redirect(res, "/admin"); return true;
    }
    throttle.fail(ip); store.log("Failed sign-in attempt (client " + crypto.createHash("sha1").update(ip).digest("hex").slice(0, 8) + ")");
    loginView(c, throttle.locked(ip) ? "Too many failed attempts. Please wait 15 minutes." : "Incorrect username or password.", 401); return true;
  }

  if (!sess) {
    if (p.startsWith("/admin/api/")) H.json(req, res, 401, { error: "Not signed in" }); else H.redirect(res, admin.exists() ? "/admin/login" : "/admin/setup");
    return true;
  }
  c.ctx.session = sess;
  const isApi = p.startsWith("/admin/api/");
  if (isPost) {
    let token = "";
    if (isApi) { c.body = await H.readJson(req, 4 * 1024 * 1024); token = String(req.headers["x-csrf-token"] || ""); }
    else if (/^multipart\//i.test(req.headers["content-type"] || "")) { const m = await H.readMultipart(req); c.body = m.fields; c.files = m.files; token = String(c.body._csrf || ""); }
    else { c.body = await H.readForm(req); token = String(c.body._csrf || ""); }
    if (!safeEqual(token, sess.csrf)) { if (isApi) H.json(req, res, 403, { error: "Session expired. Reload the page." }); else H.text(req, res, 403, "Invalid CSRF token. Go back, reload the page and try again."); return true; }
  }
  if (isPost && p === "/admin/logout") {
    session.destroy(sess.sid); H.setCookie(res, COOKIE, "", { path: "/admin", secure, maxAge: 0 }); store.log("Signed out", sess.user);
    H.redirect(res, "/admin/login"); return true;
  }
  const key = `${req.method === "HEAD" ? "GET" : req.method} ${p}`;
  const hit = matchRoute({ ...S, ...K.c("admin_routes", {}) }, key);
  if (!hit) return false;
  await hit[0](c, ...hit[1]);
  return true;
}
module.exports = { handle, page, notFound, flash, field, str, raw, bool, menu, COOKIE };
