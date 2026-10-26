"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const index=read("index.html");
const sw=read("service-worker.js");
const build=read("herdharbor-build.js");
const pkg=JSON.parse(read("package.json"));
const manifest=JSON.parse(read("manifest.json"));
const twa=JSON.parse(read("twa-manifest.json"));
const getCanineAssets=()=>[...index.matchAll(/(?:src|href)="(canine-[^"]+)"/g)].map(match=>match[1]);
function installHarness(failAsset=""){
  const handlers={},added=[],opened=[];
  const self={
    location:{href:"https://app.herdharbor.com/service-worker.js",origin:"https://app.herdharbor.com"},
    addEventListener:(type,callback)=>{handlers[type]=callback},
    skipWaiting(){throw new Error("Install must not forcibly activate an update");}
  };
  const caches={async open(name){
    opened.push(name);
    return{async add(request){
      const key=new URL(request.url).pathname;
      added.push(request.url);
      if(failAsset&&key.endsWith(failAsset))throw new Error("Simulated offline-critical asset failure");
    }};
  }};
  class RequestStub{constructor(url){this.url=String(url);}}
  vm.runInNewContext(sw,{self,caches,URL,Request:RequestStub,Promise,console},{filename:"service-worker.js"});
  let pending;
  handlers.install({waitUntil(promise){pending=promise}});
  return{pending,added,opened};
}
test("release identities agree across app, PWA, manifest and Android package",()=>{
  assert.equal(pkg.version,"2.0.1");
  assert.equal(manifest.version,"2.0.1");
  assert.equal(twa.appVersion,"2.0.1");
  assert.equal(twa.appVersionCode,20);
  assert.match(build,/version:\s*"2\.0\.1"/);
  assert.match(build,/buildId:\s*"v2\.0\.1-release-1"/);
  assert.match(read("pwa.js"),/const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "2\.0\.1"/);
  assert.match(index,/manifest\.json\?v=2\.0\.1/);
  assert.match(index,/herdharbor-build\.js\?v=2\.0\.1/);
  assert.match(sw,/const CACHE_NAME = "herdharbor-shell-v2\.0\.1-v2\.0\.1-release-1-s15-1"/);
});
test("cold PWA install preloads every versioned canine script and style",async()=>{
  const canine=getCanineAssets();
  assert.equal(canine.length,5);
  const h=installHarness();await h.pending;
  for(const asset of canine){
    const expected="https://app.herdharbor.com/"+asset;
    assert.ok(h.added.includes(expected),asset);
  }
  assert.deepEqual(h.opened,["herdharbor-shell-v2.0.1-v2.0.1-release-1-dog-breeds-1"]);
});
test("incomplete canine asset download rejects PWA shell installation",async()=>{
  const h=installHarness("canine-pedigree-print-v2.0.1.js");
  await assert.rejects(h.pending,/canine-pedigree-print-v2\.0\.1\.js/);
});
test("release cutover does not clear member data or force service worker takeover",()=>{
  assert.doesNotMatch(read("pwa.js"),/localStorage\.(?:clear|removeItem)\(/);
  const install=sw.slice(sw.indexOf('self.addEventListener("install"'),sw.indexOf('self.addEventListener("activate"'));
  assert.doesNotMatch(install,/skipWaiting/);
  assert.match(sw,/HH_CHECK_UPDATE_READINESS/);
  assert.match(sw,/allOpenClientsReadyForUpdate/);
});
