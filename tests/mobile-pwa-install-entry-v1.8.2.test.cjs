const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pwa = read("pwa.js");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");
const manifest = JSON.parse(read("manifest.json"));

test("mobile install entry is owned by the canonical PWA controller", () => {
  assert.match(pwa, /function ensureMobileInstallEntry\(\)/);
  assert.match(pwa, /hh-mobile-pwa-install-entry/);
  assert.match(pwa, /button\.dataset\.pwaInstall = "true"/);
  assert.match(pwa, /beforeinstallprompt/);
  assert.match(pwa, /Add to Home Screen/);
  assert.match(pwa, /closest\("\[data-pwa-install\]"\)/);
  assert.match(pwa, /requestInstall/);
  assert.doesNotMatch(build, /hh-mobile-pwa-install-entry/);
});

test("install UI remains isolated from the auth bootstrap", () => {
  assert.match(build, /installWebSignInSessionBridge/);
  assert.match(build, /requestPasswordSession/);
  assert.doesNotMatch(build, /ensureMobileInstallEntry/);
  assert.doesNotMatch(build, /beforeinstallprompt/);
  assert.doesNotMatch(pwa, /signInWithPassword/);
  assert.doesNotMatch(pwa, /SUPABASE_AUTH_STORAGE_KEY/);
});

test("installed sessions suppress the mobile entry and the manifest remains installable", () => {
  assert.match(pwa, /if \(isStandalone\(\)\) return false/);
  assert.match(pwa, /button\.hidden = !shouldShow/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.version, "1.8.2");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 2);
});

test("v1.8.2 rotates the PWA shell and pwa.js delivery", () => {
  assert.match(worker, /herdharbor-shell-v1\.8\.2/);
  assert.match(worker, /pwa\.js\?v=31/);
  assert.match(pwa, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.2"/);
});
