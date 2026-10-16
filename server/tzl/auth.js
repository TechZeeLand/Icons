// Admin authentication: one admin account (scrypt), in-memory sessions with CSRF tokens, login throttling.
// The public site never sets a cookie. Sessions end when the container restarts.
"use strict";
const crypto = require("crypto");
const { promisify } = require("util");
const K = require("./kit");
const store = require("./store");

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL = 12 * 3600 * 1000;
const sessions = new Map();
const attempts = new Map();
let setupToken = "";

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
async function hash(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function check(pw, stored) {
  const p = String(stored || "").split("$");
  if (p[0] !== "scrypt" || p.length !== 6) return false;
  const key = await scrypt(pw, Buffer.from(p[4], "base64"), 64, { N: +p[1], r: +p[2], p: +p[3] });
  const want = Buffer.from(p[5], "base64");
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
const file = () => store.read("admin.json", {}) || {};

const admin = {
  exists: () => Boolean(file().hash),
  username: () => file().username || "",
  lastLogin: () => file().last_login || "",
  async init() {
    if (this.exists()) return;
    const pass = K.env("TZL_ADMIN_PASSWORD");
    if (pass) {
      if (pass.length < 10) console.error("[admin] TZL_ADMIN_PASSWORD must be at least 10 characters; ignoring it");
      else {
        const user = K.env("TZL_ADMIN_USER", "admin");
        store.write("admin.json", { username: user, hash: await hash(pass), created: K.now() });
        console.log(`[admin] created admin "${user}" from TZL_ADMIN_PASSWORD. You can remove that variable now.`);
        return;
      }
    }
    setupToken = crypto.randomBytes(18).toString("base64url");
    console.log(`[admin] no admin account yet. Open /admin/setup and enter this one-time token: ${setupToken}`);
  },
  setupTokenOk: (t) => Boolean(setupToken) && safeEqual(t || "", setupToken),
  async create(username, password) { store.write("admin.json", { username, hash: await hash(password), created: K.now() }); setupToken = ""; },
  async verify(username, password) {
    if (!this.exists()) return false;
    const ok = await check(password, file().hash);
    return ok && safeEqual(username, file().username);
  },
  async change(username, password) {
    const f = file();
    store.write("admin.json", { ...f, username, hash: password ? await hash(password) : f.hash });
    sessions.clear();
  },
  checkPassword: (pw) => check(pw, file().hash),
  touch() { store.write("admin.json", { ...file(), last_login: K.now() }); },
};
const session = {
  create(user) {
    const sid = crypto.randomBytes(32).toString("base64url");
    const s = { user, csrf: crypto.randomBytes(24).toString("base64url"), exp: Date.now() + SESSION_TTL, flash: [] };
    sessions.set(sid, s);
    return { sid, ...s };
  },
  get(sid) {
    const s = sessions.get(sid);
    if (!s) return null;
    if (s.exp < Date.now()) { sessions.delete(sid); return null; }
    s.exp = Date.now() + SESSION_TTL;
    s.sid = sid;
    return s; // the live object: flash messages survive redirects
  },
  destroy: (sid) => sessions.delete(sid),
};
const MAX_FAILS = 6, WINDOW = 15 * 60 * 1000;
const throttle = {
  locked(ip) { const a = attempts.get(ip); return Boolean(a && a.until > Date.now()); },
  fail(ip) {
    const a = attempts.get(ip) || { fails: 0, until: 0, last: 0 };
    if ((a.until && a.until <= Date.now()) || Date.now() - a.last > WINDOW) { a.fails = 0; a.until = 0; }
    a.fails++; a.last = Date.now();
    if (a.fails >= MAX_FAILS) a.until = Date.now() + WINDOW;
    attempts.set(ip, a);
  },
  ok: (ip) => attempts.delete(ip),
  recent() { let n = 0; for (const a of attempts.values()) if (Date.now() - a.last < WINDOW) n += a.fails; return n; },
};
setInterval(() => { const n = Date.now(); for (const [k, v] of attempts) if (n - v.last > WINDOW) attempts.delete(k); for (const [k, v] of sessions) if (v.exp < n) sessions.delete(k); }, 600000).unref();
module.exports = { admin, session, throttle, safeEqual };
