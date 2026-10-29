-- HerdHarbor 2.0.2 — fail-closed normalized -> legacy recovery guard.
-- Apply only after normalized foundation, record CAS, and authority cutover.
-- This guard is additive and leaves existing data and authority unchanged.
-- A fresh recovery materialization is necessary but NOT sufficient to prove
-- application-data parity: the operator must independently verify the restored
-- snapshot against the latest normalized records before downgrading authority.

begin;

create or replace function public.herdharbor_sync_require_fresh_legacy_recovery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_materialized_at timestamptz;
begin
  if old.cutover_stage is distinct from 'normalized'
     or new.cutover_stage = 'normalized' then
    return new;
  end if;

  if new.cutover_stage <> 'dual_write' then
    raise exception using errcode = '55000',
      message = 'HH_SYNC_RECOVERY_INVALID_DOWNGRADE';
  end if;

  if old.metadata -> 'legacy_recovery_lock' is distinct from 'true'::jsonb
     or nullif(old.metadata ->> 'legacy_recovery_materialized_at', '') is null then
    raise exception using errcode = '55000',
      message = 'HH_SYNC_RECOVERY_MATERIALIZATION_REQUIRED';
  end if;

  begin
    v_materialized_at := (old.metadata ->> 'legacy_recovery_materialized_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023',
      message = 'HH_SYNC_RECOVERY_TIMESTAMP_INVALID';
  end;

  if v_materialized_at is null or v_materialized_at > pg_catalog.now() then
    raise exception using errcode = '55000',
      message = 'HH_SYNC_RECOVERY_TIMESTAMP_INVALID';
  end if;

  -- Prevent a materialization followed by new CAS writes from being used as
  -- stale rollback proof. Tombstones and resurrected records count as writes.
  if exists (
    select 1 from public.herdharbor_sync_records r
    where r.user_id = old.user_id
      and r.updated_at > v_materialized_at
  ) then
    raise exception using errcode = '40001',
      message = 'HH_SYNC_RECOVERY_STALE_NORMALIZED_RECORDS';
  end if;

  if not exists (
    select 1 from public.herdharbor_user_data d
    where d.user_id = old.user_id
      and d.updated_at >= v_materialized_at
  ) then
    raise exception using errcode = '55000',
      message = 'HH_SYNC_RECOVERY_LEGACY_SNAPSHOT_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.herdharbor_sync_require_fresh_legacy_recovery() from public;
revoke all on function public.herdharbor_sync_require_fresh_legacy_recovery() from anon;
revoke all on function public.herdharbor_sync_require_fresh_legacy_recovery() from authenticated;

drop trigger if exists hh_sync_require_fresh_legacy_recovery on public.herdharbor_sync_manifest;
create trigger hh_sync_require_fresh_legacy_recovery
before update of cutover_stage on public.herdharbor_sync_manifest
for each row execute function public.herdharbor_sync_require_fresh_legacy_recovery();

commit;
