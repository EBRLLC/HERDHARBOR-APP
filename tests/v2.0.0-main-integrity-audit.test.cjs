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
const eagerLocalScripts = scriptRefs
  .map(stripLocal)
  .filter((p) => p && !/^https?:/i.test(p) && !p.startsWith("//") && exists(p));

function discoverProductionScripts(seedScripts) {
  const seen = new Set();
  const queue = [...seedScripts];

  while (queue.length) {
    const file = stripLocal(queue.shift());
    if (!file || seen.has(file) || !exists(file) || !file.endsWith(".js")) continue;
    seen.add(file);
    if (file.startsWith("vendor/")) continue;

    const source = read(file);
    for (const match of source.matchAll(/["']((?:\.\/)?[A-Za-z0-9_./-]+\.js)(?:\?v=[^"']+)?["']/g)) {
      const candidate = stripLocal(match[1]);
      if (candidate && exists(candidate) && !seen.has(candidate)) queue.push(candidate);
    }
  }

  return [...seen].sort();
}

const activeScriptPaths = discoverProductionScripts(eagerLocalScripts);
const activeNonVendorPaths = activeScriptPaths.filter((p) => !p.startsWith("vendor/"));
const activeSource = [html, ...activeNonVendorPaths.map(read)].join("\n");

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

test("recursively reachable production JavaScript references resolve to real local files", () => {
  const missing = [];

  for (const file of activeNonVendorPaths) {
    const source = read(file);
    for (const match of source.matchAll(/["']((?:\.\/)?[A-Za-z0-9_./-]+\.js)(?:\?v=[^"']+)?["']/g)) {
      const candidate = stripLocal(match[1]);
      if (!candidate || /^https?:/i.test(candidate)) continue;
      if (!exists(candidate)) missing.push(file + " -> " + match[1]);
    }
  }

  assert.deepEqual([...new Set(missing)], [], "missing reachable JavaScript assets: " + [...new Set(missing)].join(", "));
});

test("every static navigation route has a real view and routes through the canonical navigator", () => {
  const routes = [...new Set([...html.matchAll(/\bdata-route=["']([^"']+)["']/gi)].map((m) => m[1]))];
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]));
  for (const route of routes) assert.ok(ids.has("view-" + route), "missing view container for route: " + route);

  const runtime = read("herdharbor-app-runtime.js");
  assert.match(runtime, /\$\$\("\.nav-item, \.brand"\)[\s\S]*addEventListener\("click"[\s\S]*navigate\(item\.dataset\.route\)/);
});

test("every static shell button is backed by a route, form submit, PWA action, or active click binding", () => {
  const buttonMatches = [...html.matchAll(/<button\\b([^>]*)>([\\s\\S]*?)<\\/button>/gi)];
  const unresolved = [];

  for (const match of buttonMatches) {
    const attrs = match[1];
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
    const id = (attrs.match(/\\bid=["\']([^"\']+)["\']/i) || [])[1] || "";
    const route = (attrs.match(/\\bdata-route=["\']([^"\']+)["\']/i) || [])[1] || "";
    const explicitType = ((attrs.match(/\\btype=["\']([^"\']+)["\']/i) || [])[1] || "").toLowerCase();

    if (route || explicitType === "submit" || /\\bonclick\\s*=/.test(attrs)) continue;
    if (/\\bdata-pwa-install\\b/i.test(attrs) && activeSource.includes("data-pwa-install")) continue;

    if (id) {
      const escapedId = id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
      const bindingPatterns = [
        new RegExp('\\$\\(["\\\']#' + escapedId + '["\\\']\\)\\.addEventListener\\(["\\\']click["\\\']'),
        new RegExp('getElementById\\(["\\\']' + escapedId + '["\\\']\\)[\\s\\S]{0,160}addEventListener\\(["\\\']click["\\\']'),
        new RegExp('querySelector\\(["\\\']#' + escapedId + '["\\\']\\)[\\s\\S]{0,160}addEventListener\\(["\\\']click["\\\']')
      ];
      if (bindingPatterns.some((pattern) => pattern.test(activeSource))) continue;
    }

    unresolved.push(id || text || attrs.trim());
  }

  assert.deepEqual(unresolved, [], "unbound static buttons: " + unresolved.join(", "));
});

test("all dynamically rendered buttons in the production module graph expose a reachable action binding", () => {
  const unresolved = [];
  const datasetName = (attribute) => attribute
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

  for (const file of activeNonVendorPaths) {
    const source = read(file);
    for (const match of source.matchAll(/<button\b([^>]*)>/gi)) {
      const attrs = match[1];
      const explicitType = ((attrs.match(/\btype=["']([^"']+)["']/i) || [])[1] || "").toLowerCase();
      if (explicitType === "submit" || /\bonclick\s*=/i.test(attrs)) continue;

      const id = (attrs.match(/\bid=["']([^"'$<>{}]+)["']/i) || [])[1] || "";
      if (id) {
        const idBound = [
          "#" + id,
          'getElementById("' + id + '")',
          "getElementById('" + id + "')"
        ].some((needle) => activeSource.includes(needle));
        if (idBound) continue;
      }

      const dataAttrs = [...attrs.matchAll(/\b(data-[a-z0-9-]+)(?:=["'][^"']*["'])?/gi)]
        .map((entry) => entry[1].toLowerCase());

      const actionBound = dataAttrs.some((attribute) => {
        const dataset = datasetName(attribute);
        return [
          "[" + attribute + "]",
          "[" + attribute + '="',
          "dataset." + dataset,
          "." + dataset
        ].some((needle) => activeSource.includes(needle));
      });

      if (actionBound) continue;
      unresolved.push(file + ":" + (id ? "#" + id : dataAttrs.join("|") || attrs.trim()));
    }
  }

  assert.deepEqual([...new Set(unresolved)], [], "unbound dynamic buttons: " + [...new Set(unresolved)].join(", "));
});

test("static anchors do not point at missing local files or missing page fragments", () => {
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]));
  const anchors = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const unresolved = [];

  for (const href of anchors) {
    if (!href || href === "#" || /^https?:|^mailto:|^tel:/i.test(href)) continue;
    if (href.startsWith("#")) {
      const fragment = href.slice(1);
      if (fragment && !ids.has(fragment)) unresolved.push(href);
      continue;
    }
    const local = stripLocal(href);
    if (!local || exists(local) || exists(path.join(local, "index.html"))) continue;
    unresolved.push(href);
  }

  assert.deepEqual([...new Set(unresolved)], [], "unresolved static anchors: " + [...new Set(unresolved)].join(", "));
});

test("application network endpoint literals are restricted to current approved services", () => {
  const requestUrls = [];
  const requestPatterns = [
    /fetch\(\s*["'](https?:\/\/[^"']+)["']/g,
    /createClient\(\s*["'](https?:\/\/[^"']+)["']/g
  ];

  for (const file of activeNonVendorPaths) {
    const source = read(file);
    for (const pattern of requestPatterns) {
      for (const match of source.matchAll(pattern)) requestUrls.push(match[1]);
    }
  }

  // Also include named production endpoint constants used by fetch wrappers.
  for (const match of activeSource.matchAll(/(?:SUPABASE_URL|FEEDBACK_ENDPOINT|FEEDBACK_URL)\s*=\s*["'](https?:\/\/[^"']+)["']/g)) {
    requestUrls.push(match[1]);
  }

  const origins = [...new Set(requestUrls.map((raw) => new URL(raw).origin))].sort();
  const approved = new Set([
    "https://okynebbksifqppwicghj.supabase.co",
    "https://formspree.io"
  ]);
  const unexpected = origins.filter((origin) => !approved.has(origin));

  assert.deepEqual(unexpected, [], "unexpected application network endpoint origins: " + unexpected.join(", "));
});

test("client-invoked Supabase Edge Functions have matching source endpoints", () => {
  const slugs = new Set();

  for (const file of activeNonVendorPaths) {
    const source = read(file);
    for (const match of source.matchAll(/functions\.invoke\(\s*["']([^"']+)["']/g)) slugs.add(match[1]);
    for (const match of source.matchAll(/invokeFunction(?:WithDiagnostics)?\(\s*["']([^"']+)["']/g)) slugs.add(match[1]);
    for (const match of source.matchAll(/\/functions\/v1\/([a-z0-9-]+)/gi)) slugs.add(match[1]);
  }

  const missing = [...slugs]
    .filter((slug) => !exists(path.join("supabase", "functions", slug, "index.ts")))
    .sort();

  assert.deepEqual(missing, [], "client references missing Edge Function sources: " + missing.join(", "));
});

test("canonical runtime ownership remains singular for state, cloud, PWA and admin APIs", () => {
  const checks = [
    ["HerdHarborStateStore", /(?:window|root|globalThis)\.HerdHarborStateStore\s*=/g],
    ["HerdHarborCloud", /window\.HerdHarborCloud\s*=/g],
    ["HerdHarborPWA", /window\.HerdHarborPWA\s*=/g],
    ["HerdHarborAdmin", /window\.HerdHarborAdmin\s*=/g]
  ];

  for (const [name, pattern] of checks) {
    const count = (activeSource.match(pattern) || []).length;
    assert.equal(count, 1, name + " must have exactly one active owner, found " + count);
  }
});

test("destructive browser storage APIs are restricted to the explicit user Clear Data workflow", () => {
  const hits = [];
  for (const file of activeNonVendorPaths) {
    const source = read(file);
    if (/localStorage\.clear\s*\(/.test(source)) hits.push(file + ":localStorage.clear");
    if (/indexedDB\.deleteDatabase\s*\(/.test(source)) hits.push(file + ":indexedDB.deleteDatabase");
  }

  assert.deepEqual(hits, ["herdharbor-app-runtime.js:indexedDB.deleteDatabase"]);
  const runtime = read("herdharbor-app-runtime.js");
  const clearAt = runtime.indexOf("async function clearData()");
  const deleteAt = runtime.indexOf("indexedDB.deleteDatabase", clearAt);
  assert.ok(clearAt >= 0 && deleteAt > clearAt);
  assert.match(runtime.slice(clearAt, deleteAt), /confirm\("Clear every local HerdHarbor record on this device\?"\)[\s\S]*confirm\("This cannot be undone unless you exported a backup\. Continue\?"\)/);
});

test("foreground polling remains singular, visibility-gated, online-gated and bounded", () => {
  const intervalOwners = activeNonVendorPaths.filter((file) => /setInterval\s*\(/.test(read(file)));
  assert.deepEqual(intervalOwners, ["herdharbor-cloud.js"]);

  const cloud = read("herdharbor-cloud.js");
  assert.match(cloud, /FOREGROUND_CLOUD_CHECK_INTERVAL_MS = 30000/);
  assert.match(cloud, /document\.visibilityState !== "visible"/);
  assert.match(cloud, /navigator\.onLine === false/);
  assert.match(cloud, /!session\?\.user\?\.id/);
  assert.match(cloud, /now - lastCloudCheckAt < 15000/);
});

test("current whole-app release fallbacks do not regress to the retired 1.8.4 identity", () => {
  const runtime = read("herdharbor-app-runtime.js");
  const cloud = read("herdharbor-cloud.js");
  assert.match(runtime, /APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "2\.0\.0"/);
  assert.doesNotMatch(runtime, /APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.4"/);
  assert.match(cloud, /CLOUD_SYNC_APP_RELEASE = "2\.0\.0"/);
});


test("stable release bootstrap cannot disable live billing or execute twice through PWA genetics loading", () => {
  const release = read("herdharbor-release-v1.6.1.js");
  const pwa = read("pwa.js");

  assert.match(release, /version: window\.HerdHarborBuild\?\.version \|\| "2\.0\.0"/);
  assert.match(release, /buildId: window\.HerdHarborBuild\?\.buildId \|\| "v2\.0\.0-release-1"/);
  assert.match(release, /billingEnabled: true/);
  assert.doesNotMatch(release, /billingEnabled: false/);

  assert.match(html, /<script id="hh-v151-release-script" src="herdharbor-release-v1\.6\.1\.js\?v=2"><\/script>/);
  assert.match(pwa, /addScript\("hh-v151-release-script", "herdharbor-release-v1\.6\.1\.js\?v=2"\)/);
  assert.match(html, /pwa\.js\?v=33/);
  assert.match(worker, /\.\/pwa\.js\?v=33/);
});


test("all root browser runtimes avoid stale application endpoints and missing Edge Function slugs", () => {
  const browserFiles = fs.readdirSync(root)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => !name.startsWith("vendor"))
    .sort();

  const staleEndpoints = new Set();
  const functionSlugs = new Set();
  const expectedSupabaseOrigin = "https://okynebbksifqppwicghj.supabase.co";
  const expectedFeedbackUrl = "https://formspree.io/f/xpqvpwwb";

  for (const file of browserFiles) {
    const source = read(file);

    for (const match of source.matchAll(/https?:\/\/[^\s"'\x60)<>{}]+/g)) {
      try {
        const url = new URL(match[0]);
        if (url.hostname.endsWith(".supabase.co") && url.origin !== expectedSupabaseOrigin) {
          staleEndpoints.add(file + " -> " + url.origin);
        }
        if (url.origin === "https://formspree.io" && (url.origin + url.pathname) !== expectedFeedbackUrl) {
          staleEndpoints.add(file + " -> " + url.origin + url.pathname);
        }
      } catch {}
    }

    for (const match of source.matchAll(/functions\.invoke\(\s*["']([^"']+)["']/g)) {
      functionSlugs.add(match[1]);
    }
    for (const match of source.matchAll(/invokeFunction(?:WithDiagnostics)?\(\s*["']([^"']+)["']/g)) {
      functionSlugs.add(match[1]);
    }
    for (const match of source.matchAll(/\/functions\/v1\/([a-z0-9-]+)/gi)) {
      functionSlugs.add(match[1]);
    }
  }

  assert.deepEqual([...staleEndpoints].sort(), [], "stale application endpoints: " + [...staleEndpoints].sort().join(", "));

  const missingFunctions = [...functionSlugs]
    .filter((slug) => !exists(path.join("supabase", "functions", slug, "index.ts")))
    .sort();
  assert.deepEqual(missingFunctions, [], "browser references missing Edge Functions: " + missingFunctions.join(", "));
});
