-- HerdHarbor v1.8.3
-- Normalized cloud-sync foundation.
--
-- This migration is intentionally additive. It does not alter, copy, or delete
-- public.herdharbor_user_data. The current full-state cloud snapshot remains the
-- production source of truth until a later, separately reviewed cutover.

begin;

create table if not exists public.herdharbor_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null
    check (
      char_length(namespace) between 1 and 64
      and namespace ~ '^[a-z0-9][a-z0-9_-]*$'
    ),
  record_id text not null
    check (char_length(record_id) between 1 and 160),
  payload jsonb not null default '{}'::jsonb,
  record_version bigint not null default 1
    check (record_version >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace, record_id)
);

create index if not exists herdharbor_sync_records_user_namespace_updated_idx
  on public.herdharbor_sync_records (user_id, namespace, updated_at desc);

create index if not exists herdharbor_sync_records_user_live_idx
  on public.herdharbor_sync_records (user_id, updated_at desc)
  where deleted_at is null;

create table if not exists public.herdharbor_sync_manifest (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1
    check (schema_version >= 1),
  cutover_stage text not null default 'legacy'
    check (cutover_stage in ('legacy', 'shadow', 'dual_write', 'normalized')),
  legacy_snapshot_updated_at timestamptz,
  last_backfill_at timestamptz,
  normalized_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.herdharbor_touch_sync_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.record_version := old.record_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists herdharbor_sync_records_touch on public.herdharbor_sync_records;
create trigger herdharbor_sync_records_touch
before update on public.herdharbor_sync_records
for each row execute function public.herdharbor_touch_sync_record();

create or replace function public.herdharbor_touch_sync_manifest()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists herdharbor_sync_manifest_touch on public.herdharbor_sync_manifest;
create trigger herdharbor_sync_manifest_touch
before update on public.herdharbor_sync_manifest
for each row execute function public.herdharbor_touch_sync_manifest();

alter table public.herdharbor_sync_records enable row level security;
alter table public.herdharbor_sync_manifest enable row level security;

drop policy if exists "users read own normalized sync records" on public.herdharbor_sync_records;
create policy "users read own normalized sync records"
on public.herdharbor_sync_records
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users insert own normalized sync records" on public.herdharbor_sync_records;
create policy "users insert own normalized sync records"
on public.herdharbor_sync_records
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own normalized sync records" on public.herdharbor_sync_records;
create policy "users update own normalized sync records"
on public.herdharbor_sync_records
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users delete own normalized sync records" on public.herdharbor_sync_records;
create policy "users delete own normalized sync records"
on public.herdharbor_sync_records
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "users read own sync manifest" on public.herdharbor_sync_manifest;
create policy "users read own sync manifest"
on public.herdharbor_sync_manifest
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users insert own sync manifest" on public.herdharbor_sync_manifest;
create policy "users insert own sync manifest"
on public.herdharbor_sync_manifest
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own sync manifest" on public.herdharbor_sync_manifest;
create policy "users update own sync manifest"
on public.herdharbor_sync_manifest
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on public.herdharbor_sync_records to authenticated;
grant select, insert, update on public.herdharbor_sync_manifest to authenticated;

comment on table public.herdharbor_sync_records is
  'Row-granular HerdHarbor cloud records. Additive v1.8.3 foundation; legacy app_state remains authoritative until cutover.';
comment on table public.herdharbor_sync_manifest is
  'Per-user migration/cutover state for the normalized cloud-sync record store.';

commit;
