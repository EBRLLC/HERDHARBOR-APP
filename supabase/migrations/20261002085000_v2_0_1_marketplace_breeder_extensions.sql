begin;

alter table public.marketplace_listings
  add column if not exists listing_kind text not null default 'individual',
  add column if not exists available_from date;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_listing_kind_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_listing_kind_check
  check (listing_kind in ('individual','future_offspring','litter_announcement'));

create index if not exists marketplace_listings_available_from_idx
  on public.marketplace_listings(available_from)
  where state='available' and available_from is not null;


drop function if exists public.marketplace_my_listings(text);
create function public.marketplace_my_listings(status_filter text default null)
returns table (
  listing_id uuid,
  source_animal_id text,
  state text,
  listing_kind text,
  available_from date,
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
as $
  select l.id,l.source_animal_id,l.state,l.listing_kind,l.available_from,l.animal_name,l.species,l.breed,l.sex,l.price_cents,l.currency,
         l.location_city,l.location_region,l.pedigree_status,l.published_at,l.expires_at,l.last_confirmed_at,
         l.sold_at,l.created_at,l.updated_at,
         (select count(*) from public.marketplace_listing_photos p where p.listing_id=l.id)
  from public.marketplace_listings l
  where l.seller_id=(select auth.uid())
    and (nullif(trim(status_filter),'') is null or l.state=lower(trim(status_filter)))
  order by l.updated_at desc,l.id;
$;
revoke all on function public.marketplace_my_listings(text) from public,anon;
grant execute on function public.marketplace_my_listings(text) to authenticated;

create table if not exists public.marketplace_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_agreement_templates_user_idx on public.marketplace_agreement_templates(user_id,updated_at desc);

create table if not exists public.marketplace_listing_agreements (
  listing_id uuid primary key references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.marketplace_agreement_templates(id) on delete set null,
  title text not null,
  body text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_deposit_records (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents>=0),
  status text not null default 'planned' check (status in ('planned','received','applied','refunded','cancelled')),
  note text not null default '',
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_deposit_records_seller_idx on public.marketplace_deposit_records(seller_id,listing_id,created_at desc);

alter table public.marketplace_agreement_templates enable row level security;
alter table public.marketplace_listing_agreements enable row level security;
alter table public.marketplace_deposit_records enable row level security;

revoke all on public.marketplace_agreement_templates,public.marketplace_listing_agreements,public.marketplace_deposit_records from anon,authenticated;

create policy marketplace_agreement_templates_owner_all on public.marketplace_agreement_templates for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy marketplace_listing_agreements_owner_all on public.marketplace_listing_agreements for all to authenticated
  using ((select auth.uid())=seller_id) with check ((select auth.uid())=seller_id);
create policy marketplace_deposit_records_owner_all on public.marketplace_deposit_records for all to authenticated
  using ((select auth.uid())=seller_id) with check ((select auth.uid())=seller_id);

create or replace function public.marketplace_update_listing_extensions(
  target_listing_id uuid,
  listing_kind_value text,
  available_from_value date
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare kind text := lower(trim(coalesce(listing_kind_value,'individual')));
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if kind not in ('individual','future_offspring','litter_announcement') then raise exception 'unsupported listing kind'; end if;
  update public.marketplace_listings
  set listing_kind=kind,available_from=available_from_value,updated_at=now()
  where id=target_listing_id and seller_id=caller;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
end;
$$;
revoke all on function public.marketplace_update_listing_extensions(uuid,text,date) from public,anon;
grant execute on function public.marketplace_update_listing_extensions(uuid,text,date) to authenticated;

create or replace function public.marketplace_listing_extension(target_listing_id uuid)
returns table (
  listing_kind text,
  available_from date,
  agreement_available boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select l.listing_kind,l.available_from,
    exists(select 1 from public.marketplace_listing_agreements a where a.listing_id=l.id)
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=target_listing_id
    and l.state in ('available','pending','sold')
    and p.marketplace_status='active'
  limit 1;
$$;
revoke all on function public.marketplace_listing_extension(uuid) from public;
grant execute on function public.marketplace_listing_extension(uuid) to anon,authenticated;

create or replace function public.marketplace_save_agreement_template(
  target_template_id uuid,
  template_title text,
  template_body text
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
  if nullif(trim(template_title),'') is null or nullif(trim(template_body),'') is null then raise exception 'agreement title and body are required'; end if;
  if target_template_id is null then
    insert into public.marketplace_agreement_templates(user_id,title,body)
    values(caller,left(trim(template_title),160),left(trim(template_body),12000))
    returning id into saved_id;
  else
    update public.marketplace_agreement_templates
    set title=left(trim(template_title),160),body=left(trim(template_body),12000),updated_at=now()
    where id=target_template_id and user_id=caller
    returning id into saved_id;
    if saved_id is null then raise exception 'agreement template unavailable' using errcode='42501'; end if;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.marketplace_save_agreement_template(uuid,text,text) from public,anon;
grant execute on function public.marketplace_save_agreement_template(uuid,text,text) to authenticated;

create or replace function public.marketplace_agreement_templates()
returns table (
  template_id uuid,
  title text,
  body text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select t.id,t.title,t.body,t.updated_at
  from public.marketplace_agreement_templates t
  where t.user_id=(select auth.uid())
  order by t.updated_at desc,t.id;
$$;
revoke all on function public.marketplace_agreement_templates() from public,anon;
grant execute on function public.marketplace_agreement_templates() to authenticated;

create or replace function public.marketplace_attach_agreement(
  target_listing_id uuid,
  target_template_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare template_row public.marketplace_agreement_templates%rowtype;
declare new_version integer;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.marketplace_listings l where l.id=target_listing_id and l.seller_id=caller) then
    raise exception 'listing unavailable' using errcode='42501';
  end if;
  select * into template_row from public.marketplace_agreement_templates where id=target_template_id and user_id=caller;
  if not found then raise exception 'agreement template unavailable' using errcode='42501'; end if;

  insert into public.marketplace_listing_agreements(listing_id,seller_id,template_id,title,body,version)
  values(target_listing_id,caller,target_template_id,template_row.title,template_row.body,1)
  on conflict (listing_id) do update
    set template_id=excluded.template_id,title=excluded.title,body=excluded.body,
        version=public.marketplace_listing_agreements.version+1,updated_at=now()
  returning version into new_version;
  return new_version;
end;
$$;
revoke all on function public.marketplace_attach_agreement(uuid,uuid) from public,anon;
grant execute on function public.marketplace_attach_agreement(uuid,uuid) to authenticated;

create or replace function public.marketplace_public_agreement(target_listing_id uuid)
returns table (
  title text,
  body text,
  version integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select a.title,a.body,a.version,a.updated_at
  from public.marketplace_listing_agreements a
  join public.marketplace_listings l on l.id=a.listing_id
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where a.listing_id=target_listing_id
    and l.state in ('available','pending','sold')
    and p.marketplace_status='active'
  limit 1;
$$;
revoke all on function public.marketplace_public_agreement(uuid) from public;
grant execute on function public.marketplace_public_agreement(uuid) to anon,authenticated;

create or replace function public.marketplace_add_deposit_record(
  target_listing_id uuid,
  amount_value bigint,
  status_value text,
  note_value text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare deposit_id uuid;
declare normalized_status text := lower(trim(coalesce(status_value,'planned')));
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if amount_value<0 then raise exception 'deposit amount must be zero or more'; end if;
  if normalized_status not in ('planned','received','applied','refunded','cancelled') then raise exception 'unsupported deposit status'; end if;
  if not exists(select 1 from public.marketplace_listings l where l.id=target_listing_id and l.seller_id=caller) then
    raise exception 'listing unavailable' using errcode='42501';
  end if;
  insert into public.marketplace_deposit_records(listing_id,seller_id,amount_cents,status,note,received_at)
  values(target_listing_id,caller,amount_value,normalized_status,left(coalesce(note_value,''),1000),case when normalized_status='received' then now() else null end)
  returning id into deposit_id;
  return deposit_id;
end;
$$;
revoke all on function public.marketplace_add_deposit_record(uuid,bigint,text,text) from public,anon;
grant execute on function public.marketplace_add_deposit_record(uuid,bigint,text,text) to authenticated;

create or replace function public.marketplace_deposit_records(target_listing_id uuid)
returns table (
  deposit_id uuid,
  amount_cents bigint,
  status text,
  note text,
  received_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select d.id,d.amount_cents,d.status,d.note,d.received_at,d.created_at
  from public.marketplace_deposit_records d
  where d.listing_id=target_listing_id and d.seller_id=(select auth.uid())
  order by d.created_at desc,d.id;
$$;
revoke all on function public.marketplace_deposit_records(uuid) from public,anon;
grant execute on function public.marketplace_deposit_records(uuid) to authenticated;

comment on table public.marketplace_deposit_records is
  'Seller-private deposit tracking only. HerdHarbor does not process or hold deposit payments in this table.';
comment on table public.marketplace_listing_agreements is
  'Deliberately attached public agreement snapshot. Editing the private template does not silently change an attached listing agreement.';

commit;
