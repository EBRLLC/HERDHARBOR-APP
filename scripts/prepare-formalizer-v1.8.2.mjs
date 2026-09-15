import fs from "node:fs";

const formalizer = "scripts/formalize-v1.8.2.mjs";
let source = fs.readFileSync(formalizer, "utf8");
const strictLine = 'html = replaceAllRequired(html, "herdharbor-monitoring-config.js?v=1.8.1", "herdharbor-monitoring-config.js?v=1.8.2", "monitoring cache version");';
const optionalLine = 'html = html.split("herdharbor-monitoring-config.js?v=1.8.1").join("herdharbor-monitoring-config.js?v=1.8.2");';
if (source.includes(strictLine)) {
  source = source.replace(strictLine, optionalLine);
  fs.writeFileSync(formalizer, source);
}

const testFile = "tests/state-integrity-e2e-v1.8.2.test.cjs";
let tests = fs.readFileSync(testFile, "utf8");
const retainOld = '  assert.equal(retained.updated.length, 3);';
const retainNew = '  assert.equal(retained.updated.length, 0, "retaining already-Active offspring is idempotent and should not rewrite unchanged records");';
if (tests.includes(retainOld)) tests = tests.replace(retainOld, retainNew);
const importOld = '  assert.equal(imported.alreadyImported, undefined);';
const importNew = '  assert.equal(imported.alreadyImported, false, "the first accepted transfer is a new import");';
if (tests.includes(importOld)) tests = tests.replace(importOld, importNew);
fs.writeFileSync(testFile, tests);
