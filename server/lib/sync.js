// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const cfg = require("./config");
const { sanitize } = require("./sanitize");

const state = { mode: cfg.UPSTREAM ? "mirror" : cfg.REPO_URL ? "git" : "bundled", running: false, lastRun: null, lastOk: null, rev: "", error: "", changed: false, count: 0 };
let catalogRef = null;
let inflight = null;

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
function git(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim())) : resolve(out.trim())));
  });
}

async function gitSync(catalog) {
  const dir = path.join(cfg.DATA_DIR, "repo");
  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.rmSync(dir, { recursive: true, force: true });
    await git(["clone", "--depth", "1", "--branch", cfg.REPO_BRANCH, cfg.REPO_URL, dir]);
  } else {
    await git(["-C", dir, "fetch", "--depth", "1", "origin", cfg.REPO_BRANCH]);
    await git(["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
  }
  state.rev = await git(["-C", dir, "rev-parse", "--short", "HEAD"]);
  const before = catalog.version;
  if (!catalog.setBaseDir(path.join(dir, cfg.REPO_SUBDIR)) && catalog.baseDir !== cfg.SEED_DIR) throw new Error("repository contains no icons; keeping previous set");
  return catalog.version !== before;
}

async function mirrorSync(catalog) {
  const dir = path.join(cfg.DATA_DIR, "mirror");
  const manFile = path.join(dir, ".manifest.json");
  const res = await fetch(`${cfg.UPSTREAM}/api/manifest`, { signal: AbortSignal.timeout(20000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`upstream manifest: HTTP ${res.status}`);
  const remote = await res.json();
  if (!Array.isArray(remote.icons) || !remote.icons.length) throw new Error("upstream manifest is empty");
  let local = {};
  try { local = JSON.parse(fs.readFileSync(manFile, "utf8")); } catch { /* first run */ }
  const next = {};
  const todo = [];
  for (const i of remote.icons) {
    if (!cfg.NAME_RE.test(i.set) || !cfg.NAME_RE.test(i.name)) continue;
    const key = `${i.set}/${i.name}`;
    next[key] = i.hash;
    if (local[key] !== i.hash || !fs.existsSync(path.join(dir, i.set, `${i.name}.svg`))) todo.push(i);
  }
  let changed = false;
  let idx = 0;
  const worker = async () => {
    while (idx < todo.length) {
      const i = todo[idx++];
      const r = await fetch(`${cfg.UPSTREAM}/i/${i.set}/${i.name}.svg`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) { delete next[`${i.set}/${i.name}`]; continue; }
      const out = sanitize(await r.text(), { set: i.set, normalize: false });
      if (out.errors.length) { log(`mirror: skipped ${i.set}/${i.name}: ${out.errors[0]}`); delete next[`${i.set}/${i.name}`]; continue; }
      fs.mkdirSync(path.join(dir, i.set), { recursive: true });
      const file = path.join(dir, i.set, `${i.name}.svg`);
      const tmp = `${file}.${crypto.randomBytes(3).toString("hex")}.tmp`;
      fs.writeFileSync(tmp, out.svg);
      fs.renameSync(tmp, file);
      changed = true;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const key of Object.keys(local)) {
    if (!(key in next)) { fs.rmSync(path.join(dir, `${key}.svg`), { force: true }); changed = true; }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manFile, JSON.stringify(next));
  state.rev = String(remote.version || "");
  const before = catalog.version;
  catalog.setBaseDir(dir);
  return changed || catalog.version !== before;
}

function run(catalog) {
  catalogRef = catalog;
  if (state.mode === "bundled") return Promise.resolve({ skipped: "no ICONS_REPO_URL or ICONS_UPSTREAM configured" });
  if (inflight) return inflight;
  state.running = true;
  inflight = (async () => {
    try {
      state.changed = state.mode === "git" ? await gitSync(catalog) : await mirrorSync(catalog);
      state.lastOk = new Date().toISOString();
      state.error = "";
      state.count = catalog.list.length;
      if (state.changed) log(`${state.mode} sync: ${catalog.list.length} icons (version ${catalog.version}${state.rev ? ", " + state.rev : ""})`);
      return { changed: state.changed, rev: state.rev, count: state.count };
    } catch (e) {
      state.error = e.message;
      log(`${state.mode} sync failed: ${e.message}`);
      return { error: e.message };
    } finally {
      state.lastRun = new Date().toISOString();
      state.running = false;
      inflight = null;
    }
  })();
  return inflight;
}

function start(catalog) {
  if (state.mode === "bundled") return;
  // Use the previously synced copy immediately so a cold start is never empty.
  const dir = path.join(cfg.DATA_DIR, state.mode === "git" ? path.join("repo", cfg.REPO_SUBDIR) : "mirror");
  if (fs.existsSync(dir)) catalog.setBaseDir(dir);
  run(catalog);
  if (cfg.SYNC_INTERVAL_MS > 0) setInterval(() => run(catalog), cfg.SYNC_INTERVAL_MS).unref();
}

module.exports = { state, run, start };
