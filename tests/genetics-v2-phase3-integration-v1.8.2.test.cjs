"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const build=read("herdharbor-build.js"),worker=read("service-worker.js");
for(const asset of ["genetics-v2-phase3-core-v1.8.2.js","genetics-v2-phase3-v1.8.2.js","genetics-v2-phase3-v1.8.2.css"]){
  assert.match(build,new RegExp(asset.replace(/[.]/g,"\\.")),`${asset} must load through HerdHarborBuild`);
  assert.match(worker,new RegExp(asset.replace(/[.]/g,"\\.")),`${asset} must be in the PWA shell`);
}
console.log("Phase 3 asset contract passed");
