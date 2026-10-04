-- HerdHarbor revised Stack C4A — privacy-safe browse/search/detail APIs
-- Owner-only website browse/search/detail preview with future-public privacy-safe response shapes.
-- No anonymous/public Marketplace access is enabled in this phase.

create index if not exists marketplace_listings_search_fts_idx
on public.marketplace_listings
using gin (
  to_tsvector(
    'simple',
    coalesce(animal_name, '') || ' ' ||
    coalesce(species, '') || ' ' ||
    coalesce(breed, '') || ' ' ||
    coalesce(variety_color, '') || ' ' ||
    coalesce(description, '')
  )
)
where state = 'available';

create or replace function public.marketplace_owner_search_preview(
  query_value text default '',
  species_value text default '',
  breed_value text default '',
  sex_value text default '',
  region_value text default '',
  pedigree_status_value text default '',
  listing_kind_value text default '',
  min_price_cents_value bigint default null,
  max_price_cents_value bigint default null,
  seller_public_id_value uuid default null,
  sort_value text default 'newest',
  limit_value integer default 24,
  offset_value integer default 0
)
returns table (
  listing_id uuid,
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
  description_excerpt text,
  pedigree_status text,
  registration_status text,
  listing_kind text,
  available_from date,
  published_at timestamptz,
  seller_public_id uuid,
  seller_display_name text,
  rabbitry_name text,
  seller_verification_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $c4_search$
declare
  actor uuid := auth.uid();
  safe_query text := btrim(coalesce(query_value, ''));
  safe_sort text := lower(btrim(coalesce(sort_value, 'newest')));
  safe_limit integer := least(greatest(coalesce(limit_value, 24), 1), 48);
  safe_offset integer := greatest(coalesce(offset_value, 0), 0);
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace browse preview is Owner-only'
      using errcode = '42501';
  end if;

  if safe_sort not in ('newest','oldest','price_asc','price_desc') then
    safe_sort := 'newest';
  end if;

  return query
  select
    l.id as listing_id,
    l.animal_name,
    l.species,
    l.breed,
    l.sex,
    l.dob,
    l.variety_color,
    l.price_cents,
    l.currency,
    l.location_city,
    l.location_region,
    left(l.description, 240) as description_excerpt,
    l.pedigree_status,
    l.registration_status,
    l.listing_kind,
    l.available_from,
    l.published_at,
    p.public_id as seller_public_id,
    p.display_name as seller_display_name,
    p.rabbitry_name,
    p.verification_status as seller_verification_status,
    count(*) over()::bigint as total_count
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id = l.seller_id
  where l.state = 'available'
    and p.marketplace_status = 'active'
    and (
      safe_query = ''
      or to_tsvector(
        'simple',
        coalesce(l.animal_name, '') || ' ' ||
        coalesce(l.species, '') || ' ' ||
        coalesce(l.breed, '') || ' ' ||
        coalesce(l.variety_color, '') || ' ' ||
        coalesce(l.description, '')
      ) @@ websearch_to_tsquery('simple', safe_query)
      or lower(p.rabbitry_name) like '%' || lower(safe_query) || '%'
      or lower(p.display_name) like '%' || lower(safe_query) || '%'
      or lower(l.location_city) like '%' || lower(safe_query) || '%'
      or lower(l.location_region) like '%' || lower(safe_query) || '%'
    )
    and (nullif(btrim(coalesce(species_value, '')), '') is null or lower(l.species) = lower(btrim(species_value)))
    and (nullif(btrim(coalesce(breed_value, '')), '') is null or lower(l.breed) = lower(btrim(breed_value)))
    and (nullif(btrim(coalesce(sex_value, '')), '') is null or lower(l.sex) = lower(btrim(sex_value)))
    and (nullif(btrim(coalesce(region_value, '')), '') is null or lower(l.location_region) = lower(btrim(region_value)))
    and (nullif(btrim(coalesce(pedigree_status_value, '')), '') is null or lower(l.pedigree_status) = lower(btrim(pedigree_status_value)))
    and (nullif(btrim(coalesce(listing_kind_value, '')), '') is null or lower(l.listing_kind) = lower(btrim(listing_kind_value)))
    and (min_price_cents_value is null or l.price_cents >= min_price_cents_value)
    and (max_price_cents_value is null or l.price_cents <= max_price_cents_value)
    and (seller_public_id_value is null or p.public_id = seller_public_id_value)
  order by
    case when safe_sort = 'price_asc' then l.price_cents end asc nulls last,
    case when safe_sort = 'price_desc' then l.price_cents end desc nulls last,
    case when safe_sort = 'oldest' then l.published_at end asc nulls last,
    case when safe_sort = 'newest' then l.published_at end desc nulls last,
    l.updated_at desc,
    l.id
  limit safe_limit
  offset safe_offset;
end
$c4_search$;

revoke all on function public.marketplace_owner_search_preview(text,text,text,text,text,text,text,bigint,bigint,uuid,text,integer,integer) from public, anon;
grant execute on function public.marketplace_owner_search_preview(text,text,text,text,text,text,text,bigint,bigint,uuid,text,integer,integer) to authenticated;

create or replace function public.marketplace_owner_listing_preview(listing_id_value uuid)
returns table (
  listing_id uuid,
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
  listing_kind text,
  available_from date,
  published_at timestamptz,
  seller_public_id uuid,
  seller_display_name text,
  rabbitry_name text,
  seller_city text,
  seller_region text,
  seller_verification_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $c4_detail$
begin
  if auth.uid() is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace listing preview is Owner-only'
      using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.animal_name,
    l.species,
    l.breed,
    l.sex,
    l.dob,
    l.variety_color,
    l.price_cents,
    l.currency,
    l.location_city,
    l.location_region,
    l.description,
    l.pedigree_status,
    l.registration_status,
    l.listing_kind,
    l.available_from,
    l.published_at,
    p.public_id,
    p.display_name,
    p.rabbitry_name,
    p.city,
    p.region,
    p.verification_status
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id = l.seller_id
  where l.id = listing_id_value
    and l.state = 'available'
    and p.marketplace_status = 'active'
  limit 1;
end
$c4_detail$;

revoke all on function public.marketplace_owner_listing_preview(uuid) from public, anon;
grant execute on function public.marketplace_owner_listing_preview(uuid) to authenticated;

create or replace function public.marketplace_owner_seller_preview(seller_public_id_value uuid)
returns table (
  public_id uuid,
  display_name text,
  rabbitry_name text,
  city text,
  region text,
  about text,
  species_breeds jsonb,
  member_since timestamptz,
  verification_status text,
  marketplace_status text,
  active_listing_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $c4_seller$
begin
  if auth.uid() is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace seller preview is Owner-only'
      using errcode = '42501';
  end if;

  return query
  select
    p.public_id,
    p.display_name,
    p.rabbitry_name,
    p.city,
    p.region,
    p.about,
    p.species_breeds,
    p.member_since,
    p.verification_status,
    p.marketplace_status,
    (
      select count(*)::bigint
      from public.marketplace_listings l
      where l.seller_id = p.user_id
        and l.state = 'available'
    )
  from public.marketplace_public_profiles p
  where p.public_id = seller_public_id_value
    and p.marketplace_status = 'active'
  limit 1;
end
$c4_seller$;

revoke all on function public.marketplace_owner_seller_preview(uuid) from public, anon;
grant execute on function public.marketplace_owner_seller_preview(uuid) to authenticated;

create or replace function public.marketplace_owner_browse_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c4_facets$
declare
  result jsonb;
begin
  if auth.uid() is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace browse preview is Owner-only'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'species', coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.species as value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id = l.seller_id
        where l.state = 'available' and p.marketplace_status = 'active' and btrim(l.species) <> ''
      ) s
    ), '[]'::jsonb),
    'breeds', coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.breed as value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id = l.seller_id
        where l.state = 'available' and p.marketplace_status = 'active' and btrim(l.breed) <> ''
      ) b
    ), '[]'::jsonb),
    'sexes', coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.sex as value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id = l.seller_id
        where l.state = 'available' and p.marketplace_status = 'active' and btrim(l.sex) <> ''
      ) sx
    ), '[]'::jsonb),
    'regions', coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.location_region as value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id = l.seller_id
        where l.state = 'available' and p.marketplace_status = 'active' and btrim(l.location_region) <> ''
      ) r
    ), '[]'::jsonb),
    'listing_kinds', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct l.listing_kind as value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id = l.seller_id
        where l.state = 'available' and p.marketplace_status = 'active' and btrim(l.listing_kind) <> ''
      ) k
    ), '[]'::jsonb)
  )
  into result;

  return result;
end
$c4_facets$;

revoke all on function public.marketplace_owner_browse_facets() from public, anon;
grant execute on function public.marketplace_owner_browse_facets() to authenticated;

-- Private media locator used only by Owner preview. It is intentionally separate
-- from future-public listing/profile payloads because storage paths may contain
-- private implementation identifiers.
create or replace function public.marketplace_owner_preview_media(listing_ids_value uuid[])
returns table (
  listing_id uuid,
  photo_paths jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $c4_media$
declare
  actor uuid := auth.uid();
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace preview media is Owner-only'
      using errcode = '42501';
  end if;

  return query
  select
    l.id,
    coalesce((
      select jsonb_agg(ph.storage_path order by ph.sort_order, ph.created_at)
      from public.marketplace_listing_photos ph
      where ph.listing_id = l.id and ph.seller_id = actor
    ), '[]'::jsonb)
  from public.marketplace_listings l
  where l.seller_id = actor
    and l.id = any(coalesce(listing_ids_value, array[]::uuid[]));
end
$c4_media$;

revoke all on function public.marketplace_owner_preview_media(uuid[]) from public, anon;
grant execute on function public.marketplace_owner_preview_media(uuid[]) to authenticated;

create or replace function public.marketplace_owner_favorite_ids()
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $c4_favorites$
declare
  actor uuid := auth.uid();
  result uuid[];
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace favorites preview is Owner-only'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(f.listing_id order by f.created_at desc), array[]::uuid[])
  into result
  from public.marketplace_favorites f
  where f.user_id = actor;

  return result;
end
$c4_favorites$;

revoke all on function public.marketplace_owner_favorite_ids() from public, anon;
grant execute on function public.marketplace_owner_favorite_ids() to authenticated;

create or replace function public.marketplace_owner_toggle_favorite(
  listing_id_value uuid,
  favorite_value boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $c4_toggle$
declare
  actor uuid := auth.uid();
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace favorites preview is Owner-only'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.marketplace_listings l
    join public.marketplace_public_profiles p on p.user_id = l.seller_id
    where l.id = listing_id_value
      and l.state = 'available'
      and p.marketplace_status = 'active'
  ) then
    raise exception 'Marketplace listing is not available'
      using errcode = '22023';
  end if;

  if coalesce(favorite_value, false) then
    insert into public.marketplace_favorites (user_id, listing_id)
    values (actor, listing_id_value)
    on conflict (user_id, listing_id) do nothing;
    return true;
  end if;

  delete from public.marketplace_favorites
  where user_id = actor and listing_id = listing_id_value;
  return false;
end
$c4_toggle$;

revoke all on function public.marketplace_owner_toggle_favorite(uuid,boolean) from public, anon;
grant execute on function public.marketplace_owner_toggle_favorite(uuid,boolean) to authenticated;
