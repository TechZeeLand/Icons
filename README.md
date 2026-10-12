# Icon service

An SVG icon set plus a tiny server that hosts it. Projects fetch icons by URL instead of copying files around.
The server has no npm dependencies, pulls the icons from this git repository, and picks up changes automatically.

```
icons/
  ui/       294 line icons, 24x24 grid, stroke="currentColor", stroke-width 2, round caps
  social/   15 brand glyphs (filled with currentColor; google.svg keeps its brand colours)
  other/    2 project-specific artwork files with fixed colours
server/     the HTTP server (server.js) and the gallery page
client/     icons.js for the browser, php/RemoteIcon.php for PHP projects
scripts/    validate.mjs - run it before every commit
```

## Run it on the homeserver (Portainer)

1. Push this repository to GitHub, Gitea or Forgejo (public).
2. In Portainer: **Stacks > Add stack > Repository**. Enter the repository URL and keep `docker-compose.yml` as the
   compose path. Portainer builds the image from the `Dockerfile`.
3. Add the environment variables below (at least `ICONS_REPO_URL` and `SOURCE_URL`) and deploy.
4. Put your reverse proxy (Nginx Proxy Manager, Caddy, Traefik, ...) in front of port `8085` and give it a hostname with HTTPS.

Open `https://<your-host>/` for the searchable gallery, or `/healthz` to see how many icons are loaded and which commit is live.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ICONS_REPO_URL` | empty | Git URL to pull. Empty serves the icons baked into the image. |
| `ICONS_REPO_BRANCH` | `main` | Branch to follow. |
| `ICONS_SUBDIR` | `icons` | Folder in the repo that contains `ui/`, `social/`, `other/`. |
| `SYNC_INTERVAL_SECONDS` | `300` | Poll interval. `0` turns polling off. |
| `SYNC_TOKEN` | empty | Enables `POST /_sync`. Also the secret for signed webhooks. |
| `SOURCE_URL` | the repo URL | Shown in the footer and at `/source`. AGPL-3.0 section 13 asks network services to offer their source. |
| `CACHE_MAX_AGE` | `86400` | Seconds browsers and CDNs may cache icons. |
| `CORS_ORIGIN` | `*` | Allowed origin for cross-site fetches. |
| `PORT` | `8085` | Host port in the compose file. |

If a sync fails or the repo is empty, the service keeps serving the last good set, so a bad push cannot take your projects' icons offline.

### Instant updates (optional)

Set `SYNC_TOKEN`, then add a webhook for push events pointing at `https://<your-host>/_sync` with the same value as secret.
GitHub, Gitea and Forgejo signatures are accepted. Manual: `curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" https://<your-host>/_sync`.

## URLs

| URL | Result |
| --- | --- |
| `/i/ui/home.svg` | The icon. `/i/home.svg` searches `ui`, then `social`, then `other`. |
| `/i/ui/home.svg?size=20&color=e11d48&stroke=1.5` | Resized, recoloured (hex without `#`, or a colour name), thinner stroke. |
| `/api/icons?q=git&set=ui` | JSON index for search and tooling. |
| `/sprite.svg?set=ui` | One file of `<symbol>`s with ids like `ui-home`; stroke width follows the CSS variable `--sw`. |
| `/icons.js` | Browser client. |

Responses are cached with ETags. A plain `<img src>` cannot inherit the page's text colour, so pass `color=` there or use the inline options below.

## Using it in projects

**Browser:**

```html
<script src="https://icons.example.com/icons.js" defer></script>
<svg-icon name="home" size="20"></svg-icon>
<svg-icon name="github" set="social" size="20"></svg-icon>
```

The icon is inlined, so it follows `color` from your CSS. From JavaScript use `Icons.svg('home')` or `Icons.el('home')`.
`<use href="https://other-host/sprite.svg#ui-home">` does not work cross-origin (a browser rule), so only use the sprite when the service is on the same origin as the site.

**PHP:**

```php
require 'RemoteIcon.php';
RemoteIcon::configure('https://icons.example.com', __DIR__ . '/cache/icons', __DIR__ . '/public/icons');
echo RemoteIcon::svg('home', ['size' => 20, 'class' => 'me-1']);
```

Icons are cached on disk, so pages never wait on the service. If it is down, the cached copy and then the optional local folder are used.

## Adding or changing an icon

1. Put `kebab-case-name.svg` into `icons/ui/` (24x24 grid, `stroke="currentColor"`, no hard-coded colours).
2. `node scripts/validate.mjs`
3. Commit and push. The service updates within `SYNC_INTERVAL_SECONDS`, or immediately with the webhook.

Names must be unique across sets, because `/i/<name>.svg` has no set in it.

## Licence

GNU Affero General Public License v3.0 or later. See `LICENSE`, and `NOTICE.md` for third-party notices that must be completed before publishing.
If you run a modified copy of the server publicly, section 13 requires you to offer your visitors the modified source; `SOURCE_URL` does that.
