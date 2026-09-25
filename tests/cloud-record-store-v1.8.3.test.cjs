"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = require(path.join(root, "cloud-record-store-v1.8.3.js"));
const adapterSource = fs.readFileSync(path.join(root, "cloud-record-store-v1.8.3.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "supabase", "v1.8.3-cloud-sync-normalized-records.sql"), "utf8");

function makeRpcOnlyStore() {
  let rpcCalls = 0;
  const client = {
    from() { return {}; },
    async rpc() { rpcCalls += 1; return { data: { ok: true }, error: null }; }
  };
  return { store: api.createRecordStore({ client, userId: "11111111-1111-1111-1111-111111111111" }), calls: () => rpcCalls };
}

test("normalized cloud record store exposes the hardened v1.8.3 RPC foundation", () => {
  assert.equal(api.release, "1.8.3");
  assert.equal(api.recordTable, "herdharbor_sync_records");
  assert.equal(api.manifestTable, "herdharbor_sync_manifest");
  assert.equal(api.batchRpc, "herdharbor_sync_apply_batch");
  assert.equal(api.verifyRpc, "herdharbor_sync_mark_verified");
  assert.equal(api.prepareWriterRpc, "herdharbor_sync_prepare_normalized_writer_guarded");
  assert.equal(api.stageRpc, "herdharbor_sync_set_stage");
  assert.equal(api.readPageSize, 500);
});

test("record namespaces and IDs are bounded and deterministic", () => {
  assert.equal(api.normalizeNamespace("Animals"), "animals");
  assert.equal(api.normalizeNamespace("health-records"), "health-records");
  assert.equal(api.normalizeRecordId("animal-123"), "animal-123");
  assert.throws(() => api.normalizeNamespace("Health Records"), /namespace/);
  assert.throws(() => api.normalizeNamespace("../records"), /namespace/);
  assert.throws(() => api.normalizeRecordId(""), /record_id/);
  assert.throws(() => api.normalizeRecordId("x".repeat(161)), /too long/);
});

test("payload validation requires JSON objects and returns a detached copy", () => {
  const source = { id: "a-1", nested: { value: 3 } };
  const copy = api.normalizePayload(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy, source);
  assert.notEqual(copy.nested, source.nested);
  assert.throws(() => api.normalizePayload(null), /JSON object/);
  assert.throws(() => api.normalizePayload([]), /JSON object/);
});

test("integrity numbers reject missing, coercible, fractional, and unsafe values before RPC", async () => {
  const { store, calls } = makeRpcOnlyStore();
  for (const value of [null, undefined, "", " ", false, true, -1, 1.5, "1.5", "1e2", Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => store.markVerified({ expectedGeneration: value, checksum: "hh64:a", recordCount: 0 }), /expectedGeneration/);
    await assert.rejects(() => store.markVerified({ expectedGeneration: 0, checksum: "hh64:a", recordCount: value }), /recordCount/);
  }
  await assert.doesNotReject(() => store.markVerified({ expectedGeneration: "0", checksum: "hh64:a", recordCount: "0" }));
  assert.equal(calls(), 1);
});

test("store exposes reads plus guarded RPC mutations, not unsafe direct writes", () => {
  const client = { from(){return{select(){return this;},eq(){return this;},order(){return this;},is(){return this;},maybeSingle:async()=>({data:null,error:null}),then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};}, rpc:async()=>({data:{},error:null}) };
  const store=api.createRecordStore({client,userId:"11111111-1111-1111-1111-111111111111"});
  for(const name of ["list","listHeaders","getManifest","applyBatch","markVerified","prepareNormalizedWriter","setStage"]) assert.equal(typeof store[name],"function");
  assert.equal(store.put,undefined); assert.equal(store.tombstone,undefined); assert.equal(store.putManifest,undefined); assert.match(adapterSource,/payload_checksum/);
});

test("record reads explicitly page beyond provider row limits", async () => {
  const sourceRows=Array.from({length:1201},(_,index)=>({namespace:"legacy-state",record_id:`row-${String(index).padStart(4,"0")}`,payload_checksum:`hh64:${String(index).padStart(16,"0")}`,record_version:1,deleted_at:null}));
  const ranges=[]; const client={from(){let rangeStart=0,rangeEnd=api.readPageSize-1;return{select(){return this;},eq(){return this;},order(){return this;},is(){return this;},range(from,to){rangeStart=from;rangeEnd=to;ranges.push([from,to]);return this;},then(resolve){return Promise.resolve({data:sourceRows.slice(rangeStart,rangeEnd+1),error:null}).then(resolve);}};},async rpc(){return{data:{},error:null};}};
  const store=api.createRecordStore({client,userId:"11111111-1111-1111-1111-111111111111"}); const rows=await store.listHeaders("legacy-state",{includeDeleted:true});
  assert.equal(rows.length,1201); assert.equal(rows[0].record_id,"row-0000"); assert.equal(rows.at(-1).record_id,"row-1200"); assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});

test("atomic batch adapter serializes checksums, versions, generation, and stage RPC", async () => {
  const calls=[]; const client={from(){throw new Error("table path should not be used by this test");},async rpc(name,args){calls.push([name,args]);if(name===api.batchRpc)return{data:{ok:true,generation:8,puts:1,tombstones:1},error:null};if(name===api.verifyRpc)return{data:{ok:true,generation:8,verified_at:"2026-09-16T04:00:00.000Z",checksum:args.p_checksum,record_count:args.p_record_count},error:null};if(name===api.prepareWriterRpc)return{data:{ok:true,generation:9,writer_version:args.p_writer_version},error:null};if(name===api.stageRpc)return{data:{ok:true,stage:args.p_target_stage,generation:10},error:null};throw new Error(`unexpected rpc ${name}`);}};
  const store=api.createRecordStore({client,userId:"11111111-1111-1111-1111-111111111111"});
  const batch=await store.applyBatch({puts:[{namespace:"legacy-state",record_id:"root:settings",payload:{kind:"root_value",value:{theme:"dark"}},payload_checksum:"hh64:1234567890abcdef",expectedVersion:4}],tombstones:[{namespace:"legacy-state",record_id:"item:health:old",expectedVersion:9}],manifestPatch:{expectedGeneration:7,schemaVersion:2,cutoverStage:"shadow",legacySnapshotUpdatedAt:"2026-09-16T03:59:00.000Z",normalizedVerifiedAt:null,metadata:{source_checksum:"hh64:1234567890abcdef"}}});
  assert.equal(batch.generation,8); assert.equal(calls[0][0],api.batchRpc); assert.equal(calls[0][1].p_manifest_patch.expected_generation,7); assert.equal(calls[0][1].p_puts[0].expected_version,4); assert.equal(calls[0][1].p_tombstones[0].expected_version,9);
  const verified=await store.markVerified({expectedGeneration:8,checksum:"hh64:1234567890abcdef",recordCount:12}); assert.equal(verified.generation,8);
  const prepared=await store.prepareNormalizedWriter({expectedGeneration:8,writerVersion:"writer-v1",namespace:"legacy-state",formatVersion:2}); assert.equal(prepared.writer_version,"writer-v1");
  const staged=await store.setStage({targetStage:"dual_write",expectedGeneration:9}); assert.equal(staged.generation,10);
});

test("batch adapter rejects missing generation, duplicate records, and missing checksums before provider calls", async () => {
  let rpcCalls=0; const client={from(){return{};},async rpc(){rpcCalls+=1;return{data:null,error:{code:"40001",message:"HH_SYNC_CONFLICT"}};}}; const store=api.createRecordStore({client,userId:"11111111-1111-1111-1111-111111111111"});
  await assert.rejects(()=>store.applyBatch({puts:[],tombstones:[],manifestPatch:{}}),/expectedGeneration/);
  await assert.rejects(()=>store.applyBatch({puts:[],tombstones:[],manifestPatch:{expectedGeneration:null}}),/expectedGeneration/);
  await assert.rejects(()=>store.applyBatch({puts:[{namespace:"legacy-state",record_id:"x",payload:{a:1}}],manifestPatch:{expectedGeneration:0}}),/payload_checksum/);
  await assert.rejects(()=>store.applyBatch({puts:[{namespace:"legacy-state",record_id:"x",payload:{a:1},payload_checksum:"hh64:a"}],tombstones:[{namespace:"legacy-state",record_id:"x",expectedVersion:1}],manifestPatch:{expectedGeneration:0}}),/Duplicate normalized batch record/);
  assert.equal(rpcCalls,0);
  await assert.rejects(()=>store.applyBatch({puts:[],tombstones:[],manifestPatch:{expectedGeneration:0,cutoverStage:"shadow",metadata:{}}}),(error)=>error?.code==="HH_SYNC_CONFLICT"); assert.equal(rpcCalls,1);
});

test("schema is additive to legacy data and uses payload checksums for header-only diffs",()=>{assert.match(schema,/create table if not exists public\.herdharbor_sync_records/i);assert.match(schema,/create table if not exists public\.herdharbor_sync_manifest/i);assert.match(schema,/payload_checksum text/i);assert.match(schema,/primary key \(user_id, namespace, record_id\)/i);assert.match(schema,/enable row level security/i);assert.match(schema,/user_id = \(select auth\.uid\(\)\)/i);assert.match(schema,/record_version := old\.record_version \+ 1/i);assert.doesNotMatch(schema,/(?:drop\s+table|delete\s+from|truncate\s+table|alter\s+table|update)\s+public\.herdharbor_user_data/i);});
test("schema makes browser mutations RPC-only and every real stage change advances generation",()=>{const lower=schema.toLowerCase();assert.ok(lower.includes("revoke all on table public.herdharbor_sync_records from anon, authenticated;"));assert.ok(lower.includes("revoke all on table public.herdharbor_sync_manifest from anon, authenticated;"));assert.ok(lower.includes("grant select on table public.herdharbor_sync_records to authenticated;"));assert.ok(lower.includes("grant select on table public.herdharbor_sync_manifest to authenticated;"));assert.match(schema,/security definer/i);assert.match(schema,/herdharbor_sync_apply_batch/i);assert.match(schema,/herdharbor_sync_set_stage/i);assert.match(schema,/sync_generation = sync_generation \+ 1/i);assert.match(schema,/v_put_count \+ v_tombstone_count > 0 or v_stage_changed/i);assert.match(schema,/HH_SYNC_STAGE_CHANGE_REQUIRES_RPC/);});
test("verification is generation, checksum, metadata-count, and actual-row-count guarded",()=>{assert.match(schema,/herdharbor_sync_mark_verified/i);assert.match(schema,/sync_generation = p_expected_generation/i);assert.match(schema,/normalized_record_count/i);assert.match(schema,/select count\(\*\)::integer[\s\S]*namespace = 'legacy-state'/i);assert.match(schema,/HH_SYNC_RECORD_COUNT_MISMATCH/);assert.match(schema,/HH_SYNC_VERIFY_STALE/);});
test("schema embeds the final adjacent stage guard in the base migration",()=>{assert.match(schema,/HH_SYNC_INITIAL_STAGE_MUST_BE_LEGACY/);assert.match(schema,/HH_SYNC_INVALID_STAGE_TRANSITION/);assert.match(schema,/HH_SYNC_STAGE_VERIFICATION_REQUIRED/);assert.match(schema,/HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION/);assert.match(schema,/HH_SYNC_NORMALIZED_WRITER_REQUIRED/);assert.match(schema,/legacy app_state remains authoritative until cutover/i);});


test("normalized foundation uses explicit least-privilege table and function grants",()=>{
  assert.match(schema,/revoke all on table public\.herdharbor_sync_records from anon, authenticated/i);
  assert.match(schema,/revoke all on table public\.herdharbor_sync_manifest from anon, authenticated/i);
  assert.match(schema,/grant select on table public\.herdharbor_sync_records to authenticated/i);
  assert.match(schema,/grant select on table public\.herdharbor_sync_manifest to authenticated/i);
  assert.match(schema,/revoke all on function public\.herdharbor_touch_sync_record\(\) from public, anon, authenticated/i);
  assert.match(schema,/revoke all on function public\.herdharbor_touch_sync_manifest\(\) from public, anon, authenticated/i);
  assert.match(schema,/revoke all on function public\.herdharbor_sync_prepare_normalized_writer\(bigint, text, text, integer\) from public, anon, authenticated/i);
  assert.doesNotMatch(schema,/grant execute on function public\.herdharbor_sync_prepare_normalized_writer\(bigint, text, text, integer\) to authenticated/i);
  assert.match(schema,/security definer\s+set search_path = ''/i);
});


test("normalized owner policies evaluate auth identity once per statement",()=>{
  assert.match(schema,/using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(schema,/using \(user_id = auth\.uid\(\)\)/i);
});
