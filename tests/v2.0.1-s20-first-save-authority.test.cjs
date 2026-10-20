"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const start = src.indexOf("  async function syncNow() {");
const end = src.indexOf("    const raw = activeStateRaw();", start);
assert.ok(start > 0 && end > start, "normalized save switch must be extractable");
const initialSaveSource = src.slice(start, end) +
  "\n    return 'legacy-fallthrough';\n  }";

function harness(options = {}) {
  let authorized = options.authorized === true;
  let normalizedWrites = 0;
  let statusCalls = 0;
  let legacyMarkerCleared = 0;
  const states = [];
  const identity = "new-breeder-account";
  const getItem = { call(_storage, key) {
    if (key === "dirty-" + identity) return options.dirty === false ? null : "1";
    if (key === "version-" + identity) return options.legacyVersion || null;
    return null;
  }};
  const deps = [
    "session", "captureAccountOperation", "isAccountOperationCurrent", "pendingSync",
    "originalGetItem", "localStorage", "dirtyKey", "normalizedRolloutStage",
    "normalizedAuthorityActive", "refreshNormalizedAuthorityIfEligible", "setSyncState",
    "normalizedOutboxPending", "deferNormalizedDualWriteCleanup", "clearTimeout",
    "syncTimer", "syncDebounceStartedAt", "normalizedRollout", "versionKey",
    "getNormalizedSyncCohortStatus", "safeStorageRemove", "canonicalStateStore"
  ];
  const vals = [
    { user: { id: identity } }, ()=>({}), ()=>true, options.pending === true ? { rawValue:"{}" } : null,
    getItem, {}, id=>"dirty-"+id, ()=>options.localStage || "legacy",
    ()=>authorized, async()=>{
      if (options.refreshSuccess !== false) authorized = true;
      return authorized;
    }, (message,status)=>states.push({message,status}),
    ()=>false, ()=>{}, ()=>{}, null, 0,
    { syncNormalizedNow: async()=>{
      normalizedWrites++;
      return options.normalizedResult || {ok:true,reason:null};
    } },
    id=>"version-"+id,
    async()=>{
      statusCalls++;
      if (options.statusError) throw new Error("offline");
      return options.serverStatus === undefined ? {stage:"normalized"} : options.serverStatus;
    },
    () => {legacyMarkerCleared++;},
    { getOutbox: () => options.noOutbox ? [] : [{mutationId:"first-edit"}] }
  ];
  const execute = new Function(...deps, initialSaveSource + "\nreturn syncNow;")(...vals);
  return {
    execute, states,
    get stats(){return {statusCalls, normalizedWrites,legacyMarkerCleared};}
  };
}

test("S20 cold normalized-only signup selects record CAS, never legacy, even for an early dirty edit", async()=>{
  const h=harness({dirty:true,localStage:"legacy",serverStatus:{stage:"normalized"}});
  const result=await h.execute();
  assert.equal(result,true);
  assert.equal(h.stats.statusCalls,1);
  assert.equal(h.stats.normalizedWrites,1);
  assert.equal(h.stats.legacyMarkerCleared,1);
  assert.match(h.states.at(-1).message,/Saved to cloud/);
});

test("S20 never interprets a missing authority RPC as permission for legacy full-state write",async()=>{
  const h=harness({statusError:true});
  assert.equal(await h.execute(),false);
  assert.equal(h.stats.normalizedWrites,0);
  assert.equal(h.stats.legacyMarkerCleared,0);
  assert.match(h.states.at(-1).message,/authority could not be verified/i);
});

test("S20 normalized authority that cannot initialize stays fail-closed",async()=>{
  const h=harness({refreshSuccess:false});
  assert.equal(await h.execute(),false);
  assert.equal(h.stats.normalizedWrites,0);
  assert.match(h.states.at(-1).message,/Normalized record authority/);
});

test("S20 verified legacy stage can still preserve first legacy save",async()=>{
  const h=harness({serverStatus:{stage:"legacy"},localStage:"legacy"});
  assert.equal(await h.execute(),"legacy-fallthrough");
  assert.equal(h.stats.statusCalls,1);
  assert.equal(h.stats.normalizedWrites,0);
});

test("S20 existing legacy account with a known CAS revision saves without delaying for extra authority preflight",async()=>{
  const h=harness({serverStatus:{stage:"legacy"},legacyVersion:"2026-10-20T12:00:00Z"});
  assert.equal(await h.execute(),"legacy-fallthrough");
  assert.equal(h.stats.statusCalls,0);
});

test("S20 confirmed normalized save clears old dirty marker only after a successful record sync",async()=>{
  const h=harness({normalizedResult:{ok:false,reason:"record-conflict"}});
  assert.equal(await h.execute(),false);
  assert.equal(h.stats.normalizedWrites,1);
  assert.equal(h.stats.legacyMarkerCleared,0);
});

test("S20 never claims a normalized save for an unmatched legacy dirty marker", async()=>{
  const h=harness({noOutbox:true});
  const result=await h.execute();
  assert.equal(result,false);
  assert.equal(h.stats.normalizedWrites,0);
  assert.equal(h.stats.legacyMarkerCleared,0);
  assert.match(h.states.at(-1).message,/unsynced local records need recovery/i);
});
