-- HerdHarbor 2.0.2 account-scoped, server-side release recovery snapshots.
-- Capture once during operator-confirmed freeze BEFORE production cutover.
-- Existing account JSON, manifest, normalized record versions/tombstones are
-- copied verbatim from PostgreSQL rows; a user with no cloud rows is recorded
-- explicitly as an Auth-only identity, NOT as a fictitious empty cloud save.
-- No regular authenticated/anonymous client may read, mutate or purge backups.
begin;

create table if not exists public.herdharbor_202_release_snapshots (
  release_id text not null default '2.0.2',
  user_id uuid not null,
  captured_at timestamptz not null default pg_catalog.now(),
  legacy_row jsonb,
  manifest_row jsonb,
  normalized_rows jsonb not null default '[]'::jsonb,
  account_has_cloud_data boolean not null,
  source_sha256 text not null,
  primary key (release_id,user_id),
  constraint hh_202_release_id_check check (release_id = '2.0.2'),
  constraint hh_202_snapshot_sha_check check (source_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists public.herdharbor_202_release_snapshot_receipts (
  release_id text not null default '2.0.2',
  user_id uuid not null,
  source_sha256 text not null,
  cleared_at timestamptz not null default pg_catalog.now(),
  normalized_generation bigint not null,
  normalized_verified_at timestamptz not null,
  verified_readback_reference text not null,
  primary key (release_id,user_id)
);

alter table public.herdharbor_202_release_snapshots enable row level security;
alter table public.herdharbor_202_release_snapshot_receipts enable row level security;
revoke all on public.herdharbor_202_release_snapshots from public,anon,authenticated;
revoke all on public.herdharbor_202_release_snapshot_receipts from public,anon,authenticated;
-- Do not create client-facing RLS policies. Only privileged migration/operator
-- connections may inspect or remove recovery payloads.

create or replace function public.herdharbor_202_capture_release_snapshots()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $hh202capture$
declare
  v_total int;
  v_captured int;
  v_cloud int;
  v_unbacked_auth int;
  v_mismatch int;
begin
  -- An account's release source must NOT be updated while this runs.
  -- All data reads in this single INSERT SELECT use the same MVCC snapshot.
  with rows_to_capture as (
    select u.id as user_id,
      pg_catalog.to_jsonb(l) as legacy_row,
      pg_catalog.to_jsonb(m) as manifest_row,
      coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)
          order by r.namespace,r.record_id)
        from public.herdharbor_sync_records r
        where r.user_id = u.id
      ),'[]'::jsonb) as normalized_rows
    from auth.users u
    left join public.herdharbor_user_data l on l.user_id = u.id
    left join public.herdharbor_sync_manifest m on m.user_id = u.id
  )
  insert into public.herdharbor_202_release_snapshots (
    release_id,user_id,legacy_row,manifest_row,normalized_rows,
    account_has_cloud_data,source_sha256
  )
  select '2.0.2',r.user_id,r.legacy_row,r.manifest_row,r.normalized_rows,
    (r.legacy_row is not null or r.manifest_row is not null or
      pg_catalog.jsonb_array_length(r.normalized_rows)>0),
    pg_catalog.encode(extensions.digest(
      pg_catalog.jsonb_build_object('legacy',r.legacy_row,'manifest',r.manifest_row,
        'records',r.normalized_rows)::text::bytea,'sha256'),'hex')
  from rows_to_capture r
  on conflict (release_id,user_id) do nothing;

  select count(*) into v_total from auth.users;
  select count(*),count(*) filter (where account_has_cloud_data),
    count(*) filter (where not account_has_cloud_data)
  into v_captured,v_cloud,v_unbacked_auth
  from public.herdharbor_202_release_snapshots
  where release_id='2.0.2';

  if v_total <> v_captured then
    raise exception using errcode='23514',message='HH_202_SNAPSHOT_COHORT_COUNT_MISMATCH';
  end if;
  select count(*) into v_mismatch
  from public.herdharbor_202_release_snapshots s
  where s.release_id='2.0.2' and
    s.source_sha256 <> pg_catalog.encode(extensions.digest(
      pg_catalog.jsonb_build_object('legacy',s.legacy_row,
        'manifest',s.manifest_row,'records',s.normalized_rows)::text::bytea,
        'sha256'),'hex');
  if v_mismatch>0 then
    raise exception using errcode='23514',message='HH_202_SNAPSHOT_DIGEST_MISMATCH';
  end if;
  return pg_catalog.jsonb_build_object(
    'release_id','2.0.2','auth_accounts',v_total,
    'snapshot_accounts',v_captured,'with_cloud_data',v_cloud,
    'auth_only_no_server_data',v_unbacked_auth,'digest_mismatches',v_mismatch);
end;
$hh202capture$;

-- Operator-only destructive cleanup. No login alone triggers deletion.
-- Requires exact retained SHA, post-snapshot verified normalized authority,
-- a newer completed Auth sign-in, and an independent, recorded application
-- readback reference. The receipt remains after the backup payload is gone.
create or replace function public.herdharbor_202_purge_verified_snapshot(
  p_user_id uuid,p_source_sha256 text,p_readback_reference text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $hh202purge$
declare
  v_snapshot public.herdharbor_202_release_snapshots%rowtype;
  v_manifest public.herdharbor_sync_manifest%rowtype;
  v_last_login timestamptz;
begin
  select * into v_snapshot from public.herdharbor_202_release_snapshots
   where release_id='2.0.2' and user_id=p_user_id for update;
  if not found then raise exception using errcode='22023',message='HH_202_NO_SNAPSHOT_TO_PURGE'; end if;
  if p_source_sha256 is distinct from v_snapshot.source_sha256 or
     pg_catalog.length(pg_catalog.btrim(coalesce(p_readback_reference,'')))<16 then
    raise exception using errcode='22023',message='HH_202_PURGE_READBACK_PROOF_REQUIRED';
  end if;

  select * into v_manifest from public.herdharbor_sync_manifest where user_id=p_user_id;
  select last_sign_in_at into v_last_login from auth.users where id=p_user_id;
  if not found or v_manifest.cutover_stage <> 'normalized' or
     v_manifest.metadata -> 'normalized_authority_ready' is distinct from 'true'::jsonb or
     v_manifest.metadata -> 'normalized_writer_ready' is distinct from 'true'::jsonb or
     v_manifest.normalized_verified_at is null or
     v_manifest.normalized_verified_at <= v_snapshot.captured_at or
     v_last_login is null or v_last_login <= v_snapshot.captured_at then
    raise exception using errcode='23514',message='HH_202_PURGE_VERIFIED_SIGNIN_AND_AUTHORITY_REQUIRED';
  end if;

  insert into public.herdharbor_202_release_snapshot_receipts(
    release_id,user_id,source_sha256,normalized_generation,
    normalized_verified_at,verified_readback_reference)
  values('2.0.2',p_user_id,p_source_sha256,
    v_manifest.sync_generation,v_manifest.normalized_verified_at,
    pg_catalog.left(p_readback_reference,256));

  delete from public.herdharbor_202_release_snapshots
   where release_id='2.0.2' and user_id=p_user_id;
  return true;
end;
$hh202purge$;

revoke all on function public.herdharbor_202_capture_release_snapshots() from public,anon,authenticated,service_role;
revoke all on function public.herdharbor_202_purge_verified_snapshot(uuid,text,text) from public,anon,authenticated,service_role;
comment on table public.herdharbor_202_release_snapshots is
  'Operator-only immutable pre-cutover cloud account recovery snapshots for HerdHarbor 2.0.2; no browser/client access.';
comment on table public.herdharbor_202_release_snapshot_receipts is
  'Operator proof receipts after verified normalization and post-release signed-in recovery; source payload removed only after separate readback evidence.';
commit;
