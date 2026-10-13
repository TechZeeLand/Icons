// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";
const { statsFile } = require("./store");

// Anonymous counters only: no IP addresses, no user agents, no referrers.
let dirty = false;
const day = () => new Date().toISOString().slice(0, 10);

function bump(kind, key) {
  const d = (statsFile.data.days[day()] ||= { icons: 0, pages: 0, api: 0 });
  d[kind] = (d[kind] || 0) + 1;
  if (kind === "icons" && key) statsFile.data.top[key] = (statsFile.data.top[key] || 0) + 1;
  dirty = true;
}

function flush() {
  if (!dirty) return;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  for (const d of Object.keys(statsFile.data.days)) if (d < cutoff) delete statsFile.data.days[d];
  const top = Object.entries(statsFile.data.top).sort((a, b) => b[1] - a[1]).slice(0, 500);
  statsFile.data.top = Object.fromEntries(top);
  try { statsFile.save(); dirty = false; } catch (e) { console.error("[stats] save failed:", e.message); }
}
setInterval(flush, 60000).unref();
process.on("exit", flush);

function summary(days = 14) {
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    rows.push({ day: k, ...(statsFile.data.days[k] || { icons: 0, pages: 0, api: 0 }) });
  }
  const total = Object.values(statsFile.data.days).reduce((a, d) => a + (d.icons || 0), 0);
  const top = Object.entries(statsFile.data.top).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { rows, total, top, today: rows[rows.length - 1] };
}

module.exports = { bump, flush, summary };
