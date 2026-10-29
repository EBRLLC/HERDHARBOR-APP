"use strict";

// Validates a staged Pages candidate locally. Does not deploy or contact production.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "_site");
const read = (file) => fs.readFile(path.join(root, file), "utf8");
const hash = (content) => crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);

const manifest = JSON.parse(await read("release-asset-manifest.json"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.algorithm, "sha256-16");
assert.match(manifest.generation, /^[a-f0-9]{16}$/);
assert.equal(manifest.cacheName, "herdharbor-shell-" + manifest.generation);

const worker = await read("service-worker.js");
const cacheIdentity = worker.match(/const CACHE_NAME = "([^"]+)";/)?.[1];
assert.equal(cacheIdentity, manifest.cacheName, "deployed worker cache must match the asset manifest");

const shellLiteral = worker.match(/const REQUIRED_SHELL = (\[[\s\S]*?\]);/)?.[1];
assert.ok(shellLiteral, "required service worker shell must exist");
const shell = JSON.parse(shellLiteral);
assert.ok(shell.length > 30 && shell.length <= 60, "keep the offline startup shell bounded");
assert.equal(new Set(shell).size, shell.length, "no duplicate required shell URLs");

const missing = [];
const badFingerprints = [];
for (const [file, digest] of Object.entries(manifest.assets)) {
  assert.match(digest, /^[a-f0-9]{16}$/, "malformed asset digest: " + file);
  const absolute = path.resolve(root, file);
  assert.ok(absolute.startsWith(root + path.sep), "unsafe manifest asset: " + file);
  const bytes = await fs.readFile(absolute).catch(() => null);
  if (!bytes) { missing.push(file); continue; }
  if (hash(bytes) !== digest) badFingerprints.push(file);
}
assert.deepEqual(missing, [], "manifest references missing files");
assert.deepEqual(badFingerprints, [], "fingerprint does not match staged bytes");

const required = new Set();
for (const item of shell) {
  const url = new URL(item, "https://app.herdharbor.com/");
  assert.equal(url.origin, "https://app.herdharbor.com", "required URLs must be same-origin");
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!relative || relative.endsWith("/")) relative += "index.html";
  const absolute = path.resolve(root, relative);
  assert.ok(absolute.startsWith(root + path.sep), "required URL escapes staged root");
  try { await fs.access(absolute); } catch { missing.push(relative); }
  required.add(relative);
  if (/\.(?:js|css)$/.test(relative)) {
    const expected = manifest.assets[relative];
    assert.ok(expected, "required JS/CSS missing fingerprint: " + relative);
    assert.equal(url.searchParams.get("rev"), expected, "stale offline asset fingerprint: " + relative);
    assert.equal(url.searchParams.has("v"), false, "mutable version query remains in offline shell");
  }
}
assert.deepEqual(missing, [], "required startup assets are missing");

for (const file of [
  "index.html", "herdharbor-cloud.js", "herdharbor-app-runtime.js",
  "animal-profile-runtime-v1.8.3.js", "health-runtime-v1.8.3.js",
  "task-runtime-v1.8.3.js", "canine-lineage-v2.0.1.js"
]) {
  assert.ok(required.has(file), "missing mandatory operational component: " + file);
}

const index = await read("index.html");
for (const file of [
  "herdharbor-cloud.js", "herdharbor-app-runtime.js", "health-runtime-v1.8.3.js",
  "task-runtime-v1.8.3.js", "canine-lineage-v2.0.1.js"
]) {
  assert.ok(index.includes(file + "?rev=" + manifest.assets[file]), "HTML/manifest disagree: " + file);
}
const monitoring = await read("herdharbor-monitoring-config.js");
assert.match(monitoring, /"environment": "production"/);
assert.match(monitoring, /"release": "HerdHarbor@2\.0\.2"/);
assert.doesNotMatch(monitoring, /"dsn": ""/);
assert.match(monitoring, /"enableTestCrash": false/);

console.log("Candidate artifact verified:", manifest.cacheName, "-", required.size, "essential files; no deploy performed.");
