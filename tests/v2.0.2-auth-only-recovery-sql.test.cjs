"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const source=fs.readFileSync(path.join(__dirname,"../supabase/v2.0.2-auth-only-local-recovery-claim.sql"),"utf8");
test("Auth-only recovery function is owner-derived, one-time and authenticated-only",()=>{
  for(const exp of [
    /v_owner uuid := auth\.uid\(\)/,
    /HH_AUTH_ONLY_RECOVERY_ALREADY_CLAIMED/,
    /HH_AUTH_ONLY_RECOVERY_COHORT_DISABLED/,
    /pg_advisory_xact_lock/,
    /revoke all on function .*\(jsonb\)/,
    /grant execute on function .*\(jsonb\)[\s\S]*to authenticated/,
    /set search_path = ''/
  ]) assert.match(source,exp);
});
test("disposable PostgreSQL verifies atomic initial claim, replay rejection and owner isolation",{
  skip:process.env.HH_RECOVERY_POSTGRES_CI!=="1"
},()=>{
  const body=source.replace(/^begin;\s*/im,"").replace(/\ncommit;\s*$/i,"");
  const sql=`BEGIN;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.herdharbor_user_data (
 user_id uuid PRIMARY KEY,app_state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.herdharbor_sync_manifest(user_id uuid PRIMARY KEY);
CREATE TABLE public.herdharbor_sync_records(user_id uuid);
CREATE TABLE public.herdharbor_sync_cohort (
 user_id uuid PRIMARY KEY,enabled boolean NOT NULL,cohort text NOT NULL,updated_at timestamptz DEFAULT now()
);
${body}
DO $hh_test$
DECLARE
  v_a uuid:='00000000-0000-4000-8000-000000000001';
  v_b uuid:='00000000-0000-4000-8000-000000000002';
  v_c uuid:='00000000-0000-4000-8000-000000000003';
  v_result jsonb;
BEGIN
  IF has_function_privilege('anon',
       'public.herdharbor_claim_auth_only_local_recovery(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'ANON_RPC_EXECUTION_ALLOWED';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.herdharbor_claim_auth_only_local_recovery(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'AUTH_RPC_EXECUTION_MISSING';
  END IF;
  BEGIN
    PERFORM public.herdharbor_claim_auth_only_local_recovery('{"profile":{"operationName":"Wrong"}}');
    RAISE EXCEPTION 'UNAUTHENTICATED_CLAIM_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'HH_AUTH_ONLY_RECOVERY_AUTH_REQUIRED' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_a::text,true);
  BEGIN
    PERFORM public.herdharbor_claim_auth_only_local_recovery('{"animals":[{"id":"a"}]}');
    RAISE EXCEPTION 'MISSING_PROFILE_ALLOWED';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'HH_AUTH_ONLY_RECOVERY_PROFILE_REQUIRED' THEN RAISE; END IF;
  END;
  v_result:=public.herdharbor_claim_auth_only_local_recovery(
    '{"profile":{"operationName":"Ranch A"},"animals":[{"id":"a"}]}');
  IF v_result->>'ok'<>'true' OR
     (SELECT count(*) FROM public.herdharbor_user_data WHERE user_id=v_a)<>1 OR
     NOT EXISTS(SELECT 1 FROM public.herdharbor_sync_cohort
       WHERE user_id=v_a AND enabled AND cohort='internal_test')
  THEN RAISE EXCEPTION 'FIRST_OWNER_CLAIM_NOT_ATOMIC'; END IF;
  BEGIN
    PERFORM public.herdharbor_claim_auth_only_local_recovery(
      '{"profile":{"operationName":"Replace Ranch A"}}');
    RAISE EXCEPTION 'REPEAT_CLAIM_ALLOWED';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM <> 'HH_AUTH_ONLY_RECOVERY_ALREADY_CLAIMED' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_b::text,true);
  v_result:=public.herdharbor_claim_auth_only_local_recovery(
    '{"profile":{"operationName":"Ranch B"}}');
  IF v_result->>'ok'<>'true' OR
    (SELECT app_state#>>'{profile,operationName}' FROM public.herdharbor_user_data WHERE user_id=v_a) <> 'Ranch A' OR
    (SELECT app_state#>>'{profile,operationName}' FROM public.herdharbor_user_data WHERE user_id=v_b) <> 'Ranch B'
    THEN RAISE EXCEPTION 'CROSS_OWNER_DATA_OVERWRITE'; END IF;
  INSERT INTO public.herdharbor_sync_manifest(user_id) VALUES(v_c);
  PERFORM set_config('request.jwt.claim.sub',v_c::text,true);
  BEGIN
    PERFORM public.herdharbor_claim_auth_only_local_recovery(
      '{"profile":{"operationName":"Overwrite normalized"}}');
    RAISE EXCEPTION 'EXISTING_MANIFEST_OVERWRITE';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM <> 'HH_AUTH_ONLY_RECOVERY_ALREADY_CLAIMED' THEN RAISE; END IF;
  END;
END $hh_test$;
ROLLBACK;`;
  const r=spawnSync("psql",["-X","-v","ON_ERROR_STOP=1","-q"],{
    input:sql,encoding:"utf8",timeout:45000,env:process.env
  });
  assert.equal(r.error,undefined,r.error?.message);
  assert.equal(r.status,0,[r.stderr,r.stdout].join("\n").slice(0,6000));
});
