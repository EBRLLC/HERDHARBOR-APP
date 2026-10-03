"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","breeding-intelligence-v1.6.1.js"),"utf8");

test("linebreeding defaults to active rabbits and exposes an ancestor toggle",()=>{
  assert.match(source,/function linebreedingCandidateRabbits\(state, includeAncestors = false\)/);
  assert.match(source,/HerdHarborMembership\?\.isActiveAnimal/);
  assert.match(source,/id="bi-linebreeding-include-ancestors"/);
  assert.match(source,/>Include ancestors</);
  assert.match(source,/Off by default/);
  assert.match(source,/isActiveAnimalRecord\(animal\) \|\| \(includeAncestors && isAncestorOnly\(animal\)\)/);
});

test("ancestor toggle adds only Ancestor Only records, not other inactive statuses",()=>{
  assert.match(source,/String\(animal\?\.status \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "ancestor only"/);
  assert.match(source,/\["sold", "deceased", "archived", "ancestor only"\]/);
  assert.match(source,/renderRelationshipComparison\(buckId, doeId, event\.currentTarget\.checked === true\)/);
});
