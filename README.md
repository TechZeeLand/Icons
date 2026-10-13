# TechZeeLand Icons

A free, open-source SVG icon library in the spirit of Font Awesome: a public website with documentation, a CDN-style
delivery layer (`<i class="zi zi-home">`, a web component, plain SVG URLs), self-hostable caching so other people's
sites never wait on yours, and an admin portal for managing icons. One small Node.js service, no npm dependencies.

- **311 icons** in three sets: `ui` (294 line icons, 24x24 grid), `social` (15 brand glyphs), `other` (2 project artworks).
- **Website**: home, icon browser with copy-ready snippets, full docs, About, Contact, Privacy Policy, Terms & Conditions,
  Cookie Policy, License, error pages. Light/dark theme, responsive, green/cyan (#3ce9be) design.
- **Fast by design**: ETags, `stale-while-revalidate`, browser-side icon cache in `icons.js`, a mirror mode, and a sync
  script so consumers can host the icons on their own server and still get updates on a schedule.
- **Admin portal** at `/admin`: dashboard and anonymous stats, categories, bulk-add icons (with automatic cleaning), edit, tag,
  hide, replace, revert, export, sync now, site settings, account.
- **Private**: no accounts for visitors, no cookies for visitors, no analytics scripts, no IP addresses stored.

```
icons/        ui/ social/ other/  - the icon files (this is what you edit and commit)
server/       server.js, lib/ (catalog, sanitizer, sync, auth, stats, http), views/ (public + admin pages)
public/       assets: css, js, images, favicons
client/       icons.js (browser), php/RemoteIcon.php
tools/        icons-sync.mjs (copy icons to your own server)
scripts/      validate.mjs (icon checks), smoke-test.mjs
```

## Deploy with Portainer (Debian 12 homeserver)

1. Create a **public** git repository from this folder (GitHub, Gitea or Forgejo) and push it.
2. Portainer: **Stacks > Add stack > Repository**, enter the repo URL, compose path `docker-compose.yml`.
   Portainer builds the image from the `Dockerfile`.
3. Under *Environment variables* add at least:

   | Variable | Example | Meaning |
   | --- | --- | --- |
   | `PUBLIC_URL` | `https://icons.example.com` | Public address; used in the docs snippets and sitemap. |
   | `ICONS_REPO_URL` | `https://github.com/you/icons.git` | Repository to follow. Empty serves the icons baked into the image. |
   | `SOURCE_URL` | `https://github.com/you/icons` | "Source code" link (AGPL-3.0 section 13). |
   | `SYNC_TOKEN` | long random string | Enables instant updates through a push webhook (`POST /_sync`). |
   | `TRUST_PROXY` | `true` | Keep `true` behind a reverse proxy so HTTPS cookies and client IPs are read correctly. |

   All options: `ICONS_REPO_BRANCH` (main), `ICONS_SUBDIR` (icons), `SYNC_INTERVAL_SECONDS` (300, `0` = off),
   `CACHE_MAX_AGE` (86400), `CORS_ORIGIN` (`*`), `ADMIN_ENABLED` (true), `ADMIN_USER`, `ADMIN_PASSWORD`, `PORT` (8085 on the host).
4. Put your reverse proxy (Nginx Proxy Manager, Caddy, Traefik) in front of host port `8085` with HTTPS.
5. **First run**: open the container log in Portainer, copy the one-time setup token, then visit `/admin/setup` to create the
   administrator. (Or set `ADMIN_PASSWORD`, at least 10 characters, once and remove it afterwards.)

Check `/healthz` for the icon count, the live commit and the sync mode. The `icons-data` volume holds the admin login,
settings, icons added in the portal, the synced repository and stats. Back it up.

## Two ways to manage icons

- **In git (recommended source of truth).** Add `kebab-name.svg` to `icons/ui/`, run `node scripts/validate.mjs`, push.
  The service picks it up within `SYNC_INTERVAL_SECONDS`, or immediately via the webhook.
- **In the admin portal.** *Add icons* accepts many files at once, cleans them (removes scripts, metadata and editor junk,
  checks the 24x24 grid, converts colours to `currentColor`) and shows a preview before saving. Icons added or edited there
  are stored in the data volume and overlay the repository. *Sync & export* downloads them as a zip laid out for the repo
  so you can commit them upstream.

**Categories.** *Categories* in the admin portal lets you add, rename and remove categories (each has an icon style that decides
how uploads are cleaned). Icons without a category, and icons from a category you remove, move to the built-in **Extras**
category. Moving an icon never changes its file or URL (`/i/ui/home.svg` keeps working). Categories are stored in the data
volume, not in git; exports include a `categories.json` for reference.

The portal never deletes repository icons; it can hide them, replace them (and revert), or delete icons it added itself.

## How other people use it

The `/docs` page of your deployment documents everything with your own URL filled in: CSS classes, web component, image
tags, JavaScript API, frameworks, caching, self-hosting a cache (Docker mirror, `icons-sync.mjs` with cron or CI, Nginx or
Caddy proxy cache), PHP helper, URL reference, a searchable list of every icon name (`zi-home`, …), accessibility, licensing. The docs page has a *Download as Markdown*
button (`/docs.md`) that exports everything, with your URL and all icon names, as one file to share.

```html
<link rel="stylesheet" href="https://icons.example.com/zi.css">
<i class="zi zi-home"></i>
```

Caching summary: browsers keep icons for `CACHE_MAX_AGE` (ETag revalidation after that), `icons.js` stores them in
`localStorage` for 7 days and refreshes in the background, and a consumer can run `docker-compose.mirror.yml` or
`tools/icons-sync.mjs` to serve everything from their own domain while still picking up changes on a timer.

## Security notes

- Admin: scrypt password hashing, 12 h sliding sessions in an `HttpOnly` `SameSite=Strict` cookie scoped to `/admin`,
  per-session CSRF tokens plus an origin check on every POST, login lockout (5 failures, 15 minutes), one-time setup token.
- Uploaded SVGs are rebuilt from a whitelist of elements and attributes; anything else is dropped. The catalog also refuses to
  serve any file containing scripts or event handlers, and icon responses carry a sandboxing CSP.
- Pages use a nonce-based CSP, no inline event handlers and no third-party resources.
- The admin is disabled entirely with `ADMIN_ENABLED=false` (use that for mirrors).
- Put the service behind HTTPS. Sessions are in memory, so restarting the container signs everyone out.

## Develop

```
node server/server.js          # DATA_DIR defaults to /data; set DATA_DIR=./data for local use
node scripts/validate.mjs      # icon rules
node scripts/smoke-test.mjs    # boots the server and checks the main endpoints
```

Requires Node 22 or newer.

## Licence

GNU AGPL-3.0-or-later (see `LICENSE`). Complete `NOTICE.md` (Feather and Lucide notices, trademark note on brand logos)
before publishing. Whether embedding the icons obliges other projects to use the AGPL is a question to settle deliberately;
the *License note* setting in the admin portal lets you add your own statement to the public License page.
