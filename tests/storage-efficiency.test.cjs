"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const animalProfileRuntime = fs.readFileSync(path.join(root, "animal-profile-runtime-v1.8.3.js"), "utf8");
const taskRuntime = fs.readFileSync(path.join(root, "task-runtime-v1.8.3.js"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

assert.match(appRuntime, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.2"/);
assert.match(appRuntime, /let lastSavedRaw = localStorage\.getItem\(STORAGE_KEY\) \|\| ""/);
assert.match(appRuntime, /if \(rawValue !== lastSavedRaw\) \{[\s\S]*?localStorage\.setItem\(STORAGE_KEY, rawValue\)[\s\S]*?lastSavedRaw = rawValue/);
assert.match(appRuntime, /function scheduleUiWork\(key, callback\)/);
assert.match(appRuntime, /window\.requestAnimationFrame/);
assert.match(animalProfileRuntime, /deps\.scheduleUiWork\("animal-search"/);
assert.match(taskRuntime, /scheduleUiWork\("task-search"/);
assert.match(appRuntime, /scheduleUiWork\("sales-search"/);
assert.match(appRuntime, /function animalById\(id\)/);
assert.match(appRuntime, /new Map\(state\.animals\.map/);

assert.match(appRuntime, /id="settings-state-size"/);
assert.match(appRuntime, /id="settings-storage-used"/);
assert.match(appRuntime, /id="settings-storage-available"/);
assert.match(appRuntime, /navigator\.storage\?\.estimate\?\.\(\)/);
assert.match(appRuntime, /navigator\.storage\?\.persisted\?\.\(\)/);

assert.match(animalProfileRuntime, /maxDimension: 560,[\s\S]*?targetBytes: 65000/);
assert.match(appRuntime, /maxDimension: 420,[\s\S]*?targetBytes: 45000/);

assert.match(cloud, /const MAX_RECOVERY_SNAPSHOTS = 6/);
assert.match(cloud, /const MAX_RECOVERY_BYTES = 8_000_000/);
assert.match(cloud, /if \(snapshots\[0\]\?\.rawValue === rawValue\) return/);
assert.match(cloud, /retainedBytes \+ snapshotBytes > MAX_RECOVERY_BYTES/);
assert.match(cloud, /if \(left === right\) return Boolean\(safeParse\(left\)\)/);
assert.match(cloud, /if \(previousValue === value\) return undefined/);
assert.match(cloud, /if \(previousValue && sameState\(previousValue, value\)\) return result/);

const fullCacheWrites = cloud.match(/safeStorageSet\(cacheKey\(userId\),/g) || [];
assert.equal(
  fullCacheWrites.length,
  2,
  "only signed-out account fallback and the tiny clear-data sentinel may use the per-user cache"
);
assert.match(cloud, /safeStorageSet\(cacheKey\(userId\), activeRaw\)/);
assert.match(cloud, /safeStorageSet\(cacheKey\(userId\), "\{\}"\)/);

console.log("workflow and storage efficiency tests passed");
