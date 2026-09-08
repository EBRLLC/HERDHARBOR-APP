const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(path.join(root, file));

test("authoritative web and package metadata identify Alpha v1.8.2", () => {
  const build = read("herdharbor-build.js");
  const pkg = json("package.json");
  const lock = json("package-lock.json");
  const manifest = json("manifest.json");

  assert.match(build, /version: "1\.8\.2"/);
  assert.match(build, /buildId: "animal-first-genetics-mobile-install-1"/);
  assert.equal(pkg.version, "1.8.2");
  assert.equal(lock.version, "1.8.2");
  assert.equal(lock.packages[""].version, "1.8.2");
  assert.equal(manifest.version, "1.8.2");
});

test("PWA and Android release surfaces agree on v1.8.2", () => {
  const pwa = read("pwa.js");
  const worker = read("service-worker.js");
  const gradle = read("android/app/build.gradle");
  const twa = json("twa-manifest.json");
  const bundledManifest = json("android/app/src/main/res/raw/web_app_manifest.json");

  assert.match(pwa, /"1\.8\.2"/);
  assert.match(worker, /herdharbor-shell-v1\.8\.2-alpha-animal-first-genetics-mobile-install-1/);
  assert.match(worker, /manifest\.json\?v=1\.8\.2/);
  assert.match(worker, /herdharbor-build\.js\?v=1\.8\.2/);
  assert.match(worker, /pwa\.js\?v=31/);
  assert.match(gradle, /versionName "1\.8\.2"/);
  assert.match(gradle, /versionCode 16/);
  assert.equal(twa.appVersion, "1.8.2");
  assert.equal(twa.appVersionCode, 16);
  assert.equal(bundledManifest.version, "1.8.2");
});

test("monitoring is aligned without committing a production DSN", () => {
  const config = read("herdharbor-monitoring-config.js");
  const generator = read("scripts/build-monitoring-config.mjs");
  const acceptance = read("scripts/sentry-production-acceptance.mjs");

  assert.match(config, /release: "HerdHarbor@1\.8\.2"/);
  assert.match(config, /build: "animal-first-genetics-mobile-install-1"/);
  assert.match(config, /dsn: ""/);
  assert.match(generator, /HerdHarbor@1\.8\.2/);
  assert.match(acceptance, /HerdHarbor@1\.8\.2/);
  assert.match(acceptance, /herdharbor-release-acceptance\/1\.8\.2/);
});

test("v1.8.2 workflows are authoritative and v1.8.1 workflow copies are retired", () => {
  for (const file of [
    ".github/workflows/v1.8.2-ci.yml",
    ".github/workflows/v1.8.2-production-pages.yml",
    ".github/workflows/v1.8.2-production-acceptance.yml"
  ]) {
    assert.equal(exists(file), true, `${file} must exist`);
    assert.match(read(file), /v1\.8\.2/);
  }

  assert.equal(exists(".github/workflows/v1.8.1-ci.yml"), false);
  assert.equal(exists(".github/workflows/v1.8.1-production-pages.yml"), false);
  assert.equal(exists(".github/workflows/v1.8.1-production-acceptance.yml"), false);
});

test("the closeout contains the animal-first, breeder-flow and Genetics V2 runtime", () => {
  const build = read("herdharbor-build.js");
  const worker = read("service-worker.js");
  for (const asset of [
    "flow-phase2-v1.8.2.js",
    "breeding-litter-workspace-v1.8.2.js",
    "litter-sale-transfer-v1.8.2.js",
    "breeding-next-action-v1.8.2.js",
    "breeding-performance-dashboard-v1.8.2.js",
    "genetics-v2-phase1-v1.8.2.js",
    "genetics-v2-phase2-v1.8.2.js",
    "genetics-v2-phase3-v1.8.2.js"
  ]) {
    assert.match(build, new RegExp(asset.replaceAll(".", "\\.")));
    assert.match(worker, new RegExp(asset.replaceAll(".", "\\.")));
  }
});

test("subscription launch policy is intentionally carried forward unchanged", () => {
  const launch = read("subscription-launch-v1.8.1.js");
  const readme = read("README.md");
  assert.match(launch, /2026-10-01T00:00:00-04:00/);
  assert.match(readme, /October 1, 2026 at 12:00 AM Eastern/);
  assert.match(readme, /Member — \$14\.99\/month/);
  assert.match(readme, /Business — Coming Soon/);
});

test("release documentation and mobile install safety contract are present", () => {
  assert.equal(exists("RELEASE_NOTES-v1.8.2.md"), true);
  assert.match(read("README.md"), /^# HerdHarbor Alpha v1\.8\.2/m);
  assert.match(read("RELEASE_NOTES-v1.8.2.md"), /Mobile web install entry/);
  assert.match(read("tests/mobile-pwa-install-entry-v1.8.2.test.cjs"), /canonical PWA controller/);
});
