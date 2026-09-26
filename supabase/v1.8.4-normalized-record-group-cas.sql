-- HerdHarbor v1.8.4
-- Atomic logical-record writer for normalized synchronization.
--
-- Multi-row logical mutations such as array membership create/delete must be
-- committed as one PostgreSQL transaction. This prevents a new item from
-- becoming orphaned when its array manifest CAS fails, and prevents a delete
-- from removing manifest membership while the tombstone write conflicts.

begin;

create or replace function public.herdharbor_sync_apply_record_group(
  p_operations jsonb,
  p_writer_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_stage text;
  v_metadata jsonb;
  v_writer_version text := nullif(btrim(p_writer_version), '');
  v_operation jsonb;
  v_namespace text;
  v_record_id text;
  v_payload jsonb;
  v_checksum text;
  v_expected bigint;
  v_delete boolean;
  v_rows integer;
  v_record_version bigint;
  v_deleted_at timestamptz;
  v_generation bigint;
  v_operation_count integer;
  v_results jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_key text;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
  end if;

  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_GROUP';
  end if;

  v_operation_count := jsonb_array_length(p_operations);
  if v_operation_count < 1 or v_operation_count > 16 then
    raise exception using errcode = '54000', message = 'HH_SYNC_RECORD_GROUP_LIMIT';
  end if;

  select cutover_stage, metadata
  into v_stage, v_metadata
  from public.herdharbor_sync_manifest
  where user_id = v_user;

  if not found then
    raise exception using errcode = 'P0002', message = 'HH_SYNC_MANIFEST_MISSING';
  end if;
  if v_stage not in ('shadow', 'dual_write', 'normalized') then
    raise exception using errcode = '55000', message = 'HH_SYNC_RECORD_WRITER_STAGE_REQUIRED';
  end if;
  if v_metadata -> 'legacy_recovery_lock' = 'true'::jsonb then
    raise exception using errcode = '55000', message = 'HH_SYNC_RECOVERY_IN_PROGRESS';
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

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_operation) <> 'object' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_GROUP';
    end if;

    v_namespace := nullif(btrim(v_operation ->> 'namespace'), '');
    v_record_id := nullif(v_operation ->> 'record_id', '');
    v_checksum := nullif(btrim(v_operation ->> 'payload_checksum'), '');
    v_payload := v_operation -> 'payload';

    if v_operation ? 'deleted' and jsonb_typeof(v_operation -> 'deleted') <> 'boolean' then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_GROUP';
    end if;
    v_delete := coalesce((v_operation ->> 'deleted')::boolean, false);

    if v_namespace is null
       or char_length(v_namespace) > 64
       or v_namespace !~ '^[a-z0-9][a-z0-9_-]*$'
       or v_record_id is null
       or char_length(v_record_id) > 160 then
      raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_MUTATION';
    end if;

    v_key := v_namespace || ':' || v_record_id;
    if v_key = any(v_seen) then
      raise exception using errcode = '22023', message = 'HH_SYNC_DUPLICATE_RECORD_MUTATION';
    end if;
    v_seen := array_append(v_seen, v_key);

    v_expected := null;
    if v_operation ? 'expected_version' and v_operation ->> 'expected_version' is not null then
      if (v_operation ->> 'expected_version') !~ '^[1-9][0-9]*$' then
        raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_VERSION';
      end if;
      v_expected := (v_operation ->> 'expected_version')::bigint;
    end if;

    if v_delete then
      if v_expected is null then
        raise exception using errcode = '22023', message = 'HH_SYNC_RECORD_VERSION_REQUIRED';
      end if;

      update public.herdharbor_sync_records
      set deleted_at = now()
      where user_id = v_user
        and namespace = v_namespace
        and record_id = v_record_id
        and record_version = v_expected
        and deleted_at is null;
      get diagnostics v_rows = row_count;
    else
      if v_payload is null
         or jsonb_typeof(v_payload) <> 'object'
         or v_checksum is null
         or char_length(v_checksum) > 128 then
        raise exception using errcode = '22023', message = 'HH_SYNC_INVALID_RECORD_MUTATION';
      end if;

      if v_expected is null then
        insert into public.herdharbor_sync_records (
          user_id, namespace, record_id, payload, payload_checksum, deleted_at
        ) values (
          v_user, v_namespace, v_record_id, v_payload, v_checksum, null
        )
        on conflict (user_id, namespace, record_id) do nothing;
        get diagnostics v_rows = row_count;
      else
        update public.herdharbor_sync_records
        set payload = v_payload,
            payload_checksum = v_checksum,
            deleted_at = null
        where user_id = v_user
          and namespace = v_namespace
          and record_id = v_record_id
          and record_version = v_expected
          and deleted_at is null;
        get diagnostics v_rows = row_count;
      end if;
    end if;

    if v_rows <> 1 then
      raise exception using errcode = '40001', message = 'HH_SYNC_CONFLICT';
    end if;

    select record_version, deleted_at
    into v_record_version, v_deleted_at
    from public.herdharbor_sync_records
    where user_id = v_user
      and namespace = v_namespace
      and record_id = v_record_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'namespace', v_namespace,
      'record_id', v_record_id,
      'record_version', v_record_version,
      'deleted', v_deleted_at is not null
    ));
  end loop;

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
    and cutover_stage = v_stage
    and coalesce(metadata -> 'legacy_recovery_lock' = 'true'::jsonb, false) = false
    and (
      v_stage = 'shadow'
      or (
        metadata -> 'normalized_writer_ready' = 'true'::jsonb
        and btrim(coalesce(metadata ->> 'normalized_writer_version', '')) = v_writer_version
      )
    )
    and (
      v_stage <> 'normalized'
      or metadata -> 'normalized_authority_ready' = 'true'::jsonb
    )
  returning sync_generation into v_generation;

  if v_generation is null then
    raise exception using errcode = '40001', message = 'HH_SYNC_STAGE_CHANGED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'generation', v_generation,
    'operations', v_results
  );
end;
$$;

revoke all on function public.herdharbor_sync_apply_record_group(jsonb, text)
from public, anon, authenticated;

grant execute on function public.herdharbor_sync_apply_record_group(jsonb, text)
to authenticated;

comment on function public.herdharbor_sync_apply_record_group(jsonb, text) is
  'Atomically applies one logical normalized mutation group so item/manifest membership changes cannot partially commit.';

commit;
