import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(file(name), "utf8");
const write = (name, value) => fs.writeFileSync(file(name), value);
const all = (text, from, to) => text.split(from).join(to);

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

// The formal v1.8.2 PWA must request monitoring assets with the same cache
// identity used by index.html and the service worker.
edit("pwa.js", (text) => {
  text = all(text, "herdharbor-monitoring-config.js?v=1.8.1", "herdharbor-monitoring-config.js?v=1.8.2");
  text = all(text, "vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.8.1", "vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.8.2");
  return text;
});

// The promoted CI workflow must exercise the promoted release suite.
edit(".github/workflows/v1.8.2-ci.yml", (text) =>
  all(text, "npm run test:v1.8.1", "npm run test:v1.8.2")
);

edit("tests/monitoring-deployment-v1.5.1.test.cjs", (text) =>
  all(text, "npm run test:v1\\.8\\.1", "npm run test:v1\\.8\\.2")
);

// v1.8.2 has its own Cloud Sync V2 build family; do not route it through the
// v1.8.1 subscription-launch build assertion.
edit("tests/genetics-routing-completion-v1.6.1.test.cjs", (text) => {
  text = all(text, '["1.7.1", "1.8.0", "1.8.1"]', '["1.7.1", "1.8.0", "1.8.1", "1.8.2"]');
  text = text.replace(
    '  } else {\n    assert.match(buildId, /^october-subscription-launch-/);\n    assert.match(worker, /herdharbor-shell-v1\\.8\\.1/);\n  }',
    '  } else if (version === "1.8.1") {\n    assert.match(buildId, /^october-subscription-launch-/);\n    assert.match(worker, /herdharbor-shell-v1\\.8\\.1/);\n  } else {\n    assert.equal(buildId, "cloud-sync-v2-state-integrity-1");\n    assert.match(worker, /herdharbor-shell-v1\\.8\\.2-alpha-cloud-sync-v2-state-integrity-1/);\n  }'
  );
  return text;
});

// Stability guard follows the formal shell identity while continuing to assert
// every older-named domain engine and preserved data contract.
edit("tests/stability-release.test.cjs", (text) => {
  text = all(text, "HerdHarbor Alpha v1\\.8\\.1 current application shell", "HerdHarbor Alpha v1\\.8\\.2 current application shell");
  text = all(text, 'const APP_VERSION = window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.1"', 'const APP_VERSION = window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.2"');
  text = all(text, '(?:7\\.1|8\\.0|8\\.1)', '(?:7\\.1|8\\.0|8\\.1|8\\.2)');
  text = all(text, 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "october-subscription-launch-referrals-credits-4"', 'window\\.HerdHarborBuild\\?\\.buildId \\|\\| "cloud-sync-v2-state-integrity-1"');
  return text;
});

edit("tests/tablet-layout-login-color.test.cjs", (text) => {
  text = all(text, "native/PWA shell retains its carried-forward v1.8.1 identity", "native/PWA shell shares the formal v1.8.2 identity");
  text = all(text, 'const APP_VERSION = window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.1"', 'const APP_VERSION = window\\.HerdHarborBuild\\?\\.version \\|\\| "1\\.8\\.2"');
  text = all(text, 'assert.equal(manifest.version, "1.8.1");', 'assert.equal(manifest.version, "1.8.2");');
  text = all(text, '(?:7\\.1|8\\.0|8\\.1)', '(?:7\\.1|8\\.0|8\\.1|8\\.2)');
  return text;
});

console.log("remaining v1.8.2 release contracts closed");
