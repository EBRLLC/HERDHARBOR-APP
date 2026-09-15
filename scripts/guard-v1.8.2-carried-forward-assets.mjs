import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(target(name), "utf8");
const write = (name, value) => fs.writeFileSync(target(name), value);
const all = (text, from, to) => text.split(from).join(to);

function edit(name, mutator) {
  const before = read(name);
  const after = mutator(before);
  if (after !== before) write(name, after);
  console.log(`${after !== before ? "updated" : "no-op"} ${name}`);
}

const carriedForward = [
  "registration-safety-v1.8.1.js",
  "subscription-launch-v1.8.1.js",
  "subscription-referral-policy-v1.8.1.js",
  "subscription-admin-credits-v1.8.1.js",
  "subscription-stripe-launch-bridge-v1.8.1.js"
];

for (const workflow of [
  ".github/workflows/v1.8.2-ci.yml",
  ".github/workflows/v1.8.2-production-pages.yml",
  ".github/workflows/v1.8.2-production-acceptance.yml"
]) {
  edit(workflow, (text) => {
    for (const asset of carriedForward) {
      text = all(text, asset.replace("v1.8.1", "v1.8.2"), asset);
    }
    return text;
  });
}

edit("tests/monitoring-deployment-v1.5.1.test.cjs", (text) => {
  text = all(text, "name: Alpha v1\\.8\\.1 CI", "name: Alpha v1\\.8\\.2 CI");
  text = all(text, "herdharbor-v1\\.8\\.1-unsigned-aab", "herdharbor-v1\\.8\\.2-unsigned-aab");
  text = all(text, "protected v1.8.1 production acceptance", "protected v1.8.2 production acceptance");
  text = all(text, "Alpha v1.8.1 deployment, Android review, protected production acceptance", "Alpha v1.8.2 deployment, Android review, protected production acceptance");
  if (!text.includes("carried-forward v1.8.1 runtime assets keep their real filenames")) {
    text = text.replace(
      'assert.match(pagesWorkflow, /actions\\/deploy-pages@v4/);',
      'assert.match(pagesWorkflow, /actions\\/deploy-pages@v4/);\nfor (const asset of ["registration-safety-v1.8.1.js", "subscription-launch-v1.8.1.js", "subscription-referral-policy-v1.8.1.js", "subscription-admin-credits-v1.8.1.js", "subscription-stripe-launch-bridge-v1.8.1.js"]) {\n  assert.ok(pagesWorkflow.includes(asset), `carried-forward v1.8.1 runtime assets keep their real filenames: ${asset}`);\n  assert.ok(!pagesWorkflow.includes(asset.replace("v1.8.1", "v1.8.2")), `deployment must not invent a v1.8.2 filename for ${asset}`);\n}'
    );
  }
  return text;
});

edit("tests/current-release-reference-audit-v1.8.2.test.cjs", (text) => {
  if (!text.includes("PWA monitoring loader uses the v1.8.2 cache identity")) {
    text = text.replace(
      'assert.match(pwa, /BUILD_ID = window\\.HerdHarborBuild\\?\\.buildId \\|\\| "cloud-sync-v2-state-integrity-1"/);',
      'assert.match(pwa, /BUILD_ID = window\\.HerdHarborBuild\\?\\.buildId \\|\\| "cloud-sync-v2-state-integrity-1"/);\n  assert.match(pwa, /herdharbor-monitoring-config\\.js\\?v=1\\.8\\.2/, "PWA monitoring loader uses the v1.8.2 cache identity");\n  assert.match(pwa, /herdharbor-monitoring-v1\\.6\\.1\\.min\\.js\\?v=1\\.8\\.2/);'
    );
  }
  if (!text.includes("deployment keeps carried-forward runtime filenames")) {
    text = text.replace(
      'assert.match(ci, /herdharbor-v1\\.8\\.2-unsigned-aab/);',
      'assert.match(ci, /herdharbor-v1\\.8\\.2-unsigned-aab/);\n  for (const asset of ["registration-safety-v1.8.1.js", "subscription-launch-v1.8.1.js", "subscription-referral-policy-v1.8.1.js", "subscription-admin-credits-v1.8.1.js", "subscription-stripe-launch-bridge-v1.8.1.js"]) {\n    assert.ok(deploy.includes(asset), `deployment keeps carried-forward runtime filenames: ${asset}`);\n    assert.ok(!deploy.includes(asset.replace("v1.8.1", "v1.8.2")), `deployment must not reference nonexistent promoted filename for ${asset}`);\n  }'
    );
  }
  return text;
});

console.log("v1.8.2 carried-forward runtime filename guard complete");
