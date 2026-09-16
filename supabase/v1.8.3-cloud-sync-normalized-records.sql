-- HerdHarbor v1.8.3
-- Normalized cloud-sync foundation.
--
-- This migration is additive with respect to production user data. It never
-- reads, alters, copies, or deletes public.herdharbor_user_data. The v1.8.2
-- legacy app_state remains authoritative until a separately reviewed cutover.

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
  payload_checksum text not null default 'unverified'
    check (char_length(payload_checksum) between 1 and 128),
  record_version bigint not null default 1
    check (record_version >= 1),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace, record_id)
);

-- Idempotent upgrade path for non-production environments that applied an
-- earlier v1.8.3 draft before lightweight payload checksums existed.
alter table public.herdharbor_sync_records
  add column if not exists payload_checksum text;
update public.herdharbor_sync_records
set payload_checksum = 'unverified'
where payload_checksum is null or btrim(payload_checksum) = '';
alter table public.herdharbor_sync_records
  alter column payload_checksum set default 'unverified';
alter table public.herdharbor_sync_records
  alter column payload_checksum set not null;

-- The primary key already supports (user_id, namespace, record_id) header
-- scans. Earlier draft indexes ordered by updated_at only added write cost.
drop index if exists public.herdharbor_sync_records_user_namespace_updated_idx;
drop index if exists public.herdharbor_sync_records_user_live_idx;

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

alter table public.herdharbor_sync_manifest
  add column if not exists sync_generation bigint not null default 0;

create or replace function public.herdharbor_touch_sync_record()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
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

-- Final transition guard is installed in the base migration so accidentally
-- omitting a later rollout script cannot permit an unsafe stage jump.
create or replace function public.herdharbor_touch_sync_manifest()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_verified_checksum text;
  v_source_checksum text;
  v_verified_count text;
  v_normalized_count text;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' and new.cutover_stage <> 'legacy' then
    raise exception using errcode = '23514', message = 'HH_SYNC_INITIAL_STAGE_MUST_BE_LEGACY';
  end if;

  if tg_op = 'UPDATE' and new.cutover_stage is distinct from old.cutover_stage then
    if not (
      (old.cutover_stage = 'legacy' and new.cutover_stage = 'shadow')
      or (old.cutover_stage = 'shadow' and new.cutover_stage = 'legacy')
      or (old.cutover_stage = 'shadow' and new.cutover_stage = 'dual_write')
      or (old.cutover_stage = 'dual_write' and new.cutover_stage = 'shadow')
      or (old.cutover_stage = 'dual_write' and new.cutover_stage = 'normalized')
      or (old.cutover_stage = 'normalized' and new.cutover_stage = 'dual_write')
    ) then
      raise exception using errcode = '23514', message = 'HH_SYNC_INVALID_STAGE_TRANSITION';
    end if;

    if (
      (old.cutover_stage = 'shadow' and new.cutover_stage = 'dual_write')
      or (old.cutover_stage = 'dual_write' and new.cutover_stage = 'normalized')
    ) then
      v_verified_checksum := nullif(btrim(new.metadata ->> 'verified_checksum'), '');
      v_source_checksum := nullif(btrim(new.metadata ->> 'source_checksum'), '');
      v_verified_count := nullif(btrim(new.metadata ->> 'verification_record_count'), '');
      v_normalized_count := nullif(btrim(new.metadata ->> 'normalized_record_count'), '');
      if new.normalized_verified_at is null
         or v_verified_checksum is null
         or v_source_checksum is null
         or v_verified_checksum <> v_source_checksum
         or v_verified_count is null
         or v_verified_count !~ '^[0-9]+$'
         or v_normalized_count is null
         or v_normalized_count !~ '^[0-9]+$'
         or v_verified_count <> v_normalized_count then
        raise exception using errcode = '23514', message = 'HH_SYNC_STAGE_VERIFICATION_REQUIRED';
      end if;
    end if;

    if old.cutover_stage = 'dual_write' and new.cutover_stage = 'normalized' then
      if new.metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb
         or nullif(btrim(new.metadata ->> 'normalized_writer_version'), '') is null then
        raise exception using errcode = '23514', message = 'HH_SYNC_NORMALIZED_WRITER_REQUIRED';
      end if;
    end if;
  end if;

  if new.cutover_stage = 'normalized' then
    v_verified_checksum := nullif(btrim(new.metadata ->> 'verified_checksum'), '');
    v_source_checksum := nullif(btrim(new.metadata ->> 'source_checksum'), '');
    v_verified_count := nullif(btrim(new.metadata ->> 'verification_record_count'), '');
    v_normalized_count := nullif(btrim(new.metadata ->> 'normalized_record_count'), '');
    if new.normalized_verified_at is null
       or v_verified_checksum is null
       or v_source_checksum is null
       or v_verified_checksum <> v_source_checksum
       or v_verified_count is null
       or v_verified_count !~ '^[0-9]+$'
       or v_normalized_count is null
       or v_normalized_count !~ '^[0-9]+$'
       or v_verified_count <> v_normalized_count then
      raise exception using errcode = '23514', message = 'HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION';
    end if;
    if new.metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb
       or nullif(btrim(new.metadata ->> 'normalized_writer_version'), '') is null then
      raise exception using errcode = '23514', message = 'HH_SYNC_NORMALIZED_WRITER_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists herdharbor_sync_manifest_touch on public.herdharbor_sync_manifest;
create trigger herdharbor_sync_manifest_touch
before insert or update on public.herdharbor_sync_manifest
for each row execute function public.herdharbor_touch_sync_manifest();

alter table public.herdharbor_sync_records enable row level security;
alter table public.herdharbor_sync_manifest enable row level security;

drop policy if exists "users read own normalized sync records" on public.herdharbor_sync_records;
create policy "users read own normalized sync records"
on public.herdharbor_sync_records
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users read own sync manifest" on public.herdharbor_sync_manifest;
create policy "users read own sync manifest"
on public.herdharbor_sync_manifest
for select
to authenticated
using (user_id = auth.uid());

-- Remove direct browser mutation paths from earlier drafts. All writes now go
-- through generation/version guarded SECURITY DEFINER RPCs below.
drop policy if exists "users insert own normalized sync records" on public.herdharbor_sync_records;
drop policy if exists "users update own normalized sync records" on public.herdharbor_sync_records;
drop policy if exists "users delete own normalized sync records" on public.herdharbor_sync_records;
drop policy if exists "users insert own sync manifest" on public.herdharbor_sync_manifest;
drop policy if exists "users update own sync manifest" on public.herdharbor_sync_manifest;

revoke insert, update, delete on public.herdharbor_sync_records from authenticated;
revoke insert, update, delete on public.herdharbor_sync_manifest from authenticated;
grant select on public.herdharbor_sync_records to authenticated;
grant select on public.herdharbor_sync_manifest to authenticated;

create or replace function public.herdharbor_sync_apply_batch(
  p_puts jsonb default '[]'::jsonb,
  p_tombstones jsonb default '[]'::jsonb,
  p_manifest_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_namespace text;
  v_record_id text;
  v_checksum text;
  v_expected bigint;
  v_rows integer;
  v_put_count integer := 0;
  v_tombstone_count integer := 0;
  v_generation bigint;
  v_current_generation bigint;
  v_current_stage text;
  v_requested_stage text;
  v_stage_changed boolean := false;
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

  select sync_generation, cutover_stage
  into v_current_generation, v_current_stage
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  if v_current_stage = 'normalized' then
    raise exception using errcode = '40001', message = 'HH_SYNC_ALREADY_NORMALIZED';
  end if;

  if not (p_manifest_patch ? 'expected_generation')
     or (p_manifest_patch ->> 'expected_generation') !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'HH_SYNC_EXPECTED_GENERATION_REQUIRED';
  end if;
  if (p_manifest_patch ->> 'expected_generation')::bigint <> v_current_generation then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;

  v_requested_stage := v_current_stage;
  if p_manifest_patch ? 'cutover_stage' then
    v_requested_stage := p_manifest_patch ->> 'cutover_stage';
    if v_requested_stage not in ('legacy', 'shadow', 'dual_write') then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_BATCH_STAGE';
    end if;
    if v_requested_stage <> v_current_stage
       and not (v_current_stage = 'legacy' and v_requested_stage = 'shadow') then
      raise exception using errcode = '40001', message = 'HH_SYNC_STAGE_CHANGE_REQUIRES_RPC';
    end if;
    v_stage_changed := v_requested_stage <> v_current_stage;
  end if;

  if p_manifest_patch ? 'schema_version'
     and (p_manifest_patch ->> 'schema_version') !~ '^[1-9][0-9]*$' then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_SCHEMA_VERSION';
  end if;
  if p_manifest_patch ? 'metadata' then
    v_metadata := p_manifest_patch -> 'metadata';
    if jsonb_typeof(v_metadata) <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_MANIFEST_METADATA';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_puts)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_PUT';
    end if;
    v_namespace := nullif(btrim(v_item ->> 'namespace'), '');
    v_record_id := nullif(v_item ->> 'record_id', '');
    v_checksum := nullif(btrim(v_item ->> 'payload_checksum'), '');
    if v_namespace is null
       or char_length(v_namespace) > 64
       or v_namespace !~ '^[a-z0-9][a-z0-9_-]*$'
       or v_record_id is null
       or char_length(v_record_id) > 160
       or v_checksum is null
       or char_length(v_checksum) > 128
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
        user_id, namespace, record_id, payload, payload_checksum, deleted_at
      ) values (
        v_user, v_namespace, v_record_id, v_item -> 'payload', v_checksum, null
      )
      on conflict (user_id, namespace, record_id) do nothing;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
      end if;
    else
      update public.herdharbor_sync_records
      set payload = v_item -> 'payload', payload_checksum = v_checksum, deleted_at = null
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

  update public.herdharbor_sync_manifest
  set
    schema_version = case
      when p_manifest_patch ? 'schema_version' then (p_manifest_patch ->> 'schema_version')::integer
      else schema_version
    end,
    cutover_stage = v_requested_stage,
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
      when v_put_count + v_tombstone_count > 0 or v_stage_changed then 1
      else 0
    end
  where user_id = v_user
  returning sync_generation into v_generation;

  return jsonb_build_object(
    'ok', true,
    'generation', v_generation,
    'puts', v_put_count,
    'tombstones', v_tombstone_count,
    'stage_changed', v_stage_changed
  );
end;
$$;

create or replace function public.herdharbor_sync_mark_verified(
  p_expected_generation bigint,
  p_checksum text,
  p_record_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_verified_at timestamptz := now();
  v_rows integer;
  v_actual_count integer;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;
  if p_expected_generation is null or p_expected_generation < 0
     or p_checksum is null or char_length(p_checksum) not between 1 and 128
     or p_record_count is null or p_record_count < 0 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_VERIFICATION';
  end if;

  select count(*)::integer
  into v_actual_count
  from public.herdharbor_sync_records
  where user_id = v_user
    and namespace = 'legacy-state'
    and deleted_at is null;

  if v_actual_count <> p_record_count then
    raise exception using errcode = '40001', message = 'HH_SYNC_RECORD_COUNT_MISMATCH';
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
    and cutover_stage in ('shadow', 'dual_write')
    and nullif(btrim(metadata ->> 'source_checksum'), '') = p_checksum
    and nullif(btrim(metadata ->> 'normalized_record_count'), '') ~ '^[0-9]+$'
    and (metadata ->> 'normalized_record_count')::integer = p_record_count;
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

-- Preparing the normalized writer is deliberately separate from stage
-- promotion. It invalidates the previous verification and advances generation,
-- forcing a fresh round-trip verification before normalized can become
-- authoritative.
create or replace function public.herdharbor_sync_prepare_normalized_writer(
  p_expected_generation bigint,
  p_writer_version text,
  p_namespace text,
  p_format_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_stage text;
  v_generation bigint;
  v_metadata jsonb;
  v_prepared_at timestamptz := now();
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_GENERATION';
  end if;
  if p_writer_version is null or char_length(btrim(p_writer_version)) not between 1 and 80
     or p_namespace is null or char_length(btrim(p_namespace)) not between 1 and 64
     or p_format_version is null or p_format_version < 1 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_WRITER_READINESS';
  end if;

  select cutover_stage, sync_generation, metadata
  into v_stage, v_generation, v_metadata
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HH_SYNC_MANIFEST_MISSING';
  end if;
  if v_generation <> p_expected_generation then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;
  if v_stage <> 'dual_write' then
    raise exception using errcode = '23514', message = 'HH_SYNC_DUAL_WRITE_STAGE_REQUIRED';
  end if;
  if nullif(btrim(v_metadata ->> 'normalized_namespace'), '') is distinct from btrim(p_namespace)
     or nullif(btrim(v_metadata ->> 'normalized_format_version'), '') is null
     or nullif(btrim(v_metadata ->> 'normalized_format_version'), '') !~ '^[1-9][0-9]*$'
     or (v_metadata ->> 'normalized_format_version')::integer <> p_format_version then
    raise exception using errcode = '23514', message = 'HH_SYNC_WRITER_FORMAT_MISMATCH';
  end if;

  update public.herdharbor_sync_manifest
  set
    normalized_verified_at = null,
    metadata = metadata || jsonb_build_object(
      'verified_checksum', null,
      'last_shadow_verified_at', null,
      'verification_record_count', null,
      'normalized_writer_ready', true,
      'normalized_writer_version', btrim(p_writer_version),
      'normalized_writer_prepared_at', v_prepared_at
    ),
    sync_generation = sync_generation + 1
  where user_id = v_user
    and sync_generation = p_expected_generation
  returning sync_generation into v_generation;

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'generation', v_generation,
    'writer_version', btrim(p_writer_version),
    'prepared_at', v_prepared_at
  );
end;
$$;

create or replace function public.herdharbor_sync_set_stage(
  p_target_stage text,
  p_expected_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_current_stage text;
  v_generation bigint;
  v_verified_at timestamptz;
  v_is_rollback boolean := false;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;
  if p_target_stage is null
     or p_target_stage not in ('legacy', 'shadow', 'dual_write', 'normalized') then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_STAGE';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_GENERATION';
  end if;

  select cutover_stage, sync_generation, normalized_verified_at
  into v_current_stage, v_generation, v_verified_at
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HH_SYNC_MANIFEST_MISSING';
  end if;
  if v_generation <> p_expected_generation then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;

  v_is_rollback := (
    (v_current_stage = 'normalized' and p_target_stage = 'dual_write')
    or (v_current_stage = 'dual_write' and p_target_stage = 'shadow')
    or (v_current_stage = 'shadow' and p_target_stage = 'legacy')
  );

  if v_current_stage <> p_target_stage then
    update public.herdharbor_sync_manifest
    set
      cutover_stage = p_target_stage,
      normalized_verified_at = case when v_is_rollback then null else normalized_verified_at end,
      metadata = case
        when v_is_rollback then metadata || jsonb_build_object(
          'verified_checksum', null,
          'last_shadow_verified_at', null,
          'verification_record_count', null,
          'normalized_writer_ready', false,
          'normalized_writer_version', null,
          'normalized_writer_prepared_at', null
        )
        else metadata
      end,
      sync_generation = sync_generation + 1
    where user_id = v_user
      and sync_generation = p_expected_generation
    returning sync_generation, normalized_verified_at
      into v_generation, v_verified_at;
  end if;

  return jsonb_build_object(
    'ok', true,
    'from_stage', v_current_stage,
    'stage', p_target_stage,
    'generation', v_generation,
    'normalized_verified_at', v_verified_at,
    'rollback', v_is_rollback
  );
end;
$$;

revoke all on function public.herdharbor_sync_apply_batch(jsonb, jsonb, jsonb) from public;
revoke all on function public.herdharbor_sync_mark_verified(bigint, text, integer) from public;
revoke all on function public.herdharbor_sync_prepare_normalized_writer(bigint, text, text, integer) from public;
revoke all on function public.herdharbor_sync_set_stage(text, bigint) from public;
grant execute on function public.herdharbor_sync_apply_batch(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.herdharbor_sync_mark_verified(bigint, text, integer) to authenticated;
grant execute on function public.herdharbor_sync_prepare_normalized_writer(bigint, text, text, integer) to authenticated;
grant execute on function public.herdharbor_sync_set_stage(text, bigint) to authenticated;

comment on table public.herdharbor_sync_records is
  'Row-granular HerdHarbor cloud records. Browser mutations are RPC-only; legacy app_state remains authoritative until cutover.';
comment on table public.herdharbor_sync_manifest is
  'Per-user migration state with generation-CAS protection for normalized cloud sync.';
comment on function public.herdharbor_sync_apply_batch(jsonb, jsonb, jsonb) is
  'Atomically applies owner-scoped normalized record changes using record versions and manifest generation.';
comment on function public.herdharbor_sync_mark_verified(bigint, text, integer) is
  'Records verification only when generation, checksum, metadata count, and actual active record count still agree.';
comment on function public.herdharbor_sync_prepare_normalized_writer(bigint, text, text, integer) is
  'Records normalized-writer readiness, invalidates prior verification, and advances generation before cutover.';
comment on function public.herdharbor_sync_set_stage(text, bigint) is
  'Generation-guarded adjacent migration stage transition. Rollbacks clear verification and writer readiness.';

commit;
