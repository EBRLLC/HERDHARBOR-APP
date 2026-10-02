begin;

alter table public.marketplace_listings
  add column if not exists location_area_key text not null default '';

create index if not exists marketplace_listings_location_idx
  on public.marketplace_listings(location_region,location_city,location_area_key)
  where state='available';

update storage.buckets
set public=true
where id='marketplace-public';

create or replace function public.marketplace_search_listings(
  search_text text default null,
  species_filter text default null,
  breed_filter text default null,
  sex_filter text default null,
  min_price_cents bigint default null,
  max_price_cents bigint default null,
  pedigree_filter text default null,
  region_filter text default null,
  result_limit integer default 40,
  result_offset integer default 0
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
  description text,
  pedigree_status text,
  registration_status text,
  state text,
  seller_public_id uuid,
  seller_display_name text,
  seller_rabbitry_name text,
  seller_verification_status text,
  primary_photo_path text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
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
    l.state,
    p.public_id,
    p.display_name,
    p.rabbitry_name,
    p.verification_status,
    (
      select ph.storage_path
      from public.marketplace_listing_photos ph
      where ph.listing_id=l.id
      order by ph.sort_order,ph.created_at
      limit 1
    ),
    l.published_at
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.state='available'
    and p.marketplace_status='active'
    and (l.expires_at is null or l.expires_at>now())
    and (nullif(trim(search_text),'') is null or
      l.animal_name ilike '%'||trim(search_text)||'%' or
      l.breed ilike '%'||trim(search_text)||'%' or
      l.variety_color ilike '%'||trim(search_text)||'%' or
      l.description ilike '%'||trim(search_text)||'%')
    and (nullif(trim(species_filter),'') is null or lower(l.species)=lower(trim(species_filter)))
    and (nullif(trim(breed_filter),'') is null or lower(l.breed)=lower(trim(breed_filter)))
    and (nullif(trim(sex_filter),'') is null or lower(l.sex)=lower(trim(sex_filter)))
    and (min_price_cents is null or l.price_cents>=min_price_cents)
    and (max_price_cents is null or l.price_cents<=max_price_cents)
    and (nullif(trim(pedigree_filter),'') is null or lower(l.pedigree_status)=lower(trim(pedigree_filter)))
    and (nullif(trim(region_filter),'') is null or lower(l.location_region)=lower(trim(region_filter)))
  order by l.published_at desc nulls last,l.created_at desc,l.id
  limit least(greatest(coalesce(result_limit,40),1),100)
  offset greatest(coalesce(result_offset,0),0);
$$;

create or replace function public.marketplace_public_listing(target_listing_id uuid)
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
  state text,
  seller_public_id uuid,
  seller_display_name text,
  seller_rabbitry_name text,
  seller_verification_status text,
  seller_city text,
  seller_region text,
  photo_paths text[],
  attributes jsonb,
  published_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    l.id,l.animal_name,l.species,l.breed,l.sex,l.dob,l.variety_color,l.price_cents,l.currency,
    l.location_city,l.location_region,l.description,l.pedigree_status,l.registration_status,l.state,
    p.public_id,p.display_name,p.rabbitry_name,p.verification_status,p.city,p.region,
    coalesce((
      select array_agg(ph.storage_path order by ph.sort_order,ph.created_at)
      from public.marketplace_listing_photos ph where ph.listing_id=l.id
    ),array[]::text[]),
    coalesce((
      select jsonb_object_agg(a.attribute_key,a.attribute_value)
      from public.marketplace_listing_attributes a where a.listing_id=l.id
    ),'{}'::jsonb),
    l.published_at
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=target_listing_id
    and l.state in ('available','pending','sold')
    and p.marketplace_status='active'
  limit 1;
$$;

revoke all on function public.marketplace_search_listings(text,text,text,text,bigint,bigint,text,text,integer,integer) from public;
revoke all on function public.marketplace_public_listing(uuid) from public;
grant execute on function public.marketplace_search_listings(text,text,text,text,bigint,bigint,text,text,integer,integer) to anon,authenticated;
grant execute on function public.marketplace_public_listing(uuid) to anon,authenticated;

comment on function public.marketplace_search_listings(text,text,text,text,bigint,bigint,text,text,integer,integer) is
  'Server-side public Marketplace search. Returns only approved listing and seller projection fields.';
comment on function public.marketplace_public_listing(uuid) is
  'Public Marketplace listing detail. Never returns source_animal_id, public_snapshot, seller auth id, contact information, or private herd data.';

commit;
