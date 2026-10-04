-- HerdHarbor revised Stack C6A — Owner-only Marketplace administration + moderation.
-- Reuses the protected account_role='owner' authority. No second admin identity system.

create or replace function public.marketplace_owner_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c6_summary$
declare
  actor uuid := auth.uid();
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  return jsonb_build_object(
    'open_reports', (select count(*) from public.marketplace_reports r where r.status in ('open','reviewing')),
    'suspended_sellers', (select count(*) from public.marketplace_public_profiles p where p.marketplace_status='suspended'),
    'removed_listings', (select count(*) from public.marketplace_listings l where l.state='removed'),
    'active_sellers', (select count(*) from public.marketplace_public_profiles p where p.marketplace_status='active'),
    'available_listings', (select count(*) from public.marketplace_listings l
      join public.marketplace_public_profiles p on p.user_id=l.seller_id
      where l.state='available' and p.marketplace_status='active')
  );
end
$c6_summary$;

revoke all on function public.marketplace_owner_admin_summary() from public, anon;
grant execute on function public.marketplace_owner_admin_summary() to authenticated;

create or replace function public.marketplace_owner_admin_reports(
  status_value text default ''
)
returns table (
  report_id uuid,
  target_type text,
  target_id text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  target_label text,
  target_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $c6_reports$
declare
  actor uuid := auth.uid();
  safe_status text := lower(btrim(coalesce(status_value,'')));
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if safe_status <> '' and safe_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode='22023';
  end if;

  return query
  select
    r.id,
    r.target_type,
    r.target_id,
    r.reason,
    r.details,
    r.status,
    r.created_at,
    r.resolved_at,
    case
      when r.target_type='listing' then coalesce(l.animal_name,'Listing unavailable')
      when r.target_type='user' then coalesce(nullif(p.rabbitry_name,''),nullif(p.display_name,''),'Seller unavailable')
      else initcap(replace(r.target_type,'_',' '))
    end as target_label,
    case
      when r.target_type='listing' then coalesce(l.state,'unavailable')
      when r.target_type='user' then coalesce(p.marketplace_status,'unavailable')
      else ''
    end as target_state
  from public.marketplace_reports r
  left join public.marketplace_listings l
    on r.target_type='listing'
   and r.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and l.id=r.target_id::uuid
  left join public.marketplace_public_profiles p
    on r.target_type='user'
   and r.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and p.public_id=r.target_id::uuid
  where safe_status='' or r.status=safe_status
  order by
    case r.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    r.created_at asc,
    r.id;
end
$c6_reports$;

revoke all on function public.marketplace_owner_admin_reports(text) from public, anon;
grant execute on function public.marketplace_owner_admin_reports(text) to authenticated;

create or replace function public.marketplace_owner_admin_sellers(
  status_value text default '',
  query_value text default '',
  limit_value integer default 100,
  offset_value integer default 0
)
returns table (
  public_id uuid,
  display_name text,
  rabbitry_name text,
  city text,
  region text,
  verification_status text,
  marketplace_status text,
  active_listing_count bigint,
  removed_listing_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $c6_sellers$
declare
  actor uuid := auth.uid();
  safe_status text := lower(btrim(coalesce(status_value,'')));
  safe_query text := left(btrim(coalesce(query_value,'')),120);
  safe_limit integer := least(greatest(coalesce(limit_value,100),1),200);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if safe_status <> '' and safe_status not in ('active','suspended','closed') then
    raise exception 'Invalid seller status' using errcode='22023';
  end if;

  return query
  select
    p.public_id,
    p.display_name,
    p.rabbitry_name,
    p.city,
    p.region,
    p.verification_status,
    p.marketplace_status,
    count(*) filter (where l.state='available')::bigint,
    count(*) filter (where l.state='removed')::bigint,
    p.updated_at
  from public.marketplace_public_profiles p
  left join public.marketplace_listings l on l.seller_id=p.user_id
  where (safe_status='' or p.marketplace_status=safe_status)
    and (
      safe_query=''
      or p.display_name ilike '%' || safe_query || '%'
      or p.rabbitry_name ilike '%' || safe_query || '%'
      or p.city ilike '%' || safe_query || '%'
      or p.region ilike '%' || safe_query || '%'
    )
  group by
    p.public_id,p.display_name,p.rabbitry_name,p.city,p.region,
    p.verification_status,p.marketplace_status,p.updated_at
  order by
    case p.marketplace_status when 'suspended' then 0 when 'active' then 1 else 2 end,
    p.updated_at desc,
    p.public_id
  limit safe_limit offset safe_offset;
end
$c6_sellers$;

revoke all on function public.marketplace_owner_admin_sellers(text,text,integer,integer) from public, anon;
grant execute on function public.marketplace_owner_admin_sellers(text,text,integer,integer) to authenticated;

create or replace function public.marketplace_owner_admin_listings(
  state_value text default '',
  query_value text default '',
  limit_value integer default 100,
  offset_value integer default 0
)
returns table (
  listing_id uuid,
  animal_name text,
  species text,
  breed text,
  sex text,
  price_cents bigint,
  currency text,
  location_city text,
  location_region text,
  listing_state text,
  seller_public_id uuid,
  seller_name text,
  seller_status text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $c6_listings$
declare
  actor uuid := auth.uid();
  safe_state text := lower(btrim(coalesce(state_value,'')));
  safe_query text := left(btrim(coalesce(query_value,'')),120);
  safe_limit integer := least(greatest(coalesce(limit_value,100),1),200);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if safe_state <> '' and safe_state not in ('draft','available','pending','sold','archived','expired','removed') then
    raise exception 'Invalid listing state' using errcode='22023';
  end if;

  return query
  select
    l.id,
    l.animal_name,
    l.species,
    l.breed,
    l.sex,
    l.price_cents,
    l.currency,
    l.location_city,
    l.location_region,
    l.state,
    p.public_id,
    coalesce(nullif(p.rabbitry_name,''),nullif(p.display_name,''),'HerdHarbor seller'),
    p.marketplace_status,
    l.updated_at
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where (safe_state='' or l.state=safe_state)
    and (
      safe_query=''
      or l.animal_name ilike '%' || safe_query || '%'
      or l.breed ilike '%' || safe_query || '%'
      or l.variety_color ilike '%' || safe_query || '%'
      or p.display_name ilike '%' || safe_query || '%'
      or p.rabbitry_name ilike '%' || safe_query || '%'
      or l.location_city ilike '%' || safe_query || '%'
      or l.location_region ilike '%' || safe_query || '%'
    )
  order by
    case l.state when 'removed' then 0 when 'available' then 1 else 2 end,
    l.updated_at desc,
    l.id
  limit safe_limit offset safe_offset;
end
$c6_listings$;

revoke all on function public.marketplace_owner_admin_listings(text,text,integer,integer) from public, anon;
grant execute on function public.marketplace_owner_admin_listings(text,text,integer,integer) to authenticated;

create or replace function public.marketplace_owner_admin_moderate_listing(
  listing_id_value uuid,
  action_value text,
  reason_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $c6_mod_listing$
declare
  actor uuid := auth.uid();
  action_name text := lower(btrim(coalesce(action_value,'')));
  reason_text text := left(btrim(coalesce(reason_value,'')),1000);
  prior_state text;
  next_state text;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if action_name not in ('remove','restore_to_draft') then
    raise exception 'Unsupported listing moderation action' using errcode='22023';
  end if;

  if reason_text='' then
    raise exception 'Moderation reason is required' using errcode='22023';
  end if;

  select l.state into prior_state
  from public.marketplace_listings l
  where l.id=listing_id_value
  for update;

  if not found then
    raise exception 'Marketplace listing is unavailable' using errcode='22023';
  end if;

  next_state := case action_name when 'remove' then 'removed' else 'draft' end;

  update public.marketplace_listings
  set state=next_state,
      updated_at=now(),
      published_at=case when next_state='draft' then null else published_at end
  where id=listing_id_value;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,
    case action_name when 'remove' then 'remove_listing' else 'restore_listing_to_draft' end,
    'listing',
    listing_id_value::text,
    reason_text,
    jsonb_build_object('previous_state',prior_state,'next_state',next_state)
  );

  return jsonb_build_object(
    'listing_id',listing_id_value,
    'previous_state',prior_state,
    'state',next_state
  );
end
$c6_mod_listing$;

revoke all on function public.marketplace_owner_admin_moderate_listing(uuid,text,text) from public, anon;
grant execute on function public.marketplace_owner_admin_moderate_listing(uuid,text,text) to authenticated;

create or replace function public.marketplace_owner_admin_moderate_seller(
  seller_public_id_value uuid,
  action_value text,
  reason_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $c6_mod_seller$
declare
  actor uuid := auth.uid();
  action_name text := lower(btrim(coalesce(action_value,'')));
  reason_text text := left(btrim(coalesce(reason_value,'')),1000);
  prior_status text;
  next_status text;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if action_name not in ('suspend','reactivate','close') then
    raise exception 'Unsupported seller moderation action' using errcode='22023';
  end if;

  if reason_text='' then
    raise exception 'Moderation reason is required' using errcode='22023';
  end if;

  select p.marketplace_status into prior_status
  from public.marketplace_public_profiles p
  where p.public_id=seller_public_id_value
  for update;

  if not found then
    raise exception 'Marketplace seller is unavailable' using errcode='22023';
  end if;

  next_status := case action_name
    when 'suspend' then 'suspended'
    when 'reactivate' then 'active'
    else 'closed'
  end;

  update public.marketplace_public_profiles
  set marketplace_status=next_status,
      updated_at=now()
  where public_id=seller_public_id_value;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,
    case action_name
      when 'suspend' then 'suspend_marketplace'
      when 'reactivate' then 'reactivate_marketplace'
      else 'close_marketplace'
    end,
    'user',
    seller_public_id_value::text,
    reason_text,
    jsonb_build_object('previous_status',prior_status,'next_status',next_status)
  );

  return jsonb_build_object(
    'seller_public_id',seller_public_id_value,
    'previous_status',prior_status,
    'marketplace_status',next_status
  );
end
$c6_mod_seller$;

revoke all on function public.marketplace_owner_admin_moderate_seller(uuid,text,text) from public, anon;
grant execute on function public.marketplace_owner_admin_moderate_seller(uuid,text,text) to authenticated;

create or replace function public.marketplace_owner_admin_resolve_report(
  report_id_value uuid,
  resolution_value text,
  reason_value text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $c6_resolve_report$
declare
  actor uuid := auth.uid();
  resolution_name text := lower(btrim(coalesce(resolution_value,'')));
  reason_text text := left(btrim(coalesce(reason_value,'')),1000);
  report_row public.marketplace_reports%rowtype;
  target_uuid uuid;
  prior_state text;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if resolution_name not in ('dismiss','resolve','remove_listing','suspend_seller') then
    raise exception 'Unsupported report resolution' using errcode='22023';
  end if;

  select * into report_row
  from public.marketplace_reports
  where id=report_id_value
  for update;

  if not found then
    raise exception 'Marketplace report is unavailable' using errcode='22023';
  end if;

  if report_row.status in ('resolved','dismissed') then
    raise exception 'Marketplace report is already closed' using errcode='22023';
  end if;

  if resolution_name in ('remove_listing','suspend_seller') and reason_text='' then
    raise exception 'Moderation reason is required' using errcode='22023';
  end if;

  if resolution_name='remove_listing' then
    if report_row.target_type <> 'listing' then
      raise exception 'remove_listing requires a listing report' using errcode='22023';
    end if;
    begin
      target_uuid := report_row.target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Report target is invalid' using errcode='22023';
    end;

    select l.state into prior_state from public.marketplace_listings l where l.id=target_uuid for update;
    if not found then raise exception 'Reported listing is unavailable' using errcode='22023'; end if;

    update public.marketplace_listings set state='removed',updated_at=now() where id=target_uuid;

  elsif resolution_name='suspend_seller' then
    if report_row.target_type <> 'user' then
      raise exception 'suspend_seller requires a seller report' using errcode='22023';
    end if;
    begin
      target_uuid := report_row.target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Report target is invalid' using errcode='22023';
    end;

    select p.marketplace_status into prior_state
    from public.marketplace_public_profiles p
    where p.public_id=target_uuid
    for update;
    if not found then raise exception 'Reported seller is unavailable' using errcode='22023'; end if;

    update public.marketplace_public_profiles
    set marketplace_status='suspended',updated_at=now()
    where public_id=target_uuid;
  end if;

  update public.marketplace_reports
  set status=case when resolution_name='dismiss' then 'dismissed' else 'resolved' end,
      resolved_at=now()
  where id=report_id_value;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,
    resolution_name,
    report_row.target_type,
    report_row.target_id,
    reason_text,
    jsonb_build_object(
      'report_id',report_id_value,
      'previous_target_state',coalesce(prior_state,'')
    )
  );

  return jsonb_build_object(
    'report_id',report_id_value,
    'status',case when resolution_name='dismiss' then 'dismissed' else 'resolved' end,
    'resolution',resolution_name
  );
end
$c6_resolve_report$;

revoke all on function public.marketplace_owner_admin_resolve_report(uuid,text,text) from public, anon;
grant execute on function public.marketplace_owner_admin_resolve_report(uuid,text,text) to authenticated;

create or replace function public.marketplace_owner_admin_history(
  limit_value integer default 100,
  offset_value integer default 0
)
returns table (
  action_id uuid,
  action_type text,
  target_type text,
  target_id text,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $c6_history$
declare
  actor uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(limit_value,100),1),200);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  return query
  select a.id,a.action_type,a.target_type,a.target_id,a.reason,a.metadata,a.created_at
  from public.marketplace_moderation_actions a
  order by a.created_at desc,a.id desc
  limit safe_limit offset safe_offset;
end
$c6_history$;

revoke all on function public.marketplace_owner_admin_history(integer,integer) from public, anon;
grant execute on function public.marketplace_owner_admin_history(integer,integer) to authenticated;

-- Legacy moderation functions from the abandoned app-hosted stack remain closed.
revoke all on function public.marketplace_moderation_queue(text) from public, anon, authenticated;
revoke all on function public.marketplace_moderate_report(uuid,text,text) from public, anon, authenticated;
revoke all on function public.marketplace_submit_report(text,text,text,text) from public, anon, authenticated;

grant execute on function public.marketplace_moderation_queue(text) to service_role;
grant execute on function public.marketplace_moderate_report(uuid,text,text) to service_role;
grant execute on function public.marketplace_submit_report(text,text,text,text) to service_role;
