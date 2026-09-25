-- HerdHarbor v1.8.4
-- Internal/test normalized-sync cohort allowlist.
--
-- Empty by default. There is intentionally no browser write RPC. Operators may
-- add a specifically approved internal/test user through the trusted database
-- administration path only. Percentage rollout is not represented here.

begin;

create table if not exists public.herdharbor_sync_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  cohort text not null default 'internal_test'
    check (cohort = 'internal_test'),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.herdharbor_sync_cohort enable row level security;

drop policy if exists "users inspect own internal sync eligibility"
on public.herdharbor_sync_cohort;

create policy "users inspect own internal sync eligibility"
on public.herdharbor_sync_cohort
for select
to authenticated
using (
  user_id = (select auth.uid())
  and enabled
  and cohort = 'internal_test'
);

-- The policy documents/defends ownership if table privileges change later.
-- Today the browser has no direct table privileges; eligibility is exposed only
-- through the payload-minimal RPC below.
revoke all on table public.herdharbor_sync_cohort from anon, authenticated;

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
    from public.herdharbor_sync_cohort c
    where c.user_id = v_user
      and c.enabled
      and c.cohort = 'internal_test'
  )
  into v_eligible;

  v_schema_verified := (
    to_regclass('public.herdharbor_sync_records') is not null
    and to_regclass('public.herdharbor_sync_manifest') is not null
    and to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)') is not null
    and to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)') is not null
    and to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)') is not null
    and to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)') is not null
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

comment on table public.herdharbor_sync_cohort is
  'Trusted-operator allowlist for the internal/test normalized-sync cohort. Empty means no live cohort.';

comment on function public.herdharbor_sync_cohort_status() is
  'Returns only the authenticated caller own allowlist eligibility and schema readiness. No user ID or cohort membership list is exposed.';

commit;
