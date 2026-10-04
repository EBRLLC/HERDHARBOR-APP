-- HerdHarbor revised Stack C3A — listing APIs + read-only herd import bridge
-- Owner-only website Marketplace listing creation. Marketplace listings are detached snapshots.
-- Reading "Select From My Herd" is narrow/read-only; Marketplace never joins private sync.

create or replace function public.marketplace_owner_herd_animals()
returns table (
  source_animal_id text,
  animal_name text,
  species text,
  breed text,
  sex text,
  dob date,
  variety_color text,
  asking_price text,
  herd_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $c3_herd$
declare
  actor uuid := auth.uid();
  authority_stage text;
  snapshot jsonb;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace herd import is Owner-only'
      using errcode = '42501';
  end if;

  select m.cutover_stage
  into authority_stage
  from public.herdharbor_sync_manifest m
  where m.user_id = actor;

  if authority_stage = 'normalized' then
    raise exception 'Marketplace herd import bridge does not read normalized authority yet'
      using errcode = '55000',
            hint = 'Do not fall back to a stale legacy snapshot; update the read-only Marketplace import bridge first.';
  end if;

  select d.app_state
  into snapshot
  from public.herdharbor_user_data d
  where d.user_id = actor
  limit 1;

  if snapshot is null then
    return;
  end if;

  return query
  select
    nullif(btrim(coalesce(item ->> 'id', item ->> 'uuid', item ->> 'recordId', item ->> 'record_id', item ->> 'key')), '') as source_animal_id,
    left(btrim(coalesce(item ->> 'name', '')), 120) as animal_name,
    left(btrim(coalesce(item ->> 'species', '')), 80) as species,
    left(btrim(coalesce(item ->> 'breed', '')), 120) as breed,
    left(btrim(coalesce(item ->> 'sex', '')), 32) as sex,
    case
      when coalesce(item ->> 'dob', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (item ->> 'dob')::date
      else null
    end as dob,
    left(btrim(coalesce(item ->> 'color', '')), 120) as variety_color,
    left(btrim(coalesce(item ->> 'askingPrice', '')), 32) as asking_price,
    left(btrim(coalesce(item ->> 'status', '')), 40) as herd_status
  from jsonb_array_elements(
    case
      when jsonb_typeof(snapshot -> 'animals') = 'array' then snapshot -> 'animals'
      else '[]'::jsonb
    end
  ) item
  where nullif(btrim(coalesce(item ->> 'id', item ->> 'uuid', item ->> 'recordId', item ->> 'record_id', item ->> 'key')), '') is not null
    and lower(coalesce(item ->> 'status', '')) not in ('deceased','archived','ancestor only')
  order by lower(coalesce(item ->> 'name', '')), source_animal_id;
end
$c3_herd$;

revoke all on function public.marketplace_owner_herd_animals() from public, anon;
grant execute on function public.marketplace_owner_herd_animals() to authenticated;

create or replace function public.marketplace_owner_save_listing(
  listing_id_value uuid,
  source_animal_id_value text,
  state_value text,
  animal_name_value text,
  species_value text,
  breed_value text,
  sex_value text,
  dob_value date,
  variety_color_value text,
  price_cents_value bigint,
  currency_value text,
  location_city_value text,
  location_region_value text,
  description_value text,
  pedigree_status_value text,
  registration_status_value text,
  pedigree_visibility_value text,
  listing_kind_value text,
  available_from_value date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c3_save$
declare
  actor uuid := auth.uid();
  result_id uuid;
  safe_state text := lower(btrim(coalesce(state_value, 'draft')));
  safe_currency text := upper(btrim(coalesce(currency_value, 'USD')));
  safe_visibility text := lower(btrim(coalesce(pedigree_visibility_value, 'hidden')));
  safe_kind text := lower(btrim(coalesce(listing_kind_value, 'individual')));
  safe_source text := nullif(btrim(coalesce(source_animal_id_value, '')), '');
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace listing preview is Owner-only'
      using errcode = '42501';
  end if;

  if safe_state not in ('draft','available','pending','sold','archived','expired','removed')
    or safe_visibility not in ('hidden','parents','3','4','5')
    or safe_kind not in ('individual','future_offspring','litter_announcement')
    or safe_currency !~ '^[A-Z]{3}$'
    or price_cents_value is not null and price_cents_value < 0
  then
    raise exception 'Invalid Marketplace listing value'
      using errcode = '22023';
  end if;

  if char_length(coalesce(animal_name_value, '')) > 120
    or char_length(coalesce(species_value, '')) > 80
    or char_length(coalesce(breed_value, '')) > 120
    or char_length(coalesce(sex_value, '')) > 32
    or char_length(coalesce(variety_color_value, '')) > 120
    or char_length(coalesce(location_city_value, '')) > 100
    or char_length(coalesce(location_region_value, '')) > 100
    or char_length(coalesce(description_value, '')) > 4000
    or char_length(coalesce(pedigree_status_value, '')) > 80
    or char_length(coalesce(registration_status_value, '')) > 80
  then
    raise exception 'Marketplace listing field exceeds allowed length'
      using errcode = '22001';
  end if;

  if safe_source is not null and exists (
    select 1
    from public.herdharbor_sync_manifest m
    where m.user_id = actor and m.cutover_stage = 'normalized'
  ) then
    raise exception 'Marketplace herd-linked listing save requires an updated normalized-authority import bridge'
      using errcode = '55000';
  end if;

  if safe_source is not null and not exists (
    select 1
    from public.herdharbor_user_data d,
      lateral jsonb_array_elements(
        case
          when jsonb_typeof(d.app_state -> 'animals') = 'array' then d.app_state -> 'animals'
          else '[]'::jsonb
        end
      ) item
    where d.user_id = actor
      and safe_source = nullif(btrim(coalesce(item ->> 'id', item ->> 'uuid', item ->> 'recordId', item ->> 'record_id', item ->> 'key')), '')
  ) then
    raise exception 'Source animal does not belong to the current Owner account'
      using errcode = '42501';
  end if;

  if listing_id_value is null then
    insert into public.marketplace_listings (
      seller_id, source_animal_id, state, animal_name, species, breed, sex, dob,
      variety_color, price_cents, currency, location_city, location_region,
      description, pedigree_status, registration_status, pedigree_visibility,
      listing_kind, available_from, public_snapshot, published_at, last_confirmed_at
    )
    values (
      actor, safe_source, safe_state,
      btrim(coalesce(animal_name_value, '')),
      btrim(coalesce(species_value, '')),
      btrim(coalesce(breed_value, '')),
      btrim(coalesce(sex_value, '')),
      dob_value,
      btrim(coalesce(variety_color_value, '')),
      price_cents_value,
      safe_currency,
      btrim(coalesce(location_city_value, '')),
      btrim(coalesce(location_region_value, '')),
      btrim(coalesce(description_value, '')),
      btrim(coalesce(pedigree_status_value, '')),
      btrim(coalesce(registration_status_value, '')),
      safe_visibility,
      safe_kind,
      available_from_value,
      jsonb_build_object(
        'animal_name', btrim(coalesce(animal_name_value, '')),
        'species', btrim(coalesce(species_value, '')),
        'breed', btrim(coalesce(breed_value, '')),
        'sex', btrim(coalesce(sex_value, '')),
        'dob', dob_value,
        'variety_color', btrim(coalesce(variety_color_value, '')),
        'price_cents', price_cents_value,
        'currency', safe_currency,
        'location_city', btrim(coalesce(location_city_value, '')),
        'location_region', btrim(coalesce(location_region_value, '')),
        'description', btrim(coalesce(description_value, '')),
        'pedigree_status', btrim(coalesce(pedigree_status_value, '')),
        'registration_status', btrim(coalesce(registration_status_value, '')),
        'pedigree_visibility', safe_visibility,
        'listing_kind', safe_kind,
        'available_from', available_from_value
      ),
      case when safe_state = 'available' then now() else null end,
      now()
    )
    returning id into result_id;
  else
    update public.marketplace_listings
    set
      source_animal_id = safe_source,
      state = safe_state,
      animal_name = btrim(coalesce(animal_name_value, '')),
      species = btrim(coalesce(species_value, '')),
      breed = btrim(coalesce(breed_value, '')),
      sex = btrim(coalesce(sex_value, '')),
      dob = dob_value,
      variety_color = btrim(coalesce(variety_color_value, '')),
      price_cents = price_cents_value,
      currency = safe_currency,
      location_city = btrim(coalesce(location_city_value, '')),
      location_region = btrim(coalesce(location_region_value, '')),
      description = btrim(coalesce(description_value, '')),
      pedigree_status = btrim(coalesce(pedigree_status_value, '')),
      registration_status = btrim(coalesce(registration_status_value, '')),
      pedigree_visibility = safe_visibility,
      listing_kind = safe_kind,
      available_from = available_from_value,
      public_snapshot = jsonb_build_object(
        'animal_name', btrim(coalesce(animal_name_value, '')),
        'species', btrim(coalesce(species_value, '')),
        'breed', btrim(coalesce(breed_value, '')),
        'sex', btrim(coalesce(sex_value, '')),
        'dob', dob_value,
        'variety_color', btrim(coalesce(variety_color_value, '')),
        'price_cents', price_cents_value,
        'currency', safe_currency,
        'location_city', btrim(coalesce(location_city_value, '')),
        'location_region', btrim(coalesce(location_region_value, '')),
        'description', btrim(coalesce(description_value, '')),
        'pedigree_status', btrim(coalesce(pedigree_status_value, '')),
        'registration_status', btrim(coalesce(registration_status_value, '')),
        'pedigree_visibility', safe_visibility,
        'listing_kind', safe_kind,
        'available_from', available_from_value
      ),
      published_at = case
        when safe_state = 'available' and published_at is null then now()
        when safe_state <> 'available' then null
        else published_at
      end,
      last_confirmed_at = now(),
      updated_at = now()
    where id = listing_id_value
      and seller_id = actor
    returning id into result_id;

    if result_id is null then
      raise exception 'Marketplace listing was not found for current Owner'
        using errcode = '42501';
    end if;
  end if;

  return result_id;
end
$c3_save$;

revoke all on function public.marketplace_owner_save_listing(uuid,text,text,text,text,text,text,date,text,bigint,text,text,text,text,text,text,text,text,date) from public, anon;
grant execute on function public.marketplace_owner_save_listing(uuid,text,text,text,text,text,text,date,text,bigint,text,text,text,text,text,text,text,text,date) to authenticated;

create or replace function public.marketplace_owner_listings()
returns table (
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
  updated_at timestamptz,
  photo_paths jsonb
)
language sql
stable
security definer
set search_path = ''
as $c3_list$
  select
    l.id, l.source_animal_id, l.state, l.animal_name, l.species, l.breed, l.sex,
    l.dob, l.variety_color, l.price_cents, l.currency, l.location_city,
    l.location_region, l.description, l.pedigree_status, l.registration_status,
    l.pedigree_visibility, l.listing_kind, l.available_from, l.published_at,
    l.updated_at,
    coalesce((
      select jsonb_agg(p.storage_path order by p.sort_order, p.created_at)
      from public.marketplace_listing_photos p
      where p.listing_id = l.id and p.seller_id = l.seller_id
    ), '[]'::jsonb) as photo_paths
  from public.marketplace_listings l
  where l.seller_id = (select auth.uid())
    and (select public.herdharbor_account_role()) = 'owner'
  order by l.updated_at desc, l.created_at desc
$c3_list$;

revoke all on function public.marketplace_owner_listings() from public, anon;
grant execute on function public.marketplace_owner_listings() to authenticated;

create or replace function public.marketplace_owner_set_listing_photos(
  listing_id_value uuid,
  paths_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $c3_photos$
declare
  actor uuid := auth.uid();
  item jsonb;
  path_value text;
  position_value integer := 0;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace listing preview is Owner-only'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(paths_value, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(paths_value, '[]'::jsonb)) > 6
  then
    raise exception 'Marketplace listings support at most six photos'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id_value and l.seller_id = actor
  ) then
    raise exception 'Marketplace listing was not found for current Owner'
      using errcode = '42501';
  end if;

  delete from public.marketplace_listing_photos
  where listing_id = listing_id_value and seller_id = actor;

  for item in select value from jsonb_array_elements(coalesce(paths_value, '[]'::jsonb))
  loop
    path_value := nullif(btrim(item #>> '{}'), '');
    if path_value is null
      or path_value not like actor::text || '/listings/' || listing_id_value::text || '/%'
    then
      raise exception 'Marketplace listing photo path is outside the Owner listing prefix'
        using errcode = '42501';
    end if;

    insert into public.marketplace_listing_photos (
      listing_id, seller_id, storage_path, sort_order
    )
    values (listing_id_value, actor, path_value, position_value);

    position_value := position_value + 1;
  end loop;
end
$c3_photos$;

revoke all on function public.marketplace_owner_set_listing_photos(uuid,jsonb) from public, anon;
grant execute on function public.marketplace_owner_set_listing_photos(uuid,jsonb) to authenticated;

create or replace function public.marketplace_owner_delete_listing(listing_id_value uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $c3_delete$
declare
  actor uuid := auth.uid();
  deleted_count integer;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace listing preview is Owner-only'
      using errcode = '42501';
  end if;

  delete from public.marketplace_listings
  where id = listing_id_value and seller_id = actor;

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end
$c3_delete$;

revoke all on function public.marketplace_owner_delete_listing(uuid) from public, anon;
grant execute on function public.marketplace_owner_delete_listing(uuid) to authenticated;

-- The failed stack's listing RPCs remain inaccessible during private preview.
do $c3_legacy$
declare
  function_row record;
begin
  for function_row in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'marketplace_create_listing',
        'marketplace_public_listing',
        'marketplace_search_listings',
        'marketplace_update_listing',
        'marketplace_archive_listing',
        'marketplace_set_listing_state',
        'marketplace_upsert_listing',
        'marketplace_set_listing_photos',
        'marketplace_set_listing_attributes'
      )
  loop
    execute format('revoke all privileges on function %s from public, anon, authenticated', function_row.signature);
    execute format('grant execute on function %s to service_role', function_row.signature);
  end loop;
end
$c3_legacy$;
