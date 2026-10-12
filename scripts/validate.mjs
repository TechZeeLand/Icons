// SPDX-License-Identifier: AGPL-3.0-or-later
// Zero-dependency sanity check for every icon. Run: node scripts/validate.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
const MAX_BYTES = 6 * 1024;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const FORBIDDEN = [/<script/i, /<foreignObject/i, /<metadata/i, /<image\b/i, /<style/i, /\son[a-z]+\s*=/i, /\s(?:xlink:)?href\s*=\s*"(?!#)/i, /javascript:/i, /c2pa/i, /<!ENTITY/i];
const errors = [];
const seen = new Map();
let count = 0;

function wellFormed(src) {
  // Minimal tag balance check (no npm deps): catches unclosed or crossed tags.
  const stack = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|\x27[^\x27]*\x27|[^>"\x27])*?)(\/?)>/g;
  let m, last = 0;
  while ((m = re.exec(src))) {
    if (m[2] === undefined) continue;
    if (src.slice(last, m.index).replace(/\s+/g, "").length && !stack.length) return "text outside root";
    last = re.lastIndex;
    if (m[4]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return `unexpected </${m[2]}>`; }
    else stack.push(m[2]);
  }
  return stack.length ? `unclosed <${stack.pop()}>` : null;
}

for (const set of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const f of readdirSync(join(root, set.name)).sort()) {
    const rel = `${set.name}/${f}`;
    if (!f.endsWith(".svg")) { errors.push(`${rel}: only .svg files belong here`); continue; }
    const name = f.slice(0, -4);
    const src = readFileSync(join(root, set.name, f), "utf8");
    count++;
    if (!NAME.test(name)) errors.push(`${rel}: name must be lower-case kebab-case`);
    if (seen.has(name)) errors.push(`${rel}: same name already used in ${seen.get(name)} (/i/${name}.svg would be ambiguous)`);
    else seen.set(name, set.name);
    if (statSync(join(root, set.name, f)).size > MAX_BYTES) errors.push(`${rel}: larger than ${MAX_BYTES} bytes (embedded data or metadata?)`);
    const bad = wellFormed(src);
    if (bad) errors.push(`${rel}: malformed XML (${bad})`);
    const open = (src.match(/<svg\b[^>]*>/) || [""])[0];
    if (!open) { errors.push(`${rel}: no <svg> root`); continue; }
    if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(open)) errors.push(`${rel}: missing xmlns`);
    if (!/\sviewBox="[^"]+"/.test(open)) errors.push(`${rel}: missing viewBox`);
    for (const re of FORBIDDEN) if (re.test(src)) errors.push(`${rel}: forbidden content ${re}`);
    if (set.name === "ui") {
      if (!/\sviewBox="0 0 24 24"/.test(open)) errors.push(`${rel}: ui icons use viewBox="0 0 24 24"`);
      if (!/currentColor/.test(src)) errors.push(`${rel}: ui icons must use currentColor`);
      if (/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(src)) errors.push(`${rel}: ui icons must not hard-code colours`);
    }
  }
}
if (errors.length) { console.error(errors.join("\n")); console.error(`\n${errors.length} problem(s) in ${count} icons`); process.exit(1); }
console.log(`OK: ${count} icons, ${seen.size} unique names`);
