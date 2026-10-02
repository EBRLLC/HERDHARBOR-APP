begin;

alter table public.marketplace_public_profiles
  add column if not exists public_id uuid not null default gen_random_uuid();

create unique index if not exists marketplace_public_profiles_public_id_idx
  on public.marketplace_public_profiles(public_id);

create or replace function public.marketplace_public_profile(target_public_id uuid)
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
  active_listing_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
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
    (
      select count(*)
      from public.marketplace_listings l
      where l.seller_id=p.user_id
        and l.state='available'
        and (l.expires_at is null or l.expires_at>now())
    ) as active_listing_count
  from public.marketplace_public_profiles p
  where p.public_id=target_public_id
    and p.marketplace_status='active'
  limit 1;
$$;

revoke all on function public.marketplace_public_profile(uuid) from public;
grant execute on function public.marketplace_public_profile(uuid) to anon, authenticated;

comment on function public.marketplace_public_profile(uuid) is
  'Privacy-safe Marketplace seller projection. Never returns auth user id, email, phone, street address, billing, subscription, private herd, or private records.';

commit;
