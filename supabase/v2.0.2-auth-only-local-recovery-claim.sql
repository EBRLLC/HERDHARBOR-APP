-- HerdHarbor 2.0.2: one-time owner-initiated import for PRE-EXISTING
-- Auth-only users with local records but no legacy or normalized save.
-- This deliberately creates a single, immutable first cloud recovery baseline
-- for the existing S18 migration pipeline; new signups still remain normalized-only.
-- Must be deployed AFTER normalized foundation, cohort, legacy write guard,
-- and normalized-only signup trigger. No existing user data is modified.
begin;

create or replace function public.herdharbor_claim_auth_only_local_recovery(
  p_app_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $hh202$
declare
  v_owner uuid := auth.uid();
  v_saved_version timestamptz;
begin
  if v_owner is null then
    raise exception using errcode='42501', message='HH_AUTH_ONLY_RECOVERY_AUTH_REQUIRED';
  end if;

  if p_app_state is null
     or pg_catalog.jsonb_typeof(p_app_state) <> 'object'
     or pg_catalog.jsonb_typeof(p_app_state -> 'profile') <> 'object'
     or nullif(pg_catalog.btrim(p_app_state #>> '{profile,operationName}'), '') is null then
    raise exception using errcode='22023', message='HH_AUTH_ONLY_RECOVERY_PROFILE_REQUIRED';
  end if;

  if pg_catalog.octet_length(p_app_state::text) > 20971520 then
    raise exception using errcode='22023', message='HH_AUTH_ONLY_RECOVERY_TOO_LARGE';
  end if;

  -- Serialize competing first-login claims for exactly this owner.
  -- This is a fixed transaction-only lock, not a user-supplied lock ID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 202));

  -- A missing legacy row does NOT mean the account has no normalized state,
  -- shadow records, or pending cohort setup. Reject every ambiguous source.
  if exists (select 1 from public.herdharbor_user_data where user_id=v_owner)
     or exists (select 1 from public.herdharbor_sync_manifest where user_id=v_owner)
     or exists (select 1 from public.herdharbor_sync_records where user_id=v_owner) then
    raise exception using errcode='23505', message='HH_AUTH_ONLY_RECOVERY_ALREADY_CLAIMED';
  end if;

  -- Do not override a deliberately disabled cohort entry.
  if exists (select 1 from public.herdharbor_sync_cohort
             where user_id=v_owner and enabled=false) then
    raise exception using errcode='42501', message='HH_AUTH_ONLY_RECOVERY_COHORT_DISABLED';
  end if;

  insert into public.herdharbor_user_data(user_id,app_state)
  values(v_owner,p_app_state)
  returning updated_at into v_saved_version;

  insert into public.herdharbor_sync_cohort(user_id,enabled,cohort)
  values(v_owner,true,'internal_test')
  on conflict (user_id) do update
  set enabled=true,cohort='internal_test',updated_at=pg_catalog.now()
  where public.herdharbor_sync_cohort.enabled=true;

  if not found then
    raise exception using errcode='42501', message='HH_AUTH_ONLY_RECOVERY_COHORT_UNAVAILABLE';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,'cloud_updated_at',v_saved_version,
    'migration_enabled',true
  );
end;
$hh202$;

revoke all on function public.herdharbor_claim_auth_only_local_recovery(jsonb)
  from public, anon, authenticated;
grant execute on function public.herdharbor_claim_auth_only_local_recovery(jsonb)
  to authenticated;

comment on function public.herdharbor_claim_auth_only_local_recovery(jsonb) is
  'One-time authenticated owner-only local recovery claim for legacy Auth-only accounts. Caller must first preserve an independent device recovery copy, obtain informed consent, and verify cloud readback.';

commit;
