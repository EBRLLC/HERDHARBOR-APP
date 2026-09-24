const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("v1.8.4 stability baseline preserves current whole-app v1.8.3 identity", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.version, "1.8.3");
  assert.match(pkg.description, /Alpha v1\.8\.3/);
  assert.match(read("herdharbor-build.js"), /version:\s*["']1\.8\.3["']/);
  assert.match(read("manifest.json"), /1\.8\.3/);
});

test("v1.8.4 contract defines a nine-phase stacked stability release", () => {
  const contract = read("V1.8.4-STABILITY-RELEASE-CONTRACT.md");
  const ledger = read("V1.8.4-STABILITY-STACK.md");
  for (let phase = 1; phase <= 9; phase += 1) {
    assert.match(contract, new RegExp(`PR ${phase}\\b`));
    assert.match(ledger, new RegExp(`\\| ${phase} \\|`));
  }
  assert.match(contract, /immediately previous phase/i);
  assert.match(contract, /No phase is auto-merged/i);
});

test("v1.8.4 defers AI expansion and keeps normalized authority gated", () => {
  const contract = read("V1.8.4-STABILITY-RELEASE-CONTRACT.md");
  assert.match(contract, /v2\.0\.1/);
  assert.match(contract, /does not expand AI functionality/i);
  assert.match(contract, /legacy full-state sync remains authoritative\/recovery/i);
  assert.match(contract, /formal whole-app promotion to Alpha v1\.8\.4 belongs to PR 9/i);
});

test("current operational documentation uses the v1.8.3 production baseline", () => {
  const checklist = read("TEST_CHECKLIST.md");
  const telemetry = read("CLOUD-SYNC-PRODUCTION-TELEMETRY-RUNBOOK.md");
  const rollout = read("CLOUD-SYNC-CONTROLLED-ROLLOUT-v1.8.3.md");

  assert.match(checklist, /current v1\.8\.3 production baseline/i);
  assert.doesNotMatch(checklist, /current v1\.8\.1 release contract/i);
  assert.match(telemetry, /application release remains `1\.8\.3`/);
  assert.match(rollout, /current production application identity is HerdHarbor Alpha v1\.8\.3/i);
});
