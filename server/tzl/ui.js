// Small HTML builders for admin forms. All output is escaped.
"use strict";
const K = require("./kit");
const Site = require("./site");
const e = K.e;

const text = (label, name, value, o = {}) => {
  let attrs = "";
  for (const a of ["placeholder", "maxlength", "min", "max", "step", "pattern", "autocomplete"]) if (o[a] !== undefined) attrs += ` ${a}="${e(o[a])}"`;
  if (o.required) attrs += " required";
  return `<div class="field"><label for="f_${e(name)}">${e(label)}</label><input${o.narrow ? ' class="narrow"' : ""} type="${e(o.type || "text")}" id="f_${e(name)}" name="${e(name)}" value="${e(value)}"${attrs}>${o.hint ? `<p class="hint">${o.hint}</p>` : ""}</div>`;
};
const area = (label, name, value, o = {}) =>
  `<div class="field"><label for="f_${e(name)}">${e(label)}</label><textarea${o.mono ? ' class="mono"' : ""} id="f_${e(name)}" name="${e(name)}" rows="${o.rows || 5}"${o.maxlength ? ` maxlength="${+o.maxlength}"` : ""}${o.placeholder ? ` placeholder="${e(o.placeholder)}"` : ""}>${e(value)}</textarea>${o.hint ? `<p class="hint">${o.hint}</p>` : ""}</div>`;
const select = (label, name, options, value, o = {}) =>
  `<div class="field"><label for="f_${e(name)}">${e(label)}</label><select id="f_${e(name)}" name="${e(name)}">${Object.entries(options).map(([k, v]) => `<option value="${e(k)}"${String(k) === String(value) ? " selected" : ""}>${e(v)}</option>`).join("")}</select>${o.hint ? `<p class="hint">${o.hint}</p>` : ""}</div>`;
const check = (name, label, on, hint = "") =>
  `<label class="row-check"><input type="checkbox" name="${e(name)}" value="1"${on ? " checked" : ""}><span class="switch"></span><span class="row-check-label">${e(label)}${hint ? ` <small>— ${e(hint)}</small>` : ""}</span></label>`;
const color = (label, name, value, hint = "") => {
  const v = Site.cleanColor(String(value));
  return `<div class="field"><label for="f_${e(name)}">${e(label)}</label><div class="color-row"><input type="color" id="f_${e(name)}" name="${e(name)}" value="${e(v)}" data-color-sync><input type="text" value="${e(v)}" maxlength="7" data-color-text aria-label="${e(label)} hex" class="narrow"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
};
const card = (title, icon, inner, intro = "") => `<section class="card"><h2>${K.icon(icon)} ${e(title)}</h2>${intro ? `<p class="hint">${intro}</p>` : ""}${inner}</section>`;

function linkEditor(name, rows, icons = true, withNew = true) {
  const row = (i, r) => {
    const n = `${e(name)}[${i}]`;
    return `<div class="link-row" data-row><input type="text" name="${n}[label]" value="${e(r.label || "")}" placeholder="Label" maxlength="40" aria-label="Label"><input type="text" name="${n}[url]" value="${e(r.url || "")}" placeholder="/path or https://…" maxlength="300" aria-label="URL">`
      + (icons ? `<input type="text" name="${n}[icon]" value="${e(r.icon || "")}" placeholder="icon name" maxlength="40" aria-label="Icon name" list="zi-names">` : "")
      + (withNew ? `<label class="mini-check" title="Open in a new tab"><input type="checkbox" name="${n}[new]" value="1"${r.new ? " checked" : ""}><span>New tab</span></label>` : "")
      + `<span class="row-tools"><button type="button" class="icon-btn" data-move="-1" aria-label="Move up">${K.icon("chevron-up")}</button><button type="button" class="icon-btn" data-move="1" aria-label="Move down">${K.icon("chevron-down")}</button><button type="button" class="icon-btn danger" data-remove aria-label="Remove">${K.icon("trash")}</button></span></div>`;
  };
  return `<div class="link-editor" data-link-editor data-name="${e(name)}"><div class="link-rows" data-rows>${rows.map((r, i) => row(String(i), r)).join("")}</div><template data-template>${row("__i__", {})}</template><button type="button" class="btn btn-secondary btn-sm" data-add>${K.icon("plus")} Add link</button></div>`;
}
const iconList = () => `<datalist id="zi-names">${["home", "info", "mail", "book-open", "font", "sparkles", "qr-code", "barcode", "file-pdf", "github", "youtube", "facebook", "instagram", "tiktok", "x", "linkedin", "whatsapp", "pathaopay", "heart", "globe", "star-outline", "download", "code", "shield-check", "life-buoy", "rocket", "tag", "phone", "message-square", "map-pin", "link"].map((x) => `<option value="${x}">`).join("")}</datalist>`;

/** Daily stacked bar chart (SVG). series: [[label, {date: value}, cssClass], ...] */
function chart(dates, series, H = 150) {
  const n = Math.max(1, dates.length), W = 600, bw = 26, gap = (W - n * bw) / (n + 1);
  let max = 1;
  for (const d of dates) max = Math.max(max, series.reduce((t, s) => t + (s[1][d] || 0), 0));
  let h = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H + 22}" class="chart" role="img" aria-label="Daily chart">`;
  dates.forEach((d, i) => {
    const x = gap + i * (bw + gap);
    let y = H;
    for (const s of series) {
      const v = s[1][d] || 0, hh = Math.round((v / max) * H);
      if (hh > 0) { y -= hh; h += `<rect class="${e(s[2])}" x="${Math.round(x * 10) / 10}" y="${y}" width="${bw}" height="${hh}" rx="3"><title>${e(`${d}: ${v} ${s[0]}`)}</title></rect>`; }
    }
    if (n <= 16 ? i % 2 === 0 : i % 5 === 0) h += `<text class="chart-label" x="${Math.round((x + bw / 2) * 10) / 10}" y="${H + 16}" text-anchor="middle">${e(d.slice(5))}</text>`;
  });
  h += '</svg></div><p class="legend">';
  for (const s of series) h += `<span class="dot ${e(s[2])}"></span> ${e(s[0])} (${K.number(Object.values(s[1]).reduce((a, b) => a + b, 0))}) `;
  return h + "</p>";
}
function rank(rows, link) {
  const entries = Object.entries(rows);
  if (!entries.length) return '<p class="muted">Nothing recorded yet.</p>';
  return `<ol class="rank">${entries.map(([k, n]) => `<li><span class="rank-label">${link ? link(k) : e(k)}</span><span>${K.number(n)}</span></li>`).join("")}</ol>`;
}
module.exports = { text, area, select, check, color, card, linkEditor, iconList, chart, rank };
