-- HerdHarbor v1.8.3 normalized-sync rollout preflight
-- READ ONLY. This file validates prerequisites and intentionally performs no schema mutation.

with object_checks as (
  select
    to_regclass('public.herdharbor_sync_records') is not null as records_table,
    to_regclass('public.herdharbor_sync_manifest') is not null as manifest_table,
    to_regclass('public.herdharbor_sync_cohort') is not null as cohort_table,
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
    exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'herdharbor_sync_records'
        and grantee = 'authenticated'
        and privilege_type = 'SELECT'
    ) as records_authenticated_select,
    exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'herdharbor_sync_manifest'
        and grantee = 'authenticated'
        and privilege_type = 'SELECT'
    ) as manifest_authenticated_select,
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('herdharbor_sync_records', 'herdharbor_sync_manifest')
        and grantee = 'authenticated'
        and privilege_type <> 'SELECT'
    ) as no_authenticated_direct_mutation,
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('herdharbor_sync_records', 'herdharbor_sync_manifest')
        and grantee = 'anon'
    ) as no_anon_table_access,
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'herdharbor_sync_cohort'
        and grantee in ('anon', 'authenticated')
    ) as no_browser_cohort_table_access,
    to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)') is not null as batch_rpc,
    to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)') is not null as record_rpc,
    to_regprocedure('public.herdharbor_sync_cohort_status()') is not null as cohort_rpc,
    to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)') is not null as verify_rpc,
    to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)') is not null as stage_rpc,
    to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)') is not null as guarded_writer_rpc,
    coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)'),
      'EXECUTE'
    ), false) as batch_authenticated_execute,
    coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)'),
      'EXECUTE'
    ), false) as record_authenticated_execute,
    coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_cohort_status()'),
      'EXECUTE'
    ), false) as cohort_authenticated_execute,
    coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)'),
      'EXECUTE'
    ), false) as verify_authenticated_execute,
    coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)'),
      'EXECUTE'
    ), false) as stage_authenticated_execute,
    coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)'),
      'EXECUTE'
    ), false) as guarded_writer_authenticated_execute,
    not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_prepare_normalized_writer(bigint,text,text,integer)'),
      'EXECUTE'
    ), false) as unguarded_writer_not_exposed,
    not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'herdharbor_touch_sync_record',
          'herdharbor_touch_sync_manifest',
          'herdharbor_sync_apply_batch',
          'herdharbor_sync_apply_record',
          'herdharbor_sync_cohort_status',
          'herdharbor_sync_mark_verified',
          'herdharbor_sync_prepare_normalized_writer',
          'herdharbor_sync_prepare_normalized_writer_guarded',
          'herdharbor_sync_set_stage',
          'herdharbor_block_legacy_write_after_normalized'
        )
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    ) as no_anon_sync_function_execute,
    exists (
      select 1
      from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('public.herdharbor_user_data')
        and t.tgname = 'herdharbor_legacy_write_cutover_guard'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
    ) as legacy_guard,
    not exists (
      select 1
      from public.herdharbor_sync_manifest
      where cutover_stage <> 'legacy'
    ) as legacy_authority_only
),
summary as (
  select
    *,
    (
      records_rls and manifest_rls and
      records_owner_policy and manifest_owner_policy and
      records_authenticated_select and manifest_authenticated_select and
      no_authenticated_direct_mutation and no_anon_table_access
    ) as owner_rls,
    (
      batch_authenticated_execute and
      record_authenticated_execute and
      cohort_authenticated_execute and
      verify_authenticated_execute and
      stage_authenticated_execute and
      guarded_writer_authenticated_execute and
      unguarded_writer_not_exposed and
      no_anon_sync_function_execute
    ) as rpc_acl
  from object_checks
)
select
  *,
  (
    records_table and manifest_table and cohort_table and
    owner_rls and no_browser_cohort_table_access and
    batch_rpc and record_rpc and cohort_rpc and verify_rpc and stage_rpc and guarded_writer_rpc and
    rpc_acl and legacy_guard and legacy_authority_only
  ) as verified
from summary;
