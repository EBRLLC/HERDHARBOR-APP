import fs from "node:fs";

const target = "tests/state-integrity-e2e-v1.8.2.test.cjs";
let source = fs.readFileSync(target, "utf8");

const retainOld = '  assert.equal(retained.updated.length, 3);';
const retainNew = '  assert.equal(retained.updated.length, 0, "retaining already-Active offspring is idempotent and should not rewrite unchanged records");';
if (!source.includes(retainOld)) throw new Error("Expected retain assertion was not found");
source = source.replace(retainOld, retainNew);

const importOld = '  assert.equal(imported.alreadyImported, undefined);';
const importNew = '  assert.equal(imported.alreadyImported, false, "the first accepted transfer is a new import");';
if (!source.includes(importOld)) throw new Error("Expected first-import assertion was not found");
source = source.replace(importOld, importNew);

fs.writeFileSync(target, source);
