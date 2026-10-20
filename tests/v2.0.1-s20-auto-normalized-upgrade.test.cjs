"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const normalize = require("../cloud-state-normalizer-v1.8.3.js");
const s20 = require("../cloud-normalized-upgrade-v2.0.1.js");

function mock(options = {}) {
  let userId = "account-a", stage = options.stage || "dual_write";
  let dirty = options.dirty === true, revision = 7, cutovers = 0, validations = 0;
  let writes = 0, backups = 0, offers = 0, promotions = 0;
  const store = new Map();
  const sessionStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  let offer;
  const coordinator = s20.create({
    getUserId: () => userId,
    getStatus: async () => ({ stage, eligible: options.eligible !== false, schemaVerified: true }),
    isClean: id => id === userId && !dirty,
    getRevision: () => revision,
    sync: async () => { writes += 1; return options.syncSuccess !== false; },
    prepare: async () => {
      if (options.bootstrapFailure) return { ok:false, stage, reason:"bootstrap-blocked" };
      stage = "dual_write";
      return { ok:true, stage };
    },
    validate: async () => {
      validations += 1;
      return { ok: options.validateSuccess !== false, stage, reason:"reconciliation-failed" };
    },
    readLegacy: async () => ({ snapshot:{ animals:[{id:"rabbit-1"}] }, updatedAt:"2026-10-20T00:00:00Z" }),
    saveRecovery: async () => { backups += 1; return options.backupSuccess !== false; },
    cutover: async (approvals) => {
      cutovers += 1;
      assert.deepEqual(approvals,{ ownerApproved:true, legacyClientsClosed:true, backupVerified:true });
      if (options.cutoverFailure) return {ok:false,reason:"verification-failed",stage};
      stage = "normalized";
      return {ok:true,stage};
    },
    offer: next => { offers += 1; offer = next; },
    updateAvailable: async () => {
      if (options.updateError) throw new Error("service worker update state unavailable");
      if (options.updateUnknown) return undefined;
      return options.updateWaiting === true;
    },
    afterPromotion: async () => { promotions += 1; },
    sessionStorage
  });
  return {
    coordinator,
    get offer() {return offer;},
    get calls() {return {cutovers,validations,writes,backups,offers,promotions};},
    setUser: value => {userId = value;},
    setDirty: value => {dirty = value;},
    setStage: value => {stage = value;},
    setRevision: value => {revision = value;},
    store
  };
}
test("S20 offers only after clean, verified cloud reconciliation",async()=>{
  const m = mock();
  const ready = await m.coordinator.afterLogin();
  assert.equal(ready.offered,true);
  assert.equal(m.calls.validations,1);
  assert.equal(m.calls.offers,1);
  assert.equal(m.calls.cutovers,0);
  await m.coordinator.afterLogin();
  assert.equal(m.calls.offers,1);
});
test("S20 never migrates without explicit closed-client confirmation",async()=>{
  const m=mock();
  await m.coordinator.afterLogin();
  const result=await m.offer.accept({legacyClientsClosed:false});
  assert.equal(result.ok,false);
  assert.equal(m.calls.cutovers,0);
  assert.equal(m.calls.backups,0);
});
test("S20 upgrades only after backup, cloud save and guarded server verification",async()=>{
  const m=mock();
  await m.coordinator.afterLogin();
  const result=await m.offer.accept({legacyClientsClosed:true});
  assert.equal(result.stage,"normalized");
  assert.equal(m.calls.cutovers,1);
  assert.equal(m.calls.backups,1);
  assert.equal(m.calls.writes,1);
  assert.equal(m.calls.promotions,1);
  assert.equal(m.store.size,0);
});
test("S20 PWA update handoff retains intent but never silently activates worker",async()=>{
  const m=mock({updateWaiting:true});
  await m.coordinator.afterLogin();
  const pending=await m.offer.accept({legacyClientsClosed:true});
  assert.equal(pending.stage,"update-offered");
  assert.equal(m.calls.cutovers,0);
  assert.equal(m.store.size,1);
  const premature=await m.coordinator.afterLogin();
  assert.equal(premature.reason,"waiting-for-pwa-activation");
  assert.equal(m.calls.cutovers,0,"focus or login must not promote before update activation");
  m.store.set("hh_s20_update_activated_at",String(Date.now()));
  const ready=await m.coordinator.afterLogin();
  assert.equal(ready.stage,"normalized");
  assert.equal(m.calls.cutovers,1);
  assert.equal(m.store.size,0);
});
test("S20 never resumes promotion after failed or uncertain PWA state lookup",async()=>{
  for (const option of [{updateError:true}, {updateUnknown:true}]) {
    const m=mock(option);
    await m.coordinator.afterLogin();
    const result=await m.offer.accept({legacyClientsClosed:true});
    assert.equal(result.ok,false);
    assert.equal(m.store.size,0,"no resumable migration consent may survive an unverified update");
    assert.equal(m.calls.cutovers,0);
    await m.coordinator.afterLogin();
    assert.equal(m.calls.cutovers,0,"later login must not silently resume failed acceptance");
  }
});
test("S20 stale upgrade dialogs cannot accept or dismiss consent for another identity epoch",async()=>{
  const m=mock();
  await m.coordinator.afterLogin();
  const staleOffer=m.offer;
  m.setUser("account-b");
  m.coordinator.fenceAccountBoundary();
  assert.deepEqual(await staleOffer.accept({legacyClientsClosed:true}),{ok:false,reason:"account-changed"});
  staleOffer.dismiss();
  assert.equal(m.calls.cutovers,0);
  assert.equal(m.calls.backups,0);
  m.setUser("account-a");
  m.coordinator.fenceAccountBoundary();
  assert.deepEqual(await staleOffer.accept({legacyClientsClosed:true}),{ok:false,reason:"account-changed"});
  assert.equal((await m.coordinator.afterLogin()).offered,true,"stale dismissal cannot suppress a fresh legitimate offer");
  assert.equal(m.calls.cutovers,0);
});
test("S21 account switch revokes pending upgrade authorization instead of resuming on return",async()=>{
  const m=mock({updateWaiting:true});
  await m.coordinator.afterLogin();
  const offered=await m.offer.accept({legacyClientsClosed:true});
  assert.equal(offered.stage,"update-offered");
  assert.equal(m.store.size,1);
  m.coordinator.fenceAccountBoundary({
    event:"SIGNED_IN",previousUserId:"account-a",nextUserId:"account-b"
  });
  assert.equal(m.store.size,0,"A's approval must not survive a real account switch");
  m.setUser("account-b");
  m.coordinator.fenceAccountBoundary({
    event:"SIGNED_IN",previousUserId:"account-b",nextUserId:"account-a"
  });
  m.setUser("account-a");
  m.store.set("hh_s20_update_activated_at",String(Date.now()));
  const result=await m.coordinator.afterLogin();
  assert.equal(result.offered,true,"A must obtain fresh consent after the account switch");
  assert.equal(m.calls.cutovers,0);
});
test("S21 intentional PWA reload preserves only the original account's pending consent",async()=>{
  const m=mock({updateWaiting:true});
  await m.coordinator.afterLogin();
  assert.equal((await m.offer.accept({legacyClientsClosed:true})).stage,"update-offered");
  m.coordinator.fenceAccountBoundary({
    event:"SIGNED_IN",previousUserId:"",nextUserId:"account-a"
  });
  assert.equal(m.store.size,1,"fresh page load is not an account switch");
  m.store.set("hh_s20_update_activated_at",String(Date.now()));
  assert.equal((await m.coordinator.afterLogin()).stage,"normalized");
  assert.equal(m.calls.cutovers,1);
});
test("S21 missing PWA update listener cannot silently approve cutover",()=>{
  const cloud=fs.readFileSync(path.join(__dirname,"..","herdharbor-cloud.js"),"utf8");
  assert.match(cloud,/return detail\.promise \|\| Promise\.resolve\(null\)/);
  assert.match(cloud,/fenceAccountBoundary\?\.\(event\.detail \|\| \{\}\)/);
});
test("S20 fails closed on dirty workspace, failed reconciliation and missing backup",async()=>{
  const dirty=mock({dirty:true});
  assert.equal((await dirty.coordinator.afterLogin()).reason,"local-work-pending");
  assert.equal(dirty.calls.offers,0);
  const invalid=mock({validateSuccess:false});
  assert.equal((await invalid.coordinator.afterLogin()).reason,"reconciliation-failed");
  assert.equal(invalid.calls.offers,0);
  const bad=mock({backupSuccess:false});
  await bad.coordinator.afterLogin();
  const result=await bad.offer.accept({legacyClientsClosed:true});
  assert.equal(result.reason,"verified-recovery-backup-required");
  assert.equal(bad.calls.cutovers,0);
});
test("S20 blocks promotion when legacy cloud save is not confirmed",async()=>{
  const m=mock({syncSuccess:false});
  await m.coordinator.afterLogin();
  const result=await m.offer.accept({legacyClientsClosed:true});
  assert.equal(result.reason,"legacy-save-unconfirmed");
  assert.equal(m.calls.cutovers,0);
});
test("S20 remains normalized without attempting a legacy transition for new signups",async()=>{
  const m=mock({stage:"normalized",eligible:false});
  const result=await m.coordinator.afterLogin();
  assert.equal(result.stage,"normalized");
  assert.equal(m.calls.cutovers,0);
  assert.equal(m.calls.offers,0);
  assert.equal(m.calls.backups,0);
});
test("S20 retries legacy/shadow bootstrap only for eligible clean accounts",async()=>{
  const m=mock({stage:"legacy"});
  const result=await m.coordinator.afterLogin();
  assert.equal(result.stage,"dual_write");
  assert.equal(m.calls.offers,1);
  const rejected=mock({stage:"legacy",eligible:false});
  assert.equal((await rejected.coordinator.afterLogin()).reason,"not-eligible");
  assert.equal(rejected.calls.offers,0);
});
test("S20 fences A to B to A races during asynchronous verification",async()=>{
  let finishValidation;
  let current="account-a", offered=0, migrated=0;
  const c=s20.create({
    getUserId:()=>current,
    getStatus:async()=>({stage:"dual_write",eligible:true,schemaVerified:true}),
    isClean:()=>true,
    getRevision:()=>0,
    sync:async()=>true,
    prepare:async()=>({ok:true}),
    validate:()=>new Promise(resolve=>{finishValidation=resolve;}),
    readLegacy:async()=>({snapshot:{},updatedAt:"2026-10-20T00:00:00Z"}),
    saveRecovery:async()=>true,
    cutover:async()=>{migrated++;return {ok:true,stage:"normalized"};},
    offer:()=>{offered++;},
    updateAvailable:async()=>false,
    afterPromotion:async()=>{},
    sessionStorage:new Map()
  });
  const pending=c.afterLogin();
  await new Promise(resolve=>setImmediate(resolve));
  current="account-b";c.fenceAccountBoundary();
  current="account-a";c.fenceAccountBoundary();
  finishValidation({ok:true,stage:"dual_write"});
  assert.equal((await pending).ok,false);
  assert.equal(offered,0);
  assert.equal(migrated,0);
});
test("S20 SQL installs normalized-only signup and canonical checkpoint without legacy writes",()=>{
  const root=path.join(__dirname,"..");
  const sql=fs.readFileSync(path.join(root,"supabase/v2.0.1-s20-normalized-only-signup.sql"),"utf8");
  const expected=normalize.mapLegacySnapshot({});
  const checkpoint=expected.records.find(r=>r.record_id==="snapshot-manifest");
  assert.ok(checkpoint);
  assert.ok(sql.includes(expected.checksum));
  assert.ok(sql.includes(checkpoint.payload_checksum));
  assert.match(sql,/after insert on auth\.users/i);
  assert.match(sql,/s20_signup_normalized_only/i);
  assert.match(sql,/cutover_stage='normalized'/);
  assert.match(sql,/delete from public\.herdharbor_sync_cohort/i);
  assert.doesNotMatch(sql,/insert into public\.herdharbor_user_data/i);
  assert.match(sql,/create or replace function public\.herdharbor_normalized_signup_ready\(\)/i);
  assert.match(sql,/grant execute on function public\.herdharbor_normalized_signup_ready\(\)\s+to anon, authenticated/i);
});
test("S20 release assets wire the coordinator before cloud bridge and keep its PWA cache current",()=>{
  const root=path.join(__dirname,"..");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const sw=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
  const cloud=fs.readFileSync(path.join(root,"herdharbor-cloud.js"),"utf8");
  const pwa=fs.readFileSync(path.join(root,"pwa.js"),"utf8");
  assert.ok(html.indexOf("cloud-normalized-upgrade-v2.0.1.js?v=1") < html.indexOf("herdharbor-cloud.js?v=42"));
  assert.match(sw,/herdharbor-shell-v2\.0\.1-v2\.0\.1-release-1-s20-2/);
  assert.match(sw,/cloud-normalized-upgrade-v2\.0\.1\.js\?v=1/);
  assert.match(cloud,/normalizedUpgradeS20 = window\.HerdHarborNormalizedUpgradeS20\.create/);
  assert.match(cloud,/rolloutHydrationPromise\.then\(\(decision\) => \{/);
  assert.match(pwa,/hasUnfinishedLocalWork,/);
  const signupGuard = cloud.indexOf('"herdharbor_normalized_signup_ready"');
  const signupCall = cloud.indexOf('client.auth.signUp({');
  assert.ok(signupGuard > 0 && signupGuard < signupCall, "S20 preflight must run before Auth signup");
  assert.match(cloud,/if \(!normalizedSignupReady\) \{/);
  assert.match(html,/herdharbor-cloud\.js\?v=42/);
});

test("S20 signup preflight fails closed on missing or failing RPC and permits verified normalized accounts", async () => {
  const source = fs.readFileSync(path.join(__dirname,"..","herdharbor-cloud.js"),"utf8");
  const startToken = 'root.querySelector("#hh-signup-form").addEventListener("submit", async (event) => {';
  const endToken = '\n    });\n\n    root.querySelector("#hh-forgot-password")';
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start > 0 && end > start, "signup listener must exist and be extractable");
  const handlerBody = source.slice(start + startToken.length, end);
  const fields = {
    "#hh-signup-password": { value: "longpassword123" },
    "#hh-signup-confirm": { value: "longpassword123" },
    "#hh-signup-email": { value: "breeder@example.invalid" }
  };
  const root = { querySelector: selector => fields[selector] };
  const windowMock = { location: { origin: "https://example.invalid", pathname: "/" } };
  let signups = 0, ready = false, rpcError = null, busy = true;
  const notices = [];
  const client = {
    rpc: async name => {
      assert.equal(name,"herdharbor_normalized_signup_ready");
      return { data:ready, error:rpcError };
    },
    auth: { signUp: async () => {
      signups++;
      return { data:{session:null}, error:null };
    } }
  };
  const handler = new Function("root","client","authMessage","setFormBusy","window","console",
    "return async function(event) {" + handlerBody + "\n};")(
    root,client,(_,kind)=>notices.push(kind),
    (_,flag)=>{busy=flag;},windowMock,{warn:()=>{}}
  );
  const formEvent = { preventDefault(){}, currentTarget:{} };
  await handler(formEvent);
  assert.equal(signups,0,"readiness false must prevent signup");
  assert.equal(busy,false,"failed readiness must release the form");
  rpcError={code:"PGRST202"};
  ready=true;
  await handler(formEvent);
  assert.equal(signups,0,"PostgREST/RPC errors must not silently create an account");
  rpcError=null;
  await handler(formEvent);
  assert.equal(signups,1,"verified readiness must allow normal account creation");
  assert.ok(notices.includes("error"));
});
