-- Adjust existing 2.0.2 release escrow digest for authentic legacy JSON.
-- PostgreSQL text::bytea parses backslash escape syntax; real app JSON may
-- contain literal \\x sequences that are not valid bytea hex input.
-- convert_to(...,'UTF8') encodes JSON reliably without interpreting data.
begin;
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
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('legacy',r.legacy_row,'manifest',r.manifest_row,
        'records',r.normalized_rows)::text,'UTF8'),'sha256'),'hex')
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
    s.source_sha256 <> pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('legacy',s.legacy_row,
        'manifest',s.manifest_row,'records',s.normalized_rows)::text,'UTF8'),'sha256'),'hex');
  if v_mismatch>0 then
    raise exception using errcode='23514',message='HH_202_SNAPSHOT_DIGEST_MISMATCH';
  end if;
  return pg_catalog.jsonb_build_object(
    'release_id','2.0.2','auth_accounts',v_total,
    'snapshot_accounts',v_captured,'with_cloud_data',v_cloud,
    'auth_only_no_server_data',v_unbacked_auth,'digest_mismatches',v_mismatch);
end;
$hh202capture$;
commit;
