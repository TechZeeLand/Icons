// Icons-specific admin screens (registered through Kit.boot admin_routes / admin_menu / dashboard).
"use strict";
const cfg = require("./lib/config");
const { esc } = require("./lib/http");
const { sanitize } = require("./lib/sanitize");
const { zip } = require("./lib/zip");
const sync = require("./lib/sync");
const { Kit, Site, Admin, Ui, Stats, store, H } = require("./tzl");
const V = require("./admin-icons.views");

module.exports = function make(catalog) {
  const styleOf = (catId) => ({ line: "ui", brand: "social", free: "other" })[(catalog.category(catId) || {}).kind] || "other";
  const view = (c, v, extra = {}) => { c.ctx.catalog = catalog; c.ctx.cacheMaxAge = cfg.CACHE_MAX_AGE; const r = v(c.ctx, { query: c.query, ...extra }); Admin.page(c, r.title, r.active, r.body, "", true); };
  const done = (c, to, kind, msg) => { Admin.flash(c, kind, Kit.e(msg)); H.redirect(c.res, to); };
  const log = (c, m) => store.log(m, c.sess.user);
  const R = {};

  R["GET /admin/icons"] = (c) => {
    const q = (c.query.q || "").toLowerCase().trim(), category = c.query.category || "", source = c.query.source || "";
    const terms = q.split(/[\s,]+/).filter(Boolean);
    const entries = catalog.all.filter((e) => (!category || e.category === category) && (!source || (source === "hidden" ? e.hidden : e.source === source)) && terms.every((t) => e.name.includes(t) || e.tags.some((x) => x.includes(t))));
    view(c, (ctx, o) => V.iconsList(ctx, { entries, q, category, source, page: parseInt(c.query.page, 10) || 1, ...o }));
  };
  R["GET /admin/icons/edit"] = (c) => {
    const entry = catalog.byKey.get(c.query.key || "");
    if (!entry) return done(c, "/admin/icons", "err", "Icon not found");
    view(c, (ctx, o) => V.editIcon(ctx, { entry, ...o }));
  };
  R["POST /admin/icons/save"] = (c) => {
    const entry = catalog.byKey.get(c.body.key || "");
    if (!entry) return done(c, "/admin/icons", "err", "Icon not found");
    const back = `/admin/icons/edit?key=${encodeURIComponent(entry.key)}`;
    const src = String(c.body.svg || "");
    if (src.trim() && src.trim() !== entry.svg.trim()) {
      const out = sanitize(src, { set: styleOf(entry.category) });
      if (out.errors.length) return done(c, back, "err", out.errors[0]);
      catalog.saveCustom(entry.set, entry.name, out.svg);
    }
    catalog.setTags(entry.key, String(c.body.tags || "").split(","));
    if (c.body.category && c.body.category !== entry.category && catalog.category(c.body.category)) catalog.setCategory(entry.key, c.body.category);
    log(c, `Edited icon ${entry.key}`);
    done(c, back, "ok", "Saved");
  };
  R["POST /admin/icons/visibility"] = (c) => {
    const entry = catalog.byKey.get(c.body.key || "");
    if (!entry) return done(c, "/admin/icons", "err", "Icon not found");
    catalog.setHidden(entry.key, c.body.hidden === "1");
    log(c, `${c.body.hidden === "1" ? "Hid" : "Showed"} icon ${entry.key}`);
    done(c, `/admin/icons/edit?key=${encodeURIComponent(entry.key)}`, "ok", c.body.hidden === "1" ? "Icon hidden from the site" : "Icon is visible again");
  };
  R["POST /admin/icons/delete"] = (c) => {
    const key = c.body.key || "";
    if (!catalog.byKey.get(key) || !catalog.deleteCustom(key)) return done(c, "/admin/icons", "err", "Only icons added or edited here can be deleted");
    log(c, `Deleted or reverted icon ${key}`);
    const still = catalog.byKey.has(key);
    done(c, still ? `/admin/icons/edit?key=${encodeURIComponent(key)}` : "/admin/icons", "ok", still ? "Reverted to the repository version" : "Icon deleted");
  };
  R["GET /admin/add"] = (c) => {
    c.ctx.catalog = catalog;
    const r = V.addIcons(c.ctx, { categories: catalog.categoryList(), query: c.query });
    Admin.page(c, r.title, r.active, r.body + `<script type="application/json" id="zi-admin-data">${JSON.stringify({ csrf: c.sess.csrf }).replace(/</g, "\\u003c")}</script>`, "", true);
  };
  const apiIcons = (saving) => (c) => {
    const cat = catalog.category(String(c.body.category || ""));
    if (!cat) return H.json(c.req, c.res, 400, { error: "Unknown category" });
    const set = cat.id, style = styleOf(cat.id);
    const items = Array.isArray(c.body.items) ? c.body.items.slice(0, 200) : [];
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
    if (!saving) return H.json(c.req, c.res, 200, { items: results });
    const saved = [], failed = [];
    for (const r of results) {
      if (r.nameError || r.errors.length || !r.svg) failed.push({ name: r.name, error: r.nameError || r.errors[0] || "Invalid" });
      else if (r.exists && !c.body.overwrite) failed.push({ name: r.name, error: "Already exists" });
      else { try { catalog.saveCustom(set, r.name, r.svg); saved.push(r.name); } catch (e) { failed.push({ name: r.name, error: e.message }); } }
    }
    if (saved.length) log(c, `Saved ${saved.length} icon(s) to ${set}`);
    H.json(c.req, c.res, 200, { saved, failed });
  };
  R["POST /admin/api/icons/check"] = apiIcons(false);
  R["POST /admin/api/icons"] = apiIcons(true);
  R["GET /admin/sync"] = (c) => view(c, (ctx, o) => V.syncPage(ctx, { sync: sync.state, cfg, customCount: catalog.customEntries().length, ...o }));
  R["POST /admin/sync/run"] = async (c) => {
    const r = await sync.run(catalog);
    log(c, "Ran icon sync");
    if (r.error) return done(c, "/admin/sync", "err", `Sync failed: ${r.error}`);
    done(c, "/admin/sync", "ok", r.skipped ? r.skipped : r.changed ? `Synced. ${catalog.list.length} icons are now live.` : "Already up to date.");
  };
  R["GET /admin/export.zip"] = (c) => {
    const all = c.query.scope === "all";
    const entries = all ? catalog.list : catalog.customEntries();
    if (!entries.length) return done(c, "/admin/sync", "err", "There are no added or edited icons to export");
    const files = entries.map((e) => ({ name: `icons/${e.set}/${e.name}.svg`, data: e.svg }));
    files.push({ name: "categories.json", data: JSON.stringify({ categories: catalog.categoryList().map(({ id, label, kind }) => ({ id, label, kind })), assignments: Object.fromEntries(entries.map((e) => [e.key, e.category])) }, null, 2) });
    log(c, `Exported ${all ? "all" : "custom"} icons`);
    H.send(c.req, c.res, 200, zip(files), { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="icons-${all ? "all" : "custom"}-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store", "Access-Control-Allow-Origin": null }, { compress: false });
  };
  R["GET /admin/categories"] = (c) => view(c, (ctx, o) => V.categoriesPage(ctx, { categories: catalog.categories(), ...o }));
  R["POST /admin/categories/add"] = (c) => {
    try { const id = catalog.addCategory(c.body.label, c.body.kind); log(c, `Added category ${id}`); done(c, "/admin/categories", "ok", `Category "${catalog.category(id).label}" created`); } catch (e) { done(c, "/admin/categories", "err", e.message); }
  };
  R["POST /admin/categories/update"] = (c) => { try { catalog.updateCategory(c.body.id, c.body.label, c.body.kind); done(c, "/admin/categories", "ok", "Category updated"); } catch (e) { done(c, "/admin/categories", "err", e.message); } };
  R["POST /admin/categories/remove"] = (c) => {
    try { const label = (catalog.category(c.body.id) || {}).label; const n = catalog.removeCategory(c.body.id); log(c, `Removed category ${label}`); done(c, "/admin/categories", "ok", `Category "${label}" removed. ${n} icon${n === 1 ? "" : "s"} moved to Extras.`); } catch (e) { done(c, "/admin/categories", "err", e.message); }
  };

  // Delivery & caching (the settings that only exist for Icons)
  R["GET /admin/delivery"] = (c) => {
    const s = Site.all();
    let h = `<form method="post" action="/admin/delivery" class="admin-form">${Admin.field(c)}`;
    h += Ui.card("Caching", "zap", Ui.text("Browser cache lifetime (seconds)", "cache_max_age", s.cache_max_age || 0, { type: "number", min: 0, max: 31536000, narrow: true, hint: `How long browsers and CDNs may reuse an icon without asking again. <code>0</code> uses the <code>CACHE_MAX_AGE</code> environment value (${cfg.CACHE_MAX_AGE} s). Longer is faster; shorter picks up changes sooner.` }));
    h += Ui.card("License page note", "scale", Ui.area("Extra text shown at the top of the License page", "license_note", s.license_note || "", { rows: 4, maxlength: 1000, placeholder: "For example, any additional permission you grant to people who embed the icons in their projects." }));
    h += `<div class="form-actions"><button class="btn btn-primary" type="submit">${Kit.icon("save")} Save</button></div></form>`;
    Admin.page(c, "Delivery & caching", "delivery", h);
  };
  R["POST /admin/delivery"] = (c) => {
    Site.save({ cache_max_age: Math.min(31536000, Math.max(0, parseInt(c.body.cache_max_age, 10) || 0)), license_note: Admin.raw(c, "license_note", 1000).trim() });
    log(c, "Updated delivery settings");
    done(c, "/admin/delivery", "ok", "Settings saved");
  };

  const menu = {
    icons: ["/admin/icons", "Icons", "grid"], add: ["/admin/add", "Add icons", "upload"], categories: ["/admin/categories", "Categories", "tag"],
    sync: ["/admin/sync", "Sync & export", "cloud-download"], delivery: ["/admin/delivery", "Delivery & caching", "zap"],
  };
  const dashboard = (days) => {
    const hidden = catalog.all.filter((e) => e.hidden).length, custom = catalog.all.filter((e) => e.source !== "repo").length;
    const served = Stats.sumEvent(days, "icon"), s = sync.state;
    const top = Stats.topEventKeys(days, "icon", 8);
    const src = `<table class="data-table"><tbody><tr><th>Mode</th><td>${esc(s.mode)}</td></tr><tr><th>Version</th><td><code>${esc(catalog.version)}</code></td></tr><tr><th>Revision</th><td>${esc(s.rev || "n/a")}</td></tr><tr><th>Last sync</th><td>${s.lastOk ? esc(s.lastOk) : "never"}</td></tr><tr><th>Status</th><td>${s.error ? `<span class="badge badge-warn">${esc(s.error)}</span>` : '<span class="badge badge-ok">OK</span>'}</td></tr></tbody></table><p><a class="btn btn-secondary" href="/admin/sync">${Kit.icon("cloud-download")} Sync &amp; export</a> <a class="btn btn-primary" href="/admin/add">${Kit.icon("plus")} Add icons</a></p>`;
    return {
      cards: [["grid", Kit.number(catalog.list.length), "public icons"], ["upload", Kit.number(custom), "added or edited here"], ["eye-off", Kit.number(hidden), "hidden"], ["download", Kit.number(served), "icons served, 14 days"]],
      html: `<div class="admin-cols">${Ui.card("Most requested icons", "trophy", Ui.rank(top, (k) => `<a href="/admin/icons/edit?key=${encodeURIComponent(k)}">${esc(k)}</a>`))}${Ui.card("Icon source", "git-branch", src)}</div>`,
    };
  };
  return { routes: R, menu, dashboard };
};
