"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const migration = fs.readFileSync(
  path.join(__dirname,"../supabase/v2.0.2-account-release-snapshot-escrow.sql"),"utf8"
);

test("2.0.2 snapshots include every Auth account, exact legacy, manifests, normalized versions, tombstones, and hashes",()=>{
  for (const pattern of [
    /from auth\.users u/,
    /pg_catalog\.to_jsonb\(l\)/,
    /pg_catalog\.to_jsonb\(m\)/,
    /pg_catalog\.to_jsonb\(r\)/,
    /order by r\.namespace,r\.record_id/,
    /account_has_cloud_data/,
    /source_sha256/,
    /HH_202_SNAPSHOT_COHORT_COUNT_MISMATCH/,
    /on conflict \(release_id,user_id\) do nothing/,
    /HH_202_PURGE_VERIFIED_SIGNIN_AND_AUTHORITY_REQUIRED/,
    /verified_readback_reference/,
    /revoke all on public\.herdharbor_202_release_snapshots from public,anon,authenticated/,
    /revoke all on function public\.herdharbor_202_purge_verified_snapshot\(uuid,text,text\) from public,anon,authenticated,service_role/
  ]) assert.match(migration,pattern);
});

test("disposable PostgreSQL 17 proves exact frozen snapshots, no client access, and verified-only cleanup",{
  skip:process.env.HH_RECOVERY_POSTGRES_CI!=="1"
},()=>{
  const sql=`BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE auth.users(id uuid PRIMARY KEY,last_sign_in_at timestamptz);
CREATE TABLE public.herdharbor_user_data(
 user_id uuid primary key,app_state jsonb not null,
 created_at timestamptz default now(),updated_at timestamptz default now()
);
CREATE TABLE public.herdharbor_sync_manifest(
 user_id uuid primary key,cutover_stage text not null,
 metadata jsonb default '{}'::jsonb,
 sync_generation bigint default 0,
 normalized_verified_at timestamptz
);
CREATE TABLE public.herdharbor_sync_records(
 user_id uuid, namespace text, record_id text, payload jsonb,
 record_version bigint default 1, deleted_at timestamptz,
 primary key(user_id,namespace,record_id)
);
${migration}
INSERT INTO auth.users VALUES
 ('00000000-0000-4000-8000-000000000001',NULL),
 ('00000000-0000-4000-8000-000000000002',NULL),
 ('00000000-0000-4000-8000-000000000003',NULL);
INSERT INTO public.herdharbor_user_data(user_id,app_state) VALUES
 ('00000000-0000-4000-8000-000000000001',
  '{"profile":{"operationName":"Original ranch"},"animals":[{"id":"a"}]}');
INSERT INTO public.herdharbor_sync_manifest(
 user_id,cutover_stage,metadata,sync_generation) VALUES
 ('00000000-0000-4000-8000-000000000002','normalized',
  '{"normalized_authority_ready":true,"normalized_writer_ready":true}',14);
INSERT INTO public.herdharbor_sync_records(user_id,namespace,record_id,payload,record_version,deleted_at) VALUES
 ('00000000-0000-4000-8000-000000000002','legacy-state','animal-a','{"animal":"a"}',8,null),
 ('00000000-0000-4000-8000-000000000002','legacy-state','animal-b',null,9,now());
DO $hh$
DECLARE v_status jsonb;v_digest text;v_failed boolean;
BEGIN
 v_status:=public.herdharbor_202_capture_release_snapshots();
 IF (v_status->>'snapshot_accounts')::int<>3 OR
    (v_status->>'with_cloud_data')::int<>2 OR
    (v_status->>'auth_only_no_server_data')::int<>1 THEN
    RAISE EXCEPTION 'HH_SNAPSHOT_COUNTS_WRONG: %',v_status;
 END IF;
 IF has_table_privilege('authenticated','public.herdharbor_202_release_snapshots','SELECT')
    OR has_table_privilege('anon','public.herdharbor_202_release_snapshots','DELETE')
    OR has_function_privilege('authenticated',
       'public.herdharbor_202_purge_verified_snapshot(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'HH_SNAPSHOT_LEAKED_PRIVILEGES';
 END IF;
 IF (select count(*) from public.herdharbor_202_release_snapshots where
   user_id='00000000-0000-4000-8000-000000000002' and
   jsonb_array_length(normalized_rows)=2 and
   normalized_rows @> '[{"record_id":"animal-b","record_version":9}]'::jsonb)<>1
   THEN RAISE EXCEPTION 'HH_TOMBSTONE_VERSION_NOT_PRESERVED'; END IF;
 IF (select count(*) from public.herdharbor_202_release_snapshots where
   user_id='00000000-0000-4000-8000-000000000003' and
   legacy_row is null and manifest_row is null and normalized_rows='[]'::jsonb
   and not account_has_cloud_data)<>1
   THEN RAISE EXCEPTION 'HH_AUTH_ONLY_FICTITIOUS_SNAPSHOT'; END IF;
 UPDATE public.herdharbor_user_data set
   app_state='{"profile":{"operationName":"Changed after capture"}}'
   where user_id='00000000-0000-4000-8000-000000000001';
 PERFORM public.herdharbor_202_capture_release_snapshots();
 IF (select legacy_row #>> '{app_state,profile,operationName}'
   from public.herdharbor_202_release_snapshots where
     user_id='00000000-0000-4000-8000-000000000001')<>'Original ranch'
   THEN RAISE EXCEPTION 'HH_SNAPSHOT_OVERWRITTEN_BY_RECAPTURE'; END IF;
 SELECT source_sha256 INTO v_digest FROM public.herdharbor_202_release_snapshots
 WHERE user_id='00000000-0000-4000-8000-000000000002';
 v_failed:=false;
 BEGIN
   PERFORM public.herdharbor_202_purge_verified_snapshot(
     '00000000-0000-4000-8000-000000000002',v_digest,'readback-verified-123456');
 EXCEPTION WHEN check_violation THEN
   v_failed := sqlerrm = 'HH_202_PURGE_VERIFIED_SIGNIN_AND_AUTHORITY_REQUIRED';
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'HH_UNVERIFIED_PURGE_SUCCEEDED'; END IF;
 UPDATE public.herdharbor_sync_manifest
 SET normalized_verified_at = now()+interval '3 minutes'
 WHERE user_id='00000000-0000-4000-8000-000000000002';
 UPDATE auth.users SET last_sign_in_at=now()+interval '3 minutes'
 WHERE id='00000000-0000-4000-8000-000000000002';
 IF NOT public.herdharbor_202_purge_verified_snapshot(
   '00000000-0000-4000-8000-000000000002',v_digest,'readback-verified-123456')
   THEN RAISE EXCEPTION 'HH_VERIFIED_PURGE_NOT_ACCEPTED'; END IF;
 IF (select count(*) from public.herdharbor_202_release_snapshots
   where user_id='00000000-0000-4000-8000-000000000002')<>0 OR
    (select count(*) from public.herdharbor_202_release_snapshot_receipts
   where user_id='00000000-0000-4000-8000-000000000002')<>1
   THEN RAISE EXCEPTION 'HH_PURGE_RECEIPT_MISSING'; END IF;
END $hh$;
ROLLBACK;`;
  const result=spawnSync("psql",["-X","-v","ON_ERROR_STOP=1","-q"],{
    input:sql,encoding:"utf8",timeout:45000,env:process.env
  });
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,[result.stderr,result.stdout].join("\n").slice(0,7000));
});
