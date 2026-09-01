"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const buildSource = read("herdharbor-build.js");
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const html = read("index.html");

const buildIdMatch = buildSource.match(/buildId:\s*"([^"]+)"/);
const versionMatch = buildSource.match(/version:\s*"([^"]+)"/);
assert.ok(buildIdMatch, "herdharbor-build.js must expose the authoritative buildId");
assert.ok(versionMatch, "herdharbor-build.js must expose the authoritative version");
const buildId = buildIdMatch[1];
const version = versionMatch[1];

assert.match(buildId, /^current-state-\d+$/, "buildId must use the current-state-N release contract");
assert.equal(version, "1.6.1", "this release audit is scoped to Alpha v1.6.1");

// The browser fallback and service-worker shell must agree with the authoritative build file.
assert.ok(pwa.includes(`const BUILD_ID = window.HerdHarborBuild?.buildId || "${buildId}";`),
  `pwa.js fallback must match authoritative buildId ${buildId}`);
assert.ok(worker.includes(`herdharbor-shell-v${version}-alpha-${buildId}`),
  `service-worker.js cache must match v${version} / ${buildId}`);

// Scan every regression test at once. A build bump must never leave old current-state
// assertions behind to fail one-by-one in later CI runs.
const staleBuildReferences = [];
for (const file of fs.readdirSync(__dirname).filter((name) => name.endsWith(".test.cjs"))) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const refs = new Set(source.match(/current-state-\d+/g) || []);
  for (const ref of refs) {
    if (ref !== buildId) staleBuildReferences.push(`${file}: ${ref} (expected ${buildId})`);
  }
}
assert.deepEqual(staleBuildReferences, [], `stale build references found:\n${staleBuildReferences.join("\n")}`);

// Current startup paths may keep compatibility adapters, but must never request the
// retired pre-v1.6.1 runtime assets themselves.
const legacyRuntimeAssets = [
  "herdharbor-release-v1.4.5.js",
  "pedigree-genetics-v1.4.5.js",
  "pedigree-genetics-v1.4.5.css",
  "rabbit-records-v1.4.5.js",
  "rabbit-genetics-engine-v1.4.5.js",
  "rabbit-genetics-runtime-v1.4.5.js",
  "rabbit-genetics-ui-v1.4.5.js",
  "breeding-pair-hotfix-v1.4.2.js",
  "shows-v1.5.0.js",
  "shows-v1.5.0.css",
  "shows-v1.5.0-hardening.js",
  "shows-v1.5.0-performance.js"
];
for (const legacy of legacyRuntimeAssets) {
  assert.ok(!pwa.includes(legacy), `pwa.js must not load retired runtime asset ${legacy}`);
  assert.ok(!worker.includes(legacy), `service-worker.js must not cache retired runtime asset ${legacy}`);
  assert.ok(!html.includes(legacy), `index.html must not embed retired runtime asset ${legacy}`);
}

// Historical test filenames are allowed; their executable imports must target the
// consolidated/current runtime. This catches accidental requires of retired assets.
const obsoleteImports = [];
for (const file of fs.readdirSync(__dirname).filter((name) => name.endsWith(".test.cjs"))) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  for (const legacy of legacyRuntimeAssets) {
    const escaped = legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const executableRef = new RegExp(`(?:require\\(|readFileSync\\([^\\n]*|read\\()\\s*["'][^"']*${escaped}["']`);
    if (executableRef.test(source)) obsoleteImports.push(`${file}: ${legacy}`);
  }
}
assert.deepEqual(obsoleteImports, [], `tests still execute retired runtime assets:\n${obsoleteImports.join("\n")}`);

console.log(`Alpha v${version} release-reference audit passed for ${buildId}`);
