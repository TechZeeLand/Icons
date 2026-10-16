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

/** Page inside the shared TZL shell. o: title, description, body, wide, path, noindex, head. Returns { html, csp }. */
function layout(ctx, o) {
  const { Layout, Kit } = require("../tzl");
  const cfg = { base: ctx.base };
  const main = `<main id="main-content" class="${o.wide ? "wide-main ic" : "content-wrap"}">\n${o.body}\n</main>`
    + `<script type="application/json" id="zi-config">${jsonForScript(cfg)}</script>`;
  return Layout.render(ctx, {
    title: o.title || "", desc: o.description || "", main, noindex: o.noindex, canonical: o.path === undefined ? undefined : (o.path === "/" ? "" : o.path),
    head: o.head || "", css: ["assets/css/icons.css"], js: ["assets/js/site.js", ...(o.scripts || [])].map((x) => x.replace(/^\//, "")),
  });
}

module.exports = { layout, icon, jsonForScript };
