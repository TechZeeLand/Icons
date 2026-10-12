// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';

/**
 * Icon service: serves a folder of SVG icons over HTTP and keeps it in sync
 * with a git repository. Zero npm dependencies; needs Node 18+ and git.
 *
 *   GET  /i/<set>/<name>.svg?size=24&color=ff0000&stroke=1.5
 *   GET  /i/<name>.svg                (first match in ui, social, other)
 *   GET  /api/icons?q=&set=           (JSON index)
 *   GET  /sprite.svg?set=ui           (<symbol> sprite, ids like "ui-home")
 *   GET  /icons.js                    (browser client)
 *   GET  /                            (gallery)
 *   GET  /source                      (redirect to the source code, AGPL-3.0 section 13)
 *   POST /_sync                       (pull the repo now; needs SYNC_TOKEN)
 *   GET  /healthz
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const env = process.env;
const PORT = parseInt(env.PORT, 10) || 3000;
const SEED_DIR = path.resolve(env.SEED_DIR || path.join(__dirname, '..', 'icons'));
const DATA_DIR = path.resolve(env.DATA_DIR || '/data');
const REPO_URL = env.ICONS_REPO_URL || '';
const REPO_BRANCH = env.ICONS_REPO_BRANCH || 'main';
const REPO_SUBDIR = env.ICONS_SUBDIR || 'icons';
const SYNC_INTERVAL_MS = (env.SYNC_INTERVAL_SECONDS === undefined ? 300 : Math.max(0, parseInt(env.SYNC_INTERVAL_SECONDS, 10) || 0)) * 1000;
const SYNC_TOKEN = env.SYNC_TOKEN || '';
const SOURCE_URL = env.SOURCE_URL || REPO_URL.replace(/\.git$/, '');
const CACHE_MAX_AGE = parseInt(env.CACHE_MAX_AGE, 10) || 86400;
const CORS_ORIGIN = env.CORS_ORIGIN || '*';

const SET_ORDER = ['ui', 'social', 'other'];
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SVG_BYTES = 64 * 1024;

const clientJs = fs.readFileSync(path.join(__dirname, '..', 'client', 'icons.js'));
const galleryHtml = fs
  .readFileSync(path.join(__dirname, 'gallery.html'), 'utf8')
  .replace(/{{SOURCE_URL}}/g, escapeHtml(SOURCE_URL || '/source'));

/** @type {{ byKey: Map<string, Entry>, byName: Map<string, Entry>, list: Entry[], version: string, rev: string }} */
let index = { byKey: new Map(), byName: new Map(), list: [], version: 'empty', rev: '' };

// ---------- loading ----------

function loadDir(dir) {
  const byKey = new Map();
  const list = [];
  const hash = crypto.createHash('sha1');
  let sets;
  try {
    sets = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && NAME_RE.test(d.name)).map((d) => d.name);
  } catch (e) {
    throw new Error(`cannot read icon directory ${dir}: ${e.message}`);
  }
  sets.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const set of sets) {
    const files = fs.readdirSync(path.join(dir, set)).filter((f) => f.endsWith('.svg')).sort();
    for (const f of files) {
      const name = f.slice(0, -4);
      if (!NAME_RE.test(name)) continue;
      const full = path.join(dir, set, f);
      const st = fs.statSync(full);
      if (!st.isFile() || st.size > MAX_SVG_BYTES) continue;
      const svg = fs.readFileSync(full, 'utf8');
      if (!/^\s*(<\?xml[^>]*>\s*)?<svg\b/.test(svg)) continue;
      const entry = { set, name, svg };
      byKey.set(`${set}/${name}`, entry);
      list.push(entry);
      hash.update(set + '/' + name + '\0' + svg);
    }
  }
  const byName = new Map();
  for (const e of list) if (!byName.has(e.name)) byName.set(e.name, e); // list is already in set order
  return { byKey, byName, list, version: hash.digest('hex').slice(0, 12), rev: '' };
}

function rank(set) {
  const i = SET_ORDER.indexOf(set);
  return i === -1 ? SET_ORDER.length : i;
}

function swapIndex(next, label) {
  if (!next.list.length) throw new Error('no icons found, keeping the previous index');
  index = next;
  log(`loaded ${next.list.length} icons from ${label} (version ${next.version}${next.rev ? ', commit ' + next.rev : ''})`);
}

// ---------- git sync ----------

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

let syncing = null;
function sync() {
  if (!REPO_URL) return Promise.resolve({ skipped: 'ICONS_REPO_URL is not set' });
  if (syncing) return syncing;
  syncing = (async () => {
    const dir = path.join(DATA_DIR, 'repo');
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      await git(['clone', '--depth', '1', '--branch', REPO_BRANCH, REPO_URL, dir]);
    } else {
      await git(['-C', dir, 'fetch', '--depth', '1', 'origin', REPO_BRANCH]);
      await git(['-C', dir, 'reset', '--hard', 'FETCH_HEAD']);
    }
    const rev = await git(['-C', dir, 'rev-parse', '--short', 'HEAD']);
    const next = loadDir(path.join(dir, REPO_SUBDIR));
    next.rev = rev;
    if (next.version === index.version) return { changed: false, rev, count: next.list.length };
    swapIndex(next, `${REPO_URL}@${REPO_BRANCH}`);
    return { changed: true, rev, count: next.list.length };
  })()
    .catch((e) => {
      log(`sync failed: ${e.message}`);
      return { error: e.message };
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

// ---------- rendering ----------

function clampNum(v, min, max) {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return n;
}

function parseColor(v) {
  if (v === null || v === '') return null;
  const c = v.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3,4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(c)) return '#' + c;
  if (/^[a-zA-Z]{3,24}$/.test(c)) return c; // named colours, currentColor, transparent, ...
  return NaN;
}

function setAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=)"[^"]*"`);
  return re.test(tag) ? tag.replace(re, `$1"${value}"`) : tag.replace(/>$/, ` ${name}="${value}">`);
}

function render(entry, params) {
  const size = clampNum(params.get('size'), 1, 2048);
  const stroke = clampNum(params.get('stroke'), 0.25, 4);
  const color = parseColor(params.get('color'));
  if ([size, stroke, color].some(Number.isNaN)) return null;

  let svg = entry.svg.replace(/^\s*<\?xml[^>]*>\s*/, '');
  const open = svg.match(/<svg\b[^>]*>/)[0];
  let tag = open;
  if (size !== null) tag = setAttr(setAttr(tag, 'width', size), 'height', size);
  if (stroke !== null && /\sstroke-width=/.test(tag)) tag = setAttr(tag, 'stroke-width', stroke);
  svg = svg.replace(open, tag);
  if (color !== null) svg = svg.replace(/currentColor/g, color);
  return svg;
}

function sprite(setFilter) {
  const out = ['<svg xmlns="http://www.w3.org/2000/svg">'];
  for (const e of index.list) {
    if (setFilter && e.set !== setFilter) continue;
    const open = e.svg.match(/<svg\b[^>]*>/);
    if (!open) continue;
    const attr = (n) => (open[0].match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1];
    const vb = attr('viewBox') || '0 0 24 24';
    // stroke-width becomes a CSS variable so pages can restyle it: svg { --sw: 1.5 }
    const keep =
      ['fill', 'stroke', 'stroke-linecap', 'stroke-linejoin'].map((n) => (attr(n) !== undefined ? ` ${n}="${attr(n)}"` : '')).join('') +
      (attr('stroke-width') !== undefined ? ` style="stroke-width:var(--sw,${attr('stroke-width')})"` : '');
    const inner = e.svg.slice(e.svg.indexOf(open[0]) + open[0].length).replace(/<\/svg>\s*$/, '');
    out.push(`<symbol id="${e.set}-${e.name}" viewBox="${vb}"><g${keep}>${inner}</g></symbol>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

// ---------- http ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function baseHeaders(extra) {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  };
}

function send(req, res, status, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, baseHeaders({ 'Content-Length': buf.length, ...headers }));
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function sendCached(req, res, body, type, extraKey, extraHeaders) {
  const etag = '"' + crypto.createHash('sha1').update(index.version + '\0' + extraKey + '\0').update(body).digest('hex').slice(0, 20) + '"';
  const headers = {
    'Content-Type': type,
    ETag: etag,
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_MAX_AGE * 7}`,
    ...extraHeaders,
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, baseHeaders({ ETag: etag, 'Cache-Control': headers['Cache-Control'] }));
    return res.end();
  }
  send(req, res, 200, body, headers);
}

const SVG_HEADERS = { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function authorised(req, body) {
  if (!SYNC_TOKEN) return false;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && safeEqual(bearer, SYNC_TOKEN)) return true;
  // GitHub / Gitea / Forgejo webhooks sign the body with the shared secret (HMAC-SHA256).
  const mac = crypto.createHmac('sha256', SYNC_TOKEN).update(body).digest('hex');
  const sig = (req.headers['x-hub-signature-256'] || '').replace(/^sha256=/, '') || req.headers['x-gitea-signature'] || req.headers['x-forgejo-signature'] || '';
  return Boolean(sig) && safeEqual(String(sig), mac);
}

const ICON_ROUTE = /^\/i\/(?:([a-z0-9-]+)\/)?([a-z0-9-]+?)(?:\.svg)?$/;

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, baseHeaders({ 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' }));
    return res.end();
  }

  if (req.method === 'POST' && p === '/_sync') {
    if (!SYNC_TOKEN) return send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const body = await readBody(req);
    if (!authorised(req, body)) return send(req, res, 401, 'Unauthorised', { 'Content-Type': 'text/plain' });
    const result = await sync();
    return send(req, res, result.error ? 502 : 200, JSON.stringify(result), { 'Content-Type': 'application/json' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Method not allowed', { 'Content-Type': 'text/plain', Allow: 'GET, HEAD, OPTIONS' });

  if (p === '/healthz') return send(req, res, 200, JSON.stringify({ ok: true, icons: index.list.length, version: index.version, commit: index.rev || null }), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

  if (p === '/') return send(req, res, 200, galleryHtml, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });

  if (p === '/icons.js') return sendCached(req, res, clientJs, 'text/javascript; charset=utf-8', 'client');

  if (p === '/source') {
    if (!SOURCE_URL) return send(req, res, 404, 'SOURCE_URL is not configured', { 'Content-Type': 'text/plain' });
    res.writeHead(302, baseHeaders({ Location: SOURCE_URL }));
    return res.end();
  }

  if (p === '/api/icons') {
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    const set = url.searchParams.get('set');
    const icons = index.list.filter((e) => (!set || e.set === set) && (!q || e.name.includes(q))).map((e) => ({ set: e.set, name: e.name }));
    const sets = {};
    for (const e of index.list) sets[e.set] = (sets[e.set] || 0) + 1;
    return send(req, res, 200, JSON.stringify({ version: index.version, commit: index.rev || null, total: index.list.length, sets, icons }), {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    });
  }

  if (p === '/sprite.svg') {
    const set = url.searchParams.get('set') || '';
    if (set && !NAME_RE.test(set)) return send(req, res, 400, 'Bad set', { 'Content-Type': 'text/plain' });
    return sendCached(req, res, sprite(set), 'image/svg+xml; charset=utf-8', 'sprite:' + set, SVG_HEADERS);
  }

  const m = ICON_ROUTE.exec(p);
  if (m) {
    const [, set, name] = m;
    const entry = set ? index.byKey.get(`${set}/${name}`) : index.byName.get(name);
    if (!entry) return send(req, res, 404, 'Icon not found', { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=60' });
    const svg = render(entry, url.searchParams);
    if (svg === null) return send(req, res, 400, 'Invalid size, stroke or color parameter', { 'Content-Type': 'text/plain' });
    return sendCached(req, res, svg, 'image/svg+xml; charset=utf-8', `${entry.set}/${entry.name}?${url.searchParams.get('size')}|${url.searchParams.get('stroke')}|${url.searchParams.get('color')}`, SVG_HEADERS);
  }

  return send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain' });
}

// ---------- start ----------

try {
  swapIndex(loadDir(SEED_DIR), SEED_DIR);
} catch (e) {
  if (!REPO_URL) {
    console.error(e.message);
    process.exit(1);
  }
  log(`no bundled icons (${e.message}); waiting for the first sync`);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log(`error ${req.method} ${req.url}: ${e.message}`);
    if (!res.headersSent) send(req, res, 500, 'Internal error', { 'Content-Type': 'text/plain' });
    else res.end();
  });
});
server.headersTimeout = 15000;
server.requestTimeout = 30000;
server.listen(PORT, () => {
  log(`listening on :${PORT}${REPO_URL ? `, syncing ${REPO_URL}@${REPO_BRANCH} every ${SYNC_INTERVAL_MS / 1000}s` : ', serving bundled icons (no ICONS_REPO_URL)'}`);
  if (REPO_URL) {
    sync();
    if (SYNC_INTERVAL_MS > 0) setInterval(sync, SYNC_INTERVAL_MS).unref();
  }
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
