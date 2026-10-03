begin;

create or replace function public.marketplace_my_listings(status_filter text default null)
returns table (
  listing_id uuid,
  source_animal_id text,
  state text,
  animal_name text,
  species text,
  breed text,
  sex text,
  price_cents bigint,
  currency text,
  location_city text,
  location_region text,
  pedigree_status text,
  published_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  photo_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
  select l.id,l.source_animal_id,l.state,l.animal_name,l.species,l.breed,l.sex,l.price_cents,l.currency,
         l.location_city,l.location_region,l.pedigree_status,l.published_at,l.expires_at,l.last_confirmed_at,
         l.sold_at,l.created_at,l.updated_at,
         (select count(*) from public.marketplace_listing_photos p where p.listing_id=l.id)
  from public.marketplace_listings l
  where l.seller_id=(select auth.uid())
    and (nullif(trim(status_filter),'') is null or l.state=lower(trim(status_filter)))
  order by l.updated_at desc,l.id;
$$;
revoke all on function public.marketplace_my_listings(text) from public,anon;
grant execute on function public.marketplace_my_listings(text) to authenticated;

create or replace function public.marketplace_update_listing_state(target_listing_id uuid,new_state text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare desired text := lower(trim(coalesce(new_state,'')));
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if desired not in ('draft','available','pending','sold','archived') then raise exception 'unsupported listing state'; end if;
  update public.marketplace_listings l
  set state=desired,
      published_at=case when desired='available' then coalesce(l.published_at,now()) else l.published_at end,
      expires_at=case when desired='available' then greatest(coalesce(l.expires_at,now()),now()+interval '60 days') else l.expires_at end,
      last_confirmed_at=case when desired='available' then now() else l.last_confirmed_at end,
      sold_at=case when desired='sold' then coalesce(l.sold_at,now()) when desired in ('draft','available','pending') then null else l.sold_at end,
      updated_at=now()
  where l.id=target_listing_id and l.seller_id=caller;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
  return desired;
end;
$$;
revoke all on function public.marketplace_update_listing_state(uuid,text) from public,anon;
grant execute on function public.marketplace_update_listing_state(uuid,text) to authenticated;

create or replace function public.marketplace_confirm_listing(target_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare confirmed timestamptz := now();
begin
  update public.marketplace_listings l
  set last_confirmed_at=confirmed,
      expires_at=greatest(coalesce(l.expires_at,confirmed),confirmed+interval '60 days'),
      updated_at=confirmed
  where l.id=target_listing_id and l.seller_id=caller and l.state='available';
  if not found then raise exception 'available listing unavailable' using errcode='42501'; end if;
  return confirmed;
end;
$$;
revoke all on function public.marketplace_confirm_listing(uuid) from public,anon;
grant execute on function public.marketplace_confirm_listing(uuid) to authenticated;

create or replace function public.marketplace_refresh_seller_notifications()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare inserted_count integer := 0;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;

  update public.marketplace_listings l
  set state='expired',updated_at=now()
  where l.seller_id=caller and l.state='available' and l.expires_at is not null and l.expires_at<=now();


  insert into public.marketplace_notifications(user_id,kind,listing_id,dedupe_key,payload)
  select caller,'stale_listing',l.id,
         'stale:'||l.id::text||':'||to_char(now(),'YYYY-MM'),
         jsonb_build_object('listing_name',l.animal_name,'last_confirmed_at',l.last_confirmed_at,'published_at',l.published_at)
  from public.marketplace_listings l
  where l.seller_id=caller
    and l.state='available'
    and (l.expires_at is null or l.expires_at>now())
    and coalesce(l.last_confirmed_at,l.published_at,l.created_at)<now()-interval '30 days'
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$$;
revoke all on function public.marketplace_refresh_seller_notifications() from public,anon;
grant execute on function public.marketplace_refresh_seller_notifications() to authenticated;

create or replace function public.marketplace_my_notifications(result_limit integer default 50)
returns table (
  notification_id uuid,
  kind text,
  listing_id uuid,
  conversation_id uuid,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select n.id,n.kind,n.listing_id,n.conversation_id,n.payload,n.read_at,n.created_at
  from public.marketplace_notifications n
  where n.user_id=(select auth.uid())
  order by n.created_at desc,n.id
  limit least(greatest(coalesce(result_limit,50),1),100);
$$;
revoke all on function public.marketplace_my_notifications(integer) from public,anon;
grant execute on function public.marketplace_my_notifications(integer) to authenticated;

create or replace function public.marketplace_mark_notification_read(target_notification_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.marketplace_notifications
  set read_at=coalesce(read_at,now())
  where id=target_notification_id and user_id=(select auth.uid());
  if not found then raise exception 'notification unavailable' using errcode='42501'; end if;
end;
$$;
revoke all on function public.marketplace_mark_notification_read(uuid) from public,anon;
grant execute on function public.marketplace_mark_notification_read(uuid) to authenticated;

create or replace function public.marketplace_my_favorites(result_limit integer default 60)
returns table (
  listing_id uuid,
  animal_name text,
  breed text,
  sex text,
  price_cents bigint,
  currency text,
  location_city text,
  location_region text,
  state text,
  primary_photo_path text,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select l.id,l.animal_name,l.breed,l.sex,l.price_cents,l.currency,l.location_city,l.location_region,l.state,
    (select p.storage_path from public.marketplace_listing_photos p where p.listing_id=l.id order by p.sort_order,p.created_at limit 1),
    f.created_at
  from public.marketplace_favorites f
  join public.marketplace_listings l on l.id=f.listing_id
  join public.marketplace_public_profiles p on p.user_id=l.seller_id and p.marketplace_status='active'
  where f.user_id=(select auth.uid())
  order by f.created_at desc
  limit least(greatest(coalesce(result_limit,60),1),100);
$$;
revoke all on function public.marketplace_my_favorites(integer) from public,anon;
grant execute on function public.marketplace_my_favorites(integer) to authenticated;

commit;
