-- HerdHarbor v1.8.3
-- Stale-client write guard for the final normalized cutover.
--
-- Apply only after v1.8.3-cloud-sync-normalized-records.sql. This migration
-- intentionally does not modify any existing herdharbor_user_data row. It adds
-- a trigger that blocks future legacy mutations only while that user's sync
-- manifest says normalized state is authoritative. Rolling back to dual_write
-- automatically re-enables legacy writes.

begin;

create or replace function public.herdharbor_block_legacy_write_after_normalized()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_stage text;
begin
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if v_user is null then
    raise exception using errcode = '22023', message = 'HH_SYNC_LEGACY_GUARD_USER_REQUIRED';
  end if;

  select cutover_stage
  into v_stage
  from public.herdharbor_sync_manifest
  where user_id = v_user;

  if v_stage = 'normalized' then
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

revoke all on function public.herdharbor_block_legacy_write_after_normalized() from public;
revoke all on function public.herdharbor_block_legacy_write_after_normalized() from authenticated;

drop trigger if exists herdharbor_legacy_write_cutover_guard on public.herdharbor_user_data;
create trigger herdharbor_legacy_write_cutover_guard
before insert or update or delete on public.herdharbor_user_data
for each row execute function public.herdharbor_block_legacy_write_after_normalized();

-- The browser must prepare its normalized writer through this guarded wrapper.
-- If this migration or its trigger was omitted/disabled, preparation fails and
-- the existing normalized_writer_ready cutover requirement remains false.
create or replace function public.herdharbor_sync_prepare_normalized_writer_guarded(
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
  v_guard_ready boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'HH_SYNC_AUTH_REQUIRED';
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

  return public.herdharbor_sync_prepare_normalized_writer(
    p_expected_generation,
    p_writer_version,
    p_namespace,
    p_format_version
  );
end;
$$;

-- Remove the unguarded browser path once the cutover guard migration is
-- installed. Internal database ownership still allows the guarded wrapper to
-- invoke it.
revoke execute on function public.herdharbor_sync_prepare_normalized_writer(bigint, text, text, integer) from authenticated;
revoke all on function public.herdharbor_sync_prepare_normalized_writer_guarded(bigint, text, text, integer) from public;
grant execute on function public.herdharbor_sync_prepare_normalized_writer_guarded(bigint, text, text, integer) to authenticated;

comment on function public.herdharbor_block_legacy_write_after_normalized() is
  'Blocks stale clients from mutating the legacy full-state row while normalized sync is authoritative; rollback re-enables legacy writes.';
comment on function public.herdharbor_sync_prepare_normalized_writer_guarded(bigint, text, text, integer) is
  'Prepares normalized-writer readiness only when the stale-client legacy-write guard is installed and enabled.';

commit;
