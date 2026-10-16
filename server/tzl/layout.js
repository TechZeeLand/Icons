// Shared page shell: <head>, header, footer, prose pages, error pages. Everything comes from Site settings. Output matches the PHP kit.
"use strict";
const K = require("./kit");
const Site = require("./site");
const e = K.e;

function mix(a, b, t) {
  a = a.replace("#", ""); b = b.replace("#", "");
  let o = "#";
  for (let i = 0; i < 6; i += 2) {
    const x = parseInt(a.substr(i, 2), 16), y = parseInt(b.substr(i, 2), 16);
    o += Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  }
  return o;
}
const lum = (hex) => { const h = hex.replace("#", ""); return (0.2126 * parseInt(h.substr(0, 2), 16) + 0.7152 * parseInt(h.substr(2, 2), 16) + 0.0722 * parseInt(h.substr(4, 2), 16)) / 255; };
function accentCss() {
  const a = Site.cleanColor(String(Site.get("accent")));
  if (a === "#6cc6af") return "";
  const ink = lum(a) > 0.55 ? "#10201b" : "#ffffff";
  return `:root{--accent:${a};--accent-ink:${ink};--accent-dark:${mix(a, "#000000", 0.12)};--accent-text:${mix(a, "#000000", 0.38)};--accent-soft:${mix(a, "#ffffff", 0.78)}}`
    + `html[data-theme="dark"]{--accent-text:${a};--accent-dark:${mix(a, "#ffffff", 0.2)};--accent-soft:${mix(a, "#0c1513", 0.82)}}`;
}
const logoUrl = () => (Site.get("logo_path") ? "/brand/logo" : "/assets/img/logo.svg");
const isExternal = (url, req) => /^https?:\/\//i.test(url) && !url.startsWith(K.baseUrl(req));
const linkAttrs = (l, req) => (l.new || isExternal(String(l.url), req) ? ' target="_blank" rel="noopener"' : "");
function isActive(url, p) {
  if (/^https?:\/\//i.test(url)) return false;
  const u = url.split(/[?#]/)[0];
  if (!u) return false;
  if (u === "/") return p === "/" && !url.includes("#");
  return p === u || p.startsWith(u + "/");
}

/** CSP additions from the Security settings (public pages only). */
function cspExtra(admin, extra = {}) {
  const csp = { ...extra };
  if (!admin) {
    for (const [dir, key] of [["script-src", "csp_script_hosts"], ["connect-src", "csp_connect_hosts"], ["img-src", "csp_img_hosts"]]) {
      const h = String(Site.get(key) || "").replace(/[^a-zA-Z0-9:/.\-*\s]/g, "").trim();
      if (h) csp[dir] = (csp[dir] ? csp[dir] + " " : "") + h;
    }
    if (Site.on("csp_allow_inline")) csp["script-src"] = (csp["script-src"] ? csp["script-src"] + " " : "") + "'unsafe-inline'";
  }
  return csp;
}

function servicesMenu() {
  const self = K.c("service", "");
  let h = `<details class="svc-menu"><summary class="icon-btn" aria-label="TechZeeLand services" title="TechZeeLand services">${K.icon("grid")}</summary><div class="svc-pop"><p class="svc-title">${e(Site.get("services_title"))}</p>`;
  for (const [k, s] of Object.entries(K.SERVICES)) {
    const cur = k === self;
    h += `<a href="${e(cur ? "/" : K.service(k))}"${cur ? ' aria-current="true"' : ""}>${K.icon(s.icon)}<span><strong>${e(s.name)}</strong><small>${e(s.desc)}</small></span></a>`;
  }
  return h + "</div></details>";
}
const linkList = (links, req) => links.map((l) => `<li><a href="${e(l.url)}"${linkAttrs(l, req)}>${l.icon ? K.icon(l.icon) + " " : ""}${e(l.label)}</a></li>`).join("");

function head(ctx, title, desc = "", o = {}) {
  const { req } = ctx;
  const site = String(Site.get("site_name"));
  if (!desc) desc = String(Site.get("description") || "").trim() || String(Site.get("tagline"));
  const full = o.raw_title ? title : title === "" ? site : `${title} — ${site}`;
  const admin = Boolean(o.admin);
  const base = K.baseUrl(req);
  const p = ctx.path;
  const canon = base + (o.canonical || p);
  let og = o.og_image || String(Site.get("og_image")) || "/assets/img/og-image.png";
  if (og[0] === "/") og = base + og;
  const noindex = Boolean(o.noindex) || admin || !Site.on("robots_index");
  const t = e(full), d = e(desc);
  let h = `<!DOCTYPE html><html lang="en" data-theme-default="${e(Site.get("default_theme"))}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n`;
  h += `<title>${t}</title><meta name="description" content="${d}">\n`;
  if (noindex) h += '<meta name="robots" content="noindex, nofollow">\n';
  h += `<link rel="canonical" href="${e(canon)}">\n`;
  h += `<meta property="og:type" content="website"><meta property="og:site_name" content="${e(site)}"><meta property="og:title" content="${t}"><meta property="og:description" content="${d}"><meta property="og:url" content="${e(canon)}"><meta property="og:image" content="${e(og)}">\n`;
  h += `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${e(og)}">\n`;
  h += `<link rel="icon" type="image/svg+xml" href="${e(logoUrl())}"><link rel="alternate icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/assets/favicon/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">\n`;
  h += `<meta name="theme-color" content="${Site.cleanColor(String(Site.get("accent")))}" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0c1513" media="(prefers-color-scheme: dark)">\n`;
  for (const o2 of Object.values(K.origins())) h += `<link rel="preconnect" href="${e(o2)}" crossorigin>\n`;
  h += `<link rel="stylesheet" href="${e(K.fontCssUrl(K.c("ui_font", "Alata")))}">\n<link rel="stylesheet" href="${e(K.iconCssUrl())}">\n`;
  h += `<link rel="stylesheet" href="${K.asset("assets/tzl/tzl.css")}">\n`;
  for (const css of [...K.c("css", []), ...(o.css || [])]) h += `<link rel="stylesheet" href="${K.asset(css)}">\n`;
  const ac = accentCss(), cc = String(Site.get("custom_css") || "").trim();
  if (ac || (cc && !admin)) h += `<style>${ac}${admin ? "" : cc.replace(/<\//g, "<\\/")}</style>\n`;
  h += `<script src="${K.asset("assets/tzl/theme-init.js")}"></script>\n`;
  if (o.head) h += o.head;
  if (!admin && String(Site.get("custom_head_html")).trim()) h += Site.get("custom_head_html") + "\n";
  h += `</head><body class="${e((admin ? "is-admin " : "") + (o.body || ""))}">\n<a class="skip-link" href="#main-content">Skip to content</a>\n`;
  if (!admin && Site.on("announcement_on") && String(Site.get("announcement_text")).trim()) {
    const txt = e(Site.get("announcement_text")), lnk = Site.cleanUrl(String(Site.get("announcement_link")));
    h += `<div class="announcement">${lnk ? `<a href="${e(lnk)}">${txt}</a>` : txt}</div>`;
  }
  h += `<header class="topbar"><div class="topbar-inner"><div class="site-title"><a class="brand-link" href="${admin ? "/admin" : "/"}"><img class="brand-logo" src="${e(logoUrl())}" alt="" width="30" height="30"><span>${e(site)}</span></a>`;
  if (admin) h += '<span class="badge badge-accent">Admin</span>';
  h += "</div>";
  if (!admin) {
    h += '<nav class="main-nav" id="main-nav" aria-label="Main">';
    for (const l of Site.headerLinks()) {
      const act = isActive(String(l.url), p);
      h += `<a href="${e(l.url)}"${linkAttrs(l, req)}${act ? ' class="active" aria-current="page"' : ""}>${l.icon ? K.icon(l.icon) : ""}<span>${e(l.label)}</span></a>`;
    }
    h += "</nav>";
  }
  h += '<div class="topbar-actions">';
  if (admin) h += `<a class="gh-link" href="/" target="_blank" rel="noopener">${K.icon("external-link")}<span>View site</span></a>`;
  else if (Site.on("show_github") && Site.get("github_url")) h += `<a class="gh-link" href="${e(Site.get("github_url"))}" target="_blank" rel="noopener">${K.icon("github")}<span>${e(Site.get("github_label"))}</span></a>`;
  if (Site.on("show_services")) h += servicesMenu();
  h += `<button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="false" aria-label="Switch to dark mode" title="Switch theme">${K.icon("sun", "ico-sun")}${K.icon("moon", "ico-moon")}</button>`;
  h += `<button type="button" class="menu-toggle" id="${admin ? "admin-menu-toggle" : "menu-toggle"}" aria-expanded="false" aria-controls="${admin ? "admin-nav" : "main-nav"}" aria-label="Open menu">${K.icon("menu")}</button>`;
  return h + "</div></div></header>\n";
}

function foot(ctx, o = {}) {
  const { req } = ctx;
  const admin = Boolean(o.admin);
  const site = e(Site.get("site_name"));
  let h = "";
  if (!admin) {
    h += `<footer class="site-footer"><div class="footer-inner"><div class="footer-cols">`;
    h += `<div class="footer-col footer-about"><a class="brand-link" href="/"><img class="brand-logo" src="${e(logoUrl())}" alt="" width="30" height="30"><span>${site}</span></a><p>${e(Site.get("tagline"))}</p></div>`;
    for (const col of Site.footerColumns()) h += `<nav class="footer-col" aria-label="${e(col.title)}"><h3>${e(col.title)}</h3><ul class="footer-links">${linkList(col.links || [], req)}</ul></nav>`;
    if (Site.on("show_services")) {
      h += `<nav class="footer-col" aria-label="Services"><h3>${e(Site.get("services_title"))}</h3><ul class="footer-links">`;
      for (const [k, s] of Object.entries(K.SERVICES)) if (k !== K.c("service", "")) h += `<li><a href="${e(K.service(k))}">${K.icon(s.icon)} ${e(s.name)}</a></li>`;
      h += "</ul></nav>";
    }
    const soc = Site.socialLinks();
    if (soc.length) h += `<nav class="footer-col" aria-label="Social links"><h3>Connect</h3><ul class="social-links">${linkList(soc, req)}</ul></nav>`;
    h += `</div><div class="footer-bottom"><p>${Site.footerText()}</p><p><a href="${e(Site.get("owner_url"))}" target="_blank" rel="noopener">Made by ${e(Site.get("owner_name"))}</a></p></div></div></footer>`;
    if (String(Site.get("custom_footer_html")).trim()) h += Site.get("custom_footer_html");
    if (Site.on("cookie_banner_on")) h += `<div class="cookie-banner" id="cookie-banner" hidden><p>${e(Site.get("cookie_banner_text"))} <a href="/cookie-policy">Learn more</a></p><button type="button" class="btn btn-primary btn-sm" id="cookie-ok">Got it</button></div>`;
  } else h += `<footer class="admin-foot"><p>${site} admin &middot; TZL Kit v${K.VERSION}</p></footer>`;
  h += `<script src="${K.asset("assets/tzl/tzl.js")}"></script>`;
  for (const js of [...K.c(admin ? "admin_js" : "js", []), ...(o.js || [])]) h += `<script src="${K.asset(js)}"></script>`;
  return h + "</body></html>";
}

/** Complete HTML document. o.main is trusted markup (usually a <main id="main-content"> element). Returns {html, csp}. */
function render(ctx, o) {
  const html = head(ctx, o.title || "", o.desc || "", o) + (o.main || "") + foot(ctx, o);
  return { html, csp: K.csp(cspExtra(Boolean(o.admin), o.csp)) };
}
/** Prose page in a card. */
function page(ctx, { title, desc, h1, lede = "", html, ...o }) {
  const main = `<main id="main-content" class="content-wrap"><h1>${e(h1)}</h1>${lede ? `<p class="content-lede">${e(lede)}</p>` : ""}<div class="content-card prose">${html}</div></main>`;
  return render(ctx, { title, desc, main, ...o });
}
function error(ctx, code, icon, title, desc, links = true) {
  let m = `<main id="main-content" class="error-page"><div class="error-icon" aria-hidden="true">${K.icon(icon)}</div><p class="error-code">Error ${code}</p><h1 class="error-title">${e(title)}</h1><p class="error-desc">${e(desc)}</p>`;
  if (links) {
    m += `<div class="error-actions"><a href="/" class="btn btn-primary">${K.icon("home")} Go to homepage</a> <a href="/contact" class="btn btn-secondary">${K.icon("mail")} Contact us</a></div>`;
    m += `<p class="error-links">Or try: <a href="/about">About</a> &middot; <a href="/privacy-policy">Privacy Policy</a> &middot; <a href="/terms-and-conditions">Terms &amp; Conditions</a></p>`;
  }
  return render(ctx, { title, desc, main: m + "</main>", noindex: true });
}
module.exports = { render, page, error, head, foot, logoUrl, accentCss, mix, servicesMenu };
