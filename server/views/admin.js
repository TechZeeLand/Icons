// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const { esc } = require("../lib/http");
const { icon, jsonForScript } = require("./layout");
const { spriteSvg } = require("../lib/catalog");

const NAV = [
  ["dashboard", "/admin", "Dashboard", "dashboard"],
  ["icons", "/admin/icons", "Icons", "grid"],
  ["add", "/admin/add", "Add icons", "upload"],
  ["sync", "/admin/sync", "Sync & export", "cloud-download"],
  ["settings", "/admin/settings", "Site settings", "sliders"],
  ["account", "/admin/account", "Account", "key"],
];

const head = (ctx, title, extra = "") => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Admin</title>
<link rel="icon" href="/assets/favicon/favicon-32x32.png">
<link rel="stylesheet" href="/assets/css/site.css?v=${ctx.assetV}">
<link rel="stylesheet" href="/assets/css/admin.css?v=${ctx.assetV}">
<script nonce="${ctx.nonce}">
(function () { try { var s = localStorage.getItem('zi-theme'); document.documentElement.setAttribute('data-theme', s === 'light' || s === 'dark' ? s : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); } document.documentElement.classList.add('js'); })();
</script>${extra}
</head>`;

function flash(q) {
  const out = [];
  if (q.ok) out.push(`<div class="flash ok" role="status">${esc(String(q.ok).slice(0, 300))}</div>`);
  if (q.err) out.push(`<div class="flash error" role="alert">${esc(String(q.err).slice(0, 300))}</div>`);
  return out.join("");
}

function shell(ctx, { title, active, body, query = {}, script = "", data = null }) {
  const I = (n) => icon(ctx.catalog, n);
  return `${head(ctx, title)}
<body class="admin">
<div class="shell">
  <aside class="side">
    <a class="brand" href="/admin"><img src="/assets/img/logo.svg" alt="" width="26" height="26"> <span>Admin</span></a>
    <nav aria-label="Admin">${NAV.map(([k, href, label, ic]) => `<a href="${href}"${k === active ? ' class="on" aria-current="page"' : ""}>${I(ic)} ${label}</a>`).join("")}</nav>
    <div class="side-foot">
      <a href="/" target="_blank" rel="noopener">${I("external-link")} View site</a>
      <button type="button" id="theme-toggle" class="side-btn" aria-pressed="false" aria-label="Switch to dark mode">${I("sun")}${I("moon")} <span>Theme</span></button>
      <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(ctx.session.csrf)}"><button type="submit" class="side-btn">${I("logout")} Log out</button></form>
    </div>
  </aside>
  <main class="main" id="main-content">
    <h1>${esc(title)}</h1>
    ${flash(query)}
    ${body}
  </main>
</div>
${data ? `<script nonce="${ctx.nonce}">window.__ADMIN__ = ${jsonForScript(data)};</script>` : ""}
<script src="/assets/js/theme.js?v=${ctx.assetV}"></script>
<script src="/assets/js/admin.js?v=${ctx.assetV}"></script>
${script}
</body>
</html>`;
}

const csrf = (ctx) => `<input type="hidden" name="_csrf" value="${esc(ctx.session.csrf)}">`;

// ---------- signed-out pages ----------
function authPage(ctx, { title, body }) {
  return `${head(ctx, title)}
<body class="admin login-body">
<main class="login-card" id="main-content">
  <a class="brand login-brand" href="/"><img src="/assets/img/logo.svg" alt="" width="30" height="30"> <span>${esc(ctx.settings.site_name)}</span></a>
  <h1>${esc(title)}</h1>
  ${body}
</main>
</body>
</html>`;
}

function login(ctx, { error, locked }) {
  return authPage(ctx, {
    title: "Admin login",
    body: `${error ? `<div class="flash error" role="alert">${esc(error)}</div>` : ""}
<form method="post" action="/admin/login" autocomplete="off">
  <input type="hidden" name="_csrf" value="${esc(ctx.loginCsrf)}">
  <label for="username">Username</label>
  <input type="text" id="username" name="username" required autofocus autocomplete="username"${locked ? " disabled" : ""}>
  <label for="password">Password</label>
  <input type="password" id="password" name="password" required autocomplete="current-password"${locked ? " disabled" : ""}>
  <button class="btn btn-primary full" type="submit"${locked ? " disabled" : ""}>Sign in</button>
</form>
<p class="hint"><a href="/">Back to the site</a></p>`,
  });
}

function setup(ctx, { error }) {
  return authPage(ctx, {
    title: "Create admin account",
    body: `<p class="hint">First run: create the administrator. The one-time setup token is printed in the container log (<code>docker logs</code>, or the Portainer log view).</p>
${error ? `<div class="flash error" role="alert">${esc(error)}</div>` : ""}
<form method="post" action="/admin/setup" autocomplete="off">
  <input type="hidden" name="_csrf" value="${esc(ctx.loginCsrf)}">
  <label for="token">Setup token</label>
  <input type="text" id="token" name="token" required autofocus autocomplete="off" spellcheck="false">
  <label for="username">Username</label>
  <input type="text" id="username" name="username" required autocomplete="username" value="admin" pattern="[A-Za-z0-9_.-]{3,32}">
  <label for="password">Password (at least 10 characters)</label>
  <input type="password" id="password" name="password" required minlength="10" autocomplete="new-password">
  <label for="password2">Repeat password</label>
  <input type="password" id="password2" name="password2" required minlength="10" autocomplete="new-password">
  <button class="btn btn-primary full" type="submit">Create account</button>
</form>`,
  });
}

// ---------- signed-in pages ----------
function dashboard(ctx, { stats, sync, query }) {
  const { catalog } = ctx;
  const I = (n) => icon(catalog, n);
  const max = Math.max(1, ...stats.rows.map((r) => r.icons));
  const hidden = catalog.all.filter((e) => e.hidden).length;
  const custom = catalog.all.filter((e) => e.source !== "repo").length;
  const body = `
<div class="cards">
  <div class="stat"><span>${catalog.list.length}</span>public icons</div>
  <div class="stat"><span>${custom}</span>added or edited here</div>
  <div class="stat"><span>${hidden}</span>hidden</div>
  <div class="stat"><span>${stats.today.icons}</span>icons served today</div>
  <div class="stat"><span>${stats.total}</span>icons served (90 days)</div>
</div>
<section class="panel">
  <h2>Icons served, last 14 days</h2>
  <div class="chart" role="img" aria-label="Bar chart of icons served per day">${stats.rows.map((r) => `<div class="col" title="${esc(r.day)}: ${r.icons}"><span class="bar" style="height:${Math.max(2, Math.round((r.icons / max) * 100))}%"></span></div>`).join("")}</div>
  <p class="hint">Anonymous counters only: no IP addresses or visitor identifiers are recorded.</p>
</section>
<div class="grid2">
  <section class="panel">
    <h2>Most requested</h2>
    ${stats.top.length ? `<table><thead><tr><th>Icon</th><th class="num">Requests</th></tr></thead><tbody>${stats.top.map(([k, n]) => `<tr><td><a href="/admin/icons/edit?key=${encodeURIComponent(k)}">${esc(k)}</a></td><td class="num">${n}</td></tr>`).join("")}</tbody></table>` : '<p class="hint">Nothing served yet.</p>'}
  </section>
  <section class="panel">
    <h2>Source</h2>
    <table><tbody>
      <tr><th>Mode</th><td>${esc(sync.mode)}</td></tr>
      <tr><th>Version</th><td><code>${esc(catalog.version)}</code></td></tr>
      <tr><th>Revision</th><td>${esc(sync.rev || "n/a")}</td></tr>
      <tr><th>Last sync</th><td>${sync.lastOk ? esc(sync.lastOk) : "never"}</td></tr>
      <tr><th>Status</th><td>${sync.error ? `<span class="pill err">${esc(sync.error)}</span>` : '<span class="pill ok">OK</span>'}</td></tr>
    </tbody></table>
    <p><a class="btn" href="/admin/sync">${I("cloud-download")} Sync &amp; export</a> <a class="btn primary" href="/admin/add">${I("plus")} Add icons</a></p>
  </section>
</div>`;
  return shell(ctx, { title: "Dashboard", active: "dashboard", body, query });
}

const PAGE = 60;
function iconsList(ctx, { entries, q, set, source, page, query }) {
  const { catalog } = ctx;
  const I = (n) => icon(catalog, n);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = entries.slice((p - 1) * PAGE, p * PAGE);
  const qs = (n) => { const u = new URLSearchParams(); if (q) u.set("q", q); if (set) u.set("set", set); if (source) u.set("source", source); if (n > 1) u.set("page", n); const s = u.toString(); return "/admin/icons" + (s ? "?" + s : ""); };
  const sets = [...new Set(catalog.all.map((e) => e.set))];
  const body = `
<form class="filters" method="get" action="/admin/icons">
  <input type="search" name="q" value="${esc(q)}" placeholder="Search name or tag…" aria-label="Search">
  <select name="set" aria-label="Set"><option value="">All sets</option>${sets.map((s) => `<option${s === set ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
  <select name="source" aria-label="Source">
    <option value="">Any source</option>
    <option value="repo"${source === "repo" ? " selected" : ""}>From repository</option>
    <option value="custom"${source === "custom" ? " selected" : ""}>Added here</option>
    <option value="override"${source === "override" ? " selected" : ""}>Edited here</option>
    <option value="hidden"${source === "hidden" ? " selected" : ""}>Hidden</option>
  </select>
  <button class="btn" type="submit">${I("filter")} Filter</button>
  <a class="btn primary" href="/admin/add">${I("plus")} Add icons</a>
</form>
<p class="hint">${entries.length} icon${entries.length === 1 ? "" : "s"}. Select one to edit its tags, hide it, or replace its drawing.</p>
<div class="hidden-sprite" aria-hidden="true">${spriteSvg(slice)}</div>
<div class="admin-grid">
${slice.map((e) => `<a class="tile${e.hidden ? " is-hidden" : ""}" href="/admin/icons/edit?key=${encodeURIComponent(e.key)}" title="${esc(e.key)}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${esc(e.set)}-${esc(e.name)}"/></svg>
  <span class="tile-name">${esc(e.name)}</span>
  <span class="tile-meta">${esc(e.set)}${e.source !== "repo" ? ` · <b>${e.source === "custom" ? "new" : "edited"}</b>` : ""}${e.hidden ? " · hidden" : ""}</span>
</a>`).join("")}
</div>
${!slice.length ? '<p class="hint">No icons match these filters.</p>' : ""}
${pages > 1 ? `<div class="pager">${p > 1 ? `<a class="btn" href="${qs(p - 1)}">Previous</a>` : ""}<span>Page ${p} of ${pages}</span>${p < pages ? `<a class="btn" href="${qs(p + 1)}">Next</a>` : ""}</div>` : ""}`;
  return shell(ctx, { title: "Icons", active: "icons", body, query });
}

function addIcons(ctx, { sets, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const body = `
<section class="panel">
  <h2>1. Choose files or paste code</h2>
  <p class="hint">Drop one or many <code>.svg</code> files. Every file is cleaned before saving: scripts, metadata and editor junk are removed, <code>ui</code> icons are checked against the 24&times;24 grid and recoloured to <code>currentColor</code>. Names come from the file names.</p>
  <div class="grid2">
    <div>
      <label for="set">Set</label>
      <select id="set">${sets.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
      <p class="hint"><code>ui</code> = line icons on a 24 grid. <code>social</code> = brand glyphs. <code>other</code> = project artwork.</p>
    </div>
    <div>
      <label class="check"><input type="checkbox" id="overwrite"> <span>Replace icons that already exist</span></label>
      <p class="hint">Off by default so you never overwrite an icon by accident.</p>
    </div>
  </div>
  <div id="drop" class="dropzone" tabindex="0" role="button" aria-label="Choose SVG files">
    ${I("upload")}<strong>Drop SVG files here</strong><span>or click to choose</span>
    <input type="file" id="files" accept=".svg,image/svg+xml" multiple hidden>
  </div>
  <details class="paste"><summary>Or paste SVG code</summary>
    <label for="pname">Icon name</label>
    <input type="text" id="pname" placeholder="my-icon" pattern="[a-z0-9-]+">
    <label for="pcode">SVG code</label>
    <textarea id="pcode" rows="7" placeholder="&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 24 24&quot;&gt;…&lt;/svg&gt;"></textarea>
    <p><button type="button" class="btn" id="padd">Add to list</button></p>
  </details>
</section>
<section class="panel" id="review" hidden>
  <h2>2. Review</h2>
  <p class="hint">Fix names if needed, remove anything you do not want, then save. Previews show the cleaned result.</p>
  <div id="items" class="items"></div>
  <p><button type="button" class="btn primary" id="save">${I("check")} Save <span id="count">0</span> icon(s)</button> <button type="button" class="btn" id="clear">Clear list</button></p>
  <div id="result" role="status"></div>
</section>`;
  return shell(ctx, { title: "Add icons", active: "add", body, query, data: { csrf: ctx.session.csrf } });
}

function editIcon(ctx, { entry, repoVersion, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const body = `
<div class="grid2 edit-grid">
  <section class="panel">
    <h2>${esc(entry.key)} ${entry.hidden ? '<span class="pill off">hidden</span>' : ""}</h2>
    <div class="preview-pair">
      <div class="preview"><div class="hidden-sprite" aria-hidden="true">${spriteSvg([entry])}</div><svg viewBox="0 0 24 24" class="p-lg" aria-hidden="true"><use href="#${esc(entry.set)}-${esc(entry.name)}"/></svg></div>
      <div class="preview small"><svg viewBox="0 0 24 24" class="p-sm" aria-hidden="true"><use href="#${esc(entry.set)}-${esc(entry.name)}"/></svg><svg viewBox="0 0 24 24" class="p-xs" aria-hidden="true"><use href="#${esc(entry.set)}-${esc(entry.name)}"/></svg></div>
    </div>
    <table><tbody>
      <tr><th>Source</th><td>${entry.source === "repo" ? "Repository" : entry.source === "custom" ? "Added in this portal" : "Repository icon, replaced in this portal"}</td></tr>
      <tr><th>Public URL</th><td><a href="/i/${esc(entry.key)}.svg" target="_blank" rel="noopener"><code>/i/${esc(entry.key)}.svg</code></a></td></tr>
      <tr><th>CSS class</th><td><code>zi zi-${esc(entry.name)}</code></td></tr>
    </tbody></table>
    <div class="actions">
      <form method="post" action="/admin/icons/visibility">${csrf(ctx)}<input type="hidden" name="key" value="${esc(entry.key)}"><input type="hidden" name="hidden" value="${entry.hidden ? "0" : "1"}"><button class="btn" type="submit">${I(entry.hidden ? "eye" : "eye-off")} ${entry.hidden ? "Show on the site" : "Hide from the site"}</button></form>
      ${entry.source !== "repo" ? `<form method="post" action="/admin/icons/delete" data-confirm="${entry.source === "override" ? "Revert to the repository version of this icon?" : "Delete this icon permanently?"}">${csrf(ctx)}<input type="hidden" name="key" value="${esc(entry.key)}"><button class="btn danger" type="submit">${I("trash")} ${entry.source === "override" ? "Revert to repository version" : "Delete icon"}</button></form>` : ""}
      <a class="btn" href="/i/${esc(entry.key)}.svg" download="${esc(entry.name)}.svg">${I("download")} Download</a>
    </div>
    ${entry.source === "repo" ? '<p class="hint">Repository icons are never deleted here (the repository is the source of truth). Hiding removes it from the site; saving a new drawing replaces it for this site only, and you can export it to commit upstream.</p>' : ""}
  </section>
  <section class="panel">
    <h2>Edit</h2>
    <form method="post" action="/admin/icons/save">
      ${csrf(ctx)}<input type="hidden" name="key" value="${esc(entry.key)}">
      <label for="tags">Tags</label>
      <input type="text" id="tags" name="tags" value="${esc(entry.tags.join(", "))}" placeholder="arrow, direction, navigation">
      <p class="hint">Comma separated. Tags make the icon easier to find in search.</p>
      <label for="svg">SVG source</label>
      <textarea id="svg" name="svg" rows="12" spellcheck="false">${esc(entry.svg.trim())}</textarea>
      <p class="hint">The code is cleaned again when you save. Leave it unchanged to only update tags.</p>
      <button class="btn primary" type="submit">${I("save")} Save changes</button>
    </form>
  </section>
</div>
<p><a href="/admin/icons">&larr; Back to all icons</a></p>`;
  return shell(ctx, { title: entry.name, active: "icons", body, query });
}

function syncPage(ctx, { sync, cfg, customCount, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const body = `
<section class="panel">
  <h2>Icon source</h2>
  <table><tbody>
    <tr><th>Mode</th><td>${sync.mode === "git" ? "Git repository" : sync.mode === "mirror" ? "Mirror of another icon service" : "Bundled icons only"}</td></tr>
    ${cfg.REPO_URL ? `<tr><th>Repository</th><td><code>${esc(cfg.REPO_URL)}</code> (branch <code>${esc(cfg.REPO_BRANCH)}</code>, folder <code>${esc(cfg.REPO_SUBDIR)}</code>)</td></tr>` : ""}
    ${cfg.UPSTREAM ? `<tr><th>Upstream</th><td><code>${esc(cfg.UPSTREAM)}</code></td></tr>` : ""}
    <tr><th>Refresh interval</th><td>${cfg.SYNC_INTERVAL_MS ? `every ${Math.round(cfg.SYNC_INTERVAL_MS / 60000)} min` : "manual / webhook only"}</td></tr>
    <tr><th>Revision</th><td>${esc(sync.rev || "n/a")}</td></tr>
    <tr><th>Last attempt</th><td>${sync.lastRun ? esc(sync.lastRun) : "never"}</td></tr>
    <tr><th>Last success</th><td>${sync.lastOk ? esc(sync.lastOk) : "never"}</td></tr>
    <tr><th>Status</th><td>${sync.running ? "running…" : sync.error ? `<span class="pill err">${esc(sync.error)}</span>` : '<span class="pill ok">OK</span>'}</td></tr>
  </tbody></table>
  <form method="post" action="/admin/sync/run">${csrf(ctx)}<button class="btn primary" type="submit"${sync.mode === "bundled" ? " disabled" : ""}>${I("refresh")} Sync now</button></form>
  ${sync.mode === "bundled" ? '<p class="hint">Set <code>ICONS_REPO_URL</code> (or <code>ICONS_UPSTREAM</code>) in the stack environment to enable syncing.</p>' : ""}
</section>
<section class="panel">
  <h2>Export</h2>
  <p>Icons you add or edit here live in this server's data volume. To make them part of your open-source repository, export them and commit them.</p>
  <p><a class="btn primary" href="/admin/export.zip?scope=custom">${I("download")} Export added &amp; edited icons (${customCount})</a>
  <a class="btn" href="/admin/export.zip?scope=all">${I("download")} Export every icon</a></p>
  <ol class="steps">
    <li>Unzip into your repository so the files land in <code>icons/&lt;set&gt;/&lt;name&gt;.svg</code>.</li>
    <li>Run <code>node scripts/validate.mjs</code>, then commit and push.</li>
    <li>After the next sync the repository copy is used. You can then delete the local copy here, or leave it as an override.</li>
  </ol>
</section>
<section class="panel">
  <h2>Instant updates (webhook)</h2>
  <p>${cfg.SYNC_TOKEN ? "Webhook sync is enabled." : "Webhook sync is off. Set <code>SYNC_TOKEN</code> to enable it."} Point a push webhook at <code>${esc(ctx.base)}/_sync</code> using the token as the secret. GitHub, Gitea and Forgejo signatures are accepted.</p>
</section>`;
  return shell(ctx, { title: "Sync & export", active: "sync", body, query });
}

function settingsPage(ctx, { s, query }) {
  const body = `
<form method="post" action="/admin/settings" class="panel">
  ${csrf(ctx)}
  <h2>Site</h2>
  <label for="site_name">Site name</label>
  <input type="text" id="site_name" name="site_name" maxlength="60" value="${esc(s.site_name)}" required>
  <label for="tagline">Tagline</label>
  <input type="text" id="tagline" name="tagline" maxlength="160" value="${esc(s.tagline)}">
  <div class="grid2">
    <div><label for="contact_email">Contact email</label><input type="email" id="contact_email" name="contact_email" maxlength="120" value="${esc(s.contact_email)}"></div>
    <div><label for="repo_url">Source repository URL</label><input type="text" id="repo_url" name="repo_url" maxlength="200" value="${esc(s.repo_url)}" placeholder="https://github.com/you/icons"><p class="hint">Used by the GitHub button, the footer and <code>/source</code>. Leave empty to use <code>SOURCE_URL</code>.</p></div>
  </div>
  <h2>Announcement banner</h2>
  <label class="check"><input type="checkbox" name="announcement_enabled" value="1"${s.announcement_enabled ? " checked" : ""}> <span>Show a banner above the header</span></label>
  <label for="announcement_text">Banner text</label>
  <input type="text" id="announcement_text" name="announcement_text" maxlength="200" value="${esc(s.announcement_text)}">
  <h2>Notice banner</h2>
  <label class="check"><input type="checkbox" name="cookie_banner_enabled" value="1"${s.cookie_banner_enabled ? " checked" : ""}> <span>Show the storage notice to first-time visitors</span></label>
  <p class="hint">Not required for this site (no tracking cookies), but some operators prefer to show it.</p>
  <h2>Caching</h2>
  <label for="cache_max_age">Browser cache lifetime (seconds)</label>
  <input type="number" id="cache_max_age" name="cache_max_age" min="0" max="31536000" value="${esc(s.cache_max_age)}" style="max-width:200px">
  <p class="hint">How long browsers and CDNs may reuse an icon without asking again. <code>0</code> uses the <code>CACHE_MAX_AGE</code> environment value (${esc(ctx.cacheMaxAge)} s). Longer is faster; shorter picks up changes sooner.</p>
  <h2>License page note</h2>
  <label for="license_note">Extra text shown at the top of the License page</label>
  <textarea id="license_note" name="license_note" rows="4" maxlength="1000" placeholder="For example, any additional permission you grant to people who embed the icons in their projects.">${esc(s.license_note)}</textarea>
  <p><button class="btn primary" type="submit">Save settings</button></p>
</form>`;
  return shell(ctx, { title: "Site settings", active: "settings", body, query });
}

function accountPage(ctx, { username, query }) {
  const body = `
<form method="post" action="/admin/account" class="panel narrow">
  ${csrf(ctx)}
  <h2>Change sign-in details</h2>
  <label for="username">Username</label>
  <input type="text" id="username" name="username" value="${esc(username)}" required pattern="[A-Za-z0-9_.-]{3,32}" autocomplete="username">
  <label for="current">Current password</label>
  <input type="password" id="current" name="current" required autocomplete="current-password">
  <label for="password">New password <span class="hint">(leave empty to keep the current one)</span></label>
  <input type="password" id="password" name="password" minlength="10" autocomplete="new-password">
  <label for="password2">Repeat new password</label>
  <input type="password" id="password2" name="password2" minlength="10" autocomplete="new-password">
  <p><button class="btn primary" type="submit">Save</button></p>
  <p class="hint">Saving signs out every session, including this one.</p>
</form>`;
  return shell(ctx, { title: "Account", active: "account", body, query });
}

module.exports = { login, setup, dashboard, iconsList, addIcons, editIcon, syncPage, settingsPage, accountPage };
