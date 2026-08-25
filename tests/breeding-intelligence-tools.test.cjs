const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tools = fs.readFileSync(path.join(root, 'breeding-intelligence-tools.js'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'pwa.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

assert.doesNotThrow(() => new Function(tools), 'breeding intelligence tools compile');
assert.match(tools, /Genetic Test Records/);
assert.match(tools, /testName/);
assert.match(tools, /laboratory/);
assert.match(tools, /testDate/);
assert.match(tools, /reference/);
assert.match(tools, /Predicted vs Actual/);
assert.match(tools, /previousOffspring/);
assert.match(tools, /Genetics Data Exchange/);
assert.match(tools, /addWorksheet\("Genetics"\)/);
assert.match(tools, /addWorksheet\("Genetic Tests"\)/);
assert.match(tools, /lower-confidence information never silently replaces/i);
assert.match(pwa, /breeding-intelligence-tools\.js\?v=1\.4\.0/);
assert.match(worker, /breeding-intelligence-tools\.js\?v=1\.4\.0/);

console.log('HerdHarbor v1.4.0 genetics tools tests passed');
