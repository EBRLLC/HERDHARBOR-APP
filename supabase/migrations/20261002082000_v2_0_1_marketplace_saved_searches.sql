begin;

create table if not exists public.marketplace_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  search_text text not null default '',
  species text not null default '',
  breed text not null default '',
  sex text not null default '',
  min_price_cents bigint check (min_price_cents is null or min_price_cents>=0),
  max_price_cents bigint check (max_price_cents is null or max_price_cents>=0),
  pedigree_status text not null default '',
  region text not null default '',
  alerts_enabled boolean not null default true,
  delivery_preferences jsonb not null default '{"inApp":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_price_cents is null or min_price_cents is null or max_price_cents>=min_price_cents)
);
create index if not exists marketplace_saved_searches_user_idx on public.marketplace_saved_searches(user_id,updated_at desc);
create index if not exists marketplace_saved_searches_alert_idx on public.marketplace_saved_searches(alerts_enabled,user_id) where alerts_enabled=true;

alter table public.marketplace_saved_searches enable row level security;
revoke all on public.marketplace_saved_searches from anon,authenticated;

create policy marketplace_saved_searches_owner_select on public.marketplace_saved_searches for select to authenticated
  using ((select auth.uid())=user_id);
create policy marketplace_saved_searches_owner_insert on public.marketplace_saved_searches for insert to authenticated
  with check ((select auth.uid())=user_id);
create policy marketplace_saved_searches_owner_update on public.marketplace_saved_searches for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy marketplace_saved_searches_owner_delete on public.marketplace_saved_searches for delete to authenticated
  using ((select auth.uid())=user_id);

create or replace function public.marketplace_save_search(
  target_search_id uuid,
  search_name text,
  search_text_value text,
  species_value text,
  breed_value text,
  sex_value text,
  min_price_value bigint,
  max_price_value bigint,
  pedigree_value text,
  region_value text,
  alerts_value boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare saved_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if min_price_value is not null and min_price_value<0 then raise exception 'invalid minimum price'; end if;
  if max_price_value is not null and max_price_value<0 then raise exception 'invalid maximum price'; end if;
  if min_price_value is not null and max_price_value is not null and max_price_value<min_price_value then raise exception 'maximum price must be at least minimum price'; end if;

  if target_search_id is null then
    insert into public.marketplace_saved_searches(
      user_id,name,search_text,species,breed,sex,min_price_cents,max_price_cents,pedigree_status,region,alerts_enabled
    ) values (
      caller,left(coalesce(nullif(trim(search_name),''),'Saved Marketplace search'),120),
      left(coalesce(search_text_value,''),200),left(coalesce(species_value,''),120),left(coalesce(breed_value,''),160),
      left(coalesce(sex_value,''),40),min_price_value,max_price_value,left(coalesce(pedigree_value,''),80),
      left(coalesce(region_value,''),120),coalesce(alerts_value,true)
    ) returning id into saved_id;
  else
    update public.marketplace_saved_searches s
    set name=left(coalesce(nullif(trim(search_name),''),s.name),120),
        search_text=left(coalesce(search_text_value,''),200),
        species=left(coalesce(species_value,''),120),
        breed=left(coalesce(breed_value,''),160),
        sex=left(coalesce(sex_value,''),40),
        min_price_cents=min_price_value,
        max_price_cents=max_price_value,
        pedigree_status=left(coalesce(pedigree_value,''),80),
        region=left(coalesce(region_value,''),120),
        alerts_enabled=coalesce(alerts_value,s.alerts_enabled),
        updated_at=now()
    where s.id=target_search_id and s.user_id=caller
    returning id into saved_id;
    if saved_id is null then raise exception 'saved search unavailable' using errcode='42501'; end if;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.marketplace_save_search(uuid,text,text,text,text,text,bigint,bigint,text,text,boolean) from public,anon;
grant execute on function public.marketplace_save_search(uuid,text,text,text,text,text,bigint,bigint,text,text,boolean) to authenticated;

create or replace function public.marketplace_saved_searches()
returns table (
  search_id uuid,
  name text,
  search_text text,
  species text,
  breed text,
  sex text,
  min_price_cents bigint,
  max_price_cents bigint,
  pedigree_status text,
  region text,
  alerts_enabled boolean,
  delivery_preferences jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select s.id,s.name,s.search_text,s.species,s.breed,s.sex,s.min_price_cents,s.max_price_cents,
         s.pedigree_status,s.region,s.alerts_enabled,s.delivery_preferences,s.created_at,s.updated_at
  from public.marketplace_saved_searches s
  where s.user_id=(select auth.uid())
  order by s.updated_at desc,s.id;
$$;
revoke all on function public.marketplace_saved_searches() from public,anon;
grant execute on function public.marketplace_saved_searches() to authenticated;

create or replace function public.marketplace_delete_saved_search(target_search_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.marketplace_saved_searches where id=target_search_id and user_id=(select auth.uid());
  if not found then raise exception 'saved search unavailable' using errcode='42501'; end if;
end;
$$;
revoke all on function public.marketplace_delete_saved_search(uuid) from public,anon;
grant execute on function public.marketplace_delete_saved_search(uuid) to authenticated;

create or replace function herdharbor_private.marketplace_notify_saved_searches()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.state<>'available' then return new; end if;
  if tg_op='UPDATE' and old.state='available' and
     old.animal_name is not distinct from new.animal_name and
     old.species is not distinct from new.species and
     old.breed is not distinct from new.breed and
     old.sex is not distinct from new.sex and
     old.price_cents is not distinct from new.price_cents and
     old.location_region is not distinct from new.location_region and
     old.pedigree_status is not distinct from new.pedigree_status and
     old.description is not distinct from new.description then
    return new;
  end if;

  insert into public.marketplace_notifications(user_id,kind,listing_id,dedupe_key,payload)
  select
    s.user_id,
    'saved_search_match',
    new.id,
    'saved-search:'||s.id::text||':'||new.id::text,
    jsonb_build_object('search_id',s.id,'search_name',s.name,'listing_name',new.animal_name)
  from public.marketplace_saved_searches s
  where s.alerts_enabled=true
    and s.user_id<>new.seller_id
    and (nullif(trim(s.search_text),'') is null or
         new.animal_name ilike '%'||trim(s.search_text)||'%' or
         new.breed ilike '%'||trim(s.search_text)||'%' or
         new.variety_color ilike '%'||trim(s.search_text)||'%' or
         new.description ilike '%'||trim(s.search_text)||'%')
    and (nullif(trim(s.species),'') is null or lower(new.species)=lower(trim(s.species)))
    and (nullif(trim(s.breed),'') is null or lower(new.breed)=lower(trim(s.breed)))
    and (nullif(trim(s.sex),'') is null or lower(new.sex)=lower(trim(s.sex)))
    and (s.min_price_cents is null or new.price_cents>=s.min_price_cents)
    and (s.max_price_cents is null or new.price_cents<=s.max_price_cents)
    and (nullif(trim(s.pedigree_status),'') is null or lower(new.pedigree_status)=lower(trim(s.pedigree_status)))
    and (nullif(trim(s.region),'') is null or lower(new.location_region)=lower(trim(s.region)))
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists marketplace_notify_saved_searches on public.marketplace_listings;
create trigger marketplace_notify_saved_searches
after insert or update of state,animal_name,species,breed,sex,price_cents,location_region,pedigree_status,description
on public.marketplace_listings
for each row execute function herdharbor_private.marketplace_notify_saved_searches();

comment on column public.marketplace_saved_searches.delivery_preferences is
  'Reserved delivery preferences. Phase 20 uses in-app notifications; future email/push channels can be added without changing search matching.';

commit;
