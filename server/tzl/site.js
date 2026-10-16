// Site settings: everything an admin can edit. Stored in data/site.json. Same keys as the PHP kit (Site::BASE_DEFAULTS).
"use strict";
const fs = require("fs");
const K = require("./kit");
const store = require("./store");

const SOCIAL_DEFAULT = [
  { icon: "youtube", label: "YouTube", url: "https://www.youtube.com/@TechZeeLand" },
  { icon: "facebook", label: "Facebook", url: "https://www.facebook.com/TechZeeLand" },
  { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/TechZeeLand" },
  { icon: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@TechZeeLand" },
  { icon: "github", label: "GitHub", url: "https://github.com/TechZeeLand" },
  { icon: "pathaopay", label: "Support", url: "https://pathaopay.me/@azlanaziz" },
];

const BASE_DEFAULTS = {
  site_name: "", short_name: "", tagline: "", description: "", base_url: "", root_domain: "",
  svc_fonts: "", svc_icons: "", svc_qr: "", svc_cover: "",
  contact_email: "azlanaziz@rayaz.org", github_url: "", github_label: "Source on GitHub", show_github: true,
  owner_name: "TechZeeLand", owner_url: "https://github.com/TechZeeLand", license_name: "AGPL-3.0", license_url: "https://www.gnu.org/licenses/agpl-3.0.html",
  accent: "#6cc6af", default_theme: "auto", logo_path: "", og_image: "", custom_css: "",
  header_links: null, footer_columns: null, social_links: null, show_services: true, services_title: "More from TechZeeLand", footer_text: "",
  announcement_on: false, announcement_text: "", announcement_link: "",
  robots_index: true, robots_extra: "", ads_txt: "", custom_head_html: "", custom_footer_html: "",
  cors_origin: "*", csp_script_hosts: "", csp_connect_hosts: "", csp_img_hosts: "", csp_allow_inline: false,
  stats_on: true, maintenance_on: false, maintenance_message: "We are doing some maintenance and will be back shortly.",
  cookie_banner_on: false, cookie_banner_text: "This site uses only the cookies it needs to work. Read our cookie policy for details.",
};

let cache = null;
const defaults = () => {
  const d = { ...BASE_DEFAULTS };
  d.site_name = K.c("name", "TechZeeLand");
  d.short_name = K.c("short", d.site_name);
  d.tagline = K.c("tagline", "");
  d.description = K.c("description", "");
  d.github_url = K.c("github", "");
  return { ...d, ...(K.c("defaults", {}) || {}) };
};

/** Settings from the first Icons release (settings.json) are converted once. */
function legacy() {
  const o = store.read("settings.json", null);
  if (!o || typeof o !== "object") return {};
  const m = {};
  for (const k of ["site_name", "tagline", "contact_email"]) if (o[k]) m[k] = o[k];
  if (o.repo_url) m.github_url = o.repo_url;
  if (o.announcement_enabled !== undefined) m.announcement_on = Boolean(o.announcement_enabled);
  if (o.announcement_text) m.announcement_text = o.announcement_text;
  if (o.cookie_banner_enabled !== undefined) m.cookie_banner_on = Boolean(o.cookie_banner_enabled);
  for (const k of ["license_note", "cache_max_age"]) if (o[k] !== undefined) m[k] = o[k];
  return m;
}

function all() {
  if (cache) return cache;
  let s = store.read("site.json", null);
  if (!s || typeof s !== "object") {
    s = legacy();
    if (Object.keys(s).length) { try { store.write("site.json", s); } catch { /* read-only */ } }
  }
  cache = { ...defaults(), ...s };
  return cache;
}
const get = (key) => {
  if (!K.root) return "";
  const v = all()[key];
  return v === undefined || v === null ? (v === null ? null : "") : v;
};
const on = (key) => Boolean(get(key));

function save(patch) {
  const old = store.read("site.json", {});
  if (old && Object.keys(old).length) {
    store.write(`site-history/site-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-")}.json`, old);
    const files = fs.readdirSync(store.P("site-history")).filter((f) => /^site-.*\.json$/.test(f)).sort();
    while (files.length > 15) fs.unlinkSync(store.P("site-history/" + files.shift()));
  }
  store.write("site.json", { ...(old || {}), ...patch });
  cache = null;
}
const history = () => { try { return fs.readdirSync(store.P("site-history")).filter((f) => /^site-\d{8}-\d{6}\.json$/.test(f)).sort().reverse().slice(0, 15); } catch { return []; } };
function restore(file) {
  if (!/^site-\d{8}-\d{6}\.json$/.test(file)) return false;
  const d = store.read("site-history/" + file, null);
  if (!d || typeof d !== "object") return false;
  save(d);
  store.write("site.json", d);
  cache = null;
  return true;
}

/* ---------- sanitising helpers ---------- */
const cleanUrl = (u) => {
  u = String(u || "").replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!u) return "";
  if (/^(\/(?!\/)|#|\?)/.test(u) || /^(https?:\/\/|mailto:|tel:)[^\s<>"']+$/i.test(u)) return u.slice(0, 300);
  return "";
};
const cleanIcon = (i) => String(i || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
const cleanColor = (c, fb = "#6cc6af") => (/^#[0-9a-fA-F]{6}$/.test(c) ? String(c).toLowerCase() : fb);
/** rows: array or object keyed 0,1,2 (as posted by the link editor) */
function cleanLinks(rows, max = 20) {
  const list = Array.isArray(rows) ? rows : Object.values(rows || {});
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const label = String(r.label || "").trim();
    const url = cleanUrl(r.url);
    if (!label || !url) continue;
    out.push({ label: label.slice(0, 40), url, icon: cleanIcon(r.icon), new: Boolean(r.new) });
    if (out.length >= max) break;
  }
  return out;
}

/* ---------- effective navigation ---------- */
const headerLinks = () => {
  const v = get("header_links");
  if (Array.isArray(v)) return v;
  return K.c("nav", []).map((n) => ({ label: n[0], url: n[1], icon: n[2] || "", new: false }));
};
const footerColumns = () => {
  const v = get("footer_columns");
  if (Array.isArray(v)) return v;
  const pages = [{ label: "Home", url: "/", icon: "", new: false }];
  for (const n of K.c("footer_extra", [])) pages.push({ label: n[0], url: n[1], icon: "", new: false });
  for (const n of [["About", "/about"], ["Contact", "/contact"]]) pages.push({ label: n[0], url: n[1], icon: "", new: false });
  const legal = [["Privacy Policy", "/privacy-policy"], ["Terms & Conditions", "/terms-and-conditions"], ["Cookie Policy", "/cookie-policy"]].map((n) => ({ label: n[0], url: n[1], icon: "", new: false }));
  return [{ title: "Pages", links: pages }, { title: "Legal", links: legal }];
};
const socialLinks = () => {
  const v = get("social_links");
  return Array.isArray(v) ? v : SOCIAL_DEFAULT.map((s) => ({ label: s.label, url: s.url, icon: s.icon, new: true }));
};
const footerText = () => {
  const t = String(get("footer_text") || "").trim();
  const owner = K.e(get("owner_name")), site = K.e(get("site_name")), year = String(new Date().getUTCFullYear());
  if (!t) {
    const lic = `<a href="${K.e(get("license_url"))}" target="_blank" rel="noopener">${K.e(get("license_name"))}</a>`;
    return `&copy; ${year} ${owner}. ${site} is free &amp; open source under the ${lic} license.`;
  }
  return K.e(t).replace(/\{year\}/g, year).replace(/\{owner\}/g, owner).replace(/\{site\}/g, site).replace(/\{license\}/g, K.e(get("license_name")));
};

K.bindSite(get);
module.exports = { BASE_DEFAULTS, SOCIAL_DEFAULT, all, get, on, save, history, restore, cleanUrl, cleanIcon, cleanColor, cleanLinks, headerLinks, footerColumns, socialLinks, footerText, reset: () => { cache = null; } };
