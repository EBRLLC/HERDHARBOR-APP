-- Stack D4 — Marketplace favorites + listing lifecycle.
-- Extends canonical Stack C listing/favorite tables and state machine.

create or replace function herdharbor_private.marketplace_listing_lifecycle_defaults()
returns trigger
language plpgsql
set search_path=''
as $d4_lifecycle_trigger$
begin
  if new.state='available' then
    if tg_op='INSERT'
      or old.state is distinct from 'available'
      or new.expires_at is null
      or new.expires_at<=now()
    then
      new.expires_at:=now()+interval '30 days';
      new.last_confirmed_at:=now();
    end if;
  end if;

  return new;
end
$d4_lifecycle_trigger$;

revoke all on function herdharbor_private.marketplace_listing_lifecycle_defaults()
  from public, anon, authenticated;

drop trigger if exists marketplace_listing_lifecycle_defaults
  on public.marketplace_listings;
create trigger marketplace_listing_lifecycle_defaults
before insert or update of state,expires_at
on public.marketplace_listings
for each row execute function herdharbor_private.marketplace_listing_lifecycle_defaults();

update public.marketplace_listings
set expires_at=now()+interval '30 days',
    last_confirmed_at=coalesce(last_confirmed_at,now())
where state='available'
  and expires_at is null;

create or replace function public.marketplace_member_refresh_listing_lifecycle()
returns integer
language plpgsql
security definer
set search_path=''
as $d4_refresh$
declare
  actor uuid := auth.uid();
  changed integer;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  update public.marketplace_listings
  set state='expired',
      updated_at=now()
  where seller_id=actor
    and state='available'
    and expires_at is not null
    and expires_at<=now();

  get diagnostics changed=row_count;
  return changed;
end
$d4_refresh$;

revoke all on function public.marketplace_member_refresh_listing_lifecycle()
  from public, anon;
grant execute on function public.marketplace_member_refresh_listing_lifecycle()
  to authenticated;

create or replace function public.marketplace_member_update_listing_lifecycle(
  listing_id_value uuid,
  state_value text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $d4_state$
declare
  actor uuid := auth.uid();
  target_state text := lower(btrim(coalesce(state_value,'')));
  current_state text;
  listing_name text;
  listing_species text;
  result jsonb;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if target_state not in ('draft','available','pending','sold','archived') then
    raise exception 'Invalid listing lifecycle state' using errcode='22023';
  end if;

  select l.state,l.animal_name,l.species
    into current_state,listing_name,listing_species
  from public.marketplace_listings l
  where l.id=listing_id_value
    and l.seller_id=actor
  for update;

  if not found or current_state='removed' then
    raise exception 'Listing is unavailable for this account' using errcode='42501';
  end if;

  if target_state='available' then
    if btrim(coalesce(listing_name,''))=''
      or btrim(coalesce(listing_species,''))=''
    then
      raise exception 'Published Marketplace listings require an animal/listing name and species' using errcode='22023';
    end if;

    if not exists(
      select 1 from public.marketplace_public_profiles p
      where p.user_id=actor and p.marketplace_status='active'
    ) then
      raise exception 'Create an active Marketplace seller profile before publishing a listing' using errcode='42501';
    end if;
  end if;

  update public.marketplace_listings
  set state=target_state,
      published_at=case
        when target_state='available' then coalesce(published_at,now())
        when target_state='draft' then null
        else published_at
      end,
      expires_at=case
        when target_state='available' then now()+interval '30 days'
        else expires_at
      end,
      last_confirmed_at=case
        when target_state='available' then now()
        else last_confirmed_at
      end,
      updated_at=now()
  where id=listing_id_value
    and seller_id=actor
  returning jsonb_build_object(
    'listing_id',id,
    'state',state,
    'expires_at',expires_at,
    'last_confirmed_at',last_confirmed_at
  ) into result;

  return result;
end
$d4_state$;

revoke all on function public.marketplace_member_update_listing_lifecycle(uuid,text)
  from public, anon;
grant execute on function public.marketplace_member_update_listing_lifecycle(uuid,text)
  to authenticated;

create or replace function public.marketplace_member_reconfirm_listing(
  listing_id_value uuid
)
returns jsonb
language sql
security definer
set search_path=''
as $d4_reconfirm$
  select public.marketplace_member_update_listing_lifecycle(listing_id_value,'available')
$d4_reconfirm$;

revoke all on function public.marketplace_member_reconfirm_listing(uuid)
  from public, anon;
grant execute on function public.marketplace_member_reconfirm_listing(uuid)
  to authenticated;

create or replace function public.marketplace_member_listings_v2()
returns table(
  id uuid,
  source_animal_id text,
  state text,
  animal_name text,
  species text,
  breed text,
  sex text,
  dob date,
  variety_color text,
  price_cents bigint,
  currency text,
  location_city text,
  location_region text,
  description text,
  pedigree_status text,
  registration_status text,
  pedigree_visibility text,
  listing_kind text,
  available_from date,
  published_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  updated_at timestamptz,
  photo_paths jsonb
)
language sql
stable
security definer
set search_path=''
as $d4_listings$
  select
    l.id,l.source_animal_id,l.state,l.animal_name,l.species,l.breed,l.sex,l.dob,l.variety_color,
    l.price_cents,l.currency,l.location_city,l.location_region,l.description,l.pedigree_status,
    l.registration_status,l.pedigree_visibility,l.listing_kind,l.available_from,l.published_at,
    l.expires_at,l.last_confirmed_at,l.updated_at,
    coalesce((
      select jsonb_agg(ph.storage_path order by ph.sort_order,ph.created_at)
      from public.marketplace_listing_photos ph
      where ph.listing_id=l.id and ph.seller_id=l.seller_id
    ),'[]'::jsonb)
  from public.marketplace_listings l
  where l.seller_id=(select auth.uid())
    and herdharbor_private.marketplace_current_account_active()
  order by l.updated_at desc,l.created_at desc
$d4_listings$;

revoke all on function public.marketplace_member_listings_v2()
  from public, anon;
grant execute on function public.marketplace_member_listings_v2()
  to authenticated;

create or replace function public.marketplace_member_saved_listings(
  limit_value integer default 100,
  offset_value integer default 0
)
returns table(
  listing_id uuid,
  listing_state text,
  animal_name text,
  species text,
  breed text,
  sex text,
  variety_color text,
  price_cents bigint,
  currency text,
  location_city text,
  location_region text,
  seller_public_id uuid,
  seller_display_name text,
  seller_rabbitry_name text,
  favorited_at timestamptz,
  expires_at timestamptz,
  available boolean
)
language plpgsql
stable
security definer
set search_path=''
as $d4_saved$
declare
  actor uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(limit_value,100),1),200);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  return query
  select
    l.id,
    case when safe.visible_snapshot then l.state else 'unavailable' end,
    case when safe.visible_snapshot then l.animal_name else 'Listing unavailable' end,
    case when safe.visible_snapshot then l.species else '' end,
    case when safe.visible_snapshot then l.breed else '' end,
    case when safe.visible_snapshot then l.sex else '' end,
    case when safe.visible_snapshot then l.variety_color else '' end,
    case when safe.visible_snapshot then l.price_cents else null end,
    case when safe.visible_snapshot then l.currency else 'USD' end,
    case when safe.visible_snapshot then l.location_city else '' end,
    case when safe.visible_snapshot then l.location_region else '' end,
    case when safe.visible_snapshot then p.public_id else null end,
    case when safe.visible_snapshot then p.display_name else '' end,
    case when safe.visible_snapshot then p.rabbitry_name else '' end,
    f.created_at,
    case when safe.visible_snapshot then l.expires_at else null end,
    (
      safe.visible_snapshot
      and l.state='available'
      and (l.expires_at is null or l.expires_at>now())
    )
  from public.marketplace_favorites f
  join public.marketplace_listings l on l.id=f.listing_id
  left join public.marketplace_public_profiles p on p.user_id=l.seller_id
  left join lateral (
    select (
      l.state<>'removed'
      and p.marketplace_status='active'
      and not exists(
        select 1 from public.marketplace_account_suspensions s
        where s.user_id=l.seller_id and s.lifted_at is null
      )
    ) as visible_snapshot
  ) safe on true
  where f.user_id=actor
  order by f.created_at desc,f.listing_id
  limit safe_limit offset safe_offset;
end
$d4_saved$;

revoke all on function public.marketplace_member_saved_listings(integer,integer)
  from public, anon;
grant execute on function public.marketplace_member_saved_listings(integer,integer)
  to authenticated;


create or replace function public.marketplace_member_toggle_favorite_v2(
  listing_id_value uuid,
  favorite_value boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $d4_favorite$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if not coalesce(favorite_value,false) then
    delete from public.marketplace_favorites
    where user_id=actor and listing_id=listing_id_value;
    return false;
  end if;

  if not exists(
    select 1
    from public.marketplace_listings l
    join public.marketplace_public_profiles p on p.user_id=l.seller_id
    where l.id=listing_id_value
      and l.state='available'
      and p.marketplace_status='active'
      and (l.expires_at is null or l.expires_at>now())
      and not exists(
        select 1 from public.marketplace_account_suspensions susp
        where susp.user_id=l.seller_id and susp.lifted_at is null
      )
  ) then
    raise exception 'Marketplace listing is unavailable' using errcode='22023';
  end if;

  insert into public.marketplace_favorites(user_id,listing_id)
  values(actor,listing_id_value)
  on conflict(user_id,listing_id) do nothing;

  return true;
end
$d4_favorite$;

revoke all on function public.marketplace_member_toggle_favorite_v2(uuid,boolean)
  from public, anon;
grant execute on function public.marketplace_member_toggle_favorite_v2(uuid,boolean)
  to authenticated;
