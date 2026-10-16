// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const path = require("path");
const env = process.env;
// Legacy variable names keep working: they feed the TZL_* names the kit reads.
if (env.PUBLIC_URL && !env.TZL_BASE_URL) env.TZL_BASE_URL = env.PUBLIC_URL;
if (env.TRUST_PROXY && !env.TZL_TRUST_PROXY) env.TZL_TRUST_PROXY = /^(1|true|yes|on)$/i.test(env.TRUST_PROXY) ? "1" : "0";
if (env.ADMIN_PASSWORD && !env.TZL_ADMIN_PASSWORD) env.TZL_ADMIN_PASSWORD = env.ADMIN_PASSWORD;
if (env.ADMIN_USER && !env.TZL_ADMIN_USER) env.TZL_ADMIN_USER = env.ADMIN_USER;

const bool = (v, d = false) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const ROOT = path.resolve(__dirname, "..", "..");
const repoUrl = env.ICONS_REPO_URL || "";

module.exports = {
  ROOT,
  PORT: int(env.PORT, 3000),
  SEED_DIR: path.resolve(env.SEED_DIR || path.join(ROOT, "icons")),
  DATA_DIR: path.resolve(env.DATA_DIR || "/data"),
  PUBLIC_DIR: path.join(ROOT, "public"),
  CLIENT_DIR: path.join(ROOT, "client"),
  TOOLS_DIR: path.join(ROOT, "tools"),
  REPO_URL: repoUrl,
  REPO_BRANCH: env.ICONS_REPO_BRANCH || "main",
  REPO_SUBDIR: env.ICONS_SUBDIR || "icons",
  UPSTREAM: (env.ICONS_UPSTREAM || "").replace(/\/+$/, ""),
  SYNC_INTERVAL_MS: Math.max(0, int(env.SYNC_INTERVAL_SECONDS, 300)) * 1000,
  SYNC_TOKEN: env.SYNC_TOKEN || "",
  SOURCE_URL: env.SOURCE_URL || repoUrl.replace(/\.git$/, ""),
  PUBLIC_URL: (env.PUBLIC_URL || "").replace(/\/+$/, ""),
  TRUST_PROXY: bool(env.TRUST_PROXY, false),
  COOKIE_SECURE: env.COOKIE_SECURE === undefined ? "auto" : bool(env.COOKIE_SECURE),
  CACHE_MAX_AGE: int(env.CACHE_MAX_AGE, 86400),
  CORS_ORIGIN: env.CORS_ORIGIN || "*",
  ADMIN_ENABLED: bool(env.ADMIN_ENABLED, true),
  ADMIN_USER: env.ADMIN_USER || "admin",
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || "",
  SET_ORDER: ["ui", "social", "other"],
  NAME_RE: /^[a-z0-9][a-z0-9-]{0,63}$/,
};
