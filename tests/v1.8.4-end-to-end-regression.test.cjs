"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pkg=JSON.parse(read("package.json"));

test("v1.8.4 release regression gate includes each stability phase owner",()=>{
  const required=[
    "test:v1.8.4-baseline",
    "test:v1.8.4-sync-readiness",
    "test:v1.8.4-cloud-telemetry",
    "test:v1.8.4-state-integrity",
    "test:v1.8.4-pwa",
    "test:v1.8.4-auth",
    "test:v1.8.4-subscription"
  ];
  for(const name of required) assert.equal(typeof pkg.scripts[name],"string",name);
});

test("critical user journeys remain represented by executable regressions",()=>{
  const files=[
    "tests/state-integrity-e2e-v1.8.2.test.cjs",
    "tests/litter-sale-transfer-v1.8.2.test.cjs",
    "tests/auth-freeze-resilience-v1.8.2.test.cjs",
    "tests/pwa-update-regression-v1.5.0.test.cjs",
    "tests/subscription-production-completion-v1.8.3.test.cjs",
    "tests/cloud-sync-observability-retry-v1.8.2.test.cjs"
  ];
  for(const file of files) assert.equal(fs.existsSync(path.join(root,file)),true,file);
});

test("end-to-end state suite covers breeding, litter, sale, transfer and cross-device continuity",()=>{
  const e2e=read("tests/state-integrity-e2e-v1.8.2.test.cjs");
  for(const phrase of [
    "breeding -> pregnancy -> birth -> offspring -> weights -> weaning -> retained",
    "completed sale -> direct member transfer",
    "phone create -> PC update -> phone edit again",
    "same-field phone/PC edits stop as a conflict"
  ]) assert.ok(e2e.toLowerCase().includes(phrase.toLowerCase()),phrase);
});

test("release candidate aggregate script does not invoke production mutation or deployment",()=>{
  const cmd=pkg.scripts["test:v1.8.4-regression"];
  assert.equal(typeof cmd,"string");
  assert.doesNotMatch(cmd,/deploy|workflow_dispatch|supabase db push|migration up|stripe/i);
});
