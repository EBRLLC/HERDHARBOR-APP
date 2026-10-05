-- Marketplace filter catalog/search normalization hotfix.
-- Keeps the public v2 RPC signatures stable while making filter values useful
-- before the Marketplace has any listings.

create or replace function herdharbor_private.marketplace_normalize_species(input_value text)
returns text
language sql
immutable
set search_path = ''
as $filter_species$
  select case lower(btrim(coalesce(input_value,'')))
    when 'rabbit' then 'rabbit'
    when 'rabbits' then 'rabbit'
    when 'cattle' then 'cattle'
    when 'cow' then 'cattle'
    when 'cows' then 'cattle'
    when 'goat' then 'goat'
    when 'goats' then 'goat'
    when 'sheep' then 'sheep'
    when 'poultry' then 'poultry'
    when 'chicken' then 'poultry'
    when 'chickens' then 'poultry'
    when 'swine' then 'swine'
    when 'pig' then 'swine'
    when 'pigs' then 'swine'
    else lower(btrim(coalesce(input_value,'')))
  end
$filter_species$;

create or replace function herdharbor_private.marketplace_normalize_sex(input_value text)
returns text
language sql
immutable
set search_path = ''
as $filter_sex$
  select case lower(btrim(coalesce(input_value,'')))
    when 'male' then 'male'
    when 'm' then 'male'
    when 'buck' then 'male'
    when 'bull' then 'male'
    when 'boar' then 'male'
    when 'ram' then 'male'
    when 'rooster' then 'male'
    when 'cock' then 'male'
    when 'steer' then 'male'
    when 'wether' then 'male'
    when 'barrow' then 'male'
    when 'capon' then 'male'
    when 'female' then 'female'
    when 'f' then 'female'
    when 'doe' then 'female'
    when 'cow' then 'female'
    when 'sow' then 'female'
    when 'ewe' then 'female'
    when 'hen' then 'female'
    when 'heifer' then 'female'
    when 'gilt' then 'female'
    when 'unknown' then 'unknown'
    when 'unsexed' then 'unknown'
    when 'n/a' then 'unknown'
    when 'na' then 'unknown'
    else lower(btrim(coalesce(input_value,'')))
  end
$filter_sex$;

create or replace function herdharbor_private.marketplace_normalize_region(input_value text)
returns text
language sql
immutable
set search_path = ''
as $filter_region$
  select case lower(btrim(coalesce(input_value,'')))
    when 'alabama' then 'al' when 'al' then 'al'
    when 'alaska' then 'ak' when 'ak' then 'ak'
    when 'arizona' then 'az' when 'az' then 'az'
    when 'arkansas' then 'ar' when 'ar' then 'ar'
    when 'california' then 'ca' when 'ca' then 'ca'
    when 'colorado' then 'co' when 'co' then 'co'
    when 'connecticut' then 'ct' when 'ct' then 'ct'
    when 'delaware' then 'de' when 'de' then 'de'
    when 'district of columbia' then 'dc' when 'washington dc' then 'dc' when 'washington, dc' then 'dc' when 'dc' then 'dc'
    when 'florida' then 'fl' when 'fl' then 'fl'
    when 'georgia' then 'ga' when 'ga' then 'ga'
    when 'hawaii' then 'hi' when 'hi' then 'hi'
    when 'idaho' then 'id' when 'id' then 'id'
    when 'illinois' then 'il' when 'il' then 'il'
    when 'indiana' then 'in' when 'in' then 'in'
    when 'iowa' then 'ia' when 'ia' then 'ia'
    when 'kansas' then 'ks' when 'ks' then 'ks'
    when 'kentucky' then 'ky' when 'ky' then 'ky'
    when 'louisiana' then 'la' when 'la' then 'la'
    when 'maine' then 'me' when 'me' then 'me'
    when 'maryland' then 'md' when 'md' then 'md'
    when 'massachusetts' then 'ma' when 'ma' then 'ma'
    when 'michigan' then 'mi' when 'mi' then 'mi'
    when 'minnesota' then 'mn' when 'mn' then 'mn'
    when 'mississippi' then 'ms' when 'ms' then 'ms'
    when 'missouri' then 'mo' when 'mo' then 'mo'
    when 'montana' then 'mt' when 'mt' then 'mt'
    when 'nebraska' then 'ne' when 'ne' then 'ne'
    when 'nevada' then 'nv' when 'nv' then 'nv'
    when 'new hampshire' then 'nh' when 'nh' then 'nh'
    when 'new jersey' then 'nj' when 'nj' then 'nj'
    when 'new mexico' then 'nm' when 'nm' then 'nm'
    when 'new york' then 'ny' when 'ny' then 'ny'
    when 'north carolina' then 'nc' when 'nc' then 'nc'
    when 'north dakota' then 'nd' when 'nd' then 'nd'
    when 'ohio' then 'oh' when 'oh' then 'oh'
    when 'oklahoma' then 'ok' when 'ok' then 'ok'
    when 'oregon' then 'or' when 'or' then 'or'
    when 'pennsylvania' then 'pa' when 'pa' then 'pa'
    when 'rhode island' then 'ri' when 'ri' then 'ri'
    when 'south carolina' then 'sc' when 'sc' then 'sc'
    when 'south dakota' then 'sd' when 'sd' then 'sd'
    when 'tennessee' then 'tn' when 'tn' then 'tn'
    when 'texas' then 'tx' when 'tx' then 'tx'
    when 'utah' then 'ut' when 'ut' then 'ut'
    when 'vermont' then 'vt' when 'vt' then 'vt'
    when 'virginia' then 'va' when 'va' then 'va'
    when 'washington' then 'wa' when 'wa' then 'wa'
    when 'west virginia' then 'wv' when 'wv' then 'wv'
    when 'wisconsin' then 'wi' when 'wi' then 'wi'
    when 'wyoming' then 'wy' when 'wy' then 'wy'
    else lower(btrim(coalesce(input_value,'')))
  end
$filter_region$;

revoke all on function herdharbor_private.marketplace_normalize_species(text) from public, anon, authenticated;
revoke all on function herdharbor_private.marketplace_normalize_sex(text) from public, anon, authenticated;
revoke all on function herdharbor_private.marketplace_normalize_region(text) from public, anon, authenticated;

create or replace function public.marketplace_public_search_v2(
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
returns table(
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
as $filter_search$
declare
  safe_query text := left(btrim(coalesce(query_value,'')),160);
  safe_sort text := lower(btrim(coalesce(sort_value,'newest')));
  safe_limit integer := least(greatest(coalesce(limit_value,24),1),48);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if safe_sort not in ('newest','oldest','price_asc','price_desc') then safe_sort := 'newest'; end if;

  return query
  select
    l.id,l.animal_name,l.species,l.breed,l.sex,l.dob,l.variety_color,
    l.price_cents,l.currency,l.location_city,l.location_region,
    left(l.description,240),l.pedigree_status,l.registration_status,
    l.listing_kind,l.available_from,l.published_at,
    p.public_id,p.display_name,p.rabbitry_name,p.verification_status,
    count(*) over()::bigint
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.state='available'
    and p.marketplace_status='active'
    and (l.expires_at is null or l.expires_at>now())
    and (
      safe_query=''
      or to_tsvector(
        'simple',
        coalesce(l.animal_name,'')||' '||
        coalesce(l.species,'')||' '||
        coalesce(l.breed,'')||' '||
        coalesce(l.variety_color,'')||' '||
        coalesce(l.description,'')
      ) @@ websearch_to_tsquery('simple',safe_query)
      or lower(p.rabbitry_name) like '%'||lower(safe_query)||'%'
      or lower(p.display_name) like '%'||lower(safe_query)||'%'
      or lower(l.location_city) like '%'||lower(safe_query)||'%'
      or lower(l.location_region) like '%'||lower(safe_query)||'%'
    )
    and (
      nullif(btrim(coalesce(species_value,'')),'') is null
      or herdharbor_private.marketplace_normalize_species(l.species)
         = herdharbor_private.marketplace_normalize_species(species_value)
    )
    and (nullif(btrim(coalesce(breed_value,'')),'') is null or lower(l.breed)=lower(btrim(breed_value)))
    and (
      nullif(btrim(coalesce(sex_value,'')),'') is null
      or herdharbor_private.marketplace_normalize_sex(l.sex)
         = herdharbor_private.marketplace_normalize_sex(sex_value)
    )
    and (
      nullif(btrim(coalesce(region_value,'')),'') is null
      or herdharbor_private.marketplace_normalize_region(l.location_region)
         = herdharbor_private.marketplace_normalize_region(region_value)
    )
    and (nullif(btrim(coalesce(pedigree_status_value,'')),'') is null or lower(l.pedigree_status)=lower(btrim(pedigree_status_value)))
    and (nullif(btrim(coalesce(listing_kind_value,'')),'') is null or lower(l.listing_kind)=lower(btrim(listing_kind_value)))
    and (min_price_cents_value is null or l.price_cents>=min_price_cents_value)
    and (max_price_cents_value is null or l.price_cents<=max_price_cents_value)
    and (seller_public_id_value is null or p.public_id=seller_public_id_value)
  order by
    case when safe_sort='price_asc' then l.price_cents end asc nulls last,
    case when safe_sort='price_desc' then l.price_cents end desc nulls last,
    case when safe_sort='oldest' then l.published_at end asc nulls last,
    case when safe_sort='newest' then l.published_at end desc nulls last,
    l.updated_at desc,l.id
  limit safe_limit offset safe_offset;
end
$filter_search$;

grant execute on function public.marketplace_public_search_v2(
  text,text,text,text,text,text,text,bigint,bigint,uuid,text,integer,integer
) to anon, authenticated;

create or replace function public.marketplace_public_facets_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $filter_facets$
  select jsonb_build_object(
    'species',coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.species value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id=l.seller_id
        where l.state='available' and p.marketplace_status='active'
          and (l.expires_at is null or l.expires_at>now()) and btrim(l.species)<>''
      ) s
    ),'[]'::jsonb),
    'breeds',coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.breed value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id=l.seller_id
        where l.state='available' and p.marketplace_status='active'
          and (l.expires_at is null or l.expires_at>now()) and btrim(l.breed)<>''
      ) b
    ),'[]'::jsonb),
    'breed_pairs',coalesce((
      select jsonb_agg(
        jsonb_build_object('species',species_value,'breed',breed_value)
        order by lower(species_value),lower(breed_value)
      )
      from (
        select distinct l.species species_value,l.breed breed_value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id=l.seller_id
        where l.state='available' and p.marketplace_status='active'
          and (l.expires_at is null or l.expires_at>now())
          and btrim(l.species)<>'' and btrim(l.breed)<>''
      ) bp
    ),'[]'::jsonb),
    'sexes',coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.sex value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id=l.seller_id
        where l.state='available' and p.marketplace_status='active'
          and (l.expires_at is null or l.expires_at>now()) and btrim(l.sex)<>''
      ) sx
    ),'[]'::jsonb),
    'regions',coalesce((
      select jsonb_agg(value order by lower(value))
      from (
        select distinct l.location_region value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id=l.seller_id
        where l.state='available' and p.marketplace_status='active'
          and (l.expires_at is null or l.expires_at>now()) and btrim(l.location_region)<>''
      ) r
    ),'[]'::jsonb),
    'listing_kinds',coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct l.listing_kind value
        from public.marketplace_listings l
        join public.marketplace_public_profiles p on p.user_id=l.seller_id
        where l.state='available' and p.marketplace_status='active'
          and (l.expires_at is null or l.expires_at>now()) and btrim(l.listing_kind)<>''
      ) k
    ),'[]'::jsonb)
  )
$filter_facets$;

grant execute on function public.marketplace_public_facets_v2() to anon, authenticated;
