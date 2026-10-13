// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const { esc } = require("../lib/http");

/** Inline an icon from the catalog (so pages need no JS or extra requests for chrome icons). */
function icon(catalog, name, cls = "") {
  const e = catalog.find(null, name);
  if (!e) return "";
  return e.svg
    .replace(/^\s*<\?xml[^>]*>\s*/, "")
    .replace(/<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, "")} class="icon icon-${name}${cls ? " " + cls : ""}" aria-hidden="true" focusable="false">`)
    .trim();
}

function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const NAV = [
  ["/icons", "Icons", "grid"],
  ["/docs", "Docs", "book-open"],
  ["/about", "About", "info"],
];

function layout(ctx, o) {
  const { catalog, settings, nonce, base } = ctx;
  const I = (n, c) => icon(catalog, n, c);
  const site = settings.site_name;
  const title = o.title ? `${o.title} · ${site}` : `${site} – ${settings.tagline}`;
  const desc = o.description || settings.tagline;
  const canonical = base + (o.path || "/");
  const repo = settings.repo_url || "https://github.com/TechZeeLand";
  const year = new Date().getFullYear();
  const cfg = { cookieBanner: Boolean(settings.cookie_banner_enabled), base, ...(o.config || {}) };

  const nav = NAV.map(([href, label, ic]) => `<a href="${href}"${ctx.path === href || ctx.path.startsWith(href + "/") ? ' aria-current="page"' : ""}>${I(ic)}<span>${label}</span></a>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
${o.noindex ? '<meta name="robots" content="noindex, nofollow" />' : `<link rel="canonical" href="${esc(canonical)}" />`}
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:site_name" content="${esc(site)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<link rel="icon" type="image/svg+xml" href="/assets/img/logo.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon/favicon-16x16.png" />
<link rel="shortcut icon" href="/assets/favicon/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png" />
<link rel="manifest" href="/assets/favicon/site.webmanifest" />
<meta name="theme-color" content="#f1faf8" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0b1514" media="(prefers-color-scheme: dark)" />
<link rel="stylesheet" href="/assets/css/site.css?v=${ctx.assetV}" />
${o.head || ""}
<script nonce="${nonce}">window.__ZI__ = ${jsonForScript(cfg)};</script>
<!-- Blocking theme script: applies the saved or system theme before first paint (no flash). -->
<script nonce="${nonce}">
(function () {
    try {
        var saved = localStorage.getItem('zi-theme');
        var theme = saved === 'light' || saved === 'dark' ? saved : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
    } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
    document.documentElement.classList.add('js');
})();
</script>
</head>
<body class="${esc(o.bodyClass || "")}">
<a class="skip-link" href="#main-content">Skip to content</a>
${settings.announcement_enabled && String(settings.announcement_text).trim() ? `<div class="announcement" role="status">${esc(settings.announcement_text)}</div>` : ""}
<header class="topbar">
    <div class="topbar-inner">
        <div class="site-title">
            <a class="brand-link" href="/">
                <img class="brand-logo" src="/assets/img/logo.svg" alt="" width="28" height="28">
                <span>${esc(site)}</span>
            </a>
        </div>
        <nav class="main-nav" aria-label="Main">${nav}</nav>
        <div class="topbar-actions">
            <a class="gh-link" href="${esc(repo)}" target="_blank" rel="noopener">${I("github")}<span>Source on GitHub</span></a>
            <button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="false" aria-label="Switch to dark mode" title="Switch theme">${I("sun")}${I("moon")}</button>
            <details class="nav-menu">
                <summary aria-label="Open menu">${I("menu")}</summary>
                <nav class="nav-pop" aria-label="Mobile">${nav}<a href="${esc(repo)}" target="_blank" rel="noopener">${I("github")}<span>GitHub</span></a></nav>
            </details>
        </div>
    </div>
</header>

<main id="main-content" class="${o.wide ? "wide-main" : "content-wrap"}">
${o.body}
</main>

<footer class="site-footer">
    <div class="footer-inner">
        <div class="footer-cols">
            <nav class="footer-col" aria-label="Site pages">
                <h3>Pages</h3>
                <ul class="footer-links">
                    <li><a href="/">Home</a></li>
                    <li><a href="/icons">Icons</a></li>
                    <li><a href="/docs">Docs</a></li>
                    <li><a href="/about">About</a></li>
                    <li><a href="/contact">Contact</a></li>
                    <li><a href="/privacy-policy">Privacy Policy</a></li>
                    <li><a href="/terms-and-conditions">Terms &amp; Conditions</a></li>
                    <li><a href="/cookie-policy">Cookie Policy</a></li>
                    <li><a href="/license">License</a></li>
                </ul>
            </nav>
            <nav class="footer-col" aria-label="Social links">
                <h3>Connect</h3>
                <ul class="social-links">
                    <li><a href="https://www.youtube.com/@TechZeeLand" target="_blank" rel="noopener">${I("youtube")} YouTube</a></li>
                    <li><a href="https://www.facebook.com/TechZeeLand" target="_blank" rel="noopener">${I("facebook")} Facebook</a></li>
                    <li><a href="https://www.instagram.com/TechZeeLand" target="_blank" rel="noopener">${I("instagram")} Instagram</a></li>
                    <li><a href="https://www.tiktok.com/@TechZeeLand" target="_blank" rel="noopener">${I("tiktok")} TikTok</a></li>
                    <li><a href="https://github.com/TechZeeLand" target="_blank" rel="noopener">${I("github")} GitHub</a></li>
                    <li><a href="https://pathaopay.me/@azlanaziz" target="_blank" rel="noopener"><span class="icon-box" aria-hidden="true"><span class="pathaopay-icon"></span></span> Support</a></li>
                </ul>
            </nav>
        </div>
        <div class="footer-bottom">
            <p>&copy; ${year} TechZeeLand. ${esc(site)} is free &amp; open source under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">AGPL-3.0</a> license. <a href="/source">Source code</a>.</p>
            <p><a href="https://github.com/TechZeeLand" target="_blank" rel="noopener">Made by TechZeeLand</a></p>
        </div>
    </div>
</footer>

<div id="cookie-banner" class="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie notice" hidden>
    <p>This site sets no tracking or advertising cookies. It only remembers your light/dark choice in your browser. See our <a href="/cookie-policy">Cookie Policy</a>.</p>
    <div class="cookie-actions"><button type="button" class="btn btn-primary btn-inline" data-consent="accepted">Got it</button></div>
</div>

<script src="/assets/js/theme.js?v=${ctx.assetV}"></script>
<script src="/assets/js/site.js?v=${ctx.assetV}"></script>
${(o.scripts || []).map((s) => `<script src="${s}?v=${ctx.assetV}"></script>`).join("\n")}
</body>
</html>
`;
}

module.exports = { layout, icon, jsonForScript };
