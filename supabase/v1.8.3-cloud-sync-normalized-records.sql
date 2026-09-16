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
  sync_generation bigint not null default 0
    check (sync_generation >= 0),
  legacy_snapshot_updated_at timestamptz,
  last_backfill_at timestamptz,
  normalized_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the migration idempotent if an early foundation schema was applied in a
-- non-production environment before sync_generation was introduced.
alter table public.herdharbor_sync_manifest
  add column if not exists sync_generation bigint not null default 0;

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
  if new.cutover_stage = 'normalized' and new.normalized_verified_at is null then
    raise exception using
      errcode = '23514',
      message = 'HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION';
  end if;
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

-- Apply one logical normalized-state change as one PostgreSQL transaction. The
-- per-user manifest row is locked first so two devices cannot interleave batch
-- application. Every existing-row mutation must provide the version that was
-- read by the client. Any stale version aborts the entire function call.
create or replace function public.herdharbor_sync_apply_batch(
  p_puts jsonb default '[]'::jsonb,
  p_tombstones jsonb default '[]'::jsonb,
  p_manifest_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_namespace text;
  v_record_id text;
  v_expected bigint;
  v_rows integer;
  v_put_count integer := 0;
  v_tombstone_count integer := 0;
  v_generation bigint;
  v_stage text;
  v_metadata jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;

  p_puts := coalesce(p_puts, '[]'::jsonb);
  p_tombstones := coalesce(p_tombstones, '[]'::jsonb);
  p_manifest_patch := coalesce(p_manifest_patch, '{}'::jsonb);

  if jsonb_typeof(p_puts) <> 'array'
     or jsonb_typeof(p_tombstones) <> 'array'
     or jsonb_typeof(p_manifest_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_BATCH';
  end if;

  if jsonb_array_length(p_puts) + jsonb_array_length(p_tombstones) > 10000 then
    raise exception using errcode = '54000', message = 'HH_SYNC_BATCH_LIMIT';
  end if;

  insert into public.herdharbor_sync_manifest (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  perform 1
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  for v_item in select value from jsonb_array_elements(p_puts)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_PUT';
    end if;
    v_namespace := nullif(btrim(v_item ->> 'namespace'), '');
    v_record_id := nullif(v_item ->> 'record_id', '');
    if v_namespace is null
       or char_length(v_namespace) > 64
       or v_namespace !~ '^[a-z0-9][a-z0-9_-]*$'
       or v_record_id is null
       or char_length(v_record_id) > 160
       or jsonb_typeof(v_item -> 'payload') <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_PUT';
    end if;

    v_expected := null;
    if v_item ? 'expected_version' and v_item ->> 'expected_version' is not null then
      if (v_item ->> 'expected_version') !~ '^[1-9][0-9]*$' then
        raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_VERSION';
      end if;
      v_expected := (v_item ->> 'expected_version')::bigint;
    end if;

    if v_expected is null then
      insert into public.herdharbor_sync_records (
        user_id, namespace, record_id, payload, deleted_at
      ) values (
        v_user, v_namespace, v_record_id, v_item -> 'payload', null
      )
      on conflict (user_id, namespace, record_id) do nothing;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
      end if;
    else
      update public.herdharbor_sync_records
      set payload = v_item -> 'payload', deleted_at = null
      where user_id = v_user
        and namespace = v_namespace
        and record_id = v_record_id
        and record_version = v_expected;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
      end if;
    end if;
    v_put_count := v_put_count + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_tombstones)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_TOMBSTONE';
    end if;
    v_namespace := nullif(btrim(v_item ->> 'namespace'), '');
    v_record_id := nullif(v_item ->> 'record_id', '');
    if v_namespace is null
       or char_length(v_namespace) > 64
       or v_namespace !~ '^[a-z0-9][a-z0-9_-]*$'
       or v_record_id is null
       or char_length(v_record_id) > 160
       or not (v_item ? 'expected_version')
       or (v_item ->> 'expected_version') !~ '^[1-9][0-9]*$' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_TOMBSTONE';
    end if;
    v_expected := (v_item ->> 'expected_version')::bigint;

    update public.herdharbor_sync_records
    set deleted_at = now()
    where user_id = v_user
      and namespace = v_namespace
      and record_id = v_record_id
      and record_version = v_expected;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
    end if;
    v_tombstone_count := v_tombstone_count + 1;
  end loop;

  if p_manifest_patch ? 'cutover_stage' then
    v_stage := p_manifest_patch ->> 'cutover_stage';
    if v_stage not in ('legacy', 'shadow', 'dual_write') then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_BATCH_STAGE';
    end if;
  end if;
  if p_manifest_patch ? 'metadata' then
    v_metadata := p_manifest_patch -> 'metadata';
    if jsonb_typeof(v_metadata) <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_MANIFEST_METADATA';
    end if;
  end if;

  update public.herdharbor_sync_manifest
  set
    schema_version = case
      when p_manifest_patch ? 'schema_version'
        then greatest(1, (p_manifest_patch ->> 'schema_version')::integer)
      else schema_version
    end,
    cutover_stage = case
      when p_manifest_patch ? 'cutover_stage' then p_manifest_patch ->> 'cutover_stage'
      else cutover_stage
    end,
    legacy_snapshot_updated_at = case
      when p_manifest_patch ? 'legacy_snapshot_updated_at'
        then nullif(p_manifest_patch ->> 'legacy_snapshot_updated_at', '')::timestamptz
      else legacy_snapshot_updated_at
    end,
    last_backfill_at = case
      when p_manifest_patch ? 'last_backfill_at'
        then nullif(p_manifest_patch ->> 'last_backfill_at', '')::timestamptz
      else last_backfill_at
    end,
    normalized_verified_at = case
      when v_put_count + v_tombstone_count > 0 then null
      when p_manifest_patch ? 'normalized_verified_at'
        then nullif(p_manifest_patch ->> 'normalized_verified_at', '')::timestamptz
      else normalized_verified_at
    end,
    metadata = (
      case
        when p_manifest_patch ? 'metadata' then p_manifest_patch -> 'metadata'
        else metadata
      end
    ) || (
      case
        when v_put_count + v_tombstone_count > 0 then
          jsonb_build_object(
            'verified_checksum', null,
            'last_shadow_verified_at', null,
            'verification_record_count', null
          )
        else '{}'::jsonb
      end
    ),
    sync_generation = sync_generation + case
      when v_put_count + v_tombstone_count > 0 then 1
      else 0
    end
  where user_id = v_user
  returning sync_generation into v_generation;

  return jsonb_build_object(
    'ok', true,
    'generation', v_generation,
    'puts', v_put_count,
    'tombstones', v_tombstone_count
  );
end;
$$;

-- Verification is recorded only if no normalized write has advanced the user's
-- generation since the verifier began reading rows. This closes the race where
-- one device could otherwise verify stale rows while another device writes.
create or replace function public.herdharbor_sync_mark_verified(
  p_expected_generation bigint,
  p_checksum text,
  p_record_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_verified_at timestamptz := now();
  v_rows integer;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;
  if p_expected_generation is null or p_expected_generation < 0
     or p_checksum is null or char_length(p_checksum) not between 1 and 128
     or p_record_count is null or p_record_count < 0 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_VERIFICATION';
  end if;

  update public.herdharbor_sync_manifest
  set
    normalized_verified_at = v_verified_at,
    metadata = metadata || jsonb_build_object(
      'verified_checksum', p_checksum,
      'last_shadow_verified_at', v_verified_at,
      'verification_record_count', p_record_count
    )
  where user_id = v_user
    and sync_generation = p_expected_generation
    and cutover_stage in ('shadow', 'dual_write');
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    raise exception using errcode = '40001', message = 'HH_SYNC_VERIFY_STALE';
  end if;

  return jsonb_build_object(
    'ok', true,
    'generation', p_expected_generation,
    'verified_at', v_verified_at,
    'checksum', p_checksum,
    'record_count', p_record_count
  );
end;
$$;

revoke all on function public.herdharbor_sync_apply_batch(jsonb, jsonb, jsonb) from public;
revoke all on function public.herdharbor_sync_mark_verified(bigint, text, integer) from public;
grant execute on function public.herdharbor_sync_apply_batch(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.herdharbor_sync_mark_verified(bigint, text, integer) to authenticated;

comment on table public.herdharbor_sync_records is
  'Row-granular HerdHarbor cloud records. Additive v1.8.3 foundation; legacy app_state remains authoritative until cutover.';
comment on table public.herdharbor_sync_manifest is
  'Per-user migration/cutover state for the normalized cloud-sync record store.';
comment on function public.herdharbor_sync_apply_batch(jsonb, jsonb, jsonb) is
  'Atomically applies one owner-scoped normalized sync batch using optimistic record versions.';
comment on function public.herdharbor_sync_mark_verified(bigint, text, integer) is
  'Records a normalized shadow verification only if the owner sync generation is unchanged.';

commit;
