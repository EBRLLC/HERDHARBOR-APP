"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

assert.match(appRuntime, /const ATTACHMENT_DB = "herdharbor_attachments_v1"/);
assert.match(appRuntime, /indexedDB\.open\(ATTACHMENT_DB, 1\)/);
assert.match(appRuntime, /createObjectStore\(ATTACHMENT_STORE\)/);
assert.match(appRuntime, /async function migratePedigreeAttachments\(\)/);
assert.match(appRuntime, /navigator\.storage\?\.persist/);
assert.match(appRuntime, /await putPedigreeAttachment\(pedigreeId, sourceDocument\)/);
assert.match(appRuntime, /sourceDataUrl: ""/);
assert.match(appRuntime, /attachmentStored: Boolean\(sourceDocument\?\.dataUrl\)/);
assert.match(appRuntime, /async function stateWithPedigreeAttachments\(\)/);
assert.match(appRuntime, /window\.HerdHarborAttachments = \{ stateWithPedigreeAttachments \}/);
assert.match(appRuntime, /await deletePedigreeAttachment\(id\)/);
assert.match(appRuntime, /indexedDB\.deleteDatabase\(ATTACHMENT_DB\)/);
assert.doesNotMatch(appRuntime, /remove large pedigree documents or animal photos/);
assert.match(cloud, /async function downloadSafetyBackup\(\)/);
assert.match(cloud, /HerdHarborAttachments\?\.stateWithPedigreeAttachments/);
assert.match(cloud, /version: "1\.7\.1"/);
assert.match(cloud, /function removeRedundantStateCache\(userId\)/);
assert.match(cloud, /safeStorageRemove\(cacheKey\(userId\)\)/);
assert.match(cloud, /removeRedundantStateCache\(session\.user\.id\)/);

console.log("expanded pedigree attachment storage and backup tests passed");
