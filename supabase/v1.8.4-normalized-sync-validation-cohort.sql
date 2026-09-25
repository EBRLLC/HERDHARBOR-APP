-- HerdHarbor v1.8.4
-- Controlled normalized-sync validation cohort.
--
-- No users are enrolled by this migration. Eligibility is explicit allowlist
-- only and percentage rollout is intentionally unavailable in PR 6.

begin;

create table if not exists public.herdharbor_sync_validation_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.herdharbor_sync_validation_cohort enable row level security;

drop policy if exists "no direct normalized validation cohort reads"
on public.herdharbor_sync_validation_cohort;

create policy "no direct normalized validation cohort reads"
on public.herdharbor_sync_validation_cohort
for select
to authenticated
using (false);

revoke all on table public.herdharbor_sync_validation_cohort from anon, authenticated;

create or replace function public.herdharbor_sync_cohort_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_eligible boolean := false;
  v_schema_verified boolean := false;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;

  select exists (
    select 1
    from public.herdharbor_sync_validation_cohort c
    where c.user_id = v_user
      and c.enabled = true
  ) into v_eligible;

  v_schema_verified := (
    to_regclass('public.herdharbor_sync_records') is not null
    and to_regclass('public.herdharbor_sync_manifest') is not null
    and coalesce((
      select c.relrowsecurity
      from pg_catalog.pg_class c
      where c.oid = to_regclass('public.herdharbor_sync_records')
    ), false)
    and coalesce((
      select c.relrowsecurity
      from pg_catalog.pg_class c
      where c.oid = to_regclass('public.herdharbor_sync_manifest')
    ), false)
    and exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'herdharbor_sync_records'
        and policyname = 'users read own normalized sync records'
    )
    and exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'herdharbor_sync_manifest'
        and policyname = 'users read own sync manifest'
    )
    and exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'herdharbor_sync_records'
        and grantee = 'authenticated'
        and privilege_type = 'SELECT'
    )
    and exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'herdharbor_sync_manifest'
        and grantee = 'authenticated'
        and privilege_type = 'SELECT'
    )
    and not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('herdharbor_sync_records', 'herdharbor_sync_manifest')
        and grantee in ('anon', 'authenticated')
        and privilege_type <> 'SELECT'
    )
    and to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)') is not null
    and to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)') is not null
    and to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)') is not null
    and to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)') is not null
    and to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)') is not null
    and coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)'),
      'EXECUTE'
    ), false)
    and coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)'),
      'EXECUTE'
    ), false)
    and coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)'),
      'EXECUTE'
    ), false)
    and coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)'),
      'EXECUTE'
    ), false)
    and coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)'),
      'EXECUTE'
    ), false)
    and not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'herdharbor_sync_apply_batch',
          'herdharbor_sync_apply_record',
          'herdharbor_sync_mark_verified',
          'herdharbor_sync_prepare_normalized_writer_guarded',
          'herdharbor_sync_set_stage',
          'herdharbor_sync_cohort_status'
        )
        and has_function_privilege('anon', p.oid, 'EXECUTE')
    )
    and exists (
      select 1
      from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('public.herdharbor_user_data')
        and t.tgname = 'herdharbor_legacy_write_cutover_guard'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
    )
  );

  return jsonb_build_object(
    'eligible', v_eligible,
    'mode', 'allowlist',
    'percentage_enabled', false,
    'schema_verified', v_schema_verified
  );
end;
$$;

revoke all on function public.herdharbor_sync_cohort_status()
from public, anon, authenticated;

grant execute on function public.herdharbor_sync_cohort_status()
to authenticated;

comment on table public.herdharbor_sync_validation_cohort is
  'Explicit operator-managed allowlist for normalized-sync shadow/dual-write validation. No percentage enrollment.';

comment on function public.herdharbor_sync_cohort_status() is
  'Returns the signed-in user''s normalized-sync validation eligibility and schema readiness without exposing cohort membership for other users.';

commit;
