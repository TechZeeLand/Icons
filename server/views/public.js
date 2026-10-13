// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const { esc } = require("../lib/http");
const { icon } = require("./layout");

const code = (text, label) =>
  `${label ? `<p class="code-label">${esc(label)}</p>` : ""}<div class="code"><button type="button" class="copy">Copy</button><pre><code>${esc(String(text).replace(/^\n/, "").replace(/\s+$/, ""))}</code></pre></div>`;

function tabs(items) {
  return `<div class="tabs" data-tabs>
  <div class="tab-list" role="tablist">${items.map((t, i) => `<button type="button" class="tab" role="tab" aria-selected="${i === 0}">${esc(t.label)}</button>`).join("")}</div>
  ${items.map((t) => `<div class="tab-panel" role="tabpanel" data-title="${esc(t.label)}">${t.html}</div>`).join("")}
</div>`;
}

const SHOWCASE = ["home", "search", "heart", "bell", "mail", "user", "settings", "cloud", "download", "terminal", "rocket", "shield-check", "palette", "globe", "camera", "music", "gamepad", "dumbbell", "map-pin", "calendar", "lock", "star-filled", "github", "sparkles", "cpu", "server", "database", "code"];

function home(ctx) {
  const { catalog, settings } = ctx;
  const I = (n, c) => icon(catalog, n, c);
  const catCount = catalog.categories().filter((c) => c.count > 0).length;
  const shown = SHOWCASE.filter((n) => catalog.find(null, n)).slice(0, 28);
  const B = ctx.base;
  const feature = (ic, title, text) => `<div class="feature"><div class="ficon">${I(ic)}</div><h3>${title}</h3><p>${text}</p></div>`;
  const body = `
<section class="hero">
    <span class="hero-badge">${I("sparkles")} Free &amp; open source · AGPL-3.0</span>
    <h1>Icons you can <em>actually own</em></h1>
    <p>${esc(settings.tagline)} Drop in one line, or host the icons on your own server so your pages never wait on ours.</p>
    <form class="hero-search" action="/icons" method="get" role="search">
        <input type="search" name="q" placeholder="Search ${catalog.list.length} icons…" aria-label="Search icons" autocomplete="off">
        <button class="btn btn-primary" type="submit">${I("search")} Search</button>
    </form>
    <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="/docs#quick-start">${I("rocket")} Get started</a>
        <a class="btn btn-secondary btn-lg" href="/icons">${I("grid")} Browse icons</a>
    </div>
    <div class="stats-row">
        <span><strong>${catalog.list.length}</strong>icons</span>
        <span><strong>${catCount}</strong>categories</span>
        <span><strong>0</strong>trackers</span>
        <span><strong>1</strong>line to install</span>
    </div>
</section>

<div class="showcase" aria-label="Icon preview">
${shown.map((n) => { const e = catalog.find(null, n); return `<a href="/icons#${e.set}/${n}" title="${n}" aria-label="${n}">${I(n)}</a>`; }).join("\n")}
</div>

<section class="section">
    <h2>Get started in 30 seconds</h2>
    <p class="sub">No account, no kit ID, no build step. Pick the style you already know.</p>
    ${tabs([
      { label: "CSS class", html: code(`<link rel="stylesheet" href="${B}/zi.css">\n\n<i class="zi zi-home"></i>\n<i class="zi zi-heart zi-2x" style="color:#e11d48"></i>`) },
      { label: "Web component", html: code(`<script src="${B}/icons.js" defer></script>\n\n<svg-icon name="home" size="24"></svg-icon>\n<svg-icon name="github" set="social"></svg-icon>`) },
      { label: "Image tag", html: code(`<img src="${B}/i/ui/home.svg?size=24&color=0a7d69" width="24" height="24" alt="">`) },
      { label: "Self-hosted cache", html: code(`curl -O ${B}/tools/icons-sync.mjs\nnode icons-sync.mjs --out public/icons --sets ui --every 24h`) },
    ])}
    <p style="text-align:center;margin-top:10px"><a href="/docs">Read the full documentation →</a></p>
</section>

<section class="section">
    <h2>Built to be fast, and to stay out of your way</h2>
    <p class="sub">Everything you would expect from an icon library, plus the parts that keep your site quick.</p>
    <div class="features">
        ${feature("zap", "Cached at every level", "Browsers keep icons for days, servers send ETags, and you can mirror the whole set on your own domain so visitors never touch ours.")}
        ${feature("refresh", "Refreshes itself", "Cached icons are revalidated in the background on a schedule, so fixes and new icons reach your site without a redeploy.")}
        ${feature("palette", "Follows your theme", "Icons use currentColor, so light and dark mode, hover states and brand colours just work. Size and stroke are one attribute away.")}
        ${feature("shield-check", "Private by design", "No accounts, no cookies, no analytics scripts, no IP logging. Only anonymous daily counters on the server.")}
        ${feature("code", "Works everywhere", "Plain HTML, CSS classes, a web component, a JavaScript API, or a PHP helper. Frameworks need nothing special.")}
        ${feature("git-branch", "Open all the way down", "The icons, the server and this website are AGPL-3.0 licensed. Fork it, host it, send a pull request.")}
    </div>
</section>

<section class="section">
    <div class="cta">
        <h2>Ready to use them?</h2>
        <p>Browse ${catalog.list.length} icons, copy a snippet, and ship.</p>
        <a class="btn btn-primary btn-lg" href="/icons">${I("grid")} Open the icon browser</a>
    </div>
</section>`;
  return { title: "", description: `${settings.tagline} ${catalog.list.length} SVG icons under AGPL-3.0.`, body, wide: true, path: "/" };
}

function iconsPage(ctx) {
  const { catalog } = ctx;
  const I = (n, c) => icon(catalog, n, c);
  const body = `
<div id="gallery">
    <div class="gallery-head">
        <h1>Icons</h1>
        <p>Click an icon to copy a ready-made snippet. Size, stroke and colour below update the preview and the snippets.</p>
    </div>
    <div class="toolbar">
        <input id="q" class="grow" type="search" placeholder="Search by name or tag…" autocomplete="off" aria-label="Search icons">
        <select id="set" aria-label="Icon category"><option value="">All categories</option></select>
        <label>Size <input id="size" type="number" min="12" max="64" value="28"></label>
        <label>Stroke <input id="stroke" type="number" min="0.5" max="3" step="0.25" value="2"></label>
        <label>Colour <input id="color" type="color" value="#0a7d69"></label>
        <button id="reset" type="button" class="btn btn-secondary">Reset</button>
    </div>
    <p id="meta" class="meta">Loading…</p>
    <div id="grid" class="icon-grid" role="list"></div>
</div>
<dialog id="dlg" aria-labelledby="dname">
    <div class="big"><svg id="bigsvg" viewBox="0 0 24 24" aria-hidden="true"><use id="biguse"/></svg></div>
    <h2 id="dname"></h2><p id="dset" class="dlg-sub"></p>
    <div id="snips"></div>
    <div class="dlg-actions"><a id="dl" class="btn btn-secondary" href="#">${I("download")} Download SVG</a><button id="close" type="button" class="btn btn-secondary">Close</button></div>
</dialog>
<noscript><p class="empty">The icon browser needs JavaScript. You can still list every icon at <a href="/api/icons">/api/icons</a>.</p></noscript>`;
  return { title: "Icons", description: `Browse and copy ${catalog.list.length} free, open-source SVG icons.`, body, wide: true, path: "/icons" };
}

function docs(ctx) {
  const { catalog, settings } = ctx;
  const B = ctx.base;
  const host = B.replace(/^https?:\/\//, "");
  const sections = [
    ["quick-start", "Quick start"], ["css-classes", "CSS classes"], ["web-component", "Web component"], ["images", "Image tags"],
    ["javascript", "JavaScript API"], ["frameworks", "React, Vue and others"], ["customising", "Size, colour and stroke"],
    ["caching", "Caching and freshness"], ["self-host", "Host your own cache"], ["php", "PHP"], ["api", "URL reference"], ["icon-names", "All icon names"],
    ["accessibility", "Accessibility"], ["licensing", "Licensing"],
  ];
  const nameLists = catalog.categories().filter((c) => c.count > 0).map((c) => {
    const items = catalog.list.filter((e) => e.category === c.id);
    return `<section class="name-cat" data-cat><h3>${esc(c.label)} <span class="badge">${items.length}</span></h3>
    <div class="name-grid">${items.map((e) => {
      const mono = e.set !== "other";
      const label = mono ? `zi-${e.name}` : e.name;
      return `<button type="button" class="name-chip" data-name="${esc(e.name)}" data-tags="${esc(e.tags.join(" "))}" data-copy="${esc(label)}" title="${mono ? "Copy the class name" : "Fixed-colour artwork: use it as an image or with &lt;svg-icon&gt;; there is no zi- class"}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#${esc(e.set)}-${esc(e.name)}"/></svg><code>${esc(label)}</code></button>`;
    }).join("")}</div></section>`;
  }).join("\n");
  const tocList = sections.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("");
  const body = `
<div class="docs">
  <aside class="docs-toc" aria-label="On this page"><h3>On this page</h3><ul>${tocList}</ul></aside>
  <div class="docs-body">
    <details class="docs-mobile-toc"><summary>On this page</summary><ul>${tocList}</ul></details>
    <div class="docs-head">
      <h1>Documentation</h1>
      <a class="btn btn-secondary" href="/docs.md" download>${icon(catalog, "download")} Download as Markdown</a>
    </div>
    <p class="content-lede">Everything you need to use ${esc(settings.site_name)} in your own projects. If you have used Font Awesome, the CSS class method will feel familiar, with no kit script and no account.</p>

    <h2 id="quick-start">Quick start</h2>
    <p>Pick one of these. They all load the same icons.</p>
    ${tabs([
      { label: "CSS class", html: code(`<link rel="stylesheet" href="${B}/zi.css">\n\n<i class="zi zi-home"></i>`) },
      { label: "Web component", html: code(`<script src="${B}/icons.js" defer></script>\n\n<svg-icon name="home"></svg-icon>`) },
      { label: "Image", html: code(`<img src="${B}/i/ui/home.svg" width="24" height="24" alt="">`) },
    ])}
    <p>Live result: <span class="live-demo" style="display:inline-flex;padding:4px 12px;margin:0;font-size:1.3rem"><i class="zi zi-home"></i><i class="zi zi-heart"></i><i class="zi zi-star-filled"></i><i class="zi zi-rocket"></i></span> (this page loads <code>zi.css</code> from this server.)</p>
    <p>Find the name of any icon in the <a href="/icons">icon browser</a>. Icon names are lower-case words joined with dashes, and they are unique across every set, so <code>github</code> works without saying which set it lives in.</p>

    <h2 id="css-classes">CSS classes <span class="badge">Font Awesome style</span></h2>
    <p>Add one stylesheet, then use an <code>&lt;i&gt;</code> element with the classes <code>zi</code> and <code>zi-NAME</code>. The icon is drawn with a CSS mask, so it takes the current text colour and scales with the font size.</p>
    ${code(`<link rel="stylesheet" href="${B}/zi.css">\n\n<button><i class="zi zi-download"></i> Download</button>\n<i class="zi zi-bell zi-lg"></i>\n<i class="zi zi-loader zi-spin"></i>`)}
    <table><thead><tr><th>Class</th><th>Effect</th></tr></thead><tbody>
      <tr><td><code>zi</code></td><td>Required. 1em square, uses <code>currentColor</code>.</td></tr>
      <tr><td><code>zi-lg</code> <code>zi-xl</code> <code>zi-2x</code> <code>zi-3x</code></td><td>Larger sizes.</td></tr>
      <tr><td><code>zi-spin</code></td><td>Continuous rotation (slows down for visitors who prefer reduced motion).</td></tr>
    </tbody></table>
    <div class="callout"><strong>Good to know</strong>Only the icons you actually use are downloaded, one small file each, and the browser caches them. Mask icons are single-colour, so multi-colour logos (such as <code>google</code>) should use the web component or an image tag. Want a smaller stylesheet? Ask for just what you need: <code>${esc(B)}/zi.css?names=home,user,search</code> or one category: <code>?category=social</code>. The fixed-colour artwork in the <code>other</code> folder has no class (use the image tag).</div>

    <h2 id="web-component">Web component</h2>
    <p>Include the script once and use <code>&lt;svg-icon&gt;</code> anywhere. The SVG is placed inline in the page, so CSS can style every part of it.</p>
    ${code(`<script src="${B}/icons.js" defer></script>\n\n<svg-icon name="settings" size="20"></svg-icon>\n<svg-icon name="github" set="social" size="20"></svg-icon>\n<svg-icon name="heart" stroke="1.5" color="crimson" label="Favourite"></svg-icon>`)}
    <table><thead><tr><th>Attribute</th><th>Default</th><th>Meaning</th></tr></thead><tbody>
      <tr><td><code>name</code></td><td>required</td><td>Icon name.</td></tr>
      <tr><td><code>set</code></td><td>any</td><td><code>ui</code>, <code>social</code> or <code>other</code>. Only needed to pick a specific set.</td></tr>
      <tr><td><code>size</code></td><td><code>1em</code></td><td>Width and height. Numbers are pixels, or use <code>1.5em</code>, <code>2rem</code>.</td></tr>
      <tr><td><code>stroke</code></td><td>icon default</td><td>Stroke width for line icons, 0.25 to 4.</td></tr>
      <tr><td><code>color</code></td><td>inherits</td><td>Any CSS colour. Usually you set <code>color</code> in CSS instead.</td></tr>
      <tr><td><code>label</code></td><td>none</td><td>Accessible name. Without it the icon is hidden from screen readers.</td></tr>
    </tbody></table>

    <h2 id="images">Image tags and CSS backgrounds</h2>
    <p>Every icon is a plain SVG file, so <code>&lt;img&gt;</code> and CSS <code>background-image</code> work. An image cannot inherit the text colour, so pass the colour in the URL.</p>
    ${code(`<img src="${B}/i/ui/bell.svg?size=24&color=0a7d69" width="24" height="24" alt="">\n\n.alert { background: url("${B}/i/ui/alert-circle.svg?color=c62828") no-repeat; }`)}

    <h2 id="javascript">JavaScript API</h2>
    <p><code>icons.js</code> also exposes a small <code>Icons</code> object:</p>
    ${code(`const svgText = await Icons.svg('home', { size: 20 });      // string\nconst node    = await Icons.el('github', { set: 'social' });  // SVGElement\nconst url     = Icons.url('home', { size: 24, color: 'e11d48' });\nawait Icons.refresh();   // re-check the server now, drop outdated cached icons\nIcons.clearCache();      // forget everything stored in this browser`)}

    <h2 id="frameworks">React, Vue and other frameworks</h2>
    <p>Custom elements work in every framework, so there is nothing to install. Load <code>icons.js</code> once in your HTML shell and use the tag.</p>
    ${tabs([
      { label: "React", html: code(`// index.html: <script src="${B}/icons.js" defer></script>\n\nexport function Icon({ name, size = 20, set, label }) {\n  return <svg-icon name={name} size={size} set={set} label={label} />;\n}\n\n<button><Icon name="download" /> Download</button>`) },
      { label: "Vue", html: code(`<!-- index.html: <script src="${B}/icons.js" defer></script> -->\n<!-- vite.config.js: vue({ template: { compilerOptions: { isCustomElement: t => t === 'svg-icon' } } }) -->\n\n<svg-icon name="download" size="20" />`) },
      { label: "Svelte / Astro / plain HTML", html: code(`<svg-icon name="download" size="20"></svg-icon>`) },
      { label: "CSS only", html: code(`/* any framework: just add the stylesheet */\n<link rel="stylesheet" href="${B}/zi.css">\n<i class="zi zi-download"></i>`) },
    ])}

    <h2 id="customising">Size, colour and stroke</h2>
    <p>Icons use <code>currentColor</code>, so they match the text around them. Set <code>color</code> on the icon or a parent:</p>
    ${code(`.toolbar { color: #0a7d69; }\n.toolbar a:hover { color: #e11d48; }\n[data-theme="dark"] .toolbar { color: #3ce9be; }`)}
    <p>Server-side options for the URL form: <code>size</code> (1 to 2048), <code>stroke</code> (0.25 to 4) and <code>color</code> (hex without <code>#</code>, or a colour name). Invalid values return an error instead of guessing.</p>

    <h2 id="caching">Caching and freshness</h2>
    <p>Icons rarely change, so repeating a download on every page view is wasted time. ${esc(settings.site_name)} avoids that in three layers. You get the first two automatically.</p>
    <ol>
      <li><strong>In the browser.</strong> <code>icons.js</code> keeps icons in <code>localStorage</code> for 7 days. Within that window an icon costs no network request at all. After it, the stored copy is shown instantly and refreshed quietly in the background. Change the window with <code>&lt;script src="…/icons.js" data-ttl="86400"&gt;</code> (seconds).</li>
      <li><strong>On the wire.</strong> Every response carries <code>Cache-Control</code> with <code>stale-while-revalidate</code> and an <code>ETag</code>, so browsers and CDNs reuse files and a refresh is a tiny "not modified" reply.</li>
      <li><strong>On your server (optional, fastest).</strong> Mirror the icons onto your own domain, see <a href="#self-host">Host your own cache</a>. Your visitors then never contact this server, and your mirror still picks up changes on a schedule you choose.</li>
    </ol>
    <div class="callout"><strong>How updates reach you</strong>The service publishes a version fingerprint at <code>/api/version</code> that changes whenever any icon changes. <code>Icons.refresh()</code> and the sync tools compare against it, and download only what changed.</div>

    <h2 id="self-host">Host your own cache</h2>
    <p>Pick the option that fits your hosting. All of them refresh on a timer, so you get new and fixed icons without a redeploy.</p>
    ${tabs([
      { label: "Docker mirror", html: `<p>Run a copy of this service that pulls from <code>${esc(host)}</code>. Point your sites at your own host and you are done. It serves <code>icons.js</code>, <code>zi.css</code> and every icon, with the same URLs.</p>${code(`services:\n  icons-mirror:\n    image: ghcr.io/your-org/icon-service:latest   # or build from the source repository\n    restart: unless-stopped\n    ports: ["8085:3000"]\n    environment:\n      ICONS_UPSTREAM: ${B}\n      SYNC_INTERVAL_SECONDS: 21600     # re-check every 6 hours\n      ADMIN_ENABLED: "false"\n    volumes: ["mirror-data:/data"]\nvolumes:\n  mirror-data:`)}` },
      { label: "Sync script (cron)", html: `<p>One dependency-free Node file copies the icons you use into a folder of your site. Run it on a schedule, and only changed icons are downloaded.</p>${code(`curl -O ${B}/tools/icons-sync.mjs\n\n# once\nnode icons-sync.mjs --out public/icons --sets ui,social\n\n# only the icons you use, plus a local zi.css\nnode icons-sync.mjs --out public/icons --names home,user,search,github --css\n\n# or keep it running and refresh every 24 hours\nnode icons-sync.mjs --out public/icons --sets ui --every 24h`)}${code(`# crontab: every night at 03:30\n30 3 * * * cd /var/www/mysite && node icons-sync.mjs --out public/icons --sets ui --quiet`, "Cron")}${code(`# GitHub Actions: refresh weekly and open a commit\non:\n  schedule: [{ cron: "0 4 * * 1" }]\njobs:\n  icons:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: curl -O ${B}/tools/icons-sync.mjs && node icons-sync.mjs --out public/icons --sets ui --quiet\n      - run: git config user.name bot && git config user.email bot@users.noreply.github.com && git add -A && (git diff --cached --quiet || git commit -m "Update icons" && git push)`, "CI")}` },
      { label: "Nginx proxy cache", html: `<p>Already running Nginx? Cache our responses on your server and serve them from your own path.</p>${code(`proxy_cache_path /var/cache/nginx/icons levels=1:2 keys_zone=icons:10m max_size=100m inactive=7d;\n\nserver {\n  location /icons-cdn/ {\n    proxy_pass ${B}/;\n    proxy_ssl_server_name on;\n    proxy_cache icons;\n    proxy_cache_valid 200 1d;\n    proxy_cache_use_stale error timeout updating http_500 http_502 http_503;\n    add_header X-Cache $upstream_cache_status;\n  }\n}`)}<p>Then use <code>/icons-cdn/zi.css</code> and <code>/icons-cdn/icons.js</code>. Cached files expire after a day and are refreshed on the next request.</p>` },
      { label: "Caddy", html: `${code(`example.com {\n  handle_path /icons-cdn/* {\n    reverse_proxy ${B} {\n      header_up Host ${host}\n    }\n  }\n}`)}<p>Pair it with Caddy's <code>cache</code> module or a CDN in front for server-side caching.</p>` },
    ])}

    <h2 id="php">PHP</h2>
    <p>Server-rendered sites can inline icons with a one-file helper. It caches every icon on disk for 24 hours, so a page view does not wait on this server, and it keeps working from the stale copy if we are offline.</p>
    ${code(`require 'RemoteIcon.php';   // download: ${B}/tools/RemoteIcon.php\n\nRemoteIcon::configure('${B}', __DIR__ . '/cache/icons');\n\necho RemoteIcon::svg('home');\necho RemoteIcon::svg('github', ['set' => 'social', 'size' => 20, 'class' => 'me-1']);\necho RemoteIcon::svg('bell', ['size' => 18, 'label' => 'Notifications']);`)}

    <h2 id="api">URL reference</h2>
    <div class="table-scroll"><table><thead><tr><th>URL</th><th>Returns</th></tr></thead><tbody>
      <tr><td><code>/i/&lt;set&gt;/&lt;name&gt;.svg</code></td><td>The icon. Add <code>?size=</code> <code>&amp;stroke=</code> <code>&amp;color=</code>.</td></tr>
      <tr><td><code>/i/&lt;name&gt;.svg</code></td><td>Same, without the set (searches ui, social, other).</td></tr>
      <tr><td><code>/zi.css</code></td><td>Stylesheet for the <code>zi</code> classes. Optional <code>?category=</code>, <code>?set=</code> and <code>?names=a,b,c</code>.</td></tr>
      <tr><td><code>/icons.js</code></td><td>Browser client (web component and <code>Icons</code> API).</td></tr>
      <tr><td><code>/sprite.svg</code></td><td>SVG sprite of <code>&lt;symbol&gt;</code>s with ids like <code>ui-home</code>. Optional <code>?set=</code>, <code>?names=</code>. Use it from the same origin only (browsers block cross-site <code>&lt;use&gt;</code>).</td></tr>
      <tr><td><code>/api/icons</code></td><td>JSON index that includes the category of every icon. Filter with <code>?q=</code>, <code>?category=</code> and <code>?set=</code>.</td></tr>
      <tr><td><code>/api/manifest</code></td><td>Every icon with a content hash. Used by the sync tools.</td></tr>
      <tr><td><code>/api/version</code></td><td>Tiny JSON with the current version fingerprint.</td></tr>
      <tr><td><code>/tools/icons-sync.mjs</code></td><td>The sync script from above.</td></tr>
    </tbody></table></div>
    <p>All endpoints are open to cross-origin requests and cached for ${Math.round((Number(settings.cache_max_age) || ctx.cacheMaxAge) / 3600)} hour(s) by default.</p>

    <h2 id="icon-names">All icon names</h2>
    <p>Every icon on this server (${catalog.list.length} in total). Use the class as shown, for example <code>&lt;i class="zi zi-home"&gt;&lt;/i&gt;</code>. The name without the <code>zi-</code> prefix is what the web component, the URLs and the JavaScript API expect: <code>&lt;svg-icon name="home"&gt;</code>. Click a name to copy it.</p>
    <div class="name-filter"><input type="search" id="name-filter" placeholder="Filter ${catalog.list.length} icons…" aria-label="Filter icon names" autocomplete="off"><span id="name-count" class="hint" aria-live="polite"></span></div>
    ${nameLists}
    <p class="hint" id="name-empty" hidden>No icon matches that filter.</p>

    <h2 id="accessibility">Accessibility</h2>
    <ul>
      <li>Decorative icons next to text need nothing. <code>&lt;svg-icon&gt;</code> and <code>zi</code> icons are hidden from assistive technology by default.</li>
      <li>An icon that stands alone needs a name: use <code>label="Search"</code>, or put <code>aria-label</code> on the button and keep the icon decorative.</li>
      <li>Do not use colour alone to convey meaning. Pair icons with text where it matters.</li>
    </ul>

    <h2 id="licensing">Licensing</h2>
    <p>The icons, the server and this site are licensed under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU AGPL-3.0-or-later</a>. Read the plain-language summary and attribution notes on the <a href="/license">License page</a> before you ship them in a product. Brand logos in the <code>social</code> set belong to their owners.</p>
  </div>
</div>`;
  return { head: '<link rel="stylesheet" href="/zi.css?names=home,heart,star-filled,rocket">', title: "Documentation", description: `How to use ${settings.site_name} in your project: CSS classes, web component, caching, self-hosting and API.`, body, wide: true, path: "/docs" };
}

function about(ctx) {
  const { settings, catalog } = ctx;
  const repo = settings.repo_url || "https://github.com/TechZeeLand";
  return {
    title: "About", path: "/about",
    description: `About ${settings.site_name}, a free, open-source SVG icon library you can host yourself.`,
    body: `<h1>About ${esc(settings.site_name)}</h1>
<p class="content-lede">An open-source icon library with the convenience of a hosted service and none of the lock-in.</p>
<div class="content-card">
<h2>What it is</h2>
<p>${esc(settings.site_name)} is a collection of ${catalog.list.length} hand-checked SVG icons plus the small server that delivers them. Add a stylesheet or script tag and use icons by name, the way you would with an icon font, or download the files and host everything yourself.</p>
<h2>Why it exists</h2>
<p>Most icon services want an account, a kit script and a spot in your page's critical path. These icons are plain SVG files. They are cached in your visitors' browsers, optionally mirrored on your own server, and refreshed on a schedule, so your site stays fast and keeps working even if ours is offline.</p>
<h2>Open source &amp; self-hosted</h2>
<p>The whole project is open source under the AGPL-3.0 license: the icons, the server, and this website. Run your own copy with Docker, add icons through the admin portal, or contribute on <a href="${esc(repo)}" target="_blank" rel="noopener">GitHub</a>. See the <a href="/docs#self-host">docs</a> for how to host a cache.</p>
<h2>Made in Bangladesh</h2>
<p>${esc(settings.site_name)} is built and maintained by <a href="https://github.com/TechZeeLand" target="_blank" rel="noopener">TechZeeLand</a>, based in Bangladesh.</p>
</div>`,
  };
}

function contact(ctx) {
  const { settings, catalog } = ctx;
  const I = (n) => icon(catalog, n);
  const repo = settings.repo_url || "https://github.com/TechZeeLand";
  return {
    title: "Contact", path: "/contact",
    description: `Get in touch with TechZeeLand, the team behind ${settings.site_name}.`,
    body: `<h1>Contact</h1>
<p class="content-lede">Questions, bug reports, icon requests, or ideas — here's where to find us.</p>
<div class="content-card">
<p>For bugs, missing icons or feature requests, opening an issue on GitHub is the fastest way to reach us. For anything else, reach out by email or on social media below.</p>
<ul class="contact-list">
<li><a href="mailto:${esc(settings.contact_email)}">${I("mail")} ${esc(settings.contact_email)}</a></li>
<li><a href="${esc(repo)}" target="_blank" rel="noopener">${I("github")} Open an issue on GitHub</a></li>
<li><a href="https://www.youtube.com/@TechZeeLand" target="_blank" rel="noopener">${I("youtube")} YouTube — @TechZeeLand</a></li>
<li><a href="https://www.facebook.com/TechZeeLand" target="_blank" rel="noopener">${I("facebook")} Facebook — TechZeeLand</a></li>
<li><a href="https://www.instagram.com/TechZeeLand" target="_blank" rel="noopener">${I("instagram")} Instagram — @TechZeeLand</a></li>
<li><a href="https://www.tiktok.com/@TechZeeLand" target="_blank" rel="noopener">${I("tiktok")} TikTok — @TechZeeLand</a></li>
</ul></div>`,
  };
}

const updated = () => new Date().toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function privacy(ctx) {
  const { settings } = ctx;
  return {
    title: "Privacy Policy", path: "/privacy-policy",
    description: `How ${settings.site_name} handles data: what is stored, what is not, and how browser storage is used.`,
    body: `<h1>Privacy Policy</h1>
<p class="content-lede">Last updated: ${updated()}</p>
<div class="content-card">
<h2>Short version</h2>
<p>You do not need an account to use ${esc(settings.site_name)}, and we do not track you. We keep anonymous daily totals of how many icons were served. They contain no IP addresses, user agents, referrers or any other identifier.</p>

<h2>What the server records</h2>
<ul>
<li><strong>Anonymous counters:</strong> how many icon files and pages were served each day, and how often each icon was requested. These are numbers only and cannot be linked to a person or a website.</li>
<li><strong>Nothing else:</strong> the application does not write IP addresses, cookies, fingerprints or request logs to disk, and it contains no analytics or advertising scripts.</li>
<li><strong>Hosting logs:</strong> the server, reverse proxy or CDN that runs this site may keep ordinary access logs (including IP addresses) for security and operations. Those logs are outside this application's control and are governed by the hosting operator's practices.</li>
</ul>

<h2>Browser storage on this site</h2>
<p>This website stores two small values in your browser's <code>localStorage</code>: your light/dark theme choice, and whether you dismissed the notice banner. They never leave your device. See the <a href="/cookie-policy">Cookie Policy</a>.</p>

<h2>If you use the icons on your own website</h2>
<p>The <code>icons.js</code> script caches icons in your visitors' <code>localStorage</code> so they are not downloaded repeatedly. It stores icon markup and timestamps only, and no personal data. When a visitor's browser requests an icon from our server, that request is subject to the hosting logs described above. If you want your visitors' browsers to make no requests to us at all, <a href="/docs#self-host">host your own cache</a>.</p>

<h2>Administrators</h2>
<p>The admin area is for the site operator only. Signing in sets one essential session cookie. No visitor data is processed there.</p>

<h2>Where data lives &amp; how long</h2>
<p>Counters and settings are stored on the server that runs this site, in files that are not publicly accessible. Daily counters are kept for 90 days.</p>

<h2>Self-hosted instances</h2>
<p>${esc(settings.site_name)} is open-source software that anyone can run. This policy describes the behaviour of the application itself. If you are using an instance run by someone else, that operator's hosting, logs and settings are their responsibility.</p>

<h2>Third-party resources</h2>
<p>Icons, fonts and scripts are served from this site, not from a third-party CDN. Links to services such as GitHub or social networks lead to sites with their own privacy practices.</p>

<h2>Your rights</h2>
<p>Because we do not collect personal data, there is nothing to access or delete. Depending on where you live (for example under the GDPR) you still have rights over personal data held about you by anyone; to ask about the hosting logs, contact the operator below.</p>

<h2>Changes &amp; questions</h2>
<p>We will update this page when the application's data handling changes. Questions? Use the <a href="/contact">contact page</a> or write to <a href="mailto:${esc(settings.contact_email)}">${esc(settings.contact_email)}</a>.</p>
</div>`,
  };
}

function terms(ctx) {
  const { settings } = ctx;
  return {
    title: "Terms & Conditions", path: "/terms-and-conditions",
    description: `Terms for using ${settings.site_name}: license, availability, trademarks and acceptable use.`,
    body: `<h1>Terms &amp; Conditions</h1>
<p class="content-lede">Last updated: ${updated()}</p>
<div class="content-card">
<h2>Using this service</h2>
<p>${esc(settings.site_name)} is provided free of charge. You are welcome to use the icons and the hosted files for personal, commercial and educational projects, subject to the license below.</p>

<h2>Open-source license</h2>
<p>The icons, server and website are released under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)</a>. You may run, study, modify and redistribute them under that license. Read the <a href="/license">License page</a> for a plain-language summary and attribution notes.</p>

<h2>No warranty</h2>
<p>The software and icons are provided "as is", without warranty of any kind, express or implied, including fitness for a particular purpose. You are responsible for checking that an icon is suitable for your use, including any legal or brand requirements.</p>

<h2>Availability and fair use</h2>
<p>The hosted service is run on a best-effort basis and may change, be rate limited or be unavailable. It is not a guaranteed content delivery network. For production sites we strongly recommend <a href="/docs#self-host">hosting your own cache</a>, which also makes your site independent of ours. Please do not use automated tools to download the icon set repeatedly or to put excessive load on the service; use the sync script, which only downloads what changed.</p>

<h2>Brand logos and trademarks</h2>
<p>Logos in the <code>social</code> set (for example GitHub, YouTube or Facebook) are trademarks of their respective owners and are included only so you can link to those services. Their inclusion does not imply endorsement, and they are not covered by the AGPL license. Follow each brand's own usage guidelines.</p>

<h2>Acceptable use</h2>
<p>Do not use the service to attack, overload or probe it, to try to access the admin area, or to distribute malicious files. Do not use the icons to imitate another organization in a misleading way. Operators of self-hosted instances may apply their own additional rules.</p>

<h2>Contributions</h2>
<p>If you contribute icons or code, you confirm that you created them or have the right to share them under the AGPL-3.0-or-later license, and you agree they are published under it.</p>

<h2>Changes</h2>
<p>These terms may be updated as the project evolves. Continued use after changes means you accept the updated terms.</p>

<h2>Questions</h2>
<p>Reach out via the <a href="/contact">contact page</a>.</p>
</div>`,
  };
}

function cookies(ctx) {
  const { settings } = ctx;
  return {
    title: "Cookie Policy", path: "/cookie-policy",
    description: `Which cookies and browser storage ${settings.site_name} uses, why, and how to control them.`,
    body: `<h1>Cookie Policy</h1>
<p class="content-lede">Last updated: ${updated()}</p>
<div class="content-card">
<h2>Short version</h2>
<p>Visitors do not receive any cookies. We use no analytics, advertising or tracking cookies of any kind. The only cookie in the whole application is an essential session cookie that exists for the site operator after signing in to the admin area.</p>

<h2>What we use</h2>
<div class="table-scroll"><table class="policy-table">
<thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Lifetime</th></tr></thead>
<tbody>
<tr><td><code>zi_admin</code></td><td>Essential cookie</td><td>Keeps the site operator signed in to <code>/admin</code> and protects admin forms against cross-site requests. It is <strong>never</strong> set for visitors.</td><td>Up to 12 hours of inactivity, or until sign-out</td></tr>
<tr><td><code>zi-theme</code></td><td>Browser storage (localStorage)</td><td>Remembers whether you chose light or dark mode. Never sent to the server.</td><td>Until you clear your browser data</td></tr>
<tr><td><code>zi-consent</code></td><td>Browser storage (localStorage)</td><td>Remembers that you dismissed the notice banner, if one is shown. Never sent to the server.</td><td>Until you clear your browser data</td></tr>
<tr><td><code>zi-icons:*</code></td><td>Browser storage (localStorage)</td><td>Only on sites that use <code>icons.js</code>: caches icon files so they are not downloaded again for a few days. Contains icon markup and timestamps only.</td><td>7 days by default, then refreshed</td></tr>
</tbody></table></div>

<h2>Third-party resources</h2>
<p>Icons, scripts and fonts are served from this site, so no icon CDN or external font provider sees your visit.</p>

<h2>Your choices</h2>
<ul>
<li>Show the notice again at any time with <button type="button" class="link-button" data-cookie-settings>Cookie settings</button>.</li>
<li>Clearing your browser's site data removes every entry above. Icons are simply downloaded again.</li>
<li>Website owners using <code>icons.js</code> can shorten or disable its cache (see the <a href="/docs#caching">docs</a>).</li>
</ul>

<h2>Questions</h2>
<p>Reach out via the <a href="/contact">contact page</a>.</p>
</div>`,
  };
}

function license(ctx) {
  const { settings } = ctx;
  const note = String(settings.license_note || "").trim();
  return {
    title: "License", path: "/license",
    description: `${settings.site_name} is licensed under the GNU AGPL-3.0-or-later. A plain-language summary and attribution notes.`,
    body: `<h1>License</h1>
<p class="content-lede">Free software, in the full sense of the word.</p>
<div class="content-card">
${note ? `<div class="callout"><strong>Note from the operator</strong>${esc(note).replace(/\n/g, "<br>")}</div>` : ""}
<h2>The license</h2>
<p>The icons, the server software and this website are licensed under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU Affero General Public License, version 3 or (at your option) any later version</a>. The full text is included in the project's <code>LICENSE</code> file.</p>

<h2>In plain language</h2>
<ul>
<li>You may use, copy, study, modify and share the icons and the software, including for commercial work.</li>
<li>If you distribute them, or a modified version, you must pass on the same freedoms, include the license, and make the corresponding source available.</li>
<li>If you run a <em>modified</em> version of the server for other people over a network, you must offer those users the modified source. The unmodified server already links to its source code in the footer and at <a href="/source">/source</a>.</li>
<li>Whether embedding icons in your own project affects how that project must be licensed is a legal question that depends on how you combine them. This page is a summary, not legal advice. If in doubt, ask a lawyer or <a href="/contact">contact us</a>.</li>
</ul>

<h2>Attribution and third-party material</h2>
<ul>
<li>Some line icons are based on the geometry of the <a href="https://github.com/feathericons/feather" target="_blank" rel="noopener">Feather</a> (MIT) and <a href="https://github.com/lucide-icons/lucide" target="_blank" rel="noopener">Lucide</a> (ISC) icon sets. Their copyright and permission notices are preserved in the project's <code>NOTICE.md</code>.</li>
<li>Brand logos in the <code>social</code> set are trademarks of their owners and are not covered by the AGPL.</li>
</ul>

<h2>Source code</h2>
<p>Get the source, report issues or contribute at <a href="/source">${esc(settings.repo_url || "the project repository")}</a>.</p>
</div>`,
  };
}

function errorPage(ctx, code) {
  const I = (n) => icon(ctx.catalog, n);
  const map = {
    404: ["signpost", "This page doesn't exist", "The link might be broken, or the page may have been moved or removed. Let's get you back on track."],
    403: ["lock", "Access denied", "You don't have permission to view this page."],
    500: ["alert-triangle", "Something went wrong", "An unexpected error occurred on our side. Please try again in a moment."],
  };
  const [ic, title, desc] = map[code] || map[500];
  return {
    title: `Error ${code}`, path: "/error", noindex: true, wide: true,
    description: desc,
    body: `<div class="error-page">
    <div class="error-icon" aria-hidden="true">${I(ic)}</div>
    <p class="error-code">Error ${code}</p>
    <h1 class="error-title">${esc(title)}</h1>
    <p class="error-desc">${esc(desc)}</p>
    <div class="error-actions">
        <a href="/" class="btn btn-primary">${I("home")} Go to homepage</a>
        <a href="/contact" class="btn btn-secondary">${I("mail")} Contact us</a>
    </div>
    <p class="error-links">Or try: <a href="/icons">Icons</a> &middot; <a href="/docs">Docs</a> &middot; <a href="/privacy-policy">Privacy Policy</a> &middot; <a href="/terms-and-conditions">Terms &amp; Conditions</a></p>
</div>`,
  };
}

module.exports = { home, iconsPage, docs, about, contact, privacy, terms, cookies, license, errorPage };
