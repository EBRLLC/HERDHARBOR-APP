-- HerdHarbor v1.8.4
-- Normalized authority cutover + rollback materialization.
--
-- No account is enrolled or promoted by this migration. It only installs the
-- guarded authority, recovery, stage and record-write contracts required for
-- an explicitly approved internal account.

begin;

-- Ordinary legacy writes remain blocked after cutover. The only bypass is a
-- transaction-local flag used by the authenticated recovery RPC. Once recovery
-- materialization begins, the recovery lock keeps stale clients blocked through
-- normalized -> dual_write -> shadow until rollback reaches legacy.
create or replace function public.herdharbor_block_legacy_write_after_normalized()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_stage text;
  v_recovery_lock boolean := false;
  v_recovery_write boolean := false;
begin
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if v_user is null then
    raise exception using errcode = '22023', message = 'HH_SYNC_LEGACY_GUARD_USER_REQUIRED';
  end if;

  v_recovery_write := coalesce(
    current_setting('herdharbor.normalized_recovery_write', true),
    ''
  ) = 'on';

  select
    cutover_stage,
    coalesce(metadata -> 'legacy_recovery_lock' = 'true'::jsonb, false)
  into v_stage, v_recovery_lock
  from public.herdharbor_sync_manifest
  where user_id = v_user;

  if (v_stage = 'normalized' or v_recovery_lock) and not v_recovery_write then
    raise exception using
      errcode = '55000',
      message = 'HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.herdharbor_block_legacy_write_after_normalized()
from public, anon, authenticated;

-- The manifest trigger keeps stage transitions adjacent, requires the explicit
-- server cohort for every forward transition, requires checkpoint verification
-- when entering dual-write/normalized, and requires authority metadata whenever
-- the row remains in normalized stage. Ordinary record-CAS writes may clear
-- checkpoint verification after cutover without deactivating authority.
create or replace function public.herdharbor_touch_sync_manifest()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_verified_checksum text;
  v_source_checksum text;
  v_verified_count text;
  v_normalized_count text;
  v_cohort_ready boolean := false;
  v_forward boolean := false;
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

    v_forward := (
      (old.cutover_stage = 'legacy' and new.cutover_stage = 'shadow')
      or (old.cutover_stage = 'shadow' and new.cutover_stage = 'dual_write')
      or (old.cutover_stage = 'dual_write' and new.cutover_stage = 'normalized')
    );

    if v_forward then
      select exists (
        select 1
        from public.herdharbor_sync_cohort c
        where c.user_id = new.user_id
          and c.enabled
          and c.cohort = 'internal_test'
      ) into v_cohort_ready;

      if not v_cohort_ready then
        raise exception using errcode = '42501', message = 'HH_SYNC_COHORT_REQUIRED';
      end if;
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
         or v_verified_count::bigint <> v_normalized_count::bigint then
        raise exception using errcode = '23514', message = 'HH_SYNC_STAGE_VERIFICATION_REQUIRED';
      end if;
    end if;

    if old.cutover_stage = 'dual_write' and new.cutover_stage = 'normalized' then
      if new.metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb
         or nullif(btrim(new.metadata ->> 'normalized_writer_version'), '') is null then
        raise exception using errcode = '23514', message = 'HH_SYNC_NORMALIZED_WRITER_REQUIRED';
      end if;
      if new.metadata -> 'normalized_authority_ready' is distinct from 'true'::jsonb
         or nullif(btrim(new.metadata ->> 'normalized_authority_version'), '') is null then
        raise exception using errcode = '23514', message = 'HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED';
      end if;
    end if;
  end if;

  if new.cutover_stage = 'normalized' then
    if new.metadata -> 'normalized_authority_ready' is distinct from 'true'::jsonb
       or nullif(btrim(new.metadata ->> 'normalized_authority_version'), '') is null
       or new.metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb
       or nullif(btrim(new.metadata ->> 'normalized_writer_version'), '') is null then
      raise exception using errcode = '23514', message = 'HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.herdharbor_touch_sync_manifest()
from public, anon, authenticated;

create or replace function public.herdharbor_sync_activate_normalized_authority(
  p_expected_generation bigint,
  p_writer_version text,
  p_namespace text,
  p_format_version integer,
  p_authority_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_stage text;
  v_generation bigint;
  v_verified_at timestamptz;
  v_metadata jsonb;
  v_guard_ready boolean := false;
  v_cohort_ready boolean := false;
  v_activated_at timestamptz := now();
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_GENERATION';
  end if;
  if nullif(btrim(p_writer_version), '') is null
     or char_length(btrim(p_writer_version)) > 80
     or nullif(btrim(p_namespace), '') is null
     or char_length(btrim(p_namespace)) > 64
     or p_format_version is null
     or p_format_version < 1
     or nullif(btrim(p_authority_version), '') is null
     or char_length(btrim(p_authority_version)) > 80 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_AUTHORITY_ACTIVATION';
  end if;

  select exists (
    select 1
    from public.herdharbor_sync_cohort c
    where c.user_id = v_user
      and c.enabled
      and c.cohort = 'internal_test'
  ) into v_cohort_ready;

  if not v_cohort_ready then
    raise exception using errcode = '42501', message = 'HH_SYNC_COHORT_REQUIRED';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'herdharbor_user_data'
      and t.tgname = 'herdharbor_legacy_write_cutover_guard'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) into v_guard_ready;

  if not v_guard_ready then
    raise exception using errcode = '55000', message = 'HH_SYNC_LEGACY_GUARD_REQUIRED';
  end if;

  select cutover_stage, sync_generation, normalized_verified_at, metadata
  into v_stage, v_generation, v_verified_at, v_metadata
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HH_SYNC_MANIFEST_MISSING';
  end if;
  if v_stage <> 'dual_write' then
    raise exception using errcode = '23514', message = 'HH_SYNC_DUAL_WRITE_STAGE_REQUIRED';
  end if;
  if v_generation <> p_expected_generation then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;
  if v_verified_at is null
     or nullif(btrim(v_metadata ->> 'verified_checksum'), '') is null
     or nullif(btrim(v_metadata ->> 'source_checksum'), '') is null
     or btrim(v_metadata ->> 'verified_checksum') <> btrim(v_metadata ->> 'source_checksum')
     or nullif(btrim(v_metadata ->> 'verification_record_count'), '') is null
     or nullif(btrim(v_metadata ->> 'normalized_record_count'), '') is null
     or (v_metadata ->> 'verification_record_count') !~ '^[0-9]+$'
     or (v_metadata ->> 'normalized_record_count') !~ '^[0-9]+$'
     or (v_metadata ->> 'verification_record_count')::bigint
        <> (v_metadata ->> 'normalized_record_count')::bigint then
    raise exception using errcode = '55000', message = 'HH_SYNC_STAGE_VERIFICATION_REQUIRED';
  end if;
  if v_metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb
     or btrim(coalesce(v_metadata ->> 'normalized_writer_version', '')) <> btrim(p_writer_version) then
    raise exception using errcode = '55000', message = 'HH_SYNC_NORMALIZED_WRITER_REQUIRED';
  end if;
  if btrim(coalesce(v_metadata ->> 'normalized_namespace', '')) <> btrim(p_namespace)
     or nullif(btrim(v_metadata ->> 'normalized_format_version'), '') is null
     or (v_metadata ->> 'normalized_format_version') !~ '^[1-9][0-9]*$'
     or (v_metadata ->> 'normalized_format_version')::integer <> p_format_version then
    raise exception using errcode = '23514', message = 'HH_SYNC_WRITER_FORMAT_MISMATCH';
  end if;

  update public.herdharbor_sync_manifest
  set
    cutover_stage = 'normalized',
    metadata = metadata || jsonb_build_object(
      'normalized_authority_ready', true,
      'normalized_authority_version', btrim(p_authority_version),
      'normalized_authority_activated_at', v_activated_at,
      'legacy_recovery_lock', false
    ),
    sync_generation = sync_generation + 1
  where user_id = v_user
    and sync_generation = p_expected_generation
  returning sync_generation into v_generation;

  if v_generation is null then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;

  return jsonb_build_object(
    'ok', true,
    'stage', 'normalized',
    'generation', v_generation,
    'authority_version', btrim(p_authority_version),
    'activated_at', v_activated_at
  );
end;
$$;

create or replace function public.herdharbor_sync_materialize_legacy_recovery(
  p_app_state jsonb,
  p_expected_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_stage text;
  v_generation bigint;
  v_metadata jsonb;
  v_updated_at timestamptz;
  v_lock_rows integer;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_GENERATION';
  end if;
  if p_app_state is null or jsonb_typeof(p_app_state) <> 'object' then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECOVERY_SNAPSHOT';
  end if;

  select cutover_stage, sync_generation, metadata
  into v_stage, v_generation, v_metadata
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HH_SYNC_MANIFEST_MISSING';
  end if;
  if v_stage <> 'normalized'
     or v_metadata -> 'normalized_authority_ready' is distinct from 'true'::jsonb then
    raise exception using errcode = '55000', message = 'HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED';
  end if;
  if v_generation <> p_expected_generation then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;

  update public.herdharbor_sync_manifest
  set metadata = metadata || jsonb_build_object(
    'legacy_recovery_lock', true,
    'legacy_recovery_materialized_at', now()
  )
  where user_id = v_user
    and sync_generation = p_expected_generation;
  get diagnostics v_lock_rows = row_count;

  if v_lock_rows <> 1 then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
  end if;

  perform pg_catalog.set_config('herdharbor.normalized_recovery_write', 'on', true);

  insert into public.herdharbor_user_data (user_id, app_state)
  values (v_user, p_app_state)
  on conflict (user_id) do update
    set app_state = excluded.app_state;

  select updated_at
  into v_updated_at
  from public.herdharbor_user_data
  where user_id = v_user;

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'generation', v_generation,
    'updated_at', v_updated_at
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
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_current_stage text;
  v_generation bigint;
  v_verified_at timestamptz;
  v_is_rollback boolean := false;
  v_is_forward boolean := false;
  v_cohort_ready boolean := false;
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
  if p_target_stage = 'normalized' then
    raise exception using
      errcode = '55000',
      message = 'HH_SYNC_AUTHORITY_ACTIVATION_RPC_REQUIRED';
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

  if v_current_stage = p_target_stage then
    return jsonb_build_object(
      'ok', true,
      'from_stage', v_current_stage,
      'stage', p_target_stage,
      'generation', v_generation,
      'normalized_verified_at', v_verified_at,
      'rollback', false
    );
  end if;

  if not (
    (v_current_stage = 'legacy' and p_target_stage = 'shadow')
    or (v_current_stage = 'shadow' and p_target_stage = 'legacy')
    or (v_current_stage = 'shadow' and p_target_stage = 'dual_write')
    or (v_current_stage = 'dual_write' and p_target_stage = 'shadow')
    or (v_current_stage = 'normalized' and p_target_stage = 'dual_write')
  ) then
    raise exception using errcode = '23514', message = 'HH_SYNC_INVALID_STAGE_TRANSITION';
  end if;

  v_is_rollback := (
    (v_current_stage = 'normalized' and p_target_stage = 'dual_write')
    or (v_current_stage = 'dual_write' and p_target_stage = 'shadow')
    or (v_current_stage = 'shadow' and p_target_stage = 'legacy')
  );
  v_is_forward := (
    (v_current_stage = 'legacy' and p_target_stage = 'shadow')
    or (v_current_stage = 'shadow' and p_target_stage = 'dual_write')
  );

  if v_is_forward then
    select exists (
      select 1
      from public.herdharbor_sync_cohort c
      where c.user_id = v_user
        and c.enabled
        and c.cohort = 'internal_test'
    ) into v_cohort_ready;
    if not v_cohort_ready then
      raise exception using errcode = '42501', message = 'HH_SYNC_COHORT_REQUIRED';
    end if;
  end if;

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
        'normalized_writer_prepared_at', null,
        'normalized_authority_ready', false,
        'normalized_authority_version', null,
        'normalized_authority_activated_at', null,
        'legacy_recovery_lock', case
          when p_target_stage = 'legacy' then false
          else coalesce(metadata -> 'legacy_recovery_lock' = 'true'::jsonb, false)
        end
      )
      else metadata
    end,
    sync_generation = sync_generation + 1
  where user_id = v_user
    and sync_generation = p_expected_generation
  returning sync_generation, normalized_verified_at
    into v_generation, v_verified_at;

  if v_generation is null then
    raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
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

-- Record writes remain per-record CAS. In normalized stage they additionally
-- require the authority marker, and update/delete can only target active rows,
-- preventing a stale client from resurrecting a tombstone.
create or replace function public.herdharbor_sync_apply_record(
  p_namespace text,
  p_record_id text,
  p_payload jsonb,
  p_payload_checksum text,
  p_expected_version bigint,
  p_delete boolean,
  p_writer_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_namespace text := nullif(btrim(p_namespace), '');
  v_record_id text := nullif(p_record_id, '');
  v_checksum text := nullif(btrim(p_payload_checksum), '');
  v_stage text;
  v_metadata jsonb;
  v_rows integer;
  v_record_version bigint;
  v_generation bigint;
  v_deleted_at timestamptz;
  v_writer_version text := nullif(btrim(p_writer_version), '');
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;

  if v_namespace is null
     or char_length(v_namespace) > 64
     or v_namespace !~ '^[a-z0-9][a-z0-9_-]*$'
     or v_record_id is null
     or char_length(v_record_id) > 160 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_MUTATION';
  end if;
  if p_expected_version is not null and p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_VERSION';
  end if;

  if coalesce(p_delete, false) then
    if p_expected_version is null then
      raise exception using errcode = '22023', message = 'HH_SYNC_RECORD_VERSION_REQUIRED';
    end if;
  else
    if p_payload is null
       or jsonb_typeof(p_payload) <> 'object'
       or v_checksum is null
       or char_length(v_checksum) > 128 then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_MUTATION';
    end if;
  end if;

  select cutover_stage, metadata
  into v_stage, v_metadata
  from public.herdharbor_sync_manifest
  where user_id = v_user
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HH_SYNC_MANIFEST_MISSING';
  end if;
  if v_stage not in ('shadow', 'dual_write', 'normalized') then
    raise exception using errcode = '55000', message = 'HH_SYNC_RECORD_WRITER_STAGE_REQUIRED';
  end if;

  if v_stage in ('dual_write', 'normalized') then
    if v_metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb
       or nullif(btrim(v_metadata ->> 'normalized_writer_version'), '') is null then
      raise exception using errcode = '55000', message = 'HH_SYNC_NORMALIZED_WRITER_REQUIRED';
    end if;
    if v_writer_version is null
       or btrim(v_metadata ->> 'normalized_writer_version') <> v_writer_version then
      raise exception using errcode = '55000', message = 'HH_SYNC_WRITER_VERSION_MISMATCH';
    end if;
  end if;

  if v_stage = 'normalized'
     and v_metadata -> 'normalized_authority_ready' is distinct from 'true'::jsonb then
    raise exception using errcode = '55000', message = 'HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED';
  end if;

  if coalesce(p_delete, false) then
    update public.herdharbor_sync_records
    set deleted_at = now()
    where user_id = v_user
      and namespace = v_namespace
      and record_id = v_record_id
      and record_version = p_expected_version
      and deleted_at is null;
    get diagnostics v_rows = row_count;

    if v_rows <> 1 then
      raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
    end if;
  elsif p_expected_version is null then
    insert into public.herdharbor_sync_records (
      user_id,
      namespace,
      record_id,
      payload,
      payload_checksum,
      deleted_at
    )
    values (
      v_user,
      v_namespace,
      v_record_id,
      p_payload,
      v_checksum,
      null
    )
    on conflict (user_id, namespace, record_id) do nothing;
    get diagnostics v_rows = row_count;

    if v_rows <> 1 then
      raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
    end if;
  else
    update public.herdharbor_sync_records
    set
      payload = p_payload,
      payload_checksum = v_checksum,
      deleted_at = null
    where user_id = v_user
      and namespace = v_namespace
      and record_id = v_record_id
      and record_version = p_expected_version
      and deleted_at is null;
    get diagnostics v_rows = row_count;

    if v_rows <> 1 then
      raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
    end if;
  end if;

  select record_version, deleted_at
  into v_record_version, v_deleted_at
  from public.herdharbor_sync_records
  where user_id = v_user
    and namespace = v_namespace
    and record_id = v_record_id;

  update public.herdharbor_sync_manifest
  set
    normalized_verified_at = null,
    metadata = metadata || jsonb_build_object(
      'verified_checksum', null,
      'last_shadow_verified_at', null,
      'verification_record_count', null,
      'last_record_write_at', now()
    ),
    sync_generation = sync_generation + 1
  where user_id = v_user
  returning sync_generation into v_generation;

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'namespace', v_namespace,
    'record_id', v_record_id,
    'record_version', v_record_version,
    'deleted', v_deleted_at is not null,
    'generation', v_generation
  );
end;
$$;

-- Cohort status must remain usable for an account that is already normalized
-- even if an operator later disables its forward-rollout allowlist entry.
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
  v_stage text := 'legacy';
  v_metadata jsonb := '{}'::jsonb;
  v_authority_active boolean := false;
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
  ) into v_eligible;

  select cutover_stage, metadata
  into v_stage, v_metadata
  from public.herdharbor_sync_manifest
  where user_id = v_user;

  if not found then
    v_stage := 'legacy';
    v_metadata := '{}'::jsonb;
  end if;

  v_authority_active := v_stage = 'normalized';
  if v_authority_active
     and v_metadata -> 'normalized_authority_ready' is distinct from 'true'::jsonb then
    v_authority_active := false;
  end if;

  v_schema_verified := (
    to_regclass('public.herdharbor_sync_records') is not null
    and to_regclass('public.herdharbor_sync_manifest') is not null
    and to_regclass('public.herdharbor_sync_cohort') is not null
    and coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.herdharbor_sync_records')), false)
    and coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.herdharbor_sync_manifest')), false)
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
        and grantee = 'authenticated'
        and privilege_type <> 'SELECT'
    )
    and not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('herdharbor_sync_records', 'herdharbor_sync_manifest')
        and grantee = 'anon'
    )
    and not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'herdharbor_sync_cohort'
        and grantee in ('anon', 'authenticated')
    )
    and to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)') is not null
    and to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)') is not null
    and to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)') is not null
    and to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)') is not null
    and to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)') is not null
    and to_regprocedure('public.herdharbor_sync_activate_normalized_authority(bigint,text,text,integer,text)') is not null
    and to_regprocedure('public.herdharbor_sync_materialize_legacy_recovery(jsonb,bigint)') is not null
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_apply_batch(jsonb,jsonb,jsonb)'), 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_apply_record(text,text,jsonb,text,bigint,boolean,text)'), 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_mark_verified(bigint,text,integer)'), 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_prepare_normalized_writer_guarded(bigint,text,text,integer)'), 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_set_stage(text,bigint)'), 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_activate_normalized_authority(bigint,text,text,integer,text)'), 'EXECUTE'), false)
    and coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_materialize_legacy_recovery(jsonb,bigint)'), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.herdharbor_sync_prepare_normalized_writer(bigint,text,text,integer)'), 'EXECUTE'), false)
    and not exists (
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
          'herdharbor_sync_activate_normalized_authority',
          'herdharbor_sync_materialize_legacy_recovery',
          'herdharbor_sync_mark_verified',
          'herdharbor_sync_prepare_normalized_writer',
          'herdharbor_sync_prepare_normalized_writer_guarded',
          'herdharbor_sync_set_stage',
          'herdharbor_block_legacy_write_after_normalized'
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
    'schema_verified', v_schema_verified,
    'stage', v_stage,
    'authority_active', v_authority_active
  );
end;
$$;

revoke all on function public.herdharbor_sync_activate_normalized_authority(
  bigint, text, text, integer, text
) from public, anon, authenticated;
revoke all on function public.herdharbor_sync_materialize_legacy_recovery(
  jsonb, bigint
) from public, anon, authenticated;
revoke all on function public.herdharbor_sync_set_stage(
  text, bigint
) from public, anon, authenticated;
revoke all on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) from public, anon, authenticated;
revoke all on function public.herdharbor_sync_cohort_status()
from public, anon, authenticated;

grant execute on function public.herdharbor_sync_activate_normalized_authority(
  bigint, text, text, integer, text
) to authenticated;
grant execute on function public.herdharbor_sync_materialize_legacy_recovery(
  jsonb, bigint
) to authenticated;
grant execute on function public.herdharbor_sync_set_stage(
  text, bigint
) to authenticated;
grant execute on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) to authenticated;
grant execute on function public.herdharbor_sync_cohort_status()
to authenticated;

comment on function public.herdharbor_sync_activate_normalized_authority(
  bigint, text, text, integer, text
) is
  'Promotes an explicitly allowlisted, verified dual-write account to normalized authority after writer/format/legacy-guard checks.';

comment on function public.herdharbor_sync_materialize_legacy_recovery(
  jsonb, bigint
) is
  'Writes one generation-guarded normalized snapshot into the legacy compatibility row before rollback while stale legacy clients remain blocked.';

commit;
