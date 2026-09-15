import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, value) => fs.writeFileSync(path.join(root, name), value);

function edit(name, mutator) {
  const before = read(name);
  const after = mutator(before);
  if (after !== before) {
    write(name, after);
    console.log(`updated ${name}`);
  } else {
    console.log(`no-op ${name}`);
  }
}

function replaceAll(text, from, to) {
  return text.split(from).join(to);
}

function currentShell(text) {
  text = replaceAll(text, '(?:7\\.1|8\\.0|8\\.1)', '(?:7\\.1|8\\.0|8\\.1|8\\.2)');
  text = replaceAll(text, '(?:8\\.0|8\\.1)', '(?:8\\.0|8\\.1|8\\.2)');
  text = replaceAll(text, 'herdharbor-shell-v1\\.8\\.1-alpha-october-subscription-launch-referrals-credits-\\d+', 'herdharbor-shell-v1\\.8\\.2-alpha-cloud-sync-v2-state-integrity-1');
  text = replaceAll(text, 'herdharbor-shell-v1\\.8\\.1-alpha-october-subscription-launch-', 'herdharbor-shell-v1\\.8\\.2-alpha-cloud-sync-v2-state-integrity-1');
  text = replaceAll(text, 'herdharbor-shell-v1\\.8\\.1', 'herdharbor-shell-v1\\.8\\.2');
  text = replaceAll(text, 'const APP_VERSION = window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.1"', 'const APP_VERSION = window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.2"');
  text = replaceAll(text, 'window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.1"', 'window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.2"');
  text = replaceAll(text, 'herdharbor-build\\.js\\?v=1\\.8\\.1', 'herdharbor-build\\.js\\?v=1\\.8\\.2');
  text = replaceAll(text, 'herdharbor-monitoring-config\\.js\\?v=1\\.8\\.1', 'herdharbor-monitoring-config\\.js\\?v=1\\.8\\.2');
  text = replaceAll(text, 'herdharbor-monitoring-v1\\.6\\.1\\.min\\.js\\?v=1\\.8\\.1', 'herdharbor-monitoring-v1\\.6\\.1\\.min\\.js\\?v=1\\.8\\.2');
  return text;
}

for (const name of [
  "tests/breeding-next-action-v1.8.2.test.cjs",
  "tests/breeding-performance-dashboard-v1.8.2.test.cjs",
  "tests/breeding-performance-overflow-v1.8.2.test.cjs",
  "tests/litter-sale-transfer-v1.8.2.test.cjs"
]) {
  edit(name, (text) => {
    text = replaceAll(text, 'version:\\s*"1\\.8\\.1"', 'version:\\s*"1\\.8\\.2"');
    text = replaceAll(text, 'assert.doesNotMatch(build,/version:\\s*"1\\.8\\.2"/);', 'assert.match(build,/buildId:\\s*"cloud-sync-v2-state-integrity-1"/);');
    text = replaceAll(text, 'without changing public v1.8.1 identity', 'under the formal v1.8.2 identity');
    text = replaceAll(text, 'while release identity stays v1.8.1', 'under the formal v1.8.2 identity');
    return text;
  });
}

edit("tests/cloud-sync-v2-baseline-v1.8.2.test.cjs", (text) =>
  replaceAll(text, "cloud-sync-v2-baseline-recovery-2", "cloud-sync-v2-state-integrity-1")
);

edit("tests/current-shell-asset-identity-v1.6.7.test.cjs", currentShell);

for (const name of [
  "tests/genetics-routing-completion-v1.6.1.test.cjs",
  "tests/launch-hardening.test.cjs"
]) {
  edit(name, (text) => {
    text = replaceAll(text, '["1.7.1", "1.8.0", "1.8.1"]', '["1.7.1", "1.8.0", "1.8.1", "1.8.2"]');
    text = currentShell(text);
    text = replaceAll(text, 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "october-subscription-launch-referrals-credits-4"', 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "cloud-sync-v2-state-integrity-1"');
    if (name.endsWith("launch-hardening.test.cjs") && !text.includes('webVersion === "1.8.2"')) {
      text = text.replace(
        '  assert.match(build, /subscription-launch-v1\\.8\\.1\\.js\\?v=1/);\n}\n',
        '  assert.match(build, /subscription-launch-v1\\.8\\.1\\.js\\?v=1/);\n}\nif (webVersion === "1.8.2") assert.equal(buildId, "cloud-sync-v2-state-integrity-1");\n'
      );
    }
    return text;
  });
}

edit("tests/google-play-readiness.test.cjs", (text) => {
  text = replaceAll(text, 'assert.equal(manifest.version, "1.8.1");', 'assert.equal(manifest.version, "1.8.2");');
  text = replaceAll(text, 'assert.equal(twa.appVersion, "1.8.1");', 'assert.equal(twa.appVersion, "1.8.2");');
  text = replaceAll(text, 'assert.equal(twa.appVersionCode, 15);', 'assert.equal(twa.appVersionCode, 16);');
  text = replaceAll(text, '/versionCode 15/', '/versionCode 16/');
  text = replaceAll(text, '/versionName "1\\.8\\.1"/', '/versionName "1\\.8\\.2"/');
  text = replaceAll(text, 'share the v1.8.1', 'share the v1.8.2');
  text = currentShell(text);
  text = replaceAll(text, 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "october-subscription-launch-referrals-credits-4"', 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "cloud-sync-v2-state-integrity-1"');
  text = replaceAll(text, 'Google Play Alpha v1.8.1 native readiness', 'Google Play Alpha v1.8.2 native readiness');
  return text;
});

edit("tests/junior-entry-paths-v1.5.1.test.cjs", (text) => {
  text = currentShell(text);
  return replaceAll(text, 'embedded app metadata is Alpha v1.8.1', 'embedded app metadata is Alpha v1.8.2');
});

for (const name of [
  "tests/mobile-viewport-hotfix-v1.8.0.test.cjs",
  "tests/phase3-integration.test.cjs",
  "tests/workflow-phase1-v1.7.1.test.cjs"
]) edit(name, currentShell);

edit("tests/monitoring-deployment-v1.5.1.test.cjs", (text) => {
  text = replaceAll(text, ".github/workflows/v1.8.1-production-pages.yml", ".github/workflows/v1.8.2-production-pages.yml");
  text = replaceAll(text, ".github/workflows/v1.8.1-production-acceptance.yml", ".github/workflows/v1.8.2-production-acceptance.yml");
  text = replaceAll(text, "HerdHarbor@1\\.8\\.1", "HerdHarbor@1\\.8\\.2");
  text = replaceAll(text, "october-subscription-launch-referrals-credits-4", "cloud-sync-v2-state-integrity-1");
  return currentShell(text);
});

edit("tests/monitoring-integration-v1.5.1.test.cjs", (text) => {
  text = replaceAll(text, 'assert.equal(pkg.version, "1.8.1");', 'assert.equal(pkg.version, "1.8.2");');
  text = replaceAll(text, 'HerdHarbor@1\\.8\\.1', 'HerdHarbor@1\\.8\\.2');
  text = replaceAll(text, 'october-subscription-launch-referrals-credits-4', 'cloud-sync-v2-state-integrity-1');
  return currentShell(text);
});

edit("tests/pwa-update-regression-v1.5.0.test.cjs", (text) => {
  text = replaceAll(text, 'The web runtime is v1.8.2 while the packaged/PWA shell remains on its carried-forward v1.8.1 identity.', 'The web runtime and packaged/PWA shell share the formal v1.8.2 identity.');
  text = replaceAll(text, 'assert.equal(manifest.version, "1.8.1");', 'assert.equal(manifest.version, "1.8.2");');
  text = currentShell(text);
  text = replaceAll(text, 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "october-subscription-launch-referrals-credits-4"', 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "cloud-sync-v2-state-integrity-1"');
  text = replaceAll(text, 'the packaged shell bootstrap retains its v1.8.1 cache identity until the packaging pass', 'the packaged shell bootstrap uses the v1.8.2 cache identity');
  return text;
});

edit("tests/runtime-consolidation-v1.5.1.test.cjs", (text) => {
  text = replaceAll(text, 'file === "herdharbor-monitoring-config.js" ? "1.8.1" : "1.7.1"', 'file === "herdharbor-monitoring-config.js" ? "1.8.2" : "1.7.1"');
  return currentShell(text);
});

edit("tests/stability-release.test.cjs", (text) =>
  replaceAll(text, 'HerdHarbor Alpha v1\\.8\\.1 current application shell', 'HerdHarbor Alpha v1\\.8\\.2 current application shell')
);

edit("tests/standards-youth-guides-v1.7.0.test.cjs", currentShell);
edit("tests/storage-efficiency.test.cjs", currentShell);
edit("tests/tablet-layout-login-color.test.cjs", currentShell);

for (const name of [
  "tests/subscription-engine-v1.8.0.test.cjs",
  "tests/subscription-launch-v1.8.1.test.cjs",
  "tests/subscription-referrals-credits-v1.8.1.test.cjs",
  "tests/subscription-stripe-v1.8.1.test.cjs"
]) {
  edit(name, (text) => {
    text = currentShell(text);
    text = replaceAll(text, 'october-subscription-launch-referrals-credits-4', 'cloud-sync-v2-state-integrity-1');
    return text;
  });
}

edit("tests/v1.7.1-stability-hotfix.test.cjs", (text) =>
  replaceAll(text, ".github/workflows/v1.8.1-production-pages.yml", ".github/workflows/v1.8.2-production-pages.yml")
);

edit("tests/v1.8.2-runtime-integration-audit.test.cjs", (text) =>
  replaceAll(text, "cloud-sync-v2-baseline-recovery-2", "cloud-sync-v2-state-integrity-1")
);

console.log("v1.8.2 regression-contract migration complete");
