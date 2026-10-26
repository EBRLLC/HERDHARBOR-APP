"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MessageChannel } = require('node:worker_threads');
const Core = require('../account-boundary-core-v1.8.4.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
function extract(source, start, end) {
  const a=source.indexOf(start), b=source.indexOf(end,a);
  assert.ok(a>=0 && b>a, start);
  return source.slice(a,b);
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
function boundaryHarness() {
  const storage = new Map([['raw', JSON.stringify({ animals:[{id:'rabbit-A',species:'rabbit'},{id:'dog-A',species:'dog'}] })]]);
  const archives=[], effects=[], waiting=[];
  let ownerWrite=true, readThrows=false, badReadback=false;
  const scope={
    session:{user:{id:'A'}}, accountBoundaryFence:Core.createGenerationFence(), accountBoundaryRecoveryInFlight:null,
    window:{HerdHarborAccountBoundaryCore:Core}, localStorage:storage,
    ACTIVE_OWNER_KEY:'owner',LEGACY_ACTIVE_OWNER_KEY:'legacy',UNATTRIBUTED_RECOVERY_USER_ID:'unattributed',
    activeStateRaw:()=>storage.get('raw')||'',
    originalGetItem:function(k){if(readThrows) throw new Error('storage denied');return storage.get(k)||null;},
    originalRemoveItem:function(k){effects.push('remove:'+k);storage.delete(k);},
    safeStorageSet:(k,v)=>{if(k==='owner'&&!ownerWrite)return false;effects.push('set:'+k);if(!badReadback)storage.set(k,v);return true;},
    cacheKey:id=>'cache:'+id,safeParse:s=>{try{return JSON.parse(s);}catch{return null;}},sameState:(a,b)=>a===b,
    showAccountBoundaryRecovery:()=>effects.push('notice'),
    recordRecoverySnapshot:(id,raw)=>new Promise((resolve,reject)=>waiting.push({resolve:ok=>{if(ok)archives.push({id,raw});resolve(ok);},reject})),
    clearActiveUserData:()=>{effects.push('clear');storage.delete('raw');storage.delete('owner');return true;},
    resetAccountBoundaryRuntime:()=>effects.push('reset'),clearAccountSessionMarkers:id=>effects.push('markers:'+id),
    document:{documentElement:{classList:{add:()=>effects.push('lock')}}},
    preserveActiveForUser:async()=>true
  };
  scope.isAccountOperationCurrent=(token)=>scope.accountBoundaryFence.isCurrent(token,scope.session?.user?.id);
  vm.createContext(scope);
  vm.runInContext(extract(read('herdharbor-cloud.js'),'  async function ensureAuthenticatedAccountBoundary(', '  function setSyncState('),scope);
  return {scope,storage,archives,effects,waiting,
    run:()=>scope.ensureAuthenticatedAccountBoundary(scope.session,{allowUnownedQuarantine:true}),
    switchTo:id=>{scope.accountBoundaryFence.invalidate();scope.session={user:{id}};scope.accountBoundaryFence.advance(id);},
    badReadback:()=>{badReadback=true;},failOwner:()=>{ownerWrite=false;},denyStorage:()=>{readThrows=true;}
  };
}
test('S17 A1/A5 stale A quarantine cannot erase B rabbit/dog workspace or owner',async()=>{
  const h=boundaryHarness(), old=h.run();
  h.switchTo('B');const fresh='{"animals":[{"id":"dog-B","species":"dog"}]}';h.storage.set('raw',fresh);h.storage.set('owner','B');
  h.waiting[0].resolve(true);const result=await old;
  assert.equal(result.ok,false);assert.equal(h.storage.get('raw'),fresh);assert.equal(h.storage.get('owner'),'B');
  assert.deepEqual(h.effects,[]);assert.equal(h.archives[0].id,'unattributed');assert.equal(h.storage.has('cache:B'),false);
});
test('S17 A2 same-user dedup is generation-aware after A-B-A',async()=>{
  const h=boundaryHarness(),old=h.run();const duplicate=h.run();assert.equal(h.waiting.length,1);
  h.switchTo('B');h.switchTo('A');const newer=h.run();assert.equal(h.waiting.length,2);
  h.waiting[0].resolve(true);assert.equal((await old).ok,false);assert.equal((await duplicate).ok,false);
  assert.ok(h.scope.accountBoundaryRecoveryInFlight,'old completion must not clear the new promise');
  h.waiting[1].resolve(true);assert.equal((await newer).ok,true);assert.equal(h.storage.get('owner'),'A');
});
test('S17 A3 same-session workspace replacement invalidates an archived copy',async()=>{
  const h=boundaryHarness(),old=h.run();h.storage.set('raw','{"animals":[{"id":"new-draft"}]}');h.waiting[0].resolve(true);
  assert.equal((await old).ok,false);assert.ok(h.storage.get('raw').includes('new-draft'));assert.equal(h.effects.includes('clear'),false);
});
test('S17 A3 failed commit, abort, low quota, readback and malformed data fail closed',async()=>{
  for(const failure of ['commit','abort','quota','marker','readback','malformed','storage']){
    const h=boundaryHarness();if(failure==='marker')h.failOwner();if(failure==='readback')h.badReadback();if(failure==='malformed')h.storage.set('raw','{bad');if(failure==='storage')h.denyStorage();
    const pending=h.run();
    if(h.waiting.length){if(failure==='abort'||failure==='quota')h.waiting[0].reject(new Error(failure));else h.waiting[0].resolve(['marker','readback'].includes(failure));}
    const result=await pending;assert.equal(result.ok,false,failure);assert.equal(h.storage.has('owner'),false,failure);assert.equal(h.effects.includes('reset'),false,failure);
    if(!['marker','readback'].includes(failure))assert.ok(h.storage.has('raw'),failure);else assert.equal(h.archives.length,1);
  }
});
test('S17 A4 legitimate quarantine archives mixed animals before clearing and verifies owner',async()=>{
  const h=boundaryHarness(),pending=h.run();assert.equal(h.effects.includes('clear'),false);h.waiting[0].resolve(true);
  const result=await pending;assert.equal(result.ok,true);assert.equal(result.userId,'A');assert.equal(h.storage.get('owner'),'A');
  assert.equal(h.storage.has('raw'),false);assert.equal(JSON.parse(h.archives[0].raw).animals.length,2);assert.equal(h.archives[0].id,'unattributed');
});
function client(id,url,ready){return {id,url,type:'window',frameType:'top-level',postMessage(message,ports){if(ready!==undefined)ports[0].postMessage({type:'HH_UPDATE_READINESS_RESPONSE',requestId:message.requestId,ready});}};}
function workerHarness(initial,{rescan}={}){
  const listeners={},messages=[],deleted=[];let skips=0,scans=0;
  const scope={self:{location:{href:'https://app.herdharbor.com/service-worker.js',origin:'https://app.herdharbor.com'},registration:{scope:'https://app.herdharbor.com/'},
    clients:{matchAll:async()=>++scans>1&&rescan?rescan():initial,claim:async()=>{}},skipWaiting:()=>skips++,addEventListener:(name,handler)=>listeners[name]=handler},
    caches:{keys:async()=>[],delete:async key=>deleted.push(key)},URL,MessageChannel,// Use a realistic reply window: a 15 ms test-only timeout races a
    // genuine MessageChannel reply on loaded CI runners, producing false skips.
    Promise,console,setTimeout:fn=>setTimeout(fn,500),clearTimeout};
  vm.runInNewContext(read('service-worker.js'),scope);
  return {listeners,messages,deleted,skips:()=>skips,async request(type='HH_CHECK_UPDATE_READINESS',id='app'){
    let pending;listeners.message({data:{type},source:{id,postMessage:m=>messages.push(m)},waitUntil:p=>pending=p});await pending;
  }};
}
test('S17 B1-B4 clean clients activate; dirty, silent and legacy click clients block',async()=>{
  for(const [clients,type,expected] of [
    [[client('app','https://app.herdharbor.com/',true)],'HH_CHECK_UPDATE_READINESS',1],
    [[client('app','https://app.herdharbor.com/',false)],'HH_CHECK_UPDATE_READINESS',0],
    [[client('app','https://app.herdharbor.com/',true),client('other','https://app.herdharbor.com/',false)],'HH_CHECK_UPDATE_READINESS',0],
    [[client('app','https://app.herdharbor.com/',undefined)],'SKIP_WAITING',0]
  ]){const h=workerHarness(clients);await h.request(type);assert.equal(h.skips(),expected);assert.equal(h.deleted.length,0);if(!expected)assert.equal(h.messages[0].type,'HH_UPDATE_DEFERRED');}
});
test('S17 B5 actual 2.0.0 timeout forces navigation despite worker refusal: release blocker',async()=>{
  const old=read('tests/fixtures/pwa-main-72e6ea7.txt');
  const h=workerHarness([client('app','https://app.herdharbor.com/',undefined),client('dirty','https://app.herdharbor.com/',false)]),navigations=[],timers=[];let activation;
  const scope={registration:{waiting:{state:'installed',postMessage:m=>{activation=h.request(m.type);}},update:async()=>{}},pendingUpdateWorker:null,
    updateActivationInFlight:false,updateActivationTimer:null,updateToast:null,reloading:false,UPDATE_ACTIVATION_TIMEOUT_MS:8000,
    window:{setTimeout:fn=>{timers.push(fn);return 1;},location:{href:'https://app.herdharbor.com/',replace:url=>navigations.push(url),reload:()=>navigations.push('reload')}},
    clearUpdateActivationTimer:()=>{},monitorFailure:()=>{},URL,Date};
  vm.createContext(scope);vm.runInContext(extract(old,'  function reloadAfterUpdate(', '  function showUpdateReady('),scope);
  await scope.activatePendingUpdate({});await activation;assert.equal(h.skips(),0);
  await timers[0]();assert.equal(navigations.length,1);assert.match(navigations[0],/hh_update=/);
});
test('S17 C1/C3 exact read-only docs permit activation; unknown paths and origins do not',async()=>{
  for(const [url,expected] of [
    ['https://app.herdharbor.com/how-to/',1],['https://app.herdharbor.com/how-to/index.html?q=pedigree#sync',1],
    ['https://app.herdharbor.com/how-to/editor',0],['https://app.herdharbor.com/account/',0],['https://evil.example/how-to/',0],['https://app.herdharbor.com/',0]
  ]){const h=workerHarness([client('app','https://app.herdharbor.com/',true),client('docs',url)]);await h.request();assert.equal(h.skips(),expected,url);}
});
test('S17 C4 docs navigation or a newly opened editor during query forces deferral',async()=>{
  const original=[client('app','https://app.herdharbor.com/',true),client('docs','https://app.herdharbor.com/how-to/')];
  for(const next of [[original[0],client('docs','https://app.herdharbor.com/#animals',false)],[...original,client('new','https://app.herdharbor.com/',false)]]){
    const h=workerHarness(original,{rescan:()=>next});await h.request();assert.equal(h.skips(),0);assert.equal(h.deleted.length,0);
  }
});

test('S17 A3 duplicate callers share a failed archival result, not an unhandled rejection',async()=>{
  const h=boundaryHarness(),one=h.run(),two=h.run();assert.equal(h.waiting.length,1);h.waiting[0].reject(new Error('IndexedDB abort'));
  for(const result of await Promise.all([one,two]))assert.equal(result.ok,false);
  assert.equal(h.effects.includes('clear'),false);assert.equal(h.scope.accountBoundaryRecoveryInFlight,null);
});
test('S17 B2 actual PWA guard recognizes every unsaved editor/review signal',()=>{
  const source=extract(read('pwa.js'),'  function hasUnfinishedLocalWork()', '  function showDeferredReloadNotice()');
  for(const marker of ['#hh-paper-pedigree-dialog[open]','#photo-entry-review input','dialog[open] input','#modal-backdrop:not(.hidden) #modal-content input']){
    const document={documentElement:{dataset:{}},querySelector:selector=>selector.includes(marker)?{}:null};
    const guard=new Function('document',source+'\nreturn hasUnfinishedLocalWork;')(document);
    assert.equal(guard(),true,marker);
  }
});
test('S17 C documentation exception stays tied to a state-free document',()=>{
  const docs=read('how-to/index.html');
  const scripts=[...docs.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
  assert.doesNotMatch(docs,/<script\b[^>]*\bsrc\s*=|<form\b|<textarea\b|contenteditable\s*=/i);
  assert.doesNotMatch(scripts,/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|HerdHarborStateStore|HerdHarborCloud|location\.(?:search|hash)|URLSearchParams/);
});

test('S17 A3 concurrent archives settle out of order without stale cleanup',async()=>{
  const h=boundaryHarness(),a=h.run();h.switchTo('B');const b=h.run();
  h.storage.set('raw','{"animals":[{"id":"new-B"}]}');h.storage.set('owner','B');
  h.waiting[1].resolve(true);assert.equal((await b).ok,false);
  h.waiting[0].reject(new Error('late abort'));assert.equal((await a).ok,false);
  assert.equal(h.storage.get('owner'),'B');assert.ok(h.storage.get('raw').includes('new-B'));assert.equal(h.effects.includes('clear'),false);assert.equal(h.effects.includes('reset'),false);
});
test('S17 C5 online/offline documentation URLs never overwrite cached app home',async()=>{
  const handlers={},cache=new Map([['./index.html',new Response('APP')]]);let online=true;
  const self={location:{href:'https://app.herdharbor.com/service-worker.js',origin:'https://app.herdharbor.com'},addEventListener:(n,f)=>handlers[n]=f};
  const key=x=>typeof x==='string'?x:x.url;
  vm.runInNewContext(read('service-worker.js'),{self,URL,Response,Promise,console,caches:{open:async()=>({put:async(k,v)=>cache.set(key(k),v),match:async k=>cache.get(key(k))})},fetch:async request=>{
    if(!online)throw new Error('offline');return {ok:true,type:'basic',clone:()=>new Response('DOC '+request.url)};
  }});
  for(const suffix of ['how-to/','how-to/index.html?q=health']){
    const request={method:'GET',mode:'navigate',url:'https://app.herdharbor.com/'+suffix};let response;const writes=[];
    handlers.fetch({request,respondWith:p=>response=p,waitUntil:p=>writes.push(p)});await response;await Promise.all(writes);
    online=false;handlers.fetch({request,respondWith:p=>response=p,waitUntil:()=>{}});
    assert.equal(await (await response).text(),'DOC '+request.url);assert.equal(await cache.get('./index.html').clone().text(),'APP');online=true;
  }
});
