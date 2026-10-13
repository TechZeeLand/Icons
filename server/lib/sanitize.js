// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

/**
 * Rebuilds an SVG from a whitelist of elements and attributes, so scripts, event handlers,
 * external references, metadata and editor junk can never get through.
 *   sanitize(source, { set: "ui" })  ->  { svg, warnings: [], errors: [] }
 * For the "ui" set the icon is also normalised to the house style (24x24 grid, currentColor).
 */

const MAX_SOURCE = 64 * 1024;
const MAX_OUT = { ui: 6 * 1024, social: 8 * 1024, other: 16 * 1024 };

const ELEMENTS = {};
for (const n of ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "symbol", "use"]) ELEMENTS[n.toLowerCase()] = n;

const ATTRS = {};
for (const n of [
  "d", "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "width", "height", "viewBox", "fill", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule",
  "clip-rule", "fill-opacity", "stroke-opacity", "opacity", "transform", "id", "clip-path", "mask", "offset", "stop-color",
  "stop-opacity", "gradientUnits", "gradientTransform", "xmlns", "preserveAspectRatio", "fx", "fy", "href", "clipPathUnits",
  "maskUnits", "maskContentUnits", "vector-effect", "display", "visibility", "color",
]) ATTRS[n.toLowerCase()] = n;

const SAFE_VALUE = /^[^<>"`\\]*$/;
const KEEP_COLOURS = new Set(["none", "currentcolor", "inherit", "transparent"]);

function parse(src, warnings, errors) {
  const re = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  let skip = null; // { name, depth }
  const dropped = new Set();
  let m;
  while ((m = re.exec(src))) {
    const closing = m[1] === "/";
    const raw = m[2].replace(/^svg:/i, "").toLowerCase();
    const self = m[4] === "/";
    if (skip) {
      if (raw === skip.name) {
        if (closing) skip.depth--;
        else if (!self) skip.depth++;
        if (skip.depth === 0) skip = null;
      }
      continue;
    }
    if (closing) {
      const top = stack[stack.length - 1];
      if (stack.length === 1 || top.lname !== raw) {
        errors.push(`Malformed SVG: unexpected </${m[2]}>`);
        return null;
      }
      stack.pop();
      continue;
    }
    if (!ELEMENTS[raw]) {
      dropped.add(raw);
      if (!self) skip = { name: raw, depth: 1 };
      continue;
    }
    const node = { name: ELEMENTS[raw], lname: raw, attrs: {}, children: [] };
    const ar = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = ar.exec(m[3]))) {
      const lname = a[1].toLowerCase().replace(/^xlink:/, "");
      const value = (a[2] ?? a[3] ?? a[4] ?? "").trim();
      const canon = ATTRS[lname];
      if (!canon || a[1].includes(":") && !/^xlink:href$/i.test(a[1]) && a[1].toLowerCase() !== "xmlns") {
        if (/^on/i.test(a[1]) || lname === "style" || lname === "class") dropped.add(`${a[1]} attribute`);
        continue;
      }
      if (!SAFE_VALUE.test(value) || /javascript:|data:|expression\(/i.test(value)) {
        dropped.add(`unsafe ${canon}`);
        continue;
      }
      if (canon === "href" && !value.startsWith("#")) { dropped.add("external href"); continue; }
      if (/url\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/.test(value)) { dropped.add(`external ${canon}`); continue; }
      node.attrs[canon] = value;
    }
    stack[stack.length - 1].children.push(node);
    if (!self) stack.push(node);
  }
  if (stack.length !== 1) {
    errors.push(`Malformed SVG: <${stack[stack.length - 1].name}> is not closed`);
    return null;
  }
  if (dropped.size) warnings.push(`Removed: ${[...dropped].join(", ")}`);
  return root;
}

function walk(node, fn) {
  fn(node);
  node.children.forEach((c) => walk(c, fn));
}

function serialise(node) {
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+);)/g, "&amp;")}"`).join("");
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serialise).join("")}</${node.name}>`;
}

function sanitize(source, { set = "ui", normalize = true } = {}) {
  const warnings = [];
  const errors = [];
  let src = String(source || "");
  if (Buffer.byteLength(src) > MAX_SOURCE) return { svg: "", warnings, errors: ["File is larger than 64 KB."] };
  src = src.replace(/^\uFEFF/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?>/gi, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (/<!ENTITY/i.test(src)) return { svg: "", warnings, errors: ["Entity declarations are not allowed."] };
  if (!/<svg[\s>]/i.test(src)) return { svg: "", warnings, errors: ["No <svg> element found."] };

  const tree = parse(src, warnings, errors);
  if (!tree) return { svg: "", warnings, errors };
  const svgNode = tree.children.find((n) => n.lname === "svg");
  if (!svgNode || tree.children.length !== 1) return { svg: "", warnings, errors: ["The file must contain exactly one root <svg>."] };

  const a = svgNode.attrs;
  a.xmlns = "http://www.w3.org/2000/svg";
  if (!a.viewBox) {
    const w = parseFloat(a.width), h = parseFloat(a.height);
    if (w > 0 && h > 0) {
      a.viewBox = `0 0 ${w} ${h}`;
      warnings.push(`Added viewBox from width/height (${a.viewBox}).`);
    } else errors.push("The <svg> needs a viewBox.");
  }

  if (set === "ui" && normalize) {
    if (a.viewBox && !/^0[ ,]+0[ ,]+24[ ,]+24$/.test(a.viewBox)) errors.push(`ui icons use a 24x24 grid (viewBox="0 0 24 24"), this one has "${a.viewBox}". Redraw or scale it to 24x24.`);
    else a.viewBox = "0 0 24 24";
    a.width = "24";
    a.height = "24";
    let recoloured = false;
    let anyPaint = false;
    walk(svgNode, (n) => {
      for (const k of ["fill", "stroke"]) {
        if (n.attrs[k] === undefined) continue;
        if (n !== svgNode) anyPaint = true;
        const v = n.attrs[k];
        if (!KEEP_COLOURS.has(v.toLowerCase()) && !/^url\(/i.test(v)) { n.attrs[k] = "currentColor"; recoloured = true; }
      }
    });
    if (recoloured) warnings.push("Hard-coded colours were replaced with currentColor so the icon follows text colour.");
    if (a.fill === undefined && a.stroke === undefined && !anyPaint) {
      Object.assign(a, { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" });
      warnings.push("Applied the standard line-icon style (stroke 2, round caps and joins).");
    }
    if (a.stroke !== undefined && a["stroke-width"] === undefined) a["stroke-width"] = "2";
  }

  const order = ["xmlns", "viewBox", "width", "height", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"];
  const sorted = {};
  for (const k of order) if (a[k] !== undefined) sorted[k] = a[k];
  for (const k of Object.keys(a)) if (!(k in sorted)) sorted[k] = a[k];
  svgNode.attrs = sorted;

  let shapes = 0;
  walk(svgNode, (n) => { if (n !== svgNode && ["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "use"].includes(n.lname)) shapes++; });
  if (!shapes) errors.push("The SVG contains no drawable shapes.");

  const svg = serialise(svgNode) + "\n";
  const max = MAX_OUT[set] || MAX_OUT.other;
  if (Buffer.byteLength(svg) > max) errors.push(`Result is ${Buffer.byteLength(svg)} bytes, over the ${max} byte limit for the ${set} set. Simplify the paths.`);
  return { svg: errors.length ? "" : svg, warnings, errors };
}

module.exports = { sanitize };
