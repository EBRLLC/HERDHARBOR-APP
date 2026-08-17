"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

assert.match(html, /const APP_VERSION = "1\.3\.0"/);
assert.match(html, /let lastSavedRaw = localStorage\.getItem\(STORAGE_KEY\) \|\| ""/);
assert.match(html, /if \(rawValue !== lastSavedRaw\) \{[\s\S]*?localStorage\.setItem\(STORAGE_KEY, rawValue\)[\s\S]*?lastSavedRaw = rawValue/);
assert.match(html, /function scheduleUiWork\(key, callback\)/);
assert.match(html, /window\.requestAnimationFrame/);
assert.match(html, /scheduleUiWork\("animal-search"/);
assert.match(html, /scheduleUiWork\("task-search"/);
assert.match(html, /scheduleUiWork\("sales-search"/);
assert.match(html, /function animalById\(id\)/);
assert.match(html, /new Map\(state\.animals\.map/);

assert.match(html, /id="settings-state-size"/);
assert.match(html, /id="settings-storage-used"/);
assert.match(html, /id="settings-storage-available"/);
assert.match(html, /navigator\.storage\?\.estimate\?\.\(\)/);
assert.match(html, /navigator\.storage\?\.persisted\?\.\(\)/);

assert.match(html, /maxDimension: 560,[\s\S]*?targetBytes: 65000/);
assert.match(html, /maxDimension: 420,[\s\S]*?targetBytes: 45000/);

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
