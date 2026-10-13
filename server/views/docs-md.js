// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

/** The documentation as one self-contained Markdown file, with this server's URL filled in and every icon name listed. */
function docsMarkdown(ctx) {
  const { catalog, settings } = ctx;
  const B = ctx.base;
  const host = B.replace(/^https?:\/\//, "");
  const site = settings.site_name;
  const maxAge = Number(settings.cache_max_age) || ctx.cacheMaxAge;
  const fence = (lang, text) => "```" + lang + "\n" + String(text).replace(/^\n/, "").replace(/\s+$/, "") + "\n```\n";
  const date = new Date().toISOString().slice(0, 10);

  const lists = catalog.categories().filter((c) => c.count > 0).map((c) => {
    const items = catalog.list.filter((e) => e.category === c.id);
    const names = items.map((e) => "`" + (e.set === "other" ? e.name : "zi-" + e.name) + "`").join(" · ");
    const note = items.some((e) => e.set === "other") ? "\n\n_Fixed-colour artwork has no `zi-` class. Use it as an image: `" + B + "/i/<set>/<name>.svg`._" : "";
    return `### ${c.label} (${items.length})\n\n${names}${note}\n`;
  }).join("\n");

  return `# ${site} documentation

${settings.tagline}

- Service: ${B}
- Icons: ${catalog.list.length}
- Generated: ${date}
- License: GNU AGPL-3.0-or-later

## Contents

1. [Quick start](#quick-start)
2. [CSS classes](#css-classes)
3. [Web component](#web-component)
4. [Image tags](#image-tags-and-css-backgrounds)
5. [JavaScript API](#javascript-api)
6. [React, Vue and other frameworks](#react-vue-and-other-frameworks)
7. [Size, colour and stroke](#size-colour-and-stroke)
8. [Caching and freshness](#caching-and-freshness)
9. [Host your own cache](#host-your-own-cache)
10. [PHP](#php)
11. [URL reference](#url-reference)
12. [All icon names](#all-icon-names)
13. [Accessibility](#accessibility)
14. [Licensing](#licensing)

## Quick start

Pick one. They all load the same icons. Find an icon name in the browser at ${B}/icons.

CSS class:

${fence("html", `<link rel="stylesheet" href="${B}/zi.css">\n\n<i class="zi zi-home"></i>`)}
Web component:

${fence("html", `<script src="${B}/icons.js" defer></script>\n\n<svg-icon name="home"></svg-icon>`)}
Image:

${fence("html", `<img src="${B}/i/ui/home.svg" width="24" height="24" alt="">`)}
Icon names are lower-case words joined with dashes and are unique across every category, so \`github\` works without saying which set it lives in.

## CSS classes

Add one stylesheet, then use an \`<i>\` element with the classes \`zi\` and \`zi-NAME\`. The icon is drawn with a CSS mask, so it takes the current text colour and scales with the font size.

${fence("html", `<link rel="stylesheet" href="${B}/zi.css">\n\n<button><i class="zi zi-download"></i> Download</button>\n<i class="zi zi-bell zi-lg"></i>\n<i class="zi zi-loader zi-spin"></i>`)}
| Class | Effect |
| --- | --- |
| \`zi\` | Required. 1em square, uses \`currentColor\`. |
| \`zi-lg\` \`zi-xl\` \`zi-2x\` \`zi-3x\` | Larger sizes. |
| \`zi-spin\` | Continuous rotation (slows down for visitors who prefer reduced motion). |

Only the icons you use are downloaded, one small file each, and the browser caches them. Mask icons are single-colour, so multi-colour logos (such as \`google\`) should use the web component or an image tag. For a smaller stylesheet ask for just what you need: \`${B}/zi.css?names=home,user,search\` or one category: \`?category=social\`. The fixed-colour artwork in the \`other\` folder has no class (use the image tag).

## Web component

Include the script once and use \`<svg-icon>\` anywhere. The SVG is placed inline, so CSS can style every part of it.

${fence("html", `<script src="${B}/icons.js" defer></script>\n\n<svg-icon name="settings" size="20"></svg-icon>\n<svg-icon name="github" set="social" size="20"></svg-icon>\n<svg-icon name="heart" stroke="1.5" color="crimson" label="Favourite"></svg-icon>`)}
| Attribute | Default | Meaning |
| --- | --- | --- |
| \`name\` | required | Icon name. |
| \`set\` | any | \`ui\`, \`social\` or \`other\`. Only needed to pick a specific set. |
| \`size\` | \`1em\` | Width and height. Numbers are pixels, or use \`1.5em\`, \`2rem\`. |
| \`stroke\` | icon default | Stroke width for line icons, 0.25 to 4. |
| \`color\` | inherits | Any CSS colour. Usually set \`color\` in CSS instead. |
| \`label\` | none | Accessible name. Without it the icon is hidden from screen readers. |

## Image tags and CSS backgrounds

Every icon is a plain SVG file. An image cannot inherit the text colour, so pass the colour in the URL.

${fence("html", `<img src="${B}/i/ui/bell.svg?size=24&color=0a7d69" width="24" height="24" alt="">`)}
${fence("css", `.alert { background: url("${B}/i/ui/alert-circle.svg?color=c62828") no-repeat; }`)}
## JavaScript API

${fence("js", `const svgText = await Icons.svg('home', { size: 20 });      // string\nconst node    = await Icons.el('github', { set: 'social' });  // SVGElement\nconst url     = Icons.url('home', { size: 24, color: 'e11d48' });\nawait Icons.refresh();   // re-check the server now, drop outdated cached icons\nIcons.clearCache();      // forget everything stored in this browser`)}
## React, Vue and other frameworks

Custom elements work in every framework. Load \`icons.js\` once in your HTML shell and use the tag.

React:

${fence("jsx", `// index.html: <script src="${B}/icons.js" defer></script>\n\nexport function Icon({ name, size = 20, set, label }) {\n  return <svg-icon name={name} size={size} set={set} label={label} />;\n}`)}
Vue:

${fence("html", `<!-- vite.config.js: vue({ template: { compilerOptions: { isCustomElement: t => t === 'svg-icon' } } }) -->\n<svg-icon name="download" size="20" />`)}
Any framework, CSS only:

${fence("html", `<link rel="stylesheet" href="${B}/zi.css">\n<i class="zi zi-download"></i>`)}
## Size, colour and stroke

Icons use \`currentColor\`, so they match the surrounding text. Set \`color\` on the icon or a parent.

${fence("css", `.toolbar { color: #0a7d69; }\n.toolbar a:hover { color: #e11d48; }`)}
URL options: \`size\` (1 to 2048), \`stroke\` (0.25 to 4) and \`color\` (hex without \`#\`, or a colour name). Invalid values return an error.

## Caching and freshness

Icons rarely change, so repeating a download on every page view is wasted time. Three layers:

1. **In the browser.** \`icons.js\` keeps icons in \`localStorage\` for 7 days. Within that window an icon costs no network request. After it, the stored copy is shown instantly and refreshed quietly in the background. Change the window with \`<script src="${B}/icons.js" data-ttl="86400">\` (seconds).
2. **On the wire.** Every response carries \`Cache-Control\` with \`stale-while-revalidate\` and an \`ETag\`, so a refresh is a tiny "not modified" reply.
3. **On your server (optional, fastest).** Mirror the icons onto your own domain (next section).

\`${B}/api/version\` publishes a version fingerprint that changes whenever any icon changes. \`Icons.refresh()\` and the sync tools compare against it and download only what changed.

## Host your own cache

Docker mirror: a copy of this service that pulls from \`${host}\` and serves \`icons.js\`, \`zi.css\` and every icon from your own domain.

${fence("yaml", `services:\n  icons-mirror:\n    image: icon-service:latest   # build from the source repository\n    restart: unless-stopped\n    ports: ["8085:3000"]\n    environment:\n      ICONS_UPSTREAM: ${B}\n      SYNC_INTERVAL_SECONDS: 21600     # re-check every 6 hours\n      ADMIN_ENABLED: "false"\n    volumes: ["mirror-data:/data"]\nvolumes:\n  mirror-data:`)}
Sync script (cron or CI): one dependency-free Node file copies the icons you use into a folder of your site and only downloads what changed.

${fence("bash", `curl -O ${B}/tools/icons-sync.mjs\n\n# once\nnode icons-sync.mjs --out public/icons --sets ui,social\n\n# only the icons you use, plus a local zi.css\nnode icons-sync.mjs --out public/icons --names home,user,search,github --css\n\n# keep running and refresh every 24 hours\nnode icons-sync.mjs --out public/icons --sets ui --every 24h\n\n# crontab: every night at 03:30\n30 3 * * * cd /var/www/mysite && node icons-sync.mjs --out public/icons --sets ui --quiet`)}
Nginx proxy cache:

${fence("nginx", `proxy_cache_path /var/cache/nginx/icons levels=1:2 keys_zone=icons:10m max_size=100m inactive=7d;\n\nserver {\n  location /icons-cdn/ {\n    proxy_pass ${B}/;\n    proxy_ssl_server_name on;\n    proxy_cache icons;\n    proxy_cache_valid 200 1d;\n    proxy_cache_use_stale error timeout updating http_500 http_502 http_503;\n    add_header X-Cache $upstream_cache_status;\n  }\n}`)}
Then use \`/icons-cdn/zi.css\` and \`/icons-cdn/icons.js\`.

Caddy:

${fence("caddy", `example.com {\n  handle_path /icons-cdn/* {\n    reverse_proxy ${B} {\n      header_up Host ${host}\n    }\n  }\n}`)}
## PHP

A one-file helper caches every icon on disk for 24 hours and keeps working from the stale copy if the service is offline.

${fence("php", `require 'RemoteIcon.php';   // download: ${B}/tools/RemoteIcon.php\n\nRemoteIcon::configure('${B}', __DIR__ . '/cache/icons');\n\necho RemoteIcon::svg('home');\necho RemoteIcon::svg('github', ['set' => 'social', 'size' => 20, 'class' => 'me-1']);\necho RemoteIcon::svg('bell', ['size' => 18, 'label' => 'Notifications']);`)}
## URL reference

| URL | Returns |
| --- | --- |
| \`/i/<set>/<name>.svg\` | The icon. Add \`?size=\` \`&stroke=\` \`&color=\`. |
| \`/i/<name>.svg\` | Same, without the set. |
| \`/zi.css\` | Stylesheet for the \`zi\` classes. Optional \`?category=\`, \`?set=\`, \`?names=a,b,c\`. |
| \`/icons.js\` | Browser client (web component and \`Icons\` API). |
| \`/sprite.svg\` | SVG sprite of \`<symbol>\`s with ids like \`ui-home\`. Same origin only. |
| \`/api/icons\` | JSON index with each icon's category. Filter with \`?q=\`, \`?category=\`, \`?set=\`. |
| \`/api/manifest\` | Every icon with a content hash, used by the sync tools. |
| \`/api/version\` | Current version fingerprint. |
| \`/tools/icons-sync.mjs\` | The sync script. |

All endpoints allow cross-origin requests and are cached for ${Math.round(maxAge / 3600)} hour(s) by default. Base URL: ${B}

## All icon names

${catalog.list.length} icons. Use the class as shown, for example \`<i class="zi zi-home"></i>\`. Drop the \`zi-\` prefix for the web component, the URLs and the JavaScript API: \`<svg-icon name="home">\`.

${lists}
## Accessibility

- Decorative icons next to text need nothing. \`<svg-icon>\` and \`zi\` icons are hidden from assistive technology by default.
- An icon that stands alone needs a name: use \`label="Search"\`, or put \`aria-label\` on the button and keep the icon decorative.
- Do not use colour alone to convey meaning. Pair icons with text where it matters.

## Licensing

The icons, the server and the website are licensed under the GNU AGPL-3.0-or-later (https://www.gnu.org/licenses/agpl-3.0.html). See ${B}/license for a plain-language summary and attribution notes. Brand logos in the \`social\` set belong to their owners.

---

${site}. Questions: ${settings.contact_email}
`;
}

module.exports = { docsMarkdown };
