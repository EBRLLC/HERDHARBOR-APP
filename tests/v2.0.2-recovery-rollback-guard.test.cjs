"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
// Dedicated ephemeral PostgreSQL only; do not run against Supabase or production.
const source=fs.readFileSync(path.join(__dirname,"../supabase/v2.0.2-normalized-recovery-rollback-guard.sql"),"utf8");
const enabled=process.env.HH_RECOVERY_POSTGRES_CI==="1";
test("normalized rollback guard requires fresh materialized recovery and disallows direct execution",()=>{
  for(const re of [
    /HH_SYNC_RECOVERY_MATERIALIZATION_REQUIRED/,
    /HH_SYNC_RECOVERY_STALE_NORMALIZED_RECORDS/,
    /HH_SYNC_RECOVERY_LEGACY_SNAPSHOT_REQUIRED/,
    /legacy_recovery_lock/,
    /revoke all on function .* from authenticated/,
    /before update of cutover_stage on public\.herdharbor_sync_manifest/
  ]) assert.match(source,re);
});
test("disposable PostgreSQL rejects missing, stale, or absent recovery, allows freshly backed up snapshot",{
  skip:!enabled
},()=>{
  const body=source.replace(/^begin;\s*/im,"")
    .replace(/\ncommit;\s*$/i,"")
    .replace(/^revoke all on function .*;\s*$/gim,"");
  const replacements={
    HH_UID_A:"00000000-0000-4000-8000-000000000001",
    HH_UID_B:"00000000-0000-4000-8000-000000000002",
    HH_UID_C:"00000000-0000-4000-8000-000000000003",
    HH_UID_D:"00000000-0000-4000-8000-000000000004"
  };
  let sql="BEGIN;\nCREATE TABLE public.herdharbor_sync_manifest(user_id uuid primary key,cutover_stage text not null,metadata jsonb not null);\nCREATE TABLE public.herdharbor_sync_records(user_id uuid,updated_at timestamptz);\nCREATE TABLE public.herdharbor_user_data(user_id uuid,updated_at timestamptz);\nHH_MIGRATION_BODY\nHH_MIGRATION_BODY\nINSERT INTO public.herdharbor_sync_manifest VALUES\n('HH_UID_A','normalized','{}'::jsonb),\n('HH_UID_B','normalized',jsonb_build_object('legacy_recovery_lock',true,'legacy_recovery_materialized_at',now()-interval '2 hours')),\n('HH_UID_C','normalized',jsonb_build_object('legacy_recovery_lock',true,'legacy_recovery_materialized_at',now()-interval '30 minutes')),\n('HH_UID_D','normalized',jsonb_build_object('legacy_recovery_lock',true,'legacy_recovery_materialized_at',now()-interval '30 minutes'));\nINSERT INTO public.herdharbor_sync_records VALUES\n('HH_UID_B',now()-interval '1 hour'),('HH_UID_C',now()-interval '1 hour'),('HH_UID_D',now()-interval '1 hour');\nINSERT INTO public.herdharbor_user_data VALUES ('HH_UID_C',now());\nDO $contract$\nBEGIN\n  BEGIN\n    UPDATE public.herdharbor_sync_manifest SET cutover_stage='dual_write' WHERE user_id='HH_UID_A';\n    RAISE EXCEPTION 'HH_TEST_MISSING_LOCK_WAS_ALLOWED';\n  EXCEPTION WHEN OTHERS THEN\n    IF SQLERRM<>'HH_SYNC_RECOVERY_MATERIALIZATION_REQUIRED' THEN RAISE; END IF;\n  END;\n  BEGIN\n    UPDATE public.herdharbor_sync_manifest SET cutover_stage='dual_write' WHERE user_id='HH_UID_B';\n    RAISE EXCEPTION 'HH_TEST_STALE_RECORDS_WERE_ALLOWED';\n  EXCEPTION WHEN OTHERS THEN\n    IF SQLERRM<>'HH_SYNC_RECOVERY_STALE_NORMALIZED_RECORDS' THEN RAISE; END IF;\n  END;\n  BEGIN\n    UPDATE public.herdharbor_sync_manifest SET cutover_stage='dual_write' WHERE user_id='HH_UID_D';\n    RAISE EXCEPTION 'HH_TEST_MISSING_LEGACY_WAS_ALLOWED';\n  EXCEPTION WHEN OTHERS THEN\n    IF SQLERRM<>'HH_SYNC_RECOVERY_LEGACY_SNAPSHOT_REQUIRED' THEN RAISE; END IF;\n  END;\n  UPDATE public.herdharbor_sync_manifest SET cutover_stage='dual_write' WHERE user_id='HH_UID_C';\n  IF (SELECT count(*) FROM public.herdharbor_sync_manifest WHERE cutover_stage='dual_write') <> 1\n    THEN RAISE EXCEPTION 'HH_TEST_FRESH_RECOVERY_FAILED'; END IF;\nEND $contract$;\nROLLBACK;".replaceAll("HH_MIGRATION_BODY",body);
  for(const [token,id] of Object.entries(replacements)) sql=sql.replaceAll(token,id);
  const result=spawnSync("psql",["-X","-v","ON_ERROR_STOP=1","-q"],{
    input:sql,encoding:"utf8",timeout:45000,env:process.env
  });
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,[result.stderr,result.stdout].join("\n").slice(0,6000));
});
