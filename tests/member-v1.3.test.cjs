const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const spreadsheet = fs.readFileSync(path.join(root, "spreadsheet-import.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const releaseNotes = fs.readFileSync(path.join(root, "RELEASE_NOTES-v1.8.1.md"), "utf8");

// v1.8.1 is additive: the proven v1.3.0 Member cattle workflow remains intact.
assert.match(html, /name="earTagNumber"/);
assert.match(html, /name="earTagColor"/);
assert.match(html, /cattle-ear-field/);
assert.match(html, /toLowerCase\(\) === "cattle"/);
assert.match(html, /a\.earTagNumber, a\.earTagColor/);
assert.match(html, /earTagNumber: animal\.earTagNumber \|\| ""/);
assert.match(html, /earTagColor: animal\.earTagColor \|\| ""/);

assert.match(spreadsheet, /earTagNumber: \["ear tag number", "ear tag"/);
assert.match(spreadsheet, /earTagColor: \["ear tag color", "tag color"/);
assert.match(spreadsheet, /"Ear Tag Number"/);
assert.match(spreadsheet, /"Ear Tag Color"/);
assert.match(spreadsheet, /earTagNumber: species === "Cattle"/);
assert.match(spreadsheet, /earTagColor: species === "Cattle"/);

assert.doesNotMatch(html, /team-management\.js|business-workspace\.js|business-tasks\.js|business-operations\.js|business-animals\.js/);
assert.doesNotMatch(worker, /team-management\.js|business-workspace\.js|business-tasks\.js|business-operations\.js|business-animals\.js/);
assert.match(releaseNotes, /Business\s+—\s+Coming Soon/);
assert.match(worker, /breeding-intelligence-core-v1\.6\.1\.js/);

console.log("v1.3.0 Member regression remains intact under Alpha v1.8.1");
