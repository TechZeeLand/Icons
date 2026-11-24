# Changelog

## 3.0.1

- Fix: clicking an icon on /icons threw `wrap.querySelector(...) is null` (wrong class name), so no snippets could be copied.
- Fix: new and edited icons stayed invisible for up to a day. Icons, `zi.css` and `sprite.svg` are now cached for at most
  60 s (cap 300 s) with no stale-while-revalidate, plus `stale-if-error`. Missing icons (404) are cached for 15 s, not 60.
- `icons.js`: checks `/api/version` every 5 minutes (`data-check`), re-checks changed icons and redraws them, and no longer
  deletes stored copies on a version change, so icons removed from the service keep working in your projects.
- `RemoteIcon.php`: compares `/api/manifest` every 5 minutes and re-downloads icons whose content changed; removed icons stay
  served from your cache; a dead service is retried at most once a minute per icon, not on every request.
- Catalog: tolerates a BOM, XML header, comment or DOCTYPE before `<svg>`, and reports every icon file it refuses to serve
  (bad file name, too big, active content, not an SVG) in the log and under `skipped_files` in `/healthz`.

## 2.2.0

- Docs: "Download as Markdown" button. `/docs.md` returns the whole documentation as one shareable Markdown file with this
  server's URL filled in and every icon name listed by category.

## 2.1.0

- Admin: add, rename and remove categories; icons without a category or from a removed category move to Extras; move an
  icon between categories from its edit page; category chosen when adding icons.
- `/api/icons` now reports each icon's category and the category list; `zi.css` and `sprite.svg` accept `?category=`.
- Docs: new "All icon names" section listing every icon as `zi-<name>`, filterable, click to copy.

## 2.0.0 - full service

- Public website (home, icon browser, docs, about, contact, privacy, terms, cookies, license, error pages) with light/dark
  theme in a green/cyan palette, based on the TechZeeLand header, footer and social links.
- Font Awesome-style delivery: `/zi.css` (`<i class="zi zi-home">`), `<svg-icon>` web component, JS API, sprite, image URLs.
- Caching: ETags and stale-while-revalidate, persistent browser cache with background refresh in `icons.js`, `/api/version`
  and `/api/manifest`, mirror mode (`ICONS_UPSTREAM`), `tools/icons-sync.mjs`, PHP helper with disk cache.
- Admin portal: dashboard and anonymous stats, bulk add with SVG sanitising, edit/tag/hide/replace/revert, export zip,
  sync now, site settings, account.
- Anonymous request counters; no IP addresses stored.

## 1.0.0 - merged set

Merged `svg-icons-updated (1).zip` (233 icons) and `svg-icons-updated (1) (1).zip` (105 icons).

- The second archive was a strict subset of the first: no icon existed only in it.
- Of the 105 overlapping icons, 8 differed:
  - `barcode`, `message-square`, `qr-code`, `scan`, `upload`, `wifi` were bloated to ~8 KB each by an embedded
    C2PA provenance `<metadata>` block (base64 manifest). The clean versions from the first archive were kept.
  - `hammer` and `ticket` were the older versions that overflowed the 24x24 box; the fixed versions were kept.
- Audit of all 233 existing icons: well-formed XML, `currentColor` everywhere in `ui/`, nothing blank, nothing drawn
  outside the 24x24 box. No further repairs were needed.
- Added 78 new `ui/` icons (294 in `ui/` now, 311 in total):
  terminal, cpu, hard-drive, network, cloud, cloud-download, git-commit, git-merge, git-pull-request, bug, braces, file-code, file-plus, file-down, file-up, folder-open, activity, power, battery, bluetooth, router, ram, container, plug, rss, wifi-off, shield-alert, fingerprint, scan-face, arrow-up-right, chevrons-down, chevrons-up, check-square, square, maximize, zoom-in, zoom-out, ellipsis-vertical, grip-vertical, columns, layout, table, bold, italic, underline, strikethrough, at-sign, unlink, sort-asc, sort-desc, crop, scissors, pin, pointer, repeat, target, verified, user-minus, bell-ring, calendar-days, map, compass, navigation, thermometer, pause, stop, volume, volume-x, mic, video, music, headphones, keyboard, tv, gamepad, dumbbell, timer, trophy.
- Added `scripts/validate.mjs`, which fails on embedded metadata, oversized files, scripts, hard-coded colours in `ui/`,
  duplicate names and malformed XML.

## 3.0.0
- Rebuilt the site and admin on the TZL kit (Node edition, `server/tzl/`): shared design, header/footer/services menu, editable pages.
- New admin: Site & domains (one root domain for all services), Header & footer, Appearance, Pages & policies, SEO, Traffic, System & backup, Security, Activity log.
- `/health` endpoint (`/healthz` kept). Maintenance mode, CSP host allow-list, settings export/import with history.
- Environment: `TZL_ROOT_DOMAIN`, `TZL_BASE_URL`, `TZL_TRUST_PROXY`, `TZL_ADMIN_*` (old names still work).
