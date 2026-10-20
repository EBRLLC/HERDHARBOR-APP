-- S20 / 2.0.1: accounts created AFTER deployment start normalized-only.
-- No backfill, no production cohort change, no legacy cloud row is created.
-- Apply this migration on staging BEFORE publishing the matching 2.0.1 client.
-- Existing users remain unchanged until their individually verified S18 cutover.
begin;

create or replace function public.herdharbor_initialize_normalized_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $s20$
declare
  v_empty_checksum constant text := 'hh64:5465b825fabc98ff';
  v_checkpoint_payload constant jsonb := jsonb_build_object(
    'kind', 'snapshot_manifest',
    'format_version', 2,
    'snapshot_checksum', 'hh64:5465b825fabc98ff',
    'entry_count', 0,
    'entries', '[]'::jsonb
  );
  v_checkpoint_checksum constant text := 'hh64:976db5f570268d3b';
begin
  if new.id is null or tg_op <> 'INSERT' then
    raise exception using errcode='22023',message='HH_S20_SIGNUP_INSERT_REQUIRED';
  end if;

  -- This trigger runs in the same transaction that creates auth.users.
  -- Never initialize an account over pre-existing farm data.
  if exists (select 1 from public.herdharbor_user_data where user_id=new.id)
     or exists (select 1 from public.herdharbor_sync_manifest where user_id=new.id)
     or exists (select 1 from public.herdharbor_sync_records where user_id=new.id) then
    raise exception using errcode='23514',message='HH_S20_SIGNUP_ALREADY_HAS_DATA';
  end if;

  insert into public.herdharbor_sync_cohort(user_id,enabled,cohort)
  values(new.id,true,'internal_test');

  -- Existing guarded manifest trigger mandates adjacent transitions.
  -- These transient states are private to this ONE uncommitted transaction.
  -- No legacy application state is written at any point.
  insert into public.herdharbor_sync_manifest (
    user_id,schema_version,cutover_stage,sync_generation,
    normalized_verified_at,metadata
  ) values (
    new.id,2,'legacy',0,now(),
    jsonb_build_object(
      'source_checksum',v_empty_checksum,
      'verified_checksum',v_empty_checksum,
      'normalized_record_count',1,
      'verification_record_count',1,
      'normalized_namespace','legacy-state',
      'normalized_format_version',2,
      'normalized_writer_ready',true,
      'normalized_writer_version','record-cas-v1',
      'normalized_authority_ready',true,
      'normalized_authority_version','record-authority-v1',
      'legacy_recovery_lock',false,
      's20_signup_normalized_only',true,
      'normalized_authority_activated_at',now()
    )
  );

  insert into public.herdharbor_sync_records(
    user_id,namespace,record_id,payload,payload_checksum
  ) values (
    new.id,'legacy-state','snapshot-manifest',
    v_checkpoint_payload,v_checkpoint_checksum
  );

  update public.herdharbor_sync_manifest
    set cutover_stage='shadow'
    where user_id=new.id and cutover_stage='legacy';
  if not found then raise exception 'HH_S20_SIGNUP_SHADOW_FAILED'; end if;

  update public.herdharbor_sync_manifest
    set cutover_stage='dual_write'
    where user_id=new.id and cutover_stage='shadow';
  if not found then raise exception 'HH_S20_SIGNUP_DUAL_WRITE_FAILED'; end if;

  update public.herdharbor_sync_manifest
    set cutover_stage='normalized'
    where user_id=new.id and cutover_stage='dual_write';
  if not found then raise exception 'HH_S20_SIGNUP_AUTHORITY_FAILED'; end if;

  -- A normalized-only signup is NOT in the internal legacy migration cohort.
  delete from public.herdharbor_sync_cohort where user_id=new.id;

  if exists (select 1 from public.herdharbor_user_data where user_id=new.id) then
    raise exception 'HH_S20_UNEXPECTED_LEGACY_ROW';
  end if;
  return new;
end;
$s20$;

revoke all on function public.herdharbor_initialize_normalized_signup()
  from public, anon, authenticated;

drop trigger if exists hh_s20_initialize_normalized_account on auth.users;
create trigger hh_s20_initialize_normalized_account
  after insert on auth.users
  for each row execute function public.herdharbor_initialize_normalized_signup();

-- Anonymous callers receive only a boolean readiness signal. Never expose
-- auth.users, the cohort, or any account identifiers through this endpoint.
-- This prevents a newer client from creating accounts through a legacy
-- registration path if the database migration was not installed first.
create or replace function public.herdharbor_normalized_signup_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $s20_signup_ready$
  select exists (
    select 1
      from pg_catalog.pg_trigger t
     where t.tgrelid = to_regclass('auth.users')
       and t.tgname = 'hh_s20_initialize_normalized_account'
       and t.tgenabled in ('O', 'A')
       and not t.tgisinternal
  ) and to_regprocedure('public.herdharbor_initialize_normalized_signup()') is not null
    and to_regclass('public.herdharbor_sync_records') is not null
    and to_regclass('public.herdharbor_sync_manifest') is not null;
$s20_signup_ready$;

revoke all on function public.herdharbor_normalized_signup_ready()
  from public, anon, authenticated;
grant execute on function public.herdharbor_normalized_signup_ready()
  to anon, authenticated;

-- PostgREST must see the new RPC before the corresponding client build ships.
notify pgrst, 'reload schema';

comment on function public.herdharbor_initialize_normalized_signup() is
  'S20: create a canonical normalized empty record checkpoint and authoritative manifest for each NEW auth user; no legacy data row. Fail the signup transaction on any verification failure.';

commit;
