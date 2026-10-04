-- HerdHarbor revised Stack C2A — seller profile APIs only
-- Owner-only seller profile editing plus a privacy-safe future-public preview contract for herdharbor.com.
-- No anonymous/public Marketplace access is enabled here.

create or replace function public.marketplace_owner_profile_editor()
returns table (
  public_id uuid,
  display_name text,
  rabbitry_name text,
  avatar_path text,
  city text,
  region text,
  about text,
  species_breeds jsonb,
  member_since timestamptz,
  verification_status text,
  marketplace_status text
)
language sql
stable
security definer
set search_path = ''
as $c2_editor$
  select
    p.public_id,
    p.display_name,
    p.rabbitry_name,
    p.avatar_path,
    p.city,
    p.region,
    p.about,
    p.species_breeds,
    p.member_since,
    p.verification_status,
    p.marketplace_status
  from public.marketplace_public_profiles p
  where p.user_id = (select auth.uid())
    and (select public.herdharbor_account_role()) = 'owner'
  limit 1
$c2_editor$;

revoke all on function public.marketplace_owner_profile_editor() from public, anon;
grant execute on function public.marketplace_owner_profile_editor() to authenticated;

create or replace function public.marketplace_owner_profile_preview()
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
  has_avatar boolean,
  active_listing_count bigint
)
language sql
stable
security definer
set search_path = ''
as $c2_preview$
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
    nullif(btrim(p.avatar_path), '') is not null as has_avatar,
    (
      select count(*)::bigint
      from public.marketplace_listings l
      where l.seller_id = p.user_id
        and l.state = 'available'
    ) as active_listing_count
  from public.marketplace_public_profiles p
  where p.user_id = (select auth.uid())
    and (select public.herdharbor_account_role()) = 'owner'
  limit 1
$c2_preview$;

revoke all on function public.marketplace_owner_profile_preview() from public, anon;
grant execute on function public.marketplace_owner_profile_preview() to authenticated;

create or replace function public.marketplace_owner_save_profile(
  display_name_value text,
  rabbitry_name_value text,
  avatar_path_value text,
  city_value text,
  region_value text,
  about_value text,
  species_breeds_value jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c2_save$
declare
  actor uuid := auth.uid();
  cleaned_species jsonb := coalesce(species_breeds_value, '[]'::jsonb);
  result_public_id uuid;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace profile preview is Owner-only'
      using errcode = '42501';
  end if;

  if char_length(coalesce(display_name_value, '')) > 100
    or char_length(coalesce(rabbitry_name_value, '')) > 120
    or char_length(coalesce(city_value, '')) > 100
    or char_length(coalesce(region_value, '')) > 100
    or char_length(coalesce(about_value, '')) > 1200
  then
    raise exception 'Marketplace profile field exceeds allowed length'
      using errcode = '22001';
  end if;

  if jsonb_typeof(cleaned_species) <> 'array'
    or jsonb_array_length(cleaned_species) > 40
  then
    raise exception 'species_breeds must be an array with at most 40 entries'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(cleaned_species) item
    where jsonb_typeof(item) <> 'string'
       or char_length(item #>> '{}') > 80
  ) then
    raise exception 'species_breeds entries must be strings of 80 characters or fewer'
      using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(avatar_path_value, '')), '') is not null
    and avatar_path_value not like actor::text || '/profiles/%'
  then
    raise exception 'Avatar path must belong to the current Owner account'
      using errcode = '42501';
  end if;

  insert into public.marketplace_public_profiles (
    user_id,
    display_name,
    rabbitry_name,
    avatar_path,
    city,
    region,
    about,
    species_breeds,
    updated_at
  )
  values (
    actor,
    btrim(coalesce(display_name_value, '')),
    btrim(coalesce(rabbitry_name_value, '')),
    btrim(coalesce(avatar_path_value, '')),
    btrim(coalesce(city_value, '')),
    btrim(coalesce(region_value, '')),
    btrim(coalesce(about_value, '')),
    cleaned_species,
    now()
  )
  on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    rabbitry_name = excluded.rabbitry_name,
    avatar_path = excluded.avatar_path,
    city = excluded.city,
    region = excluded.region,
    about = excluded.about,
    species_breeds = excluded.species_breeds,
    updated_at = now()
  returning public_id into result_public_id;

  return result_public_id;
end
$c2_save$;

revoke all on function public.marketplace_owner_save_profile(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.marketplace_owner_save_profile(text,text,text,text,text,text,jsonb) to authenticated;

-- The prior failed-stack public profile RPC must stay closed throughout private preview.
do $c2_legacy$
begin
  if to_regprocedure('public.marketplace_public_profile(uuid)') is not null then
    revoke all on function public.marketplace_public_profile(uuid) from public, anon, authenticated;
    grant execute on function public.marketplace_public_profile(uuid) to service_role;
  end if;
end
$c2_legacy$;
