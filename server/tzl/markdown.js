// Minimal, safe Markdown to HTML. All raw HTML is escaped.
"use strict";
const K = require("./kit");

const slug = (s) => String(s).toLowerCase().replace(/<[^>]*>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function inline(s, req) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${K.e(c)}</code>`); return `\x01${codes.length - 1}\x02`; });
  s = K.e(s);
  s = s.replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>");
  s = s.replace(/(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])/gs, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const u = url.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (!/^(https?:\/\/|\/|#|mailto:)/.test(u)) return m;
    const ext = /^https?:\/\//.test(u) && !u.startsWith(K.baseUrl(req));
    return `<a href="${K.e(u)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
  });
  return s.replace(/\x01(\d+)\x02/g, (m, i) => codes[+i]);
}

function render(md, req) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const toc = [], used = new Set();
  let out = "", i = 0;
  const n = lines.length;
  const BLOCK = /^(```|#{1,4}\s|>\s?|\s*([-*]|\d+\.)\s+|-{3,}\s*$)/;
  while (i < n) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^```\s*([\w+-]*)\s*$/.exec(line))) {
      const buf = []; i++;
      while (i < n && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<div class="code-block"${m[1] ? ` data-lang="${K.e(m[1])}"` : ""}><pre><code>${K.e(buf.join("\n"))}</code></pre></div>\n`;
      continue;
    }
    if ((m = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line))) {
      const lvl = m[1].length;
      let id = slug(m[2]); const base = id; let k = 2;
      while (used.has(id)) id = `${base}-${k++}`;
      used.add(id);
      if (lvl === 2 || lvl === 3) toc.push({ level: lvl, id, text: m[2].replace(/`/g, "") });
      out += `<h${lvl} id="${id}">${inline(m[2], req)} <a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lvl}>\n`;
      i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out += "<hr>\n"; i++; continue; }
    if (line.includes("|") && i + 1 < n && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line); i += 2;
      const rows = [];
      while (i < n && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      out += `<div class="table-wrap"><table class="doc-table"><thead><tr>${head.map((c) => `<th>${inline(c, req)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, req)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>\n`;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < n && (m = /^>\s?(.*)$/.exec(lines[i]))) { buf.push(m[1]); i++; }
      out += `<blockquote><p>${inline(buf.join(" "), req)}</p></blockquote>\n`;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      out += ordered ? "<ol>" : "<ul>";
      while (i < n && (m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i]))) {
        let item = m[1]; i++;
        let c;
        while (i < n && (c = /^\s{2,}(\S.*)$/.exec(lines[i])) && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) { item += " " + c[1]; i++; }
        out += `<li>${inline(item, req)}</li>`;
      }
      out += ordered ? "</ol>\n" : "</ul>\n";
      continue;
    }
    const buf = [];
    while (i < n && lines[i].trim() && !BLOCK.test(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) buf.push(lines[i++].trim());
    out += `<p>${inline(buf.join(" "), req)}</p>\n`;
  }
  return { html: out, toc };
}
module.exports = { render, inline, slug };
