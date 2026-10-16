// SPDX-License-Identifier: AGPL-3.0-or-later
// Starts the server on a random port with a temp data folder and checks the important endpoints.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = mkdtempSync(join(tmpdir(), "icons-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(root, "server", "server.js")], { env: { ...process.env, PORT: String(port), DATA_DIR: data, ADMIN_PASSWORD: "", PUBLIC_URL: base, TZL_ROOT_DOMAIN: "techzeeland.com" }, stdio: "ignore" });
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) failed++; };

try {
  for (let i = 0; i < 50; i++) { try { await fetch(base + "/healthz"); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const get = (p, o) => fetch(base + p, { redirect: "manual", ...o });
  for (const p of ["/", "/icons", "/docs", "/about", "/contact", "/privacy-policy", "/terms-and-conditions", "/cookie-policy", "/license"]) check(`page ${p}`, (await get(p)).status === 200);
  const svg = await (await get("/i/ui/home.svg?size=40&color=ff0000&stroke=1.5")).text();
  check("icon recolour/resize", svg.includes('width="40"') && svg.includes("#ff0000") && svg.includes('stroke-width="1.5"'));
  check("invalid colour rejected", (await get("/i/ui/home.svg?color=red;x")).status === 400);
  check("unknown icon 404", (await get("/i/ui/does-not-exist.svg")).status === 404);
  check("path traversal blocked", (await get("/assets/..%2f..%2fserver%2fserver.js")).status !== 200);
  const etag = (await get("/i/ui/home.svg")).headers.get("etag");
  check("ETag revalidation", (await get("/i/ui/home.svg", { headers: { "if-none-match": etag } })).status === 304);
  const manifest = await (await get("/api/manifest")).json();
  check("manifest", manifest.total > 100 && manifest.icons[0].hash);
  check("zi.css", (await (await get("/zi.css?names=home")).text()).includes(".zi-home"));
  const health = await (await get("/health")).json();
  check("/health", health.ok === true && health.service === "icons" && health.icons > 100);
  const home = await (await get("/")).text();
  check("kit header/footer present", home.includes('class="topbar"') && home.includes("site-footer") && home.includes("svc-menu"));
  check("domain follows TZL_ROOT_DOMAIN", home.includes("https://fonts.techzeeland.com/css2?family=Alata") && home.includes("https://qrcode.techzeeland.com"));
  check("CSP has no inline scripts", !/script-src[^;]*unsafe-inline/.test((await get("/")).headers.get("content-security-policy") || ""));
  check("robots.txt + sitemap", (await (await get("/robots.txt")).text()).includes("Sitemap:") && (await (await get("/sitemap.xml")).text()).includes("<urlset"));
  check("admin redirects when signed out", (await get("/admin")).status === 303);
  check("admin api needs login", (await get("/admin/api/icons/check", { method: "POST" })).status === 401);
} finally { child.kill(); await new Promise((r) => { child.once("exit", r); setTimeout(r, 2000); }); rmSync(data, { recursive: true, force: true, maxRetries: 5 }); }
process.exit(failed ? 1 : 0);
