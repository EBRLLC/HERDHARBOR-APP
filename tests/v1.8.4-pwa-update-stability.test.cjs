"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pwa=read("pwa.js");
const sw=read("service-worker.js");

test("PWA update remains explicit and waits for the current client",()=>{
  const install=sw.match(/self\.addEventListener\("install",[\s\S]*?\n\}\);/);
  assert.ok(install);
  assert.doesNotMatch(install[0],/skipWaiting/);
  assert.match(sw,/event\.data\?\.type === "SKIP_WAITING"/);
  assert.match(pwa,/postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(pwa,/controllerchange/);
  assert.match(pwa,/Update Now/);
});

test("service worker rotates only HerdHarbor shell caches and preserves offline shell fallback",()=>{
  assert.match(sw,/CACHE_PREFIX = "herdharbor-shell-"/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
  assert.match(sw,/caches\.delete\(key\)/);
  assert.match(sw,/cache\.match\("\.\/index\.html"\)/);
  assert.match(sw,/cache\.match\("\.\/"\)/);
});

test("release-critical assets are network-first without broad destructive cache busting",()=>{
  assert.match(sw,/NETWORK_FIRST_PATHS/);
  for(const token of ["/manifest.json","/pwa.js","/herdharbor-build.js","/herdharbor-cloud.js"]) assert.ok(sw.includes(token),token);
  assert.match(sw,/fetch\(request, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(sw,/caches\.keys\(\)[\s\S]*caches\.delete\(key\)[\s\S]*filter\(Boolean\)/);
});

test("protected cross-origin auth and API traffic is not served from the static shell cache",()=>{
  assert.match(sw,/if \(url\.origin !== self\.location\.origin\) return;/);
  assert.match(sw,/if \(request\.method !== "GET"\) return;/);
});

test("installed/version display and update checks remain release-aware",()=>{
  assert.match(pwa,/Version \$\{APP_VERSION\} · Build \$\{BUILD_ID\}/);
  assert.match(pwa,/registration\.update\(\)/);
  assert.match(pwa,/visibilitychange/);
  assert.match(pwa,/pageshow/);
  assert.match(pwa,/online/);
});
