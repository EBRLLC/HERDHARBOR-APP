-- HerdHarbor v1.8.4
-- Record-level normalized writer.
--
-- This RPC intentionally does not require an account-wide expected sync
-- generation. Concurrency safety is scoped to the target record through
-- record_version compare-and-swap, so unrelated records do not block each
-- other. The manifest row is locked only long enough to validate rollout
-- stage/writer readiness and advance verification metadata after a successful
-- record commit.
--
-- This migration does not create manifests, advance rollout stages, backfill
-- normalized data, or mutate public.herdharbor_user_data.

begin;

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

  if coalesce(p_delete, false) then
    update public.herdharbor_sync_records
    set deleted_at = now()
    where user_id = v_user
      and namespace = v_namespace
      and record_id = v_record_id
      and record_version = p_expected_version;
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
      and record_version = p_expected_version;
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

revoke all on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) from public, anon, authenticated;

grant execute on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) to authenticated;

comment on function public.herdharbor_sync_apply_record(
  text, text, jsonb, text, bigint, boolean, text
) is
  'Applies one normalized record mutation with record_version CAS so unrelated records do not share a conflict boundary. Requires an existing shadow/dual_write/normalized manifest and never advances rollout stage.';

commit;
