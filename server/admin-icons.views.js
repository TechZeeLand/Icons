// Icons-specific admin screens, rendered inside the shared TZL admin shell.
"use strict";
const { esc } = require("./lib/http");
const { icon } = require("./views/layout");
const { spriteSvg } = require("./lib/catalog");
const csrf = (ctx) => `<input type="hidden" name="_csrf" value="${esc(ctx.session.csrf)}">`;

const PAGE = 60;
function iconsList(ctx, { entries, q, category, source, page, query }) {
  const { catalog } = ctx;
  const I = (n) => icon(catalog, n);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = entries.slice((p - 1) * PAGE, p * PAGE);
  const qs = (n) => { const u = new URLSearchParams(); if (q) u.set("q", q); if (category) u.set("category", category); if (source) u.set("source", source); if (n > 1) u.set("page", n); const s = u.toString(); return "/admin/icons" + (s ? "?" + s : ""); };
  const cats = catalog.categories();
  const catLabel = Object.fromEntries(cats.map((c) => [c.id, c.label]));
  const body = `
<form class="filters" method="get" action="/admin/icons">
  <input type="search" name="q" value="${esc(q)}" placeholder="Search name or tag…" aria-label="Search">
  <select name="category" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option value="${esc(c.id)}"${c.id === category ? " selected" : ""}>${esc(c.label)} (${c.total})</option>`).join("")}</select>
  <select name="source" aria-label="Source">
    <option value="">Any source</option>
    <option value="repo"${source === "repo" ? " selected" : ""}>From repository</option>
    <option value="custom"${source === "custom" ? " selected" : ""}>Added here</option>
    <option value="override"${source === "override" ? " selected" : ""}>Edited here</option>
    <option value="hidden"${source === "hidden" ? " selected" : ""}>Hidden</option>
  </select>
  <button class="btn btn-secondary" type="submit">${I("filter")} Filter</button>
  <a class="btn btn-primary" href="/admin/add">${I("plus")} Add icons</a>
</form>
<p class="hint">${entries.length} icon${entries.length === 1 ? "" : "s"}. Select one to edit its tags, hide it, or replace its drawing.</p>
<div class="hidden-sprite" aria-hidden="true">${spriteSvg(slice)}</div>
<div class="admin-grid">
${slice.map((e) => `<a class="tile${e.hidden ? " is-hidden" : ""}" href="/admin/icons/edit?key=${encodeURIComponent(e.key)}" title="${esc(e.key)}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${esc(e.set)}-${esc(e.name)}"/></svg>
  <span class="tile-name">${esc(e.name)}</span>
  <span class="tile-meta">${esc(catLabel[e.category] || e.category)}${e.source !== "repo" ? ` · <b>${e.source === "custom" ? "new" : "edited"}</b>` : ""}${e.hidden ? " · hidden" : ""}</span>
</a>`).join("")}
</div>
${!slice.length ? '<p class="hint">No icons match these filters.</p>' : ""}
${pages > 1 ? `<div class="pager">${p > 1 ? `<a class="btn btn-secondary" href="${qs(p - 1)}">Previous</a>` : ""}<span>Page ${p} of ${pages}</span>${p < pages ? `<a class="btn btn-secondary" href="${qs(p + 1)}">Next</a>` : ""}</div>` : ""}`;
  return ({ title: "Icons", active: "icons", body, query });
}

function addIcons(ctx, { categories, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const body = `
<section class="card">
  <h2>1. Choose files or paste code</h2>
  <p class="hint">Drop one or many <code>.svg</code> files. Every file is cleaned before saving: scripts, metadata and editor junk are removed, line icons are checked against the 24&times;24 grid and recoloured to <code>currentColor</code>. Names come from the file names.</p>
  <div class="grid2">
    <div>
      <label for="set">Category</label>
      <select id="set">${categories.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("")}</select>
      <p class="hint">Line-icon categories are checked against the 24&times;24 grid and recoloured to <code>currentColor</code>. Need a new category? <a href="/admin/categories">Manage categories</a>.</p>
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
    <p><button type="button" class="btn btn-secondary" id="padd">Add to list</button></p>
  </details>
</section>
<section class="card" id="review" hidden>
  <h2>2. Review</h2>
  <p class="hint">Fix names if needed, remove anything you do not want, then save. Previews show the cleaned result.</p>
  <div id="items" class="items"></div>
  <p><button type="button" class="btn btn-primary" id="save">${I("check")} Save <span id="count">0</span> icon(s)</button> <button type="button" class="btn btn-secondary" id="clear">Clear list</button></p>
  <div id="result" role="status"></div>
</section>`;
  return ({ title: "Add icons", active: "add", body, query, data: { csrf: ctx.session.csrf } });
}

function editIcon(ctx, { entry, repoVersion, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const body = `
<div class="grid2 edit-grid">
  <section class="card">
    <h2>${esc(entry.key)} ${entry.hidden ? '<span class="pill off">hidden</span>' : ""}</h2>
    <div class="preview-pair">
      <div class="preview"><div class="hidden-sprite" aria-hidden="true">${spriteSvg([entry])}</div><svg viewBox="0 0 24 24" class="p-lg" aria-hidden="true"><use href="#${esc(entry.set)}-${esc(entry.name)}"/></svg></div>
      <div class="preview small"><svg viewBox="0 0 24 24" class="p-sm" aria-hidden="true"><use href="#${esc(entry.set)}-${esc(entry.name)}"/></svg><svg viewBox="0 0 24 24" class="p-xs" aria-hidden="true"><use href="#${esc(entry.set)}-${esc(entry.name)}"/></svg></div>
    </div>
    <table><tbody>
      <tr><th>Category</th><td>${esc((ctx.catalog.category(entry.category) || {}).label || entry.category)}</td></tr>
      <tr><th>Source</th><td>${entry.source === "repo" ? "Repository" : entry.source === "custom" ? "Added in this portal" : "Repository icon, replaced in this portal"}</td></tr>
      <tr><th>Public URL</th><td><a href="/i/${esc(entry.key)}.svg" target="_blank" rel="noopener"><code>/i/${esc(entry.key)}.svg</code></a></td></tr>
      <tr><th>CSS class</th><td><code>zi zi-${esc(entry.name)}</code></td></tr>
    </tbody></table>
    <div class="actions">
      <form method="post" action="/admin/icons/visibility">${csrf(ctx)}<input type="hidden" name="key" value="${esc(entry.key)}"><input type="hidden" name="hidden" value="${entry.hidden ? "0" : "1"}"><button class="btn btn-secondary" type="submit">${I(entry.hidden ? "eye" : "eye-off")} ${entry.hidden ? "Show on the site" : "Hide from the site"}</button></form>
      ${entry.source !== "repo" ? `<form method="post" action="/admin/icons/delete" data-confirm="${entry.source === "override" ? "Revert to the repository version of this icon?" : "Delete this icon permanently?"}">${csrf(ctx)}<input type="hidden" name="key" value="${esc(entry.key)}"><button class="btn btn-danger" type="submit">${I("trash")} ${entry.source === "override" ? "Revert to repository version" : "Delete icon"}</button></form>` : ""}
      <a class="btn btn-secondary" href="/i/${esc(entry.key)}.svg" download="${esc(entry.name)}.svg">${I("download")} Download</a>
    </div>
    ${entry.source === "repo" ? '<p class="hint">Repository icons are never deleted here (the repository is the source of truth). Hiding removes it from the site; saving a new drawing replaces it for this site only, and you can export it to commit upstream.</p>' : ""}
  </section>
  <section class="card">
    <h2>Edit</h2>
    <form method="post" action="/admin/icons/save">
      ${csrf(ctx)}<input type="hidden" name="key" value="${esc(entry.key)}">
      <label for="category">Category</label>
      <select id="category" name="category">${ctx.catalog.categoryList().map((c) => `<option value="${esc(c.id)}"${c.id === entry.category ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select>
      <p class="hint">Move the icon to another category. The icon's URL does not change.</p>
      <label for="tags">Tags</label>
      <input type="text" id="tags" name="tags" value="${esc(entry.tags.join(", "))}" placeholder="arrow, direction, navigation">
      <p class="hint">Comma separated. Tags make the icon easier to find in search.</p>
      <label for="svg">SVG source</label>
      <textarea id="svg" name="svg" rows="12" spellcheck="false">${esc(entry.svg.trim())}</textarea>
      <p class="hint">The code is cleaned again when you save. Leave it unchanged to only update tags.</p>
      <button class="btn btn-primary" type="submit">${I("save")} Save changes</button>
    </form>
  </section>
</div>
<p><a href="/admin/icons">&larr; Back to all icons</a></p>`;
  return ({ title: entry.name, active: "icons", body, query });
}

const KINDS = [
  ["line", "Line icons: 24×24 grid, follows text colour"],
  ["brand", "Filled or brand glyphs: any grid, viewBox required"],
  ["free", "Free-form artwork: fixed colours allowed"],
];

function categoriesPage(ctx, { categories, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const kindSel = (cur, id) => `<select name="kind" aria-label="Icon style"${id ? "" : ""}>${KINDS.map(([k, l]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const body = `
<section class="card">
  <h2>Add a category</h2>
  <form method="post" action="/admin/categories/add" class="inline-form">
    ${csrf(ctx)}
    <div><label for="new-label">Name</label><input type="text" id="new-label" name="label" maxlength="40" required placeholder="e.g. Dev tools"></div>
    <div><label for="new-kind">Icon style</label>${kindSel("line")}</div>
    <div><button class="btn btn-primary" type="submit">${I("plus")} Add category</button></div>
  </form>
  <p class="hint">The style decides how icons uploaded to this category are cleaned. It does not affect icons already saved.</p>
</section>
<section class="card">
  <h2>Categories</h2>
  <p class="hint">Icons without a category, and icons from a category you remove, are moved to <strong>Extras</strong>. Extras always exists and cannot be removed.</p>
  <div class="table-scroll"><table>
    <thead><tr><th>Name</th><th>Icon style</th><th class="num">Icons</th><th></th></tr></thead>
    <tbody>${categories.map((c) => c.locked
      ? `<tr><td><strong>${esc(c.label)}</strong> <span class="pill off">built in</span></td><td>Catch-all</td><td class="num"><a href="/admin/icons?category=${esc(c.id)}">${c.total}</a></td><td class="muted">Cannot be changed</td></tr>`
      : `<tr>
      <td colspan="2"><form method="post" action="/admin/categories/update" class="inline-form tight">${csrf(ctx)}<input type="hidden" name="id" value="${esc(c.id)}">
        <input type="text" name="label" value="${esc(c.label)}" maxlength="40" required aria-label="Name of ${esc(c.label)}">${kindSel(c.kind)}<button class="btn btn-sm btn-secondary" type="submit">Save</button></form></td>
      <td class="num"><a href="/admin/icons?category=${esc(c.id)}">${c.total}</a></td>
      <td><form method="post" action="/admin/categories/remove" data-confirm="Remove the category &quot;${esc(c.label)}&quot;? ${c.total} icon(s) will be moved to Extras.">${csrf(ctx)}<input type="hidden" name="id" value="${esc(c.id)}"><button class="btn btn-sm btn-danger" type="submit">${I("trash")} Remove</button></form></td>
    </tr>`).join("")}</tbody>
  </table></div>
  <p class="hint">Categories are stored on this server. Icon files and their public URLs (<code>/i/ui/home.svg</code>) never change when you move or remove a category. Hidden icons are counted here too.</p>
</section>`;
  return ({ title: "Categories", active: "categories", body, query });
}

function syncPage(ctx, { sync, cfg, customCount, query }) {
  const I = (n) => icon(ctx.catalog, n);
  const body = `
<section class="card">
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
  <form method="post" action="/admin/sync/run">${csrf(ctx)}<button class="btn btn-primary" type="submit"${sync.mode === "bundled" ? " disabled" : ""}>${I("refresh")} Sync now</button></form>
  ${sync.mode === "bundled" ? '<p class="hint">Set <code>ICONS_REPO_URL</code> (or <code>ICONS_UPSTREAM</code>) in the stack environment to enable syncing.</p>' : ""}
</section>
<section class="card">
  <h2>Export</h2>
  <p>Icons you add or edit here live in this server's data volume. To make them part of your open-source repository, export them and commit them.</p>
  <p><a class="btn btn-primary" href="/admin/export.zip?scope=custom">${I("download")} Export added &amp; edited icons (${customCount})</a>
  <a class="btn btn-secondary" href="/admin/export.zip?scope=all">${I("download")} Export every icon</a></p>
  <ol class="steps">
    <li>Unzip into your repository so the files land in <code>icons/&lt;set&gt;/&lt;name&gt;.svg</code>.</li>
    <li>Run <code>node scripts/validate.mjs</code>, then commit and push.</li>
    <li>After the next sync the repository copy is used. You can then delete the local copy here, or leave it as an override.</li>
  </ol>
</section>
<section class="card">
  <h2>Instant updates (webhook)</h2>
  <p>${cfg.SYNC_TOKEN ? "Webhook sync is enabled." : "Webhook sync is off. Set <code>SYNC_TOKEN</code> to enable it."} Point a push webhook at <code>${esc(ctx.base)}/_sync</code> using the token as the secret. GitHub, Gitea and Forgejo signatures are accepted.</p>
</section>`;
  return ({ title: "Sync & export", active: "sync", body, query });
}


module.exports = { iconsList, addIcons, editIcon, categoriesPage, syncPage };
