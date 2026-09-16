-- HerdHarbor v1.8.3
-- Controlled normalized cloud-sync stage transitions.
-- Apply after v1.8.3-cloud-sync-normalized-records.sql.
--
-- This migration changes only the new v1.8.3 sync manifest/function layer. It
-- does not read, update, copy, or delete public.herdharbor_user_data.

begin;

create or replace function public.herdharbor_touch_sync_manifest()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_verified_checksum text;
  v_source_checksum text;
  v_record_count text;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' and new.cutover_stage <> 'legacy' then
    raise exception using
      errcode = '23514',
      message = 'HH_SYNC_INITIAL_STAGE_MUST_BE_LEGACY';
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
      raise exception using
        errcode = '23514',
        message = 'HH_SYNC_INVALID_STAGE_TRANSITION';
    end if;

    if (
      (old.cutover_stage = 'shadow' and new.cutover_stage = 'dual_write')
      or (old.cutover_stage = 'dual_write' and new.cutover_stage = 'normalized')
    ) then
      v_verified_checksum := nullif(btrim(new.metadata ->> 'verified_checksum'), '');
      v_source_checksum := nullif(btrim(new.metadata ->> 'source_checksum'), '');
      v_record_count := nullif(btrim(new.metadata ->> 'verification_record_count'), '');

      if new.normalized_verified_at is null
         or v_verified_checksum is null
         or v_source_checksum is null
         or v_verified_checksum <> v_source_checksum
         or v_record_count is null
         or v_record_count !~ '^[0-9]+$' then
        raise exception using
          errcode = '23514',
          message = 'HH_SYNC_STAGE_VERIFICATION_REQUIRED';
      end if;
    end if;
  end if;

  if new.cutover_stage = 'normalized' then
    v_verified_checksum := nullif(btrim(new.metadata ->> 'verified_checksum'), '');
    v_source_checksum := nullif(btrim(new.metadata ->> 'source_checksum'), '');
    if new.normalized_verified_at is null
       or v_verified_checksum is null
       or v_source_checksum is null
       or v_verified_checksum <> v_source_checksum then
      raise exception using
        errcode = '23514',
        message = 'HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists herdharbor_sync_manifest_touch on public.herdharbor_sync_manifest;
create trigger herdharbor_sync_manifest_touch
before insert or update on public.herdharbor_sync_manifest
for each row execute function public.herdharbor_touch_sync_manifest();

-- Tighten verification recording so the checksum being certified must still
-- equal the checksum from the last successful normalized write batch.
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
    and cutover_stage in ('shadow', 'dual_write')
    and nullif(btrim(metadata ->> 'source_checksum'), '') = p_checksum;
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

-- Stage promotion/rollback is a generation-CAS operation. The manifest trigger
-- above enforces the legal transition graph and verification requirements.
create or replace function public.herdharbor_sync_set_stage(
  p_target_stage text,
  p_expected_generation bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_current_stage text;
  v_generation bigint;
  v_verified_at timestamptz;
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

  if v_current_stage <> p_target_stage then
    update public.herdharbor_sync_manifest
    set cutover_stage = p_target_stage
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
    'normalized_verified_at', v_verified_at
  );
end;
$$;

revoke all on function public.herdharbor_sync_set_stage(text, bigint) from public;
grant execute on function public.herdharbor_sync_set_stage(text, bigint) to authenticated;

comment on function public.herdharbor_sync_set_stage(text, bigint) is
  'Generation-guarded promotion/rollback for v1.8.3 normalized cloud sync. Transition validity is enforced by the sync manifest trigger.';

commit;
