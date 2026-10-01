"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const stripLocal = (ref) => String(ref || "")
  .replace(/^\.\//, "")
  .split(/[?#]/, 1)[0]
  .replace(/^\//, "");

const html = read("index.html");
const worker = read("service-worker.js");

const scriptRefs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkRefs = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const localScriptPaths = scriptRefs
  .map(stripLocal)
  .filter((p) => p && !/^https?:/i.test(p) && !p.startsWith("//") && exists(p));

const activeSource = [
  html,
  ...localScriptPaths
    .filter((p) => !p.startsWith("vendor/"))
    .map(read)
].join("\n");

test("main shell has no duplicate DOM ids or duplicate eager script loads", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]);
  const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  assert.deepEqual(dupIds, [], "duplicate DOM ids: " + dupIds.join(", "));

  const normalizedScripts = scriptRefs.map(stripLocal);
  const dupScripts = [...new Set(normalizedScripts.filter((src, i) => normalizedScripts.indexOf(src) !== i))];
  assert.deepEqual(dupScripts, [], "duplicate eager scripts: " + dupScripts.join(", "));
});

test("all static local shell assets and service-worker asset entries resolve", () => {
  const shellRefs = [...scriptRefs, ...linkRefs]
    .filter((ref) => ref && !ref.startsWith("#") && !ref.startsWith("data:") && !/^https?:/i.test(ref) && !ref.startsWith("//"));

  const swRefs = [...worker.matchAll(/["'](\.\/[^"']+)["']/g)].map((m) => m[1]);
  const missing = [];

  for (const ref of [...shellRefs, ...swRefs]) {
    const p = stripLocal(ref);
    if (!p) continue;
    if (exists(p)) continue;
    if (exists(path.join(p, "index.html"))) continue;
    missing.push(ref);
  }

  assert.deepEqual([...new Set(missing)], [], "missing local assets: " + [...new Set(missing)].join(", "));
});

test("every static navigation route has a real view and routes through the canonical navigator", () => {
  const routes = [...new Set([...html.matchAll(/\bdata-route=["']([^"']+)["']/gi)].map((m) => m[1]))];
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]));
  for (const route of routes) assert.ok(ids.has("view-" + route), "missing view container for route: " + route);

  const runtime = read("herdharbor-app-runtime.js");
  assert.match(runtime, /\$\$\("\.nav-item, \.brand"\)[\s\S]*addEventListener\("click"[\s\S]*navigate\(item\.dataset\.route\)/);
});

test("every static shell button is backed by a route, form submit, or active click binding", () => {
  const buttonMatches = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  const unresolved = [];

  for (const match of buttonMatches) {
    const attrs = match[1];
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const id = (attrs.match(/\bid=["']([^"']+)["']/i) || [])[1] || "";
    const route = (attrs.match(/\bdata-route=["']([^"']+)["']/i) || [])[1] || "";
    const type = ((attrs.match(/\btype=["']([^"']+)["']/i) || [])[1] || "submit").toLowerCase();

    if (route) continue;
    if (type === "submit") continue;
    if (/\bdata-pwa-install\b/i.test(attrs) && activeSource.includes("data-pwa-install")) continue;

    if (id) {
      const selectors = [
        "#" + id,
        'getElementById("' + id + '")',
        "getElementById('" + id + "')"
      ];
      if (selectors.some((needle) => activeSource.includes(needle))) continue;
    }

    unresolved.push(id || text || attrs.trim());
  }

  assert.deepEqual(unresolved, [], "unbound static buttons: " + unresolved.join(", "));
});

test("top-level external browser endpoints are restricted to current approved services", () => {
  const urls = [...activeSource.matchAll(/https?:\/\/[^\s"'\x60)<>{}]+/g)].map((m) => m[0]);
  const origins = [...new Set(urls.map((raw) => {
    try { return new URL(raw).origin; } catch { return "invalid:" + raw; }
  }))].sort();

  const approved = new Set([
    "https://okynebbksifqppwicghj.supabase.co",
    "https://formspree.io",
    "https://herdharbor.com"
  ]);

  const unexpected = origins.filter((origin) => !approved.has(origin));
  assert.deepEqual(unexpected, [], "unexpected external browser endpoint origins: " + unexpected.join(", "));
});

test("canonical runtime ownership remains singular for state, cloud, PWA and admin APIs", () => {
  const checks = [
    ["HerdHarborStateStore", /window\.HerdHarborStateStore\s*=/g],
    ["HerdHarborCloud", /window\.HerdHarborCloud\s*=/g],
    ["HerdHarborPWA", /window\.HerdHarborPWA\s*=/g],
    ["HerdHarborAdmin", /window\.HerdHarborAdmin\s*=/g]
  ];

  for (const [name, pattern] of checks) {
    const count = (activeSource.match(pattern) || []).length;
    assert.equal(count, 1, name + " must have exactly one active owner, found " + count);
  }
});
