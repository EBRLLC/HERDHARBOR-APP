const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Baseline = require("../cloud-legacy-baseline-v1.8.4.js");

test("legacy cloud baseline memory store round-trips full JSON state", async () => {
  const store = Baseline.createMemoryStore();
  const raw = JSON.stringify({
    animals: [{ id: "a1", name: "Judy" }],
    litters: [{ id: "l1", bornAlive: 4 }]
  });

  assert.equal(await store.get("user-1"), null);
  assert.equal(await store.set("user-1", raw), true);
  assert.equal(await store.get("user-1"), raw);
  assert.equal(await store.remove("user-1"), true);
  assert.equal(await store.get("user-1"), null);
});

test("legacy cloud baseline store rejects invalid state payloads", async () => {
  const store = Baseline.createMemoryStore();
  await assert.rejects(() => store.set("user-1", "not-json"), /valid JSON/);
  await assert.rejects(() => store.set("user-1", "[]"), /object state/);
});

test("legacy cloud sync migrates the large merge baseline away from localStorage", () => {
  const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");

  assert.match(cloud, /HerdHarborLegacyCloudBaseline\?\.createIndexedDbStore/);
  assert.match(cloud, /async function readCloudBaseline\(userId\)/);
  assert.match(cloud, /async function writeCloudBaseline\(userId, rawValue\)/);
  assert.match(cloud, /await legacyBaselineStore\.set\(userId, rawValue\)/);
  assert.match(cloud, /safeStorageRemove\(baseKey\(userId\)\)/);

  const directReads = cloud.match(/originalGetItem\.call\(localStorage, baseKey\(/g) || [];
  const directWrites = cloud.match(/safeStorageSet\(baseKey\(/g) || [];

  assert.equal(directReads.length, 1, "only the one-time legacy migration read may access the old localStorage baseline");
  assert.equal(directWrites.length, 1, "only the emergency fallback may write the old localStorage baseline");
});

test("baseline restored is emitted only after durable persistence succeeds", () => {
  const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
  assert.match(
    cloud,
    /const stored = await writeCloudBaseline\(userId, activeRaw\);\s*if \(!stored\) return false;\s*dispatchBaselineRestored\(userId, reason\);/
  );
  assert.match(
    cloud,
    /const stored = await writeCloudBaseline\(userId, previousValue\);\s*if \(!stored\) return false;\s*dispatchBaselineRestored\(userId, reason\);/
  );
});

test("durable baseline loader precedes cloud runtime and has fresh cache identities", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");

  const baselineAt = index.indexOf("cloud-legacy-baseline-v1.8.4.js?v=1");
  const cloudAt = index.indexOf("herdharbor-cloud.js?v=23");
  assert.ok(baselineAt >= 0);
  assert.ok(cloudAt > baselineAt);

  assert.match(worker, /cloud-legacy-baseline-v1\.8\.4\.js\?v=1/);
  assert.match(worker, /herdharbor-cloud\.js\?v=23/);
});
