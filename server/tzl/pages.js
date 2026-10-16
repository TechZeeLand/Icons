// Content pages (About, Contact, Privacy, Terms, Cookies...). Markdown with {tokens}; admins can edit any of them (data/pages.json).
"use strict";
const K = require("./kit");
const Site = require("./site");
const store = require("./store");
const Markdown = require("./markdown");

const BASE_SLUGS = { about: "About", contact: "Contact", "privacy-policy": "Privacy Policy", "terms-and-conditions": "Terms & Conditions", "cookie-policy": "Cookie Policy" };
const slugs = () => ({ ...BASE_SLUGS, ...Object.fromEntries(Object.entries(K.c("extra_pages", {})).map(([k, v]) => [k, v.title])) });

function tokens(req) {
  return {
    "{site}": String(Site.get("site_name")), "{email}": String(Site.get("contact_email")), "{url}": K.baseUrl(req),
    "{github}": String(Site.get("github_url")), "{owner}": String(Site.get("owner_name")), "{license}": String(Site.get("license_name")),
    "{year}": String(new Date().getUTCFullYear()),
  };
}
const fill = (s, tok) => String(s).replace(/\{(site|email|url|github|owner|license|year)\}/g, (m) => tok[m] ?? m);

function defaults(slug) {
  const own = K.c("pages", {});
  if (own[slug]) return own[slug];
  const extraPages = K.c("extra_pages", {});
  if (extraPages[slug]) return extraPages[slug];
  const extra = (K.c("page_extra", {}) || {})[slug] || "";
  switch (slug) {
    case "about":
      return { title: "About", desc: "About {site}.", md: `## What it is\n\n{site} is a free, open-source tool by {owner}. ${K.c("tagline")}\n\n## Open source\n\nReleased under the {license} license. Source code, issues and contributions are on [GitHub]({github}).\n\n## Made in Bangladesh\n\nBuilt and maintained by {owner}, based in Bangladesh.\n${extra}` };
    case "contact":
      return { title: "Contact", desc: "Contact the {site} team.", md: `Questions, bug reports or ideas? Email [{email}](mailto:{email}) or open an issue on [GitHub]({github}/issues).\n\nWe read everything and reply as soon as we can.${extra}` };
    case "privacy-policy":
      return { title: "Privacy Policy", desc: "How {site} handles your data.", md: `## Summary\n\n{site} is built to collect as little as possible. There are no accounts for visitors, no advertising trackers and no third-party analytics unless the site owner adds them.\n\n## What we process\n\n- **Anonymous statistics.** Daily totals such as page views and feature usage. No IP addresses, no user agents and no identifiers are stored with them.\n- **Server logs.** Your hosting provider's web server may keep standard access logs (IP address, time, requested URL) for security and troubleshooting.\n- **Your own browser.** Your theme choice and, where a feature offers it, saved settings stay in your browser's local storage and never leave your device.\n${extra}\n\n## Third-party services\n\nPages load the interface font from the TechZeeLand Fonts service and icons from the TechZeeLand Icons service. Those requests reveal your IP address to those services, like any web request.\n\n## Your choices\n\nYou can clear local storage at any time. For any privacy question write to [{email}](mailto:{email}).\n\n_Last updated: {year}._` };
    case "terms-and-conditions":
      return { title: "Terms & Conditions", desc: "Terms for using {site}.", md: `## Using {site}\n\nBy using this website you agree to these terms. If you do not agree, please do not use it.\n\n## The service\n\n{site} is provided free of charge and "as is", without warranty of any kind. We may change, suspend or remove features at any time.\n\n## Acceptable use\n\nDo not abuse the service: no automated flooding, no attempts to break or bypass security, and no use that is unlawful. We may rate-limit or block abusive traffic.\n\n## Your content\n\nYou keep all rights to what you create. You are responsible for the content you generate and for having the right to use it.\n\n## Open source\n\nThe software is licensed under {license}. See the [repository]({github}) for the license text.\n\n## Liability\n\nTo the extent permitted by law, {owner} is not liable for any loss arising from use of the service.\n\n_Last updated: {year}._${extra}` };
    case "cookie-policy":
      return { title: "Cookie Policy", desc: "Cookies used by {site}.", md: `## Cookies\n\nVisitors do not receive cookies from {site}. The only cookie ever set is an administrator session cookie on the /admin area, which is strictly necessary and never set for visitors.\n\n## Local storage\n\nYour light/dark theme choice is stored in your browser's local storage so it is remembered. It is not sent to any server.\n\n## Third parties\n\nIf the site owner enables optional services (for example ads or analytics), those providers may set their own cookies. They will be described here.\n\n_Last updated: {year}._${extra}` };
    default: return null;
  }
}

function get(slug) {
  const d = defaults(slug);
  if (!d) return null;
  const ov = store.read("pages.json", {});
  const o = ov && ov[slug];
  const edited = Boolean(o && typeof o.md === "string" && o.md.trim());
  return { title: edited && o.title ? o.title : d.title, desc: d.desc, md: edited ? o.md : d.md, edited };
}
const save = (slug, title, md) => store.update("pages.json", (p) => ({ ...p, [slug]: { title, md, updated: K.now() } }), {});
const reset = (slug) => store.update("pages.json", (p) => { const n = { ...p }; delete n[slug]; return n; }, {});

/** Returns {title, desc, html} for a content page, or null. */
function render(slug, req) {
  const p = get(slug);
  if (!p) return null;
  const tok = tokens(req);
  return { title: p.title, desc: fill(p.desc, tok), html: Markdown.render(fill(p.md, tok), req).html };
}
module.exports = { slugs, tokens, defaults, get, save, reset, render };
