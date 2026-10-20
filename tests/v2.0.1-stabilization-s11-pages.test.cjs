"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const workflow=fs.readFileSync(path.join(__dirname,"../.github/workflows/v2.0.0-production-pages.yml"),"utf8");
test("main-branch Pages verification accepts 2.0.1 without bypassing inherited 2.0.0 regression",()=>{
 assert.match(workflow,/name: HerdHarbor 2\.0\.1 production Pages verification/);
 assert.match(workflow,/npm run test:v2\.0\.0-final/);
 assert.match(workflow,/npm run test:v2\.0\.1-review/);
 assert.match(workflow,/Verify reviewed PR provenance/);
 assert.match(workflow,/Require production Sentry DSN/);
 assert.match(workflow,/Require GitHub Actions Pages source before publishing/);
 assert.doesNotMatch(workflow,/grep -q 'version: "2\.0\.0"'/);
 assert.match(workflow,/grep -q 'version: "2\.0\.1"'/);
 assert.match(workflow,/grep -q '"release": "HerdHarbor@2\.0\.1"'/);
});
test("Pages static artifact requires complete new canine offline assets",()=>{
 for(const name of [
   "canine-breeds-v2.0.1.js",
   "canine-identity-v2.0.1.css",
   "canine-identity-v2.0.1.js",
   "canine-lineage-v2.0.1.js",
   "canine-pedigree-print-v2.0.1.js"
 ])assert.ok(workflow.includes("test -s _site/"+name),name);
});
