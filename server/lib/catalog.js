// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA_DIR, SEED_DIR, SET_ORDER, NAME_RE } = require("./config");
const { metaFile } = require("./store");

const CUSTOM_DIR = path.join(DATA_DIR, "custom");
const MAX_SVG_BYTES = 64 * 1024;
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");
const rank = (set) => { const i = SET_ORDER.indexOf(set); return i === -1 ? SET_ORDER.length : i; };

function scan(dir, source) {
  const out = [];
  let sets = [];
  try {
    sets = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && NAME_RE.test(d.name)).map((d) => d.name);
  } catch { return out; }
  for (const set of sets) {
    for (const f of fs.readdirSync(path.join(dir, set)).sort()) {
      if (!f.endsWith(".svg")) continue;
      const name = f.slice(0, -4);
      if (!NAME_RE.test(name)) continue;
      const full = path.join(dir, set, f);
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || st.size > MAX_SVG_BYTES) continue;
        const svg = fs.readFileSync(full, "utf8");
        if (!/^\s*(<\?xml[^>]*>\s*)?<svg\b/.test(svg)) continue;
        if (/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(svg)) continue; // never serve active content
        out.push({ set, name, key: `${set}/${name}`, svg, source });
      } catch { /* unreadable file: skip */ }
    }
  }
  return out;
}

class Catalog {
  constructor() {
    this.baseDir = SEED_DIR;
    this.all = [];        // every icon including hidden ones (admin view)
    this.list = [];       // public icons, in set order
    this.byKey = new Map();
    this.byName = new Map();
    this.version = "empty";
    this.reload();
  }

  setBaseDir(dir) { this.baseDir = dir; return this.reload(); }

  reload() {
    const merged = new Map();
    for (const e of scan(this.baseDir, "repo")) merged.set(e.key, e);
    for (const e of scan(CUSTOM_DIR, "custom")) {
      const prev = merged.get(e.key);
      merged.set(e.key, { ...e, source: prev ? "override" : "custom" });
    }
    const hidden = new Set(metaFile.data.hidden);
    const all = [...merged.values()].sort((a, b) => rank(a.set) - rank(b.set) || a.set.localeCompare(b.set) || a.name.localeCompare(b.name));
    for (const e of all) {
      e.hidden = hidden.has(e.key);
      e.tags = metaFile.data.tags[e.key] || [];
      e.hash = sha(e.svg).slice(0, 10);
    }
    const list = all.filter((e) => !e.hidden);
    if (!list.length && this.list.length) return false; // never wipe a working catalog
    this.all = all;
    this.list = list;
    this.byKey = new Map(all.map((e) => [e.key, e]));
    this.byName = new Map();
    for (const e of list) if (!this.byName.has(e.name)) this.byName.set(e.name, e);
    this.version = sha(list.map((e) => e.key + e.hash).join("|")).slice(0, 12);
    return true;
  }

  get(key) { const e = this.byKey.get(key); return e && !e.hidden ? e : null; }
  find(set, name) { return set ? this.get(`${set}/${name}`) : this.byName.get(name) || null; }
  names() { return new Set(this.all.map((e) => e.name)); }
  sets() { const s = {}; for (const e of this.list) s[e.set] = (s[e.set] || 0) + 1; return s; }

  search(q, set) {
    const terms = String(q || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
    return this.list.filter((e) => (!set || e.set === set) && terms.every((t) => e.name.includes(t) || e.tags.some((x) => x.includes(t))));
  }

  manifest() {
    return { version: this.version, total: this.list.length, icons: this.list.map((e) => ({ set: e.set, name: e.name, hash: e.hash })) };
  }

  // ---- custom icon management (admin) ----
  saveCustom(set, name, svg) {
    if (!NAME_RE.test(set) || !NAME_RE.test(name)) throw new Error("Invalid set or name");
    const dir = path.join(CUSTOM_DIR, set);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.svg`);
    const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, svg);
    fs.renameSync(tmp, file);
    this.reload();
  }

  deleteCustom(key) {
    const e = this.byKey.get(key);
    if (!e || e.source === "repo") return false;
    fs.rmSync(path.join(CUSTOM_DIR, e.set, `${e.name}.svg`), { force: true });
    delete metaFile.data.tags[key];
    metaFile.data.hidden = metaFile.data.hidden.filter((k) => k !== key);
    metaFile.save();
    this.reload();
    return true;
  }

  setHidden(key, hidden) {
    const s = new Set(metaFile.data.hidden);
    hidden ? s.add(key) : s.delete(key);
    metaFile.data.hidden = [...s];
    metaFile.save();
    this.reload();
  }

  setTags(key, tags) {
    const clean = [...new Set(tags.map((t) => String(t).toLowerCase().trim().replace(/[^a-z0-9-]/g, "")).filter(Boolean))].slice(0, 12);
    if (clean.length) metaFile.data.tags[key] = clean; else delete metaFile.data.tags[key];
    metaFile.save();
    this.reload();
  }

  customEntries() { return this.all.filter((e) => e.source !== "repo"); }
}

// ---- rendering ----
function clampNum(v, min, max) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
}
function parseColor(v) {
  if (v === null || v === undefined || v === "") return null;
  const c = String(v).replace(/^#/, "");
  if (/^([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)) return "#" + c;
  if (/^[a-zA-Z]{3,24}$/.test(c)) return c;
  return NaN;
}
function setAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=)"[^"]*"`);
  return re.test(tag) ? tag.replace(re, `$1"${value}"`) : tag.replace(/>$/, ` ${name}="${value}">`);
}

/** params: URLSearchParams. Returns SVG text or null when a parameter is invalid. */
function render(entry, params) {
  const size = clampNum(params.get("size"), 1, 2048);
  const stroke = clampNum(params.get("stroke"), 0.25, 4);
  const color = parseColor(params.get("color"));
  if ([size, stroke, color].some(Number.isNaN)) return null;
  let svg = entry.svg.replace(/^\s*<\?xml[^>]*>\s*/, "");
  const open = svg.match(/<svg\b[^>]*>/)[0];
  let tag = open;
  if (size !== null) tag = setAttr(setAttr(tag, "width", size), "height", size);
  if (stroke !== null && /\sstroke-width=/.test(tag)) tag = setAttr(tag, "stroke-width", stroke);
  svg = svg.replace(open, tag);
  if (color !== null) svg = svg.replace(/currentColor/g, color);
  return svg;
}

function spriteSvg(entries) {
  const out = ['<svg xmlns="http://www.w3.org/2000/svg">'];
  for (const e of entries) {
    const open = e.svg.match(/<svg\b[^>]*>/);
    if (!open) continue;
    const attr = (n) => (open[0].match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1];
    const keep =
      ["fill", "stroke", "stroke-linecap", "stroke-linejoin"].map((n) => (attr(n) !== undefined ? ` ${n}="${attr(n)}"` : "")).join("") +
      (attr("stroke-width") !== undefined ? ` style="stroke-width:var(--sw,${attr("stroke-width")})"` : "");
    const inner = e.svg.slice(e.svg.indexOf(open[0]) + open[0].length).replace(/<\/svg>\s*$/, "");
    out.push(`<symbol id="${e.set}-${e.name}" viewBox="${attr("viewBox") || "0 0 24 24"}"><g${keep}>${inner}</g></symbol>`);
  }
  out.push("</svg>");
  return out.join("\n");
}

/** FA-style stylesheet: <i class="zi zi-home"></i>. Icons are CSS masks, so they follow `color`. */
function maskCss(entries, prefix = "i/") {
  const css = [
    "/* zi.css - generated by the icon service. Usage: <i class=\"zi zi-home\"></i> */",
    ".zi{display:inline-block;width:1em;height:1em;background-color:currentColor;-webkit-mask:var(--zi) center/contain no-repeat;mask:var(--zi) center/contain no-repeat;vertical-align:-.125em;flex:none}",
    ".zi-lg{width:1.33em;height:1.33em}.zi-xl{width:1.6em;height:1.6em}.zi-2x{width:2em;height:2em}.zi-3x{width:3em;height:3em}",
    ".zi-spin{animation:zi-spin 1s linear infinite}@keyframes zi-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.zi-spin{animation-duration:3s}}",
  ];
  for (const e of entries) css.push(`.zi-${e.name}{--zi:url("${prefix}${e.set}/${e.name}.svg")}`);
  return css.join("\n") + "\n";
}

module.exports = { Catalog, render, spriteSvg, maskCss, parseColor, CUSTOM_DIR };
