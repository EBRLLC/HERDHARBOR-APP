-- HerdHarbor v1.8.3 normalized-sync rollout preflight
-- READ ONLY. This file validates prerequisites and intentionally performs no schema mutation.

with object_checks as (
  select
    to_regclass('public.herdharbor_sync_records') is not null as records_table,
    to_regclass('public.herdharbor_sync_manifest') is not null as manifest_table,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.herdharbor_sync_records')), false) as records_rls,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.herdharbor_sync_manifest')), false) as manifest_rls,
    exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'herdharbor_sync_records'
        and policyname = 'users read own normalized sync records'
        and coalesce(qual, '') ilike '%auth.uid()%'
        and coalesce(qual, '') ilike '%user_id%'
    ) as records_owner_policy,
    exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'herdharbor_sync_manifest'
        and policyname = 'users read own sync manifest'
        and coalesce(qual, '') ilike '%auth.uid()%'
        and coalesce(qual, '') ilike '%user_id%'
    ) as manifest_owner_policy,
    to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)') is not null as batch_rpc,
    to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)') is not null as verify_rpc,
    to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)') is not null as stage_rpc,
    to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)') is not null as guarded_writer_rpc,
    exists (
      select 1
      from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('public.herdharbor_user_data')
        and t.tgname = 'herdharbor_legacy_write_cutover_guard'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
    ) as legacy_guard
)
select
  *,
  (records_rls and manifest_rls and records_owner_policy and manifest_owner_policy) as owner_rls,
  (
    records_table and manifest_table and records_rls and manifest_rls and
    records_owner_policy and manifest_owner_policy and
    batch_rpc and verify_rpc and stage_rpc and guarded_writer_rpc and legacy_guard
  ) as verified
from object_checks;
