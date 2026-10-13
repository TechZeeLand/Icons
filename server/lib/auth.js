// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const crypto = require("crypto");
const { promisify } = require("util");
const cfg = require("./config");
const { adminFile } = require("./store");

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL = 12 * 3600 * 1000;
const sessions = new Map(); // sid -> { user, csrf, exp }
const attempts = new Map(); // ip -> { fails, until }
let setupToken = "";

async function hash(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function check(password, stored) {
  const p = String(stored).split("$");
  if (p[0] !== "scrypt" || p.length !== 6) return false;
  const key = await scrypt(password, Buffer.from(p[4], "base64"), 64, { N: +p[1], r: +p[2], p: +p[3] });
  const want = Buffer.from(p[5], "base64");
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

const admin = {
  exists: () => Boolean(adminFile.data.hash),
  username: () => adminFile.data.username,
  async init() {
    if (this.exists()) return;
    if (cfg.ADMIN_PASSWORD) {
      if (cfg.ADMIN_PASSWORD.length < 10) { console.error("[admin] ADMIN_PASSWORD must be at least 10 characters; ignoring it"); }
      else {
        adminFile.data = { username: cfg.ADMIN_USER, hash: await hash(cfg.ADMIN_PASSWORD) };
        adminFile.save();
        console.log(`[admin] created admin "${cfg.ADMIN_USER}" from ADMIN_PASSWORD. You can remove that variable now.`);
        return;
      }
    }
    setupToken = crypto.randomBytes(18).toString("base64url");
    console.log(`[admin] no admin account yet. Open /admin/setup and enter this one-time token: ${setupToken}`);
  },
  setupTokenOk: (t) => Boolean(setupToken) && safeEqual(String(t || ""), setupToken),
  async create(username, password) {
    adminFile.data = { username, hash: await hash(password) };
    adminFile.save();
    setupToken = "";
  },
  async verify(username, password) {
    if (!this.exists()) return false;
    const okPw = await check(password, adminFile.data.hash);
    return okPw && safeEqual(String(username), adminFile.data.username);
  },
  async change(username, password) {
    adminFile.data = { username, hash: password ? await hash(password) : adminFile.data.hash };
    adminFile.save();
    sessions.clear();
  },
  checkPassword: (pw) => check(pw, adminFile.data.hash),
};

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const session = {
  create(user) {
    const sid = crypto.randomBytes(32).toString("base64url");
    const s = { user, csrf: crypto.randomBytes(24).toString("base64url"), exp: Date.now() + SESSION_TTL };
    sessions.set(sid, s);
    return { sid, ...s };
  },
  get(sid) {
    const s = sessions.get(sid);
    if (!s) return null;
    if (s.exp < Date.now()) { sessions.delete(sid); return null; }
    s.exp = Date.now() + SESSION_TTL; // sliding
    return { sid, ...s };
  },
  destroy: (sid) => sessions.delete(sid),
};

const throttle = {
  locked(ip) { const a = attempts.get(ip); return Boolean(a && a.until > Date.now()); },
  fail(ip) {
    const a = attempts.get(ip) || { fails: 0, until: 0 };
    if (a.until && a.until <= Date.now()) { a.fails = 0; a.until = 0; }
    a.fails++;
    if (a.fails >= 5) a.until = Date.now() + 15 * 60 * 1000;
    attempts.set(ip, a);
  },
  ok: (ip) => attempts.delete(ip),
};
setInterval(() => { const n = Date.now(); for (const [k, v] of attempts) if (v.until && v.until < n) attempts.delete(k); for (const [k, v] of sessions) if (v.exp < n) sessions.delete(k); }, 600000).unref();

module.exports = { admin, session, throttle, safeEqual };
