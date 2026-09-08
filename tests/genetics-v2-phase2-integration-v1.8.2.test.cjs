"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const build=read("herdharbor-build.js");
const worker=read("service-worker.js");
const ui=read("genetics-v2-phase2-v1.8.2.js");
const core=read("genetics-v2-phase2-core-v1.8.2.js");

for(const asset of ["genetics-v2-phase2-core-v1.8.2.js","genetics-v2-phase2-v1.8.2.js","genetics-v2-phase2-v1.8.2.css"]){
  assert.match(build,new RegExp(asset.replace(/[.]/g,"\\.")),`${asset} must load through HerdHarborBuild`);
  assert.match(worker,new RegExp(asset.replace(/[.]/g,"\\.")),`${asset} must be in the PWA shell`);
}
assert.match(build,/genetics-v2-phase1-core-v1\.8\.2\.js[\s\S]*genetics-v2-phase2-core-v1\.8\.2\.js/,"Phase 2 loads after the Phase 1 evidence core");
assert.match(worker,/genetics-v2-phase2-1/,"Phase 2 gets a fresh PWA cache identity");
assert.match(core,/Proof breeding can answer this/);
assert.match(core,/No test needed/);
assert.match(core,/optional shortcut/i);
assert.match(ui,/What are you trying to produce/);
assert.match(ui,/Best breeding paths in your herd/);
assert.match(ui,/Target probability and evidence confidence are shown separately/);
assert.match(ui,/data-hh-p2-action=\\?"breeding\\?"/);
console.log("Genetics V2 Phase 2 integration contract passed");