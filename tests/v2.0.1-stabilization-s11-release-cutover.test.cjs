"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pkg=JSON.parse(read("package.json"));
const lock=JSON.parse(read("package-lock.json"));
const manifest=JSON.parse(read("manifest.json"));
const twa=JSON.parse(read("twa-manifest.json"));
const embedded=JSON.parse(read("android/app/src/main/res/raw/web_app_manifest.json"));
const build=read("herdharbor-build.js");
const worker=read("service-worker.js");
const index=read("index.html");
const pwa=read("pwa.js");
const gradle=read("android/app/build.gradle");
const optional=read("herdharbor-optional-tools.js");

test("staged candidate release versions are 2.0.1 with a new native code",()=>{
 assert.equal(pkg.version,"2.0.1");
 assert.equal(lock.version,"2.0.1");
 assert.equal(lock.packages[""].version,"2.0.1");
 assert.equal(manifest.version,"2.0.1");
 assert.equal(embedded.version,"2.0.1");
 assert.equal(twa.appVersion,"2.0.1");
 assert.equal(twa.appVersionCode,20);
 assert.match(gradle,/versionName "2\.0\.1"/);
 assert.match(gradle,/versionCode 20/);
 assert.match(build,/version: "2\.0\.1"/);
 assert.match(build,/buildId: "v2\.0\.1-release-1"/);
 assert.match(pwa,/HerdHarborBuild\?\.version \|\| "2\.0\.1"/);
 assert.match(worker,/const CACHE_NAME = "herdharbor-shell-v2\.0\.1-v2\.0\.1-release-1-s15-1"/);
});
test("2.0.1 HTML queries match the service-worker preload identities",()=>{
 const shell=worker.slice(worker.indexOf("const REQUIRED_SHELL"),worker.indexOf("const RUNTIME_CACHE_PATHS"));
 const important=[
  "manifest.json?v=2.0.1",
  "herdharbor-build.js?v=2.0.1",
  "herdharbor-optional-tools.js?v=4",
  "herdharbor-cloud.js?v=39",
  "pwa.js?v=36",
  "animal-profile-runtime-v1.8.3.js?v=3",
  "canine-identity-v2.0.1.css?v=1",
  "canine-breeds-v2.0.1.js?v=2",
  "canine-identity-v2.0.1.js?v=1",
  "canine-lineage-v2.0.1.js?v=1",
  "canine-pedigree-print-v2.0.1.js?v=1"
 ];
 for(const asset of important){
  assert.ok(shell.includes("./"+asset),asset+" missing in precache");
  assert.ok(index.includes(asset),asset+" missing in HTML");
  assert.ok(fs.existsSync(path.join(root,asset.split("?")[0])),"missing file "+asset);
 }
 const runtime=worker.slice(worker.indexOf("const RUNTIME_CACHE_PATHS"),worker.indexOf("const NETWORK_FIRST_PATHS"));
 for(const asset of ["photo-assisted-entry-v1.8.3.js?v=3","paper-pedigree-import-v1.8.2.js?v=3"])
  assert.ok(runtime.includes("./"+asset),asset+" absent from optional cache");
 assert.ok(optional.includes("photo-assisted-entry-v1.8.3.js?v=3"));
 assert.ok(build.includes("paper-pedigree-import-v1.8.2.js?v=3"));
});
test("missing essential canine preload aborts SW install instead of creating partial offline shell",async()=>{
 const listeners={},attempted=[];
 const self={
  location:{href:"https://app.herdharbor.com/service-worker.js",origin:"https://app.herdharbor.com"},
  addEventListener:(name,fn)=>{listeners[name]=fn;}
 };
 const cache={async add(request){
  attempted.push(request.url);
  if(request.url.includes("canine-lineage-v2.0.1.js"))
   throw new Error("simulated offline install miss");
 }};
 const caches={async open(){return cache;}};
 const Request=class{constructor(url){this.url=String(url);}};
 vm.runInNewContext(worker,{self,caches,URL,Request,Promise,console},{filename:"service-worker.js"});
 let pending;
 listeners.install({waitUntil(p){pending=p;}});
 await assert.rejects(pending,/canine-lineage-v2\.0\.1\.js/);
 assert.ok(attempted.some(url=>url.includes("canine-pedigree-print-v2.0.1.js")));
});
test("release builder fingerprints assets and assembled shell cache",()=>{
 const script=read("scripts/generate-release-assets.mjs");
 assert.match(script,/sha256/);
 assert.match(script,/cacheName:.*herdharbor-shell-.+generation/);
 assert.match(script,/worker\.replace\(cachePattern/);
 assert.match(script,/params\.set\("rev", digest\)/);
});
