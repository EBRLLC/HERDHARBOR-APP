"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const policy = require(path.join(root, "cloud-sync-stage-policy-v1.8.3.js"));
const storeApi = require(path.join(root, "cloud-record-store-v1.8.3.js"));
const schema = fs.readFileSync(path.join(root, "supabase", "v1.8.3-cloud-sync-normalized-records.sql"), "utf8");

function verifiedDualWrite(metadata = {}) {
  return { cutover_stage:"dual_write", sync_generation:21, normalized_verified_at:"2026-09-16T09:00:00.000Z", metadata:{ source_checksum:"hh64:1234567890abcdef", verified_checksum:"hh64:1234567890abcdef", normalized_record_count:25, verification_record_count:25, normalized_namespace:"legacy-state", normalized_format_version:2, ...metadata } };
}

test("dual-write cannot promote to normalized until a concrete writer is prepared",()=>{const unprepared=policy.evaluateTransition(verifiedDualWrite(),"normalized");assert.equal(unprepared.allowed,false);assert.equal(unprepared.reason,"normalized-writer-required");assert.equal(unprepared.requiresWriter,true);assert.throws(()=>policy.assertTransition(verifiedDualWrite(),"normalized"),(error)=>error?.code==="HH_SYNC_NORMALIZED_WRITER_REQUIRED");const prepared=policy.evaluateTransition(verifiedDualWrite({normalized_writer_ready:true,normalized_writer_version:"writer-v1"}),"normalized");assert.equal(prepared.allowed,true);assert.equal(prepared.requiresWriter,true);});

test("record store exposes the guarded readiness RPC with bounded inputs",async()=>{const calls=[];const client={from(){return{};},async rpc(name,args){calls.push([name,args]);return{data:{ok:true,generation:22,writer_version:args.p_writer_version},error:null};}};const store=storeApi.createRecordStore({client,userId:"11111111-1111-1111-1111-111111111111"});assert.equal(storeApi.prepareWriterRpc,"herdharbor_sync_prepare_normalized_writer_guarded");assert.equal(typeof store.prepareNormalizedWriter,"function");const result=await store.prepareNormalizedWriter({expectedGeneration:21,writerVersion:"writer-v1",namespace:"legacy-state",formatVersion:2});assert.equal(result.generation,22);assert.deepEqual(calls[0],[storeApi.prepareWriterRpc,{p_expected_generation:21,p_writer_version:"writer-v1",p_namespace:"legacy-state",p_format_version:2}]);await assert.rejects(()=>store.prepareNormalizedWriter({expectedGeneration:21,writerVersion:"",namespace:"legacy-state",formatVersion:2}),/writerVersion/);await assert.rejects(()=>store.prepareNormalizedWriter({expectedGeneration:21,writerVersion:"writer-v1",namespace:"../legacy",formatVersion:2}),/namespace/);});

test("SQL preparation invalidates old verification and advances generation before cutover",()=>{assert.match(schema,/herdharbor_sync_prepare_normalized_writer_guarded/i);assert.match(schema,/v_stage <> 'dual_write'/i);assert.match(schema,/HH_SYNC_DUAL_WRITE_STAGE_REQUIRED/);assert.match(schema,/HH_SYNC_WRITER_FORMAT_MISMATCH/);assert.match(schema,/normalized_verified_at = null/i);assert.match(schema,/'normalized_writer_ready', true/i);assert.match(schema,/'normalized_writer_version', btrim\(p_writer_version\)/i);assert.match(schema,/sync_generation = sync_generation \+ 1/i);});
test("database trigger independently rejects normalized stage without writer readiness",()=>{assert.match(schema,/HH_SYNC_NORMALIZED_WRITER_REQUIRED/);assert.match(schema,/normalized_writer_ready' is distinct from 'true'::jsonb/i);assert.match(schema,/normalized_writer_version/i);});
test("rollback clears verification and writer readiness so re-promotion requires a fresh safety cycle",()=>{assert.match(schema,/v_is_rollback boolean/i);assert.match(schema,/v_current_stage = 'normalized' and p_target_stage = 'dual_write'/i);assert.match(schema,/v_current_stage = 'dual_write' and p_target_stage = 'shadow'/i);assert.match(schema,/v_current_stage = 'shadow' and p_target_stage = 'legacy'/i);assert.match(schema,/when v_is_rollback then null else normalized_verified_at/i);assert.match(schema,/'normalized_writer_ready', false/i);assert.match(schema,/'normalized_writer_version', null/i);});
