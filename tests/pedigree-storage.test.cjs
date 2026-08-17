"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

assert.match(html, /const ATTACHMENT_DB = "herdharbor_attachments_v1"/);
assert.match(html, /indexedDB\.open\(ATTACHMENT_DB, 1\)/);
assert.match(html, /createObjectStore\(ATTACHMENT_STORE\)/);
assert.match(html, /async function migratePedigreeAttachments\(\)/);
assert.match(html, /navigator\.storage\?\.persist/);
assert.match(html, /await putPedigreeAttachment\(pedigreeId, sourceDocument\)/);
assert.match(html, /sourceDataUrl: ""/);
assert.match(html, /attachmentStored: Boolean\(sourceDocument\?\.dataUrl\)/);
assert.match(html, /async function stateWithPedigreeAttachments\(\)/);
assert.match(html, /window\.HerdHarborAttachments = \{ stateWithPedigreeAttachments \}/);
assert.match(html, /await deletePedigreeAttachment\(id\)/);
assert.match(html, /indexedDB\.deleteDatabase\(ATTACHMENT_DB\)/);
assert.doesNotMatch(html, /remove large pedigree documents or animal photos/);
assert.match(cloud, /async function downloadSafetyBackup\(\)/);
assert.match(cloud, /HerdHarborAttachments\?\.stateWithPedigreeAttachments/);
assert.match(cloud, /version: "1\.2\.0"/);
assert.match(cloud, /function removeRedundantStateCache\(userId\)/);
assert.match(cloud, /safeStorageRemove\(cacheKey\(userId\)\)/);
assert.match(cloud, /removeRedundantStateCache\(session\.user\.id\)/);

console.log("expanded pedigree attachment storage and backup tests passed");
