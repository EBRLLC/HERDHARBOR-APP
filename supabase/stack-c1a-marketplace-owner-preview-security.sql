-- HerdHarbor revised Stack C1A — website-hosted Marketplace security foundation
-- Marketplace private Owner-preview foundation. Web UI is hosted only at https://herdharbor.com/marketplace/.
-- Marketplace data is server-native shared data and must not use private herd sync.

create table if not exists public.marketplace_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null default gen_random_uuid() unique,
  display_name text not null default '',
  rabbitry_name text not null default '',
  avatar_path text not null default '',
  city text not null default '',
  region text not null default '',
  about text not null default '',
  species_breeds jsonb not null default '[]'::jsonb,
  member_since timestamptz not null default now(),
  verification_status text not null default 'none'
    check (verification_status in ('none','pending','verified')),
  marketplace_status text not null default 'active'
    check (marketplace_status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  source_animal_id text,
  state text not null default 'draft'
    check (state in ('draft','available','pending','sold','archived','expired','removed')),
  animal_name text not null default '',
  species text not null default '',
  breed text not null default '',
  sex text not null default '',
  dob date,
  variety_color text not null default '',
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency text not null default 'USD',
  location_city text not null default '',
  location_region text not null default '',
  location_area_key text not null default '',
  description text not null default '',
  pedigree_status text not null default 'none',
  registration_status text not null default '',
  public_snapshot jsonb not null default '{}'::jsonb,
  pedigree_visibility text not null default 'hidden'
    check (pedigree_visibility in ('hidden','parents','3','4','5')),
  pedigree_depth integer not null default 0
    check (pedigree_depth >= 0 and pedigree_depth <= 8),
  public_pedigree jsonb,
  listing_kind text not null default 'individual'
    check (listing_kind in ('individual','future_offspring','litter_announcement')),
  available_from date,
  published_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  alt_text text not null default '',
  created_at timestamptz not null default now(),
  unique (listing_id, storage_path)
);

create table if not exists public.marketplace_listing_attributes (
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  attribute_key text not null,
  attribute_value text not null default '',
  created_at timestamptz not null default now(),
  primary key (listing_id, attribute_key)
);

create table if not exists public.marketplace_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Roll back the old failed Marketplace permission surface without deleting data.
-- Every existing marketplace_* table is closed first. Only the C1 core tables
-- below are reopened, and then only through Owner-role RLS.
do $$
declare
  table_row record;
  policy_row record;
begin
  for table_row in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'marketplace_%'
  loop
    execute format('alter table public.%I enable row level security', table_row.relname);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_row.relname);

    for policy_row in
      select polname
      from pg_policy
      where polrelid = format('public.%I', table_row.relname)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.polname, table_row.relname);
    end loop;
  end loop;
end
$$;

-- Disable every RPC left behind by the rolled-back Marketplace stack.
-- SECURITY DEFINER functions can bypass table RLS, so no legacy marketplace_*
-- RPC remains callable by anon or authenticated during the Owner-only preview.
do $marketplace_lockdown$
declare
  function_row record;
begin
  for function_row in
    select format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) as function_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'marketplace_%'
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      function_row.function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_row.function_signature
    );
  end loop;
end
$marketplace_lockdown$;

grant select, insert, update, delete on table public.marketplace_public_profiles to authenticated;
grant select, insert, update, delete on table public.marketplace_listings to authenticated;
grant select, insert, update, delete on table public.marketplace_listing_photos to authenticated;
grant select, insert, update, delete on table public.marketplace_listing_attributes to authenticated;
grant select, insert, delete on table public.marketplace_favorites to authenticated;

create policy marketplace_profiles_owner_preview
on public.marketplace_public_profiles
for all
to authenticated
using (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = user_id
)
with check (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = user_id
);

create policy marketplace_listings_owner_preview
on public.marketplace_listings
for all
to authenticated
using (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = seller_id
)
with check (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = seller_id
);

create policy marketplace_listing_photos_owner_preview
on public.marketplace_listing_photos
for all
to authenticated
using (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.marketplace_listings l
    where l.id = marketplace_listing_photos.listing_id
      and l.seller_id = (select auth.uid())
  )
)
with check (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.marketplace_listings l
    where l.id = marketplace_listing_photos.listing_id
      and l.seller_id = (select auth.uid())
  )
);

create policy marketplace_listing_attributes_owner_preview
on public.marketplace_listing_attributes
for all
to authenticated
using (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.marketplace_listings l
    where l.id = marketplace_listing_attributes.listing_id
      and l.seller_id = (select auth.uid())
  )
)
with check (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.marketplace_listings l
    where l.id = marketplace_listing_attributes.listing_id
      and l.seller_id = (select auth.uid())
  )
);

create policy marketplace_favorites_owner_preview
on public.marketplace_favorites
for all
to authenticated
using (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = user_id
)
with check (
  (select public.herdharbor_account_role()) = 'owner'
  and (select auth.uid()) = user_id
);

-- The failed stack left a bucket named marketplace-public publicly addressable.
-- C1 explicitly closes it. Future public launch must deliberately reopen a
-- privacy-safe media path.
insert into storage.buckets (id, name, public)
values ('marketplace-public', 'marketplace-public', false)
on conflict (id) do update set public = false;

drop policy if exists marketplace_storage_owner_select on storage.objects;
drop policy if exists marketplace_storage_owner_insert on storage.objects;
drop policy if exists marketplace_storage_owner_update on storage.objects;
drop policy if exists marketplace_storage_owner_delete on storage.objects;
drop policy if exists marketplace_storage_owner_preview_select on storage.objects;
drop policy if exists marketplace_storage_owner_preview_insert on storage.objects;
drop policy if exists marketplace_storage_owner_preview_update on storage.objects;
drop policy if exists marketplace_storage_owner_preview_delete on storage.objects;

create policy marketplace_storage_owner_preview_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (select public.herdharbor_account_role()) = 'owner'
);

create policy marketplace_storage_owner_preview_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (select public.herdharbor_account_role()) = 'owner'
);

create policy marketplace_storage_owner_preview_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (select public.herdharbor_account_role()) = 'owner'
)
with check (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (select public.herdharbor_account_role()) = 'owner'
);

create policy marketplace_storage_owner_preview_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-public'
  and owner_id = (select auth.uid())::text
  and (select public.herdharbor_account_role()) = 'owner'
);
