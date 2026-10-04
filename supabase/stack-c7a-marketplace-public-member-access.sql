-- HerdHarbor Stack C7A — public read-only Marketplace + member account isolation.
-- Guests may browse only intentionally public listing/profile/pedigree/media data.
-- Authenticated members may interact only through account-bound RPCs.
-- Direct table access remains closed to browser roles.

-- ---------------------------------------------------------------------------
-- Private authorization helpers
-- ---------------------------------------------------------------------------

create schema if not exists herdharbor_private;

create or replace function herdharbor_private.marketplace_current_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $c7_active$
  select exists (
    select 1
    from public.account_access a
    join auth.users u on u.id = a.user_id
    left join public.registration_policy rp on rp.singleton = true
    where a.user_id = (select auth.uid())
      and lower(coalesce(a.account_status,'')) = 'active'
      and not exists (
        select 1
        from public.marketplace_public_profiles mp
        where mp.user_id = a.user_id
          and mp.marketplace_status = 'suspended'
      )
      and (
        coalesce(rp.enabled,false) = false
        or rp.enforcement_started_at is null
        or u.created_at < rp.enforcement_started_at
        or exists (
          select 1
          from public.registration_profiles reg
          where reg.user_id = a.user_id
            and reg.age_verified_at is not null
        )
      )
  )
$c7_active$;

revoke all on function herdharbor_private.marketplace_current_account_active() from public, anon;
grant execute on function herdharbor_private.marketplace_current_account_active() to authenticated;

create or replace function herdharbor_private.marketplace_current_user_is_conversation_member(
  conversation_id_value uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $c7_conv_member$
  select exists (
    select 1
    from public.marketplace_conversation_members m
    where m.conversation_id = conversation_id_value
      and m.user_id = (select auth.uid())
  )
$c7_conv_member$;

revoke all on function herdharbor_private.marketplace_current_user_is_conversation_member(uuid) from public, anon;
grant execute on function herdharbor_private.marketplace_current_user_is_conversation_member(uuid) to authenticated;

revoke usage on schema herdharbor_private from anon;
grant usage on schema herdharbor_private to authenticated;

-- ---------------------------------------------------------------------------
-- Browser table boundary: no direct Marketplace table access.
-- All browser data access is through the explicit RPC contracts below.
-- ---------------------------------------------------------------------------

revoke all privileges on table public.marketplace_public_profiles from anon, authenticated;
revoke all privileges on table public.marketplace_listings from anon, authenticated;
revoke all privileges on table public.marketplace_listing_photos from anon, authenticated;
revoke all privileges on table public.marketplace_listing_attributes from anon, authenticated;
revoke all privileges on table public.marketplace_favorites from anon, authenticated;
revoke all privileges on table public.marketplace_conversations from anon, authenticated;
revoke all privileges on table public.marketplace_conversation_members from anon, authenticated;
revoke all privileges on table public.marketplace_messages from anon, authenticated;
revoke all privileges on table public.marketplace_message_attachments from anon, authenticated;
revoke all privileges on table public.marketplace_blocks from anon, authenticated;
revoke all privileges on table public.marketplace_reports from anon, authenticated;
revoke all privileges on table public.marketplace_moderation_actions from anon, authenticated;

-- Defense-in-depth RLS: even if table privileges are accidentally granted later,
-- authenticated users remain constrained to their own seller/member rows.

drop policy if exists marketplace_profiles_owner_preview on public.marketplace_public_profiles;
drop policy if exists marketplace_profiles_member_self on public.marketplace_public_profiles;
create policy marketplace_profiles_member_self
on public.marketplace_public_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists marketplace_listings_owner_preview on public.marketplace_listings;
drop policy if exists marketplace_listings_member_self on public.marketplace_listings;
create policy marketplace_listings_member_self
on public.marketplace_listings
for all
to authenticated
using ((select auth.uid()) = seller_id)
with check ((select auth.uid()) = seller_id);

drop policy if exists marketplace_listing_photos_owner_preview on public.marketplace_listing_photos;
drop policy if exists marketplace_listing_photos_member_self on public.marketplace_listing_photos;
create policy marketplace_listing_photos_member_self
on public.marketplace_listing_photos
for all
to authenticated
using ((select auth.uid()) = seller_id)
with check ((select auth.uid()) = seller_id);

drop policy if exists marketplace_listing_attributes_owner_preview on public.marketplace_listing_attributes;
drop policy if exists marketplace_listing_attributes_member_self on public.marketplace_listing_attributes;
create policy marketplace_listing_attributes_member_self
on public.marketplace_listing_attributes
for all
to authenticated
using ((select auth.uid()) = seller_id)
with check ((select auth.uid()) = seller_id);

drop policy if exists marketplace_favorites_owner_preview on public.marketplace_favorites;
drop policy if exists marketplace_favorites_member_self on public.marketplace_favorites;
create policy marketplace_favorites_member_self
on public.marketplace_favorites
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists marketplace_conversations_member_select on public.marketplace_conversations;
create policy marketplace_conversations_member_select
on public.marketplace_conversations
for select
to authenticated
using (
  herdharbor_private.marketplace_current_user_is_conversation_member(id)
);

drop policy if exists marketplace_conversation_members_self_select on public.marketplace_conversation_members;
create policy marketplace_conversation_members_self_select
on public.marketplace_conversation_members
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists marketplace_messages_member_select on public.marketplace_messages;
create policy marketplace_messages_member_select
on public.marketplace_messages
for select
to authenticated
using (
  herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id)
);

drop policy if exists marketplace_messages_member_insert on public.marketplace_messages;
create policy marketplace_messages_member_insert
on public.marketplace_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id)
);

drop policy if exists marketplace_message_attachments_member_select on public.marketplace_message_attachments;
create policy marketplace_message_attachments_member_select
on public.marketplace_message_attachments
for select
to authenticated
using (
  herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id)
);

-- ---------------------------------------------------------------------------
-- Private Storage bucket: public media can be signed only when it is referenced
-- by an active public seller/listing. Members keep full access to their own
-- Marketplace media. Message attachments remain private.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id,name,public)
values ('marketplace-public','marketplace-public',false)
on conflict (id) do update set public=false;

drop policy if exists marketplace_storage_owner_preview_select on storage.objects;
drop policy if exists marketplace_storage_owner_preview_insert on storage.objects;
drop policy if exists marketplace_storage_owner_preview_update on storage.objects;
drop policy if exists marketplace_storage_owner_preview_delete on storage.objects;
drop policy if exists marketplace_storage_public_read on storage.objects;
create policy marketplace_storage_member_own_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
);

create policy marketplace_storage_member_own_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] in ('profiles','listings')
  and herdharbor_private.marketplace_current_account_active()
);

create policy marketplace_storage_member_own_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] in ('profiles','listings')
  and herdharbor_private.marketplace_current_account_active()
);

create policy marketplace_storage_member_own_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- Public read-only Marketplace contracts.
-- ---------------------------------------------------------------------------

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
as $c7_public_search$
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
    and (nullif(btrim(coalesce(species_value,'')),'') is null or lower(l.species)=lower(btrim(species_value)))
    and (nullif(btrim(coalesce(breed_value,'')),'') is null or lower(l.breed)=lower(btrim(breed_value)))
    and (nullif(btrim(coalesce(sex_value,'')),'') is null or lower(l.sex)=lower(btrim(sex_value)))
    and (nullif(btrim(coalesce(region_value,'')),'') is null or lower(l.location_region)=lower(btrim(region_value)))
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
$c7_public_search$;

revoke all on function public.marketplace_public_search_v2(text,text,text,text,text,text,text,bigint,bigint,uuid,text,integer,integer) from public;
grant execute on function public.marketplace_public_search_v2(text,text,text,text,text,text,text,bigint,bigint,uuid,text,integer,integer) to anon, authenticated;

create or replace function public.marketplace_public_listing_v2(listing_id_value uuid)
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
  pedigree_visibility text,
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
language sql
stable
security definer
set search_path = ''
as $c7_public_detail$
  select
    l.id,l.animal_name,l.species,l.breed,l.sex,l.dob,l.variety_color,
    l.price_cents,l.currency,l.location_city,l.location_region,l.description,
    l.pedigree_status,l.registration_status,l.pedigree_visibility,l.listing_kind,
    l.available_from,l.published_at,p.public_id,p.display_name,p.rabbitry_name,
    p.city,p.region,p.verification_status
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=listing_id_value
    and l.state='available'
    and p.marketplace_status='active'
    and (l.expires_at is null or l.expires_at>now())
  limit 1
$c7_public_detail$;

revoke all on function public.marketplace_public_listing_v2(uuid) from public;
grant execute on function public.marketplace_public_listing_v2(uuid) to anon, authenticated;

create or replace function public.marketplace_public_seller_v2(seller_public_id_value uuid)
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
  active_listing_count bigint
)
language sql
stable
security definer
set search_path = ''
as $c7_public_seller$
  select
    p.public_id,p.display_name,p.rabbitry_name,p.city,p.region,p.about,
    p.species_breeds,p.member_since,p.verification_status,
    (
      select count(*)::bigint
      from public.marketplace_listings l
      where l.seller_id=p.user_id
        and l.state='available'
        and (l.expires_at is null or l.expires_at>now())
    )
  from public.marketplace_public_profiles p
  where p.public_id=seller_public_id_value
    and p.marketplace_status='active'
  limit 1
$c7_public_seller$;

revoke all on function public.marketplace_public_seller_v2(uuid) from public;
grant execute on function public.marketplace_public_seller_v2(uuid) to anon, authenticated;

create or replace function public.marketplace_public_facets_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $c7_public_facets$
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
$c7_public_facets$;

revoke all on function public.marketplace_public_facets_v2() from public;
grant execute on function public.marketplace_public_facets_v2() to anon, authenticated;

create or replace function public.marketplace_public_pedigree_v2(listing_id_value uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $c7_public_pedigree$
  select case
    when l.public_pedigree is null then jsonb_build_object('available',false,'reason','unavailable')
    else jsonb_build_object(
      'available',true,
      'visibility',l.pedigree_visibility,
      'snapshot',l.public_pedigree
    )
  end
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=listing_id_value
    and l.state='available'
    and p.marketplace_status='active'
    and (l.expires_at is null or l.expires_at>now())
    and l.pedigree_visibility<>'hidden'
  limit 1
$c7_public_pedigree$;

revoke all on function public.marketplace_public_pedigree_v2(uuid) from public;
grant execute on function public.marketplace_public_pedigree_v2(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated member context + seller profile.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_member_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c7_member_session$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'user_id',actor,
    'account_role',a.account_role,
    'account_status',a.account_status,
    'membership_tier',a.membership_tier,
    'marketplace_access_ready',herdharbor_private.marketplace_current_account_active(),
    'seller_public_id',p.public_id,
    'marketplace_status',coalesce(p.marketplace_status,'not_created')
  )
  into result
  from public.account_access a
  left join public.marketplace_public_profiles p on p.user_id=a.user_id
  where a.user_id=actor
  limit 1;

  if result is null then
    raise exception 'Account access profile is unavailable' using errcode='42501';
  end if;

  return result;
end
$c7_member_session$;

revoke all on function public.marketplace_member_session() from public, anon;
grant execute on function public.marketplace_member_session() to authenticated;

create or replace function public.marketplace_member_profile_editor()
returns table (
  public_id uuid,display_name text,rabbitry_name text,avatar_path text,city text,region text,
  about text,species_breeds jsonb,member_since timestamptz,verification_status text,marketplace_status text
)
language sql
stable
security definer
set search_path = ''
as $c7_member_profile_editor$
  select p.public_id,p.display_name,p.rabbitry_name,p.avatar_path,p.city,p.region,p.about,
         p.species_breeds,p.member_since,p.verification_status,p.marketplace_status
  from public.marketplace_public_profiles p
  where p.user_id=(select auth.uid())
    and herdharbor_private.marketplace_current_account_active()
  limit 1
$c7_member_profile_editor$;

revoke all on function public.marketplace_member_profile_editor() from public, anon;
grant execute on function public.marketplace_member_profile_editor() to authenticated;

create or replace function public.marketplace_member_profile_preview()
returns table (
  public_id uuid,display_name text,rabbitry_name text,city text,region text,about text,
  species_breeds jsonb,member_since timestamptz,verification_status text,marketplace_status text,
  has_avatar boolean,active_listing_count bigint
)
language sql
stable
security definer
set search_path = ''
as $c7_member_profile_preview$
  select
    p.public_id,p.display_name,p.rabbitry_name,p.city,p.region,p.about,p.species_breeds,
    p.member_since,p.verification_status,p.marketplace_status,
    nullif(btrim(p.avatar_path),'') is not null,
    (select count(*)::bigint from public.marketplace_listings l where l.seller_id=p.user_id and l.state='available')
  from public.marketplace_public_profiles p
  where p.user_id=(select auth.uid())
    and herdharbor_private.marketplace_current_account_active()
  limit 1
$c7_member_profile_preview$;

revoke all on function public.marketplace_member_profile_preview() from public, anon;
grant execute on function public.marketplace_member_profile_preview() to authenticated;

create or replace function public.marketplace_member_save_profile(
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
as $c7_member_save_profile$
declare
  actor uuid := auth.uid();
  cleaned_species jsonb := coalesce(species_breeds_value,'[]'::jsonb);
  result_public_id uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if char_length(coalesce(display_name_value,''))>100
    or char_length(coalesce(rabbitry_name_value,''))>120
    or char_length(coalesce(city_value,''))>100
    or char_length(coalesce(region_value,''))>100
    or char_length(coalesce(about_value,''))>1200
  then
    raise exception 'Marketplace profile field exceeds allowed length' using errcode='22001';
  end if;

  if jsonb_typeof(cleaned_species)<>'array' or jsonb_array_length(cleaned_species)>40 then
    raise exception 'species_breeds must be an array with at most 40 entries' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(cleaned_species) item
    where jsonb_typeof(item)<>'string' or char_length(item #>> '{}')>80
  ) then
    raise exception 'species_breeds entries must be strings of 80 characters or fewer' using errcode='22023';
  end if;

  if nullif(btrim(coalesce(avatar_path_value,'')),'') is not null
    and (
      avatar_path_value not like 'profiles/%'
      or not exists (
        select 1
        from storage.objects o
        where o.bucket_id='marketplace-public'
          and o.name=avatar_path_value
          and o.owner_id=actor::text
      )
    )
  then
    raise exception 'Avatar path does not belong to the current account' using errcode='42501';
  end if;

  insert into public.marketplace_public_profiles(
    user_id,display_name,rabbitry_name,avatar_path,city,region,about,species_breeds,updated_at
  )
  values(
    actor,btrim(coalesce(display_name_value,'')),btrim(coalesce(rabbitry_name_value,'')),
    btrim(coalesce(avatar_path_value,'')),btrim(coalesce(city_value,'')),btrim(coalesce(region_value,'')),
    btrim(coalesce(about_value,'')),cleaned_species,now()
  )
  on conflict(user_id) do update
  set display_name=excluded.display_name,
      rabbitry_name=excluded.rabbitry_name,
      avatar_path=excluded.avatar_path,
      city=excluded.city,
      region=excluded.region,
      about=excluded.about,
      species_breeds=excluded.species_breeds,
      updated_at=now()
  returning public_id into result_public_id;

  return result_public_id;
end
$c7_member_save_profile$;

revoke all on function public.marketplace_member_save_profile(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.marketplace_member_save_profile(text,text,text,text,text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated member listing ownership.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_member_herd_animals()
returns table (
  source_animal_id text,animal_name text,species text,breed text,sex text,dob date,
  variety_color text,asking_price text,herd_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $c7_member_herd$
declare
  actor uuid := auth.uid();
  authority_stage text;
  snapshot jsonb;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select m.cutover_stage into authority_stage
  from public.herdharbor_sync_manifest m where m.user_id=actor;

  if authority_stage='normalized' then
    raise exception 'Marketplace herd import bridge does not read normalized authority yet'
      using errcode='55000',
      hint='Do not fall back to a stale legacy snapshot; update the read-only Marketplace import bridge first.';
  end if;

  select d.app_state into snapshot
  from public.herdharbor_user_data d where d.user_id=actor limit 1;

  if snapshot is null then return; end if;

  return query
  select
    nullif(btrim(coalesce(item->>'id',item->>'uuid',item->>'recordId',item->>'record_id',item->>'key')),''),
    left(btrim(coalesce(item->>'name','')),120),
    left(btrim(coalesce(item->>'species','')),80),
    left(btrim(coalesce(item->>'breed','')),120),
    left(btrim(coalesce(item->>'sex','')),32),
    case when coalesce(item->>'dob','') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'dob')::date else null end,
    left(btrim(coalesce(item->>'color','')),120),
    left(btrim(coalesce(item->>'askingPrice','')),32),
    left(btrim(coalesce(item->>'status','')),40)
  from jsonb_array_elements(
    case when jsonb_typeof(snapshot->'animals')='array' then snapshot->'animals' else '[]'::jsonb end
  ) item
  where nullif(btrim(coalesce(item->>'id',item->>'uuid',item->>'recordId',item->>'record_id',item->>'key')),'') is not null
    and lower(coalesce(item->>'status','')) not in ('deceased','archived','ancestor only')
  order by lower(coalesce(item->>'name','')),1;
end
$c7_member_herd$;

revoke all on function public.marketplace_member_herd_animals() from public, anon;
grant execute on function public.marketplace_member_herd_animals() to authenticated;

create or replace function public.marketplace_member_save_listing(
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
as $c7_member_save_listing$
declare
  actor uuid := auth.uid();
  result_id uuid;
  safe_state text := lower(btrim(coalesce(state_value,'draft')));
  safe_currency text := upper(btrim(coalesce(currency_value,'USD')));
  safe_visibility text := lower(btrim(coalesce(pedigree_visibility_value,'hidden')));
  safe_kind text := lower(btrim(coalesce(listing_kind_value,'individual')));
  safe_source text := nullif(btrim(coalesce(source_animal_id_value,'')),'');
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if safe_state not in ('draft','available','pending','sold','archived')
    or safe_visibility not in ('hidden','parents','3','4','5')
    or safe_kind not in ('individual','future_offspring','litter_announcement')
    or safe_currency !~ '^[A-Z]{3}$'
    or (price_cents_value is not null and price_cents_value<0)
  then
    raise exception 'Invalid Marketplace listing value' using errcode='22023';
  end if;

  if safe_state='available' and not exists (
    select 1 from public.marketplace_public_profiles p
    where p.user_id=actor and p.marketplace_status='active'
  ) then
    raise exception 'Create an active Marketplace seller profile before publishing a listing' using errcode='42501';
  end if;

  if char_length(coalesce(animal_name_value,''))>120
    or char_length(coalesce(species_value,''))>80
    or char_length(coalesce(breed_value,''))>120
    or char_length(coalesce(sex_value,''))>32
    or char_length(coalesce(variety_color_value,''))>120
    or char_length(coalesce(location_city_value,''))>100
    or char_length(coalesce(location_region_value,''))>100
    or char_length(coalesce(description_value,''))>4000
    or char_length(coalesce(pedigree_status_value,''))>80
    or char_length(coalesce(registration_status_value,''))>80
  then
    raise exception 'Marketplace listing field exceeds allowed length' using errcode='22001';
  end if;

  if safe_source is not null and exists (
    select 1 from public.herdharbor_sync_manifest m
    where m.user_id=actor and m.cutover_stage='normalized'
  ) then
    raise exception 'Marketplace herd-linked listing save requires an updated normalized-authority import bridge'
      using errcode='55000';
  end if;

  if safe_source is not null and not exists (
    select 1
    from public.herdharbor_user_data d,
      lateral jsonb_array_elements(
        case when jsonb_typeof(d.app_state->'animals')='array' then d.app_state->'animals' else '[]'::jsonb end
      ) item
    where d.user_id=actor
      and safe_source=nullif(btrim(coalesce(item->>'id',item->>'uuid',item->>'recordId',item->>'record_id',item->>'key')),'')
  ) then
    raise exception 'Source animal does not belong to the current account' using errcode='42501';
  end if;

  if listing_id_value is null then
    insert into public.marketplace_listings(
      seller_id,source_animal_id,state,animal_name,species,breed,sex,dob,variety_color,
      price_cents,currency,location_city,location_region,description,pedigree_status,
      registration_status,pedigree_visibility,listing_kind,available_from,public_snapshot,
      published_at,last_confirmed_at
    )
    values(
      actor,safe_source,safe_state,btrim(coalesce(animal_name_value,'')),btrim(coalesce(species_value,'')),
      btrim(coalesce(breed_value,'')),btrim(coalesce(sex_value,'')),dob_value,
      btrim(coalesce(variety_color_value,'')),price_cents_value,safe_currency,
      btrim(coalesce(location_city_value,'')),btrim(coalesce(location_region_value,'')),
      btrim(coalesce(description_value,'')),btrim(coalesce(pedigree_status_value,'')),
      btrim(coalesce(registration_status_value,'')),safe_visibility,safe_kind,available_from_value,
      jsonb_build_object(
        'animal_name',btrim(coalesce(animal_name_value,'')),
        'species',btrim(coalesce(species_value,'')),
        'breed',btrim(coalesce(breed_value,'')),
        'sex',btrim(coalesce(sex_value,'')),
        'dob',dob_value,
        'variety_color',btrim(coalesce(variety_color_value,'')),
        'price_cents',price_cents_value,
        'currency',safe_currency,
        'location_city',btrim(coalesce(location_city_value,'')),
        'location_region',btrim(coalesce(location_region_value,'')),
        'description',btrim(coalesce(description_value,'')),
        'pedigree_status',btrim(coalesce(pedigree_status_value,'')),
        'registration_status',btrim(coalesce(registration_status_value,'')),
        'pedigree_visibility',safe_visibility,
        'listing_kind',safe_kind,
        'available_from',available_from_value
      ),
      case when safe_state='available' then now() else null end,
      now()
    )
    returning id into result_id;
  else
    update public.marketplace_listings
    set source_animal_id=safe_source,
        state=safe_state,
        animal_name=btrim(coalesce(animal_name_value,'')),
        species=btrim(coalesce(species_value,'')),
        breed=btrim(coalesce(breed_value,'')),
        sex=btrim(coalesce(sex_value,'')),
        dob=dob_value,
        variety_color=btrim(coalesce(variety_color_value,'')),
        price_cents=price_cents_value,
        currency=safe_currency,
        location_city=btrim(coalesce(location_city_value,'')),
        location_region=btrim(coalesce(location_region_value,'')),
        description=btrim(coalesce(description_value,'')),
        pedigree_status=btrim(coalesce(pedigree_status_value,'')),
        registration_status=btrim(coalesce(registration_status_value,'')),
        pedigree_visibility=safe_visibility,
        listing_kind=safe_kind,
        available_from=available_from_value,
        public_snapshot=jsonb_build_object(
          'animal_name',btrim(coalesce(animal_name_value,'')),
          'species',btrim(coalesce(species_value,'')),
          'breed',btrim(coalesce(breed_value,'')),
          'sex',btrim(coalesce(sex_value,'')),
          'dob',dob_value,
          'variety_color',btrim(coalesce(variety_color_value,'')),
          'price_cents',price_cents_value,
          'currency',safe_currency,
          'location_city',btrim(coalesce(location_city_value,'')),
          'location_region',btrim(coalesce(location_region_value,'')),
          'description',btrim(coalesce(description_value,'')),
          'pedigree_status',btrim(coalesce(pedigree_status_value,'')),
          'registration_status',btrim(coalesce(registration_status_value,'')),
          'pedigree_visibility',safe_visibility,
          'listing_kind',safe_kind,
          'available_from',available_from_value
        ),
        published_at=case
          when safe_state='available' and published_at is null then now()
          when safe_state<>'available' then null
          else published_at
        end,
        last_confirmed_at=now(),
        updated_at=now()
    where id=listing_id_value
      and seller_id=actor
      and state<>'removed'
    returning id into result_id;

    if result_id is null then
      raise exception 'Listing is unavailable for this account' using errcode='42501';
    end if;
  end if;

  return result_id;
end
$c7_member_save_listing$;

revoke all on function public.marketplace_member_save_listing(uuid,text,text,text,text,text,text,date,text,bigint,text,text,text,text,text,text,text,text,date) from public, anon;
grant execute on function public.marketplace_member_save_listing(uuid,text,text,text,text,text,text,date,text,bigint,text,text,text,text,text,text,text,text,date) to authenticated;

create or replace function public.marketplace_member_listings()
returns table (
  id uuid,source_animal_id text,state text,animal_name text,species text,breed text,sex text,dob date,
  variety_color text,price_cents bigint,currency text,location_city text,location_region text,
  description text,pedigree_status text,registration_status text,pedigree_visibility text,
  listing_kind text,available_from date,published_at timestamptz,updated_at timestamptz,photo_paths jsonb
)
language sql
stable
security definer
set search_path = ''
as $c7_member_listings$
  select
    l.id,l.source_animal_id,l.state,l.animal_name,l.species,l.breed,l.sex,l.dob,l.variety_color,
    l.price_cents,l.currency,l.location_city,l.location_region,l.description,l.pedigree_status,
    l.registration_status,l.pedigree_visibility,l.listing_kind,l.available_from,l.published_at,l.updated_at,
    coalesce((
      select jsonb_agg(ph.storage_path order by ph.sort_order,ph.created_at)
      from public.marketplace_listing_photos ph
      where ph.listing_id=l.id and ph.seller_id=l.seller_id
    ),'[]'::jsonb)
  from public.marketplace_listings l
  where l.seller_id=(select auth.uid())
    and herdharbor_private.marketplace_current_account_active()
  order by l.updated_at desc,l.created_at desc
$c7_member_listings$;

revoke all on function public.marketplace_member_listings() from public, anon;
grant execute on function public.marketplace_member_listings() to authenticated;

create or replace function public.marketplace_member_set_listing_photos(
  listing_id_value uuid,
  paths_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $c7_member_photos$
declare
  actor uuid := auth.uid();
  item jsonb;
  path_value text;
  position_value integer := 0;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if jsonb_typeof(coalesce(paths_value,'[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(paths_value,'[]'::jsonb))>6
  then
    raise exception 'Marketplace listings support at most six photos' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.marketplace_listings l
    where l.id=listing_id_value and l.seller_id=actor and l.state<>'removed'
  ) then
    raise exception 'Listing is unavailable for this account' using errcode='42501';
  end if;

  delete from public.marketplace_listing_photos
  where listing_id=listing_id_value and seller_id=actor;

  for item in select value from jsonb_array_elements(coalesce(paths_value,'[]'::jsonb))
  loop
    path_value:=nullif(btrim(item #>> '{}'),'');
    if path_value is null
      or path_value not like 'listings/'||listing_id_value::text||'/%'
      or not exists (
        select 1
        from storage.objects o
        where o.bucket_id='marketplace-public'
          and o.name=path_value
          and o.owner_id=actor::text
      )
    then
      raise exception 'Listing photo path does not belong to this account listing' using errcode='42501';
    end if;

    insert into public.marketplace_listing_photos(listing_id,seller_id,storage_path,sort_order)
    values(listing_id_value,actor,path_value,position_value);
    position_value:=position_value+1;
  end loop;
end
$c7_member_photos$;

revoke all on function public.marketplace_member_set_listing_photos(uuid,jsonb) from public, anon;
grant execute on function public.marketplace_member_set_listing_photos(uuid,jsonb) to authenticated;

create or replace function public.marketplace_member_delete_listing(listing_id_value uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $c7_member_delete_listing$
declare
  actor uuid := auth.uid();
  deleted_count integer;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  delete from public.marketplace_listings
  where id=listing_id_value and seller_id=actor and state<>'removed';

  get diagnostics deleted_count=row_count;
  return deleted_count=1;
end
$c7_member_delete_listing$;

revoke all on function public.marketplace_member_delete_listing(uuid) from public, anon;
grant execute on function public.marketplace_member_delete_listing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated favorites.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_member_favorite_ids()
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $c7_member_favorites$
declare
  actor uuid := auth.uid();
  result uuid[];
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select coalesce(array_agg(f.listing_id order by f.created_at desc),array[]::uuid[])
  into result
  from public.marketplace_favorites f
  where f.user_id=actor;

  return result;
end
$c7_member_favorites$;

revoke all on function public.marketplace_member_favorite_ids() from public, anon;
grant execute on function public.marketplace_member_favorite_ids() to authenticated;

create or replace function public.marketplace_member_toggle_favorite(
  listing_id_value uuid,
  favorite_value boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $c7_member_toggle_favorite$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.marketplace_listings l
    join public.marketplace_public_profiles p on p.user_id=l.seller_id
    where l.id=listing_id_value and l.state='available' and p.marketplace_status='active'
      and (l.expires_at is null or l.expires_at>now())
  ) then
    raise exception 'Marketplace listing is unavailable' using errcode='22023';
  end if;

  if coalesce(favorite_value,false) then
    insert into public.marketplace_favorites(user_id,listing_id)
    values(actor,listing_id_value)
    on conflict(user_id,listing_id) do nothing;
    return true;
  end if;

  delete from public.marketplace_favorites where user_id=actor and listing_id=listing_id_value;
  return false;
end
$c7_member_toggle_favorite$;

revoke all on function public.marketplace_member_toggle_favorite(uuid,boolean) from public, anon;
grant execute on function public.marketplace_member_toggle_favorite(uuid,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated private conversations/messages. Every read/write re-checks
-- conversation membership against auth.uid(); no caller can select another
-- account's inbox or message thread by guessing UUIDs.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_member_open_listing_conversation(listing_id_value uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c7_open_conversation$
declare
  actor uuid := auth.uid();
  seller uuid;
  existing_id uuid;
  new_id uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Sign in with an active HerdHarbor account to message sellers' using errcode='42501';
  end if;

  select l.seller_id into seller
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=listing_id_value
    and l.state='available'
    and p.marketplace_status='active'
    and (l.expires_at is null or l.expires_at>now());

  if seller is null then raise exception 'Listing unavailable' using errcode='22023'; end if;
  if seller=actor then raise exception 'You cannot message your own listing' using errcode='22023'; end if;

  if exists (
    select 1 from public.marketplace_blocks b
    where (b.blocker_id=actor and b.blocked_id=seller)
       or (b.blocker_id=seller and b.blocked_id=actor)
  ) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  select c.id into existing_id
  from public.marketplace_conversations c
  where c.listing_id=listing_id_value
    and exists(select 1 from public.marketplace_conversation_members m where m.conversation_id=c.id and m.user_id=actor)
    and exists(select 1 from public.marketplace_conversation_members m where m.conversation_id=c.id and m.user_id=seller)
  order by c.created_at
  limit 1;

  if existing_id is not null then return existing_id; end if;

  insert into public.marketplace_conversations(listing_id,created_by)
  values(listing_id_value,actor)
  returning id into new_id;

  insert into public.marketplace_conversation_members(conversation_id,user_id,role)
  values(new_id,actor,'buyer'),(new_id,seller,'seller');

  return new_id;
end
$c7_open_conversation$;

revoke all on function public.marketplace_member_open_listing_conversation(uuid) from public, anon;
grant execute on function public.marketplace_member_open_listing_conversation(uuid) to authenticated;

create or replace function public.marketplace_member_inbox(folder_value text default 'all')
returns table (
  conversation_id uuid,
  listing_id uuid,
  listing_name text,
  member_role text,
  unread_count integer,
  archived boolean,
  other_public_id uuid,
  other_display_name text,
  other_rabbitry_name text,
  last_message_at timestamptz,
  last_message_preview text
)
language sql
stable
security definer
set search_path = ''
as $c7_inbox$
  with mine as (
    select m.*
    from public.marketplace_conversation_members m
    where m.user_id=(select auth.uid())
      and herdharbor_private.marketplace_current_account_active()
      and (
        lower(coalesce(folder_value,'all'))='all'
        or (lower(folder_value)='buying' and m.role='buyer')
        or (lower(folder_value)='selling' and m.role='seller')
        or (lower(folder_value)='unread' and m.unread_count>0)
      )
  )
  select
    c.id,c.listing_id,coalesce(l.animal_name,'Marketplace conversation'),mine.role,
    mine.unread_count,mine.archived_at is not null,op.public_id,op.display_name,op.rabbitry_name,
    lm.created_at,left(coalesce(lm.body,''),180)
  from mine
  join public.marketplace_conversations c on c.id=mine.conversation_id
  left join public.marketplace_listings l on l.id=c.listing_id
  left join lateral (
    select other.user_id
    from public.marketplace_conversation_members other
    where other.conversation_id=c.id and other.user_id<>(select auth.uid())
    order by other.joined_at
    limit 1
  ) other_member on true
  left join public.marketplace_public_profiles op on op.user_id=other_member.user_id
  left join lateral (
    select msg.created_at,msg.body
    from public.marketplace_messages msg
    where msg.conversation_id=c.id
    order by msg.created_at desc,msg.id desc
    limit 1
  ) lm on true
  order by coalesce(lm.created_at,c.updated_at,c.created_at) desc,c.id
$c7_inbox$;

revoke all on function public.marketplace_member_inbox(text) from public, anon;
grant execute on function public.marketplace_member_inbox(text) to authenticated;

create or replace function public.marketplace_member_messages(
  conversation_id_value uuid,
  limit_value integer default 100,
  before_value timestamptz default null
)
returns table (
  message_id uuid,
  sender_public_id uuid,
  sender_is_me boolean,
  sender_display_name text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $c7_messages$
declare
  actor uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(limit_value,100),1),200);
begin
  if actor is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  return query
  select
    m.id,p.public_id,m.sender_id=actor,p.display_name,m.body,m.created_at,m.edited_at
  from public.marketplace_messages m
  left join public.marketplace_public_profiles p on p.user_id=m.sender_id
  where m.conversation_id=conversation_id_value
    and (before_value is null or m.created_at<before_value)
  order by m.created_at desc,m.id desc
  limit safe_limit;
end
$c7_messages$;

revoke all on function public.marketplace_member_messages(uuid,integer,timestamptz) from public, anon;
grant execute on function public.marketplace_member_messages(uuid,integer,timestamptz) to authenticated;

create or replace function public.marketplace_member_send_message(
  conversation_id_value uuid,
  body_value text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c7_send_message$
declare
  actor uuid := auth.uid();
  safe_body text := btrim(coalesce(body_value,''));
  result_id uuid;
begin
  if actor is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  if char_length(safe_body)<1 or char_length(safe_body)>5000 then
    raise exception 'Message must be between 1 and 5000 characters' using errcode='22023';
  end if;

  if exists (
    select 1
    from public.marketplace_conversation_members mine
    join public.marketplace_conversation_members other
      on other.conversation_id=mine.conversation_id and other.user_id<>mine.user_id
    join public.marketplace_blocks b
      on (b.blocker_id=mine.user_id and b.blocked_id=other.user_id)
      or (b.blocker_id=other.user_id and b.blocked_id=mine.user_id)
    where mine.conversation_id=conversation_id_value and mine.user_id=actor
  ) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  insert into public.marketplace_messages(conversation_id,sender_id,body)
  values(conversation_id_value,actor,safe_body)
  returning id into result_id;

  update public.marketplace_conversations
  set updated_at=now()
  where id=conversation_id_value;

  update public.marketplace_conversation_members
  set unread_count=unread_count+1
  where conversation_id=conversation_id_value
    and user_id<>actor;

  return result_id;
end
$c7_send_message$;

revoke all on function public.marketplace_member_send_message(uuid,text) from public, anon;
grant execute on function public.marketplace_member_send_message(uuid,text) to authenticated;

create or replace function public.marketplace_member_mark_conversation_read(conversation_id_value uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $c7_mark_read$
declare
  actor uuid := auth.uid();
begin
  if actor is null
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  update public.marketplace_conversation_members
  set unread_count=0
  where conversation_id=conversation_id_value and user_id=actor;
end
$c7_mark_read$;

revoke all on function public.marketplace_member_mark_conversation_read(uuid) from public, anon;
grant execute on function public.marketplace_member_mark_conversation_read(uuid) to authenticated;

create or replace function public.marketplace_member_block_profile(target_public_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $c7_block_profile$
declare
  actor uuid := auth.uid();
  target_user uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select p.user_id into target_user
  from public.marketplace_public_profiles p
  where p.public_id=target_public_id;

  if target_user is null or target_user=actor then
    raise exception 'Profile unavailable' using errcode='22023';
  end if;

  insert into public.marketplace_blocks(blocker_id,blocked_id)
  values(actor,target_user)
  on conflict do nothing;
end
$c7_block_profile$;

revoke all on function public.marketplace_member_block_profile(uuid) from public, anon;
grant execute on function public.marketplace_member_block_profile(uuid) to authenticated;

create or replace function public.marketplace_member_submit_report(
  target_type_value text,
  target_id_value text,
  reason_value text,
  details_value text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c7_submit_report$
declare
  actor uuid := auth.uid();
  safe_type text := lower(btrim(coalesce(target_type_value,'')));
  safe_reason text := left(btrim(coalesce(reason_value,'')),240);
  safe_details text := left(btrim(coalesce(details_value,'')),2000);
  target_uuid uuid;
  recent_count integer;
  result_id uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Sign in to report Marketplace content' using errcode='42501';
  end if;

  if safe_type not in ('listing','user','conversation','message') or safe_reason='' then
    raise exception 'Invalid report' using errcode='22023';
  end if;

  begin
    target_uuid:=target_id_value::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid report target' using errcode='22023';
  end;

  select count(*) into recent_count
  from public.marketplace_reports r
  where r.reporter_id=actor and r.created_at>now()-interval '1 hour';

  if recent_count>=10 then
    raise exception 'Report rate limit exceeded' using errcode='54000';
  end if;

  if safe_type='listing' and not exists (
    select 1 from public.marketplace_listings l
    join public.marketplace_public_profiles p on p.user_id=l.seller_id
    where l.id=target_uuid and l.state='available' and p.marketplace_status='active'
  ) then
    raise exception 'Listing unavailable' using errcode='22023';
  elsif safe_type='user' and not exists (
    select 1 from public.marketplace_public_profiles p
    where p.public_id=target_uuid and p.user_id<>actor
  ) then
    raise exception 'Profile unavailable' using errcode='22023';
  elsif safe_type='conversation'
    and not herdharbor_private.marketplace_current_user_is_conversation_member(target_uuid)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  elsif safe_type='message' and not exists (
    select 1 from public.marketplace_messages m
    where m.id=target_uuid
      and herdharbor_private.marketplace_current_user_is_conversation_member(m.conversation_id)
  ) then
    raise exception 'Message unavailable' using errcode='42501';
  end if;

  insert into public.marketplace_reports(reporter_id,target_type,target_id,reason,details)
  values(actor,safe_type,target_uuid::text,safe_reason,safe_details)
  returning id into result_id;

  return result_id;
end
$c7_submit_report$;

revoke all on function public.marketplace_member_submit_report(text,text,text,text) from public, anon;
grant execute on function public.marketplace_member_submit_report(text,text,text,text) to authenticated;

-- Keep the abandoned-stack browser RPCs closed so there is one supported access
-- contract for C7. Public reads use *_v2; account operations use marketplace_member_*.
do $c7_legacy_lock$
declare
  function_row record;
begin
  for function_row in
    select format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'marketplace_search_listings',
        'marketplace_public_listing',
        'marketplace_public_profile',
        'marketplace_public_pedigree',
        'marketplace_open_listing_conversation',
        'marketplace_inbox',
        'marketplace_block_profile'
      )
  loop
    execute format('revoke all privileges on function %s from public, anon, authenticated',function_row.signature);
    execute format('grant execute on function %s to service_role',function_row.signature);
  end loop;
end
$c7_legacy_lock$;
