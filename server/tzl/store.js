// Flat-file JSON storage with atomic writes, plus the audit log. Everything lives in Kit.data.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const K = require("./kit");

const P = (rel = "") => (rel ? path.join(K.data, rel) : K.data);
function read(rel, def = null) {
  try { const d = JSON.parse(fs.readFileSync(P(rel), "utf8")); return d === null ? def : d; } catch { return def; }
}
function write(rel, data) {
  const f = P(rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o660 });
  fs.renameSync(tmp, f);
  return true;
}
function update(rel, fn, def = {}) { const n = fn(read(rel, def)); write(rel, n); return n; }

function log(msg, user = "-") {
  const f = P("activity.log");
  try {
    fs.appendFileSync(f, JSON.stringify({ t: K.now(), u: user, m: msg }) + "\n");
    if (fs.statSync(f).size > 300000) {
      const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean).slice(-500);
      fs.writeFileSync(f, lines.join("\n") + "\n");
    }
  } catch { /* logging must never break a request */ }
}
function activity(n = 50) {
  try {
    return fs.readFileSync(P("activity.log"), "utf8").split("\n").filter(Boolean).slice(-n).reverse()
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
module.exports = { P, read, write, update, log, activity };
