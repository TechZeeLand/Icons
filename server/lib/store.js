// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DATA_DIR } = require("./config");

fs.mkdirSync(DATA_DIR, { recursive: true });

/** Small JSON file with atomic writes. */
class JsonFile {
  constructor(name, defaults) {
    this.file = path.join(DATA_DIR, name);
    this.defaults = defaults;
    this.data = structuredClone(defaults);
    try {
      this.data = { ...structuredClone(defaults), ...JSON.parse(fs.readFileSync(this.file, "utf8")) };
    } catch (e) {
      if (e.code !== "ENOENT") console.error(`[store] ${name} unreadable (${e.message}), using defaults`);
    }
  }
  save() {
    const tmp = `${this.file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

const DEFAULT_CATEGORIES = [
  { id: "ui", label: "UI", kind: "line" },
  { id: "social", label: "Social", kind: "brand" },
  { id: "other", label: "Other", kind: "free" },
  { id: "extras", label: "Extras", kind: "free", locked: true },
];
// categories: ordered list. category: per-icon assignment ("set/name" -> category id). Icons without one use the category
// that matches their folder, or "extras".
const metaFile = new JsonFile("meta.json", { tags: {}, hidden: [], categories: DEFAULT_CATEGORIES, category: {} });

// A secret that survives restarts (used to sign nothing sensitive today, reserved for tokens).
function secret() {
  const f = path.join(DATA_DIR, "secret.key");
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(f, s, { mode: 0o600 });
    return s;
  }
}

module.exports = { JsonFile, metaFile, secret };
