"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const build=read("herdharbor-build.js"),worker=read("service-worker.js"),ui=read("genetics-v2-phase3-v1.8.2.js"),core=read("genetics-v2-phase3-core-v1.8.2.js");
for(const asset of ["genetics-v2-phase3-core-v1.8.2.js","genetics-v2-phase3-v1.8.2.js","genetics-v2-phase3-v1.8.2.css"]){
  assert.match(build,new RegExp(asset.replace(/[.]/g,"\\.")),`${asset} must load through HerdHarborBuild`);
  assert.match(worker,new RegExp(asset.replace(/[.]/g,"\\.")),`${asset} must be in the PWA shell`);
}
assert.match(build,/genetics-v2-phase2-v1\.8\.2\.js[\s\S]*genetics-v2-phase3-core-v1\.8\.2\.js/,"Phase 3 loads after the Phase 2 breeder planner");
assert.match(worker,/genetics-v2-phase3-1/,"Phase 3 gets a fresh PWA cache identity");
assert.match(ui,/What this litter taught us/);
assert.match(ui,/Record the offspring once/);
assert.match(ui,/Testing remains optional/);
assert.match(ui,/data-hh-bw-manage-litter/);
assert.match(ui,/herdharbor:litter-workspace-changed/);
assert.match(core,/No target offspring is not negative proof/);
assert.match(core,/never marks a rabbit as a non-carrier/);
assert.doesNotMatch(ui,/<form[^>]*hh-gv2p3/i,"Phase 3 must learn from canonical litter entry, not create a second genetics form");
assert.match(build,/version: "1\.8\.1"/,"additive Genetics V2 work must not change the current release identity");
console.log("Genetics V2 Phase 3 integration contract passed");