import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(file(name), "utf8");
const write = (name, value) => fs.writeFileSync(file(name), value);

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing expected ${label || from}`);
  return text.replace(from, to);
}

function replaceAllRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing expected ${label || from}`);
  return text.split(from).join(to);
}

function updateJson(name, mutator) {
  const value = JSON.parse(read(name));
  mutator(value);
  write(name, `${JSON.stringify(value, null, 2)}\n`);
}

// Package/repository identity.
updateJson("package.json", (pkg) => {
  pkg.version = "1.8.2";
  pkg.description = "HerdHarbor Alpha v1.8.2 production monitoring and regression tooling";
  pkg.scripts["test:release"] = "npm run audit:security && node --test tests/current-release-reference-audit-v1.8.2.test.cjs";
  pkg.scripts["test:completion"] = "npm run test:release && npm run test:state-integrity";
  pkg.scripts["test:state-integrity"] = "node --test tests/state-integrity-e2e-v1.8.2.test.cjs";
  pkg.scripts["test:v1.8.2"] = "node --test tests/cloud-sync-v2-baseline-v1.8.2.test.cjs tests/local-cache-v2-v1.8.2.test.cjs tests/cloud-sync-v2-flow-v1.8.2.test.cjs tests/cloud-sync-v2-diagnostics-v1.8.2.test.cjs tests/state-integrity-e2e-v1.8.2.test.cjs tests/auth-freeze-resilience-v1.8.2.test.cjs tests/auth-freeze-resilience-manifest-v1.8.2.test.cjs tests/current-release-reference-audit-v1.8.2.test.cjs";
});

updateJson("package-lock.json", (lock) => {
  lock.version = "1.8.2";
  if (lock.packages?.[""]) lock.packages[""].version = "1.8.2";
});

updateJson("manifest.json", (manifest) => {
  manifest.version = "1.8.2";
  manifest.description = "HerdHarbor Alpha v1.8.2 provides livestock recordkeeping, breeding and genetics tools, analytics, protected Cloud Sync V2, lifecycle integrity, and subscription management.";
});

updateJson("twa-manifest.json", (twa) => {
  twa.appVersion = "1.8.2";
  twa.appVersionCode = 16;
});

let gradle = read("android/app/build.gradle");
gradle = replaceRequired(gradle, "versionCode 15", "versionCode 16", "Android versionCode 15");
gradle = replaceRequired(gradle, 'versionName "1.8.1"', 'versionName "1.8.2"', "Android versionName 1.8.1");
write("android/app/build.gradle", gradle);

// Canonical web build identity.
let build = read("herdharbor-build.js");
build = replaceRequired(build, 'buildId: "cloud-sync-v2-baseline-recovery-2"', 'buildId: "cloud-sync-v2-state-integrity-1"', "old v1.8.2 buildId");
build = replaceRequired(build, 'build: "1.8.2-alpha-cloud-sync-v2-baseline-recovery-2"', 'build: "1.8.2-alpha-cloud-sync-v2-state-integrity-1"', "old v1.8.2 build string");
write("herdharbor-build.js", build);

let pwa = read("pwa.js");
pwa = replaceRequired(pwa, '// Current release contract: const APP_VERSION = "1.8.1";', '// Current release contract: const APP_VERSION = "1.8.2";');
pwa = replaceRequired(pwa, '// Current build contract: const BUILD_ID = "october-subscription-launch-referrals-credits-4";', '// Current build contract: const BUILD_ID = "cloud-sync-v2-state-integrity-1";');
pwa = replaceRequired(pwa, 'const APP_VERSION = window.HerdHarborBuild?.version || "1.8.1";', 'const APP_VERSION = window.HerdHarborBuild?.version || "1.8.2";');
pwa = replaceRequired(pwa, 'const BUILD_ID = window.HerdHarborBuild?.buildId || "october-subscription-launch-referrals-credits-4";', 'const BUILD_ID = window.HerdHarborBuild?.buildId || "cloud-sync-v2-state-integrity-1";');
write("pwa.js", pwa);

let html = read("index.html");
html = replaceAllRequired(html, "manifest.json?v=1.8.1", "manifest.json?v=1.8.2", "manifest cache version");
html = replaceAllRequired(html, "herdharbor-build.js?v=1.8.1", "herdharbor-build.js?v=1.8.2", "build loader cache version");
html = replaceAllRequired(html, "herdharbor-monitoring-config.js?v=1.8.1", "herdharbor-monitoring-config.js?v=1.8.2", "monitoring cache version");
html = replaceAllRequired(html, 'window.HerdHarborBuild?.version || "1.8.1"', 'window.HerdHarborBuild?.version || "1.8.2"', "HTML APP_VERSION fallback");
html = replaceAllRequired(html, "HerdHarbor Alpha v1.8.1 current application shell", "HerdHarbor Alpha v1.8.2 current application shell", "HTML shell release comment");
write("index.html", html);

let worker = read("service-worker.js");
worker = worker.replace(/^const CACHE_NAME = .*;$/m, 'const CACHE_NAME = "herdharbor-shell-v1.8.2-alpha-cloud-sync-v2-state-integrity-1";');
worker = replaceAllRequired(worker, "./manifest.json?v=1.8.1", "./manifest.json?v=1.8.2");
worker = replaceAllRequired(worker, "./herdharbor-build.js?v=1.8.1", "./herdharbor-build.js?v=1.8.2");
worker = replaceAllRequired(worker, "./herdharbor-monitoring-config.js?v=1.8.1", "./herdharbor-monitoring-config.js?v=1.8.2");
worker = replaceAllRequired(worker, "./vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.8.1", "./vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.8.2");
const shellAnchor = '  "./herdharbor-cloud.js?v=20",';
const shellSyncAssets = `${shellAnchor}\n  "./local-cache-v2-v1.8.2.js?v=1",\n  "./cloud-sync-v2-flow-v1.8.2.js?v=1",\n  "./cloud-sync-v2-diagnostics-v1.8.2.js?v=1",`;
if (!worker.includes("./cloud-sync-v2-diagnostics-v1.8.2.js?v=1")) worker = replaceRequired(worker, shellAnchor, shellSyncAssets, "service-worker cloud shell anchor");
const networkAnchor = '  "/herdharbor-cloud.js",';
const networkSyncAssets = `${networkAnchor}\n  "/local-cache-v2-v1.8.2.js",\n  "/cloud-sync-v2-flow-v1.8.2.js",\n  "/cloud-sync-v2-diagnostics-v1.8.2.js",`;
if (!worker.includes('  "/cloud-sync-v2-diagnostics-v1.8.2.js",')) worker = replaceRequired(worker, networkAnchor, networkSyncAssets, "service-worker network-first cloud anchor");
write("service-worker.js", worker);

// Monitoring release identity.
let monitoring = read("herdharbor-monitoring-config.js");
monitoring = replaceAllRequired(monitoring, 'release: "HerdHarbor@1.8.1"', 'release: "HerdHarbor@1.8.2"');
monitoring = replaceAllRequired(monitoring, 'build: "october-subscription-launch-referrals-credits-4"', 'build: "cloud-sync-v2-state-integrity-1"');
write("herdharbor-monitoring-config.js", monitoring);

for (const name of ["scripts/build-monitoring-config.mjs", "scripts/sentry-production-acceptance.mjs"]) {
  let value = read(name);
  value = replaceAllRequired(value, "HerdHarbor@1.8.1", "HerdHarbor@1.8.2", `${name} monitoring release`);
  value = value.split("october-subscription-launch-referrals-credits-4").join("cloud-sync-v2-state-integrity-1");
  write(name, value);
}

// Documentation.
let readme = read("README.md");
readme = replaceRequired(readme, "# HerdHarbor Alpha v1.8.1", "# HerdHarbor Alpha v1.8.2");
readme = replaceRequired(readme, "The current release is **Alpha v1.8.1**.", "The current release is **Alpha v1.8.2**.");
readme = replaceRequired(readme, "## Alpha v1.8.1 subscription and account release", "## Alpha v1.8.2 reliability and account release");
readme = replaceRequired(
  readme,
  "The current release adds the production subscription-launch layer around the established v1.8.0 Subscription Engine without replacing HerdHarbor authentication or membership storage.",
  "The current release formalizes Cloud Sync V2, lifecycle state-integrity safeguards, and the production subscription/account layer without replacing HerdHarbor authentication, membership storage, or established domain engines. Cloud Sync V2 keeps normal edits protected locally first, retries recoverable cloud work automatically, and reserves the Needs attention state for true conflicts or non-recoverable failures."
);
readme = replaceRequired(readme, "remain part of v1.8.1—for example", "remain part of v1.8.2—for example");
readme = replaceRequired(readme, "filename predates v1.8.1.", "filename predates v1.8.2.");
readme = replaceRequired(readme, "authoritative current release identity is defined by the v1.8.1", "authoritative current release identity is defined by the v1.8.2");
readme = readme.split("`npm run test:v1.8.1`").join("`npm run test:v1.8.2`");
readme = readme.split("current v1.8.1 repository identity").join("current v1.8.2 repository identity");
readme = readme.split(".github/workflows/v1.8.1-ci.yml").join(".github/workflows/v1.8.2-ci.yml");
write("README.md", readme);

let checklist = read("TEST_CHECKLIST.md");
checklist = replaceRequired(checklist, "# HerdHarbor Alpha v1.8.1 Acceptance Checklist", "# HerdHarbor Alpha v1.8.2 Acceptance Checklist");
if (!checklist.includes("Cloud Sync V2 diagnostics")) {
  checklist += `\n\n## Cloud Sync V2 and lifecycle integrity\n\n- [ ] Normal record edits show Saved locally / Syncing / Synced without a permanent red failure.\n- [ ] Offline edits remain protected locally and resume sync after connectivity returns.\n- [ ] Sync Diagnostics shows last successful sync, local/cloud revisions, pending changes, and failed operation.\n- [ ] Retry Sync, Download Local Backup, Compare Local / Cloud, and Restore Last-Known-Good behave safely.\n- [ ] Run \`npm run test:state-integrity\` for retained-offspring, sale/transfer, cross-device breeding, and stale-device deletion scenarios.\n`;
}
write("TEST_CHECKLIST.md", checklist);

let releaseNotes = read("RELEASE_NOTES-v1.8.2.md");
if (!releaseNotes.includes("## State-integrity regression suite")) {
  releaseNotes += `\n\n## State-integrity regression suite\n\nThe formal v1.8.2 gate now exercises complete canonical-state journeys across the actual lifecycle engines:\n\n- breeding → confirmed pregnancy → birth → automatic offspring profiles → weights → safe weaning → retained animals;\n- litter evaluation → reserved/completed sale → HerdHarbor Direct member transfer → pedigree/provenance import;\n- phone-created breeding → PC update → later phone edit with non-overlapping merge and same-field conflict protection;\n- litter deletion → tombstone sync → stale second device return without resurrection, while legitimate offspring profiles remain preserved.\n\n## Formal Alpha v1.8.2 release identity\n\nPackage, PWA, Android/TWA, monitoring, CI/deployment, release documentation, and release-reference tests now identify Alpha v1.8.2 consistently. Stable older-named domain engines and historical migration files remain intentionally carried forward.\n`;
}
write("RELEASE_NOTES-v1.8.2.md", releaseNotes);

write("RELEASE_NOTES.md", "# HerdHarbor Alpha v1.8.2\n\nCurrent release: **Alpha v1.8.2**.\n\nSee `RELEASE_NOTES-v1.8.2.md` for Cloud Sync V2, lifecycle state-integrity, direct transfer, breeding workflow, subscription/account, and formal release details.\n");

if (fs.existsSync(file("google-play/listing/en-US/release-notes.txt"))) {
  write("google-play/listing/en-US/release-notes.txt", "Alpha v1.8.2 improves Cloud Sync reliability with protected local-first saves, automatic recovery, sync diagnostics, and stronger lifecycle integrity across breeding, litters, weaning, sales, and animal transfers.\n");
}

// Correct diagnostic revision bookkeeping: writing STATE_KEY is already wrapped by
// installRevisionTracking and increments the local revision exactly once.
let diagnostics = read("cloud-sync-v2-diagnostics-v1.8.2.js");
diagnostics = replaceRequired(diagnostics, '      bumpLocalRevision("restore-last-known-good");\n', "", "duplicate restore revision bump");
write("cloud-sync-v2-diagnostics-v1.8.2.js", diagnostics);

let diagnosticsTest = read("tests/cloud-sync-v2-diagnostics-v1.8.2.test.cjs");
if (!diagnosticsTest.includes("restore must not double-increment")) {
  diagnosticsTest = diagnosticsTest.replace(
    "  assert.doesNotMatch(restoreSource, /removeItem\\(dirtyKey/);\n",
    "  assert.doesNotMatch(restoreSource, /removeItem\\(dirtyKey/);\n  assert.doesNotMatch(restoreSource, /bumpLocalRevision\\(\\\"restore-last-known-good\\\"\\)/, \"restore must not double-increment the diagnostic local revision\");\n"
  );
}
write("tests/cloud-sync-v2-diagnostics-v1.8.2.test.cjs", diagnosticsTest);

let authTest = read("tests/auth-freeze-resilience-v1.8.2.test.cjs");
authTest = replaceAllRequired(authTest, "cloud-sync-v2-baseline-recovery-2", "cloud-sync-v2-state-integrity-1", "auth build identity");
write("tests/auth-freeze-resilience-v1.8.2.test.cjs", authTest);

// Retire the split-identity release audit. The v1.8.2 audit supersedes it.
if (fs.existsSync(file("tests/current-release-reference-audit-v1.8.1.test.cjs"))) {
  fs.rmSync(file("tests/current-release-reference-audit-v1.8.1.test.cjs"));
}

// Promote workflow identity while preserving historical domain filenames.
const workflowPairs = [
  [".github/workflows/v1.8.1-ci.yml", ".github/workflows/v1.8.2-ci.yml"],
  [".github/workflows/v1.8.1-production-pages.yml", ".github/workflows/v1.8.2-production-pages.yml"],
  [".github/workflows/v1.8.1-production-acceptance.yml", ".github/workflows/v1.8.2-production-acceptance.yml"]
];
for (const [oldName, newName] of workflowPairs) {
  if (!fs.existsSync(file(oldName)) && fs.existsSync(file(newName))) continue;
  let value = read(oldName);
  value = value.split("v1.8.1").join("v1.8.2");
  value = value.split("1.8.1").join("1.8.2");
  value = value.split("versionCode 15").join("versionCode 16");
  value = value.split('"appVersionCode": 15').join('"appVersionCode": 16');
  value = value.split("ci-v1.8.1").join("ci-v1.8.2");
  if (oldName.endsWith("-ci.yml") && !value.includes("npm run test:state-integrity")) {
    value = value.replace(
      "      - name: Run complete HerdHarbor regression suite in UTC",
      "      - name: Run lifecycle state-integrity E2E gate\n        run: npm run test:state-integrity\n      - name: Run complete HerdHarbor regression suite in UTC"
    );
  }
  write(newName, value);
  if (oldName !== newName && fs.existsSync(file(oldName))) fs.rmSync(file(oldName));
}

console.log("HerdHarbor Alpha v1.8.2 release identity finalized.");
