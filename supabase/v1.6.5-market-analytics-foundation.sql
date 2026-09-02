-- HerdHarbor Alpha v1.6.5: privacy-safe Market Analytics foundation.
-- Review in PR before applying. This file does not deploy itself.
-- Private farm state remains in public.herdharbor_user_data; only allowlisted,
-- de-identified facts are copied into the private market schema.

begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists market_private;
revoke all on schema market_private from public, anon, authenticated;
grant usage on schema market_private to service_role;

create table if not exists market_private.market_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  consent_version text not null,
  enabled_at timestamptz,
  disabled_at timestamptz,
  include_historical boolean not null default false,
  region_country text,
  region_code text,
  broad_region text,
  updated_at timestamptz not null default now(),
  check (region_country is null or region_country ~ '^[A-Z]{2}$'),
  check (char_length(coalesce(region_code, '')) <= 32),
  check (char_length(coalesce(broad_region, '')) <= 64)
);

create table if not exists market_private.market_contribution_processing (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sale_id text not null,
  source_item_id text not null,
  fingerprint text not null,
  consent_version text not null,
  active boolean not null default true,
  processed_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (user_id, source_sale_id, source_item_id)
);

create table if not exists market_private.market_facts (
  id uuid primary key default extensions.gen_random_uuid(),
  contribution_id uuid not null unique references market_private.market_contribution_processing(id) on delete cascade,
  species text,
  breed text,
  sex text,
  age_at_sale_days integer,
  age_bucket text,
  color_variety text,
  pedigree_status text,
  registration_status text,
  listed_price_at_sale numeric(14,2),
  sale_price numeric(14,2) not null,
  sale_month smallint not null check (sale_month between 1 and 12),
  sale_year smallint not null check (sale_year between 1900 and 2200),
  region_country text,
  region_code text,
  broad_region text,
  currency text not null default 'USD',
  structured_traits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_at_sale_days is null or age_at_sale_days >= 0),
  check (listed_price_at_sale is null or listed_price_at_sale >= 0),
  check (sale_price >= 0),
  check (jsonb_typeof(structured_traits) = 'object')
);

create table if not exists market_private.market_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into market_private.market_config(key, value)
values ('minimum_sample_size', '5'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create index if not exists market_processing_user_idx
  on market_private.market_contribution_processing(user_id);
create index if not exists market_facts_dimensions_idx
  on market_private.market_facts(species, breed, sale_year, sale_month);
create index if not exists market_facts_region_idx
  on market_private.market_facts(region_country, region_code, broad_region);

alter table market_private.market_consent enable row level security;
alter table market_private.market_contribution_processing enable row level security;
alter table market_private.market_facts enable row level security;
alter table market_private.market_config enable row level security;

revoke all on all tables in schema market_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema market_private to service_role;

create or replace function market_private.safe_numeric(value text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when value ~ '^\s*[0-9]+(?:\.[0-9]+)?\s*$' then value::numeric
    else null
  end;
$$;

create or replace function market_private.safe_date(value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return substring(value from 1 for 10)::date;
exception when others then
  return null;
end;
$$;

create or replace function market_private.age_bucket(age_days integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when age_days is null then null
    when age_days <= 56 then 'Birth–8 weeks'
    when age_days <= 84 then '9–12 weeks'
    when age_days <= 183 then '3–6 months'
    when age_days <= 365 then '7–12 months'
    when age_days <= 730 then '1–2 years'
    else 'Over 2 years'
  end;
$$;

create or replace function public.market_record_consent(
  p_user_id uuid,
  p_enabled boolean,
  p_consent_version text,
  p_enabled_at timestamptz,
  p_disabled_at timestamptz,
  p_include_historical boolean,
  p_region_country text,
  p_region_code text,
  p_broad_region text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_user_id is null or p_consent_version is null or btrim(p_consent_version) = '' then
    raise exception 'A user and consent version are required.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'The authenticated account does not exist.' using errcode = '22023';
  end if;

  insert into market_private.market_consent as existing(
    user_id, enabled, consent_version, enabled_at, disabled_at, include_historical,
    region_country, region_code, broad_region, updated_at
  ) values (
    p_user_id, p_enabled, p_consent_version,
    case when p_enabled then coalesce(p_enabled_at, v_now) else p_enabled_at end,
    case when p_enabled then null else coalesce(p_disabled_at, v_now) end,
    case when p_enabled then coalesce(p_include_historical, false) else false end,
    nullif(upper(left(btrim(coalesce(p_region_country, '')), 2)), ''),
    nullif(left(btrim(coalesce(p_region_code, '')), 32), ''),
    nullif(left(btrim(coalesce(p_broad_region, '')), 64), ''),
    v_now
  )
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    consent_version = excluded.consent_version,
    enabled_at = case
      when excluded.enabled and existing.enabled then existing.enabled_at
      else excluded.enabled_at
    end,
    disabled_at = excluded.disabled_at,
    include_historical = excluded.include_historical,
    region_country = excluded.region_country,
    region_code = excluded.region_code,
    broad_region = excluded.broad_region,
    updated_at = v_now;

  return jsonb_build_object(
    'enabled', p_enabled,
    'consentVersion', p_consent_version,
    'updatedAt', v_now
  );
end;
$$;

create or replace function public.market_process_contribution(
  p_user_id uuid,
  p_source_sale_id text,
  p_source_item_id text,
  p_action text,
  p_fingerprint text,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent market_private.market_consent%rowtype;
  v_state jsonb;
  v_sale jsonb;
  v_item jsonb;
  v_animal jsonb;
  v_sale_date date;
  v_birth_date date;
  v_completed_at timestamptz;
  v_age_days integer;
  v_sale_price numeric;
  v_listed_price numeric;
  v_contribution_id uuid;
  v_fact_id uuid;
begin
  if p_action not in ('upsert', 'withdraw') then
    raise exception 'Unsupported market contribution action.' using errcode = '22023';
  end if;
  if p_user_id is null or coalesce(p_source_sale_id, '') = '' or coalesce(p_source_item_id, '') = '' then
    raise exception 'Contribution identifiers are required.' using errcode = '22023';
  end if;

  select * into v_consent
  from market_private.market_consent
  where user_id = p_user_id;
  if not found or not v_consent.enabled or v_consent.consent_version <> p_consent_version then
    raise exception 'Current Market Analytics consent is required.' using errcode = '42501';
  end if;

  select app_state into v_state
  from public.herdharbor_user_data
  where user_id = p_user_id;
  if v_state is null then
    raise exception 'Canonical HerdHarbor state was not found.' using errcode = 'P0002';
  end if;

  select sale.value into v_sale
  from jsonb_array_elements(coalesce(v_state -> 'sales', '[]'::jsonb)) as sale(value)
  where sale.value ->> 'id' = p_source_sale_id
  limit 1;
  if v_sale is null then
    raise exception 'The canonical sale was not found.' using errcode = 'P0002';
  end if;

  select item.value into v_item
  from jsonb_array_elements(coalesce(v_sale -> 'items', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = p_source_item_id
  limit 1;

  if p_action = 'withdraw' then
    update market_private.market_contribution_processing
    set active = false, withdrawn_at = now(), processed_at = now(), fingerprint = p_fingerprint
    where user_id = p_user_id
      and source_sale_id = p_source_sale_id
      and source_item_id = p_source_item_id
    returning id into v_contribution_id;
    if v_contribution_id is not null then
      delete from market_private.market_facts where contribution_id = v_contribution_id;
    end if;
    return jsonb_build_object('active', false, 'contributionId', v_contribution_id, 'processedAt', now());
  end if;

  if v_sale ->> 'status' <> 'Completed' or v_item is null then
    raise exception 'Only canonical Completed sale items qualify.' using errcode = '22023';
  end if;

  begin
    v_completed_at := nullif(v_sale ->> 'completedAt', '')::timestamptz;
  exception when others then
    v_completed_at := null;
  end;
  if not v_consent.include_historical and (v_completed_at is null or v_completed_at < v_consent.enabled_at) then
    raise exception 'This sale is outside the authorized contribution period.' using errcode = '42501';
  end if;

  select animal.value into v_animal
  from jsonb_array_elements(coalesce(v_state -> 'animals', '[]'::jsonb)) as animal(value)
  where animal.value ->> 'id' = v_item ->> 'animalId'
  limit 1;
  if v_animal is null then
    raise exception 'The canonical sale animal was not found.' using errcode = 'P0002';
  end if;

  v_sale_price := market_private.safe_numeric(coalesce(v_item ->> 'salePrice', v_item ->> 'unitPrice'));
  v_listed_price := market_private.safe_numeric(v_item ->> 'listedPriceAtSale');
  v_sale_date := market_private.safe_date(coalesce(nullif(v_sale ->> 'completedAt', ''), v_sale ->> 'saleDate'));
  v_birth_date := market_private.safe_date(v_animal ->> 'dob');
  if v_sale_price is null or v_sale_date is null then
    raise exception 'A factual sale price and date are required.' using errcode = '22023';
  end if;
  v_age_days := case when v_birth_date is not null and v_birth_date <= v_sale_date then v_sale_date - v_birth_date else null end;

  insert into market_private.market_contribution_processing(
    user_id, source_sale_id, source_item_id, fingerprint, consent_version,
    active, processed_at, withdrawn_at
  ) values (
    p_user_id, p_source_sale_id, p_source_item_id, p_fingerprint, p_consent_version,
    true, now(), null
  )
  on conflict (user_id, source_sale_id, source_item_id) do update set
    fingerprint = excluded.fingerprint,
    consent_version = excluded.consent_version,
    active = true,
    processed_at = now(),
    withdrawn_at = null
  returning id into v_contribution_id;

  insert into market_private.market_facts(
    contribution_id, species, breed, sex, age_at_sale_days, age_bucket,
    color_variety, pedigree_status, registration_status, listed_price_at_sale,
    sale_price, sale_month, sale_year, region_country, region_code, broad_region,
    currency, structured_traits, updated_at
  ) values (
    v_contribution_id,
    nullif(left(btrim(coalesce(v_item ->> 'species', v_animal ->> 'species', '')), 80), ''),
    nullif(left(btrim(coalesce(v_item ->> 'breed', v_animal ->> 'breed', '')), 120), ''),
    nullif(left(btrim(coalesce(v_animal ->> 'sex', '')), 32), ''),
    v_age_days,
    market_private.age_bucket(v_age_days),
    nullif(left(btrim(coalesce(v_animal ->> 'color', '')), 120), ''),
    nullif(left(btrim(coalesce(v_animal ->> 'pedigreeStatus', '')), 64), ''),
    case
      when nullif(btrim(coalesce(v_animal ->> 'registrationStatus', '')), '') is not null
        then left(btrim(v_animal ->> 'registrationStatus'), 64)
      when nullif(btrim(coalesce(v_animal ->> 'registrationNumber', '')), '') is not null
        then 'Registered'
      else null
    end,
    v_listed_price,
    v_sale_price,
    extract(month from v_sale_date)::smallint,
    extract(year from v_sale_date)::smallint,
    v_consent.region_country,
    v_consent.region_code,
    v_consent.broad_region,
    upper(left(coalesce(nullif(v_sale ->> 'currency', ''), 'USD'), 3)),
    '{}'::jsonb,
    now()
  )
  on conflict (contribution_id) do update set
    species = excluded.species,
    breed = excluded.breed,
    sex = excluded.sex,
    age_at_sale_days = excluded.age_at_sale_days,
    age_bucket = excluded.age_bucket,
    color_variety = excluded.color_variety,
    pedigree_status = excluded.pedigree_status,
    registration_status = excluded.registration_status,
    listed_price_at_sale = excluded.listed_price_at_sale,
    sale_price = excluded.sale_price,
    sale_month = excluded.sale_month,
    sale_year = excluded.sale_year,
    region_country = excluded.region_country,
    region_code = excluded.region_code,
    broad_region = excluded.broad_region,
    currency = excluded.currency,
    structured_traits = excluded.structured_traits,
    updated_at = now()
  returning id into v_fact_id;

  return jsonb_build_object(
    'active', true,
    'contributionId', v_contribution_id,
    'factId', v_fact_id,
    'processedAt', now()
  );
end;
$$;

create or replace function public.market_aggregate(p_user_id uuid, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_threshold integer := 5;
  v_count bigint;
  v_mean numeric;
  v_median numeric;
  v_min numeric;
  v_max numeric;
  v_asking_mean numeric;
  v_asking_median numeric;
  v_difference numeric;
  v_currency text;
  v_currency_filter text;
  v_start date;
  v_end date;
  v_trend jsonb := '[]'::jsonb;
begin
  -- v1.6.5 personal and market currency display is USD. Keep aggregation currency-isolated
  -- so future non-USD facts can never be averaged into a USD result.
  v_currency_filter := upper(coalesce(nullif(btrim(p_filters ->> 'currency'), ''), 'USD'));
  v_start := market_private.safe_date(p_filters ->> 'start');
  v_end := market_private.safe_date(p_filters ->> 'end');
  if not exists (
    select 1 from market_private.market_consent
    where user_id = p_user_id and enabled
  ) then
    raise exception 'Current Market Analytics consent is required.' using errcode = '42501';
  end if;

  select coalesce((value #>> '{}')::integer, 5) into v_threshold
  from market_private.market_config where key = 'minimum_sample_size';
  v_threshold := greatest(coalesce(v_threshold, 5), 5);

  select
    count(*), avg(f.sale_price), percentile_cont(0.5) within group (order by f.sale_price),
    min(f.sale_price), max(f.sale_price), avg(f.listed_price_at_sale),
    percentile_cont(0.5) within group (order by f.listed_price_at_sale),
    avg(f.listed_price_at_sale - f.sale_price), min(f.currency)
  into v_count, v_mean, v_median, v_min, v_max, v_asking_mean, v_asking_median, v_difference, v_currency
  from market_private.market_facts as f
  where (coalesce(p_filters ->> 'species', '') = '' or f.species = p_filters ->> 'species')
    and (coalesce(p_filters ->> 'breed', '') = '' or f.breed = p_filters ->> 'breed')
    and (coalesce(p_filters ->> 'sex', '') = '' or f.sex = p_filters ->> 'sex')
    and (coalesce(p_filters ->> 'age_bucket', '') = '' or f.age_bucket = p_filters ->> 'age_bucket')
    and (coalesce(p_filters ->> 'color_variety', '') = '' or f.color_variety = p_filters ->> 'color_variety')
    and (coalesce(p_filters ->> 'pedigree_status', '') = '' or f.pedigree_status = p_filters ->> 'pedigree_status')
    and (coalesce(p_filters ->> 'registration_status', '') = '' or f.registration_status = p_filters ->> 'registration_status')
    and (coalesce(p_filters ->> 'region_country', '') = '' or f.region_country = p_filters ->> 'region_country')
    and (coalesce(p_filters ->> 'region_code', '') = '' or f.region_code = p_filters ->> 'region_code')
    and (coalesce(p_filters ->> 'broad_region', '') = '' or f.broad_region = p_filters ->> 'broad_region')
    and (coalesce(p_filters ->> 'sale_month', '') = '' or f.sale_month = (p_filters ->> 'sale_month')::smallint)
    and (coalesce(p_filters ->> 'sale_year', '') = '' or f.sale_year = (p_filters ->> 'sale_year')::smallint)
    and f.currency = v_currency_filter
    and (v_start is null or make_date(f.sale_year, f.sale_month, 1) >= date_trunc('month', v_start::timestamp)::date)
    and (v_end is null or make_date(f.sale_year, f.sale_month, 1) <= date_trunc('month', v_end::timestamp)::date);

  if v_count < v_threshold then
    return jsonb_build_object(
      'available', false,
      'sampleSize', v_count,
      'minimumSampleSize', v_threshold
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'period', grouped.period,
    'sampleSize', grouped.sample_size,
    'medianSalePrice', grouped.median_sale_price,
    'averageSalePrice', grouped.average_sale_price
  ) order by grouped.period), '[]'::jsonb)
  into v_trend
  from (
    select concat(f.sale_year, '-', lpad(f.sale_month::text, 2, '0')) as period,
      count(*) as sample_size,
      percentile_cont(0.5) within group (order by f.sale_price) as median_sale_price,
      avg(f.sale_price) as average_sale_price
    from market_private.market_facts as f
    where (coalesce(p_filters ->> 'species', '') = '' or f.species = p_filters ->> 'species')
      and (coalesce(p_filters ->> 'breed', '') = '' or f.breed = p_filters ->> 'breed')
      and (coalesce(p_filters ->> 'sex', '') = '' or f.sex = p_filters ->> 'sex')
      and (coalesce(p_filters ->> 'age_bucket', '') = '' or f.age_bucket = p_filters ->> 'age_bucket')
      and (coalesce(p_filters ->> 'color_variety', '') = '' or f.color_variety = p_filters ->> 'color_variety')
      and (coalesce(p_filters ->> 'pedigree_status', '') = '' or f.pedigree_status = p_filters ->> 'pedigree_status')
      and (coalesce(p_filters ->> 'registration_status', '') = '' or f.registration_status = p_filters ->> 'registration_status')
      and (coalesce(p_filters ->> 'region_country', '') = '' or f.region_country = p_filters ->> 'region_country')
      and (coalesce(p_filters ->> 'region_code', '') = '' or f.region_code = p_filters ->> 'region_code')
      and (coalesce(p_filters ->> 'broad_region', '') = '' or f.broad_region = p_filters ->> 'broad_region')
      and (coalesce(p_filters ->> 'sale_month', '') = '' or f.sale_month = (p_filters ->> 'sale_month')::smallint)
      and (coalesce(p_filters ->> 'sale_year', '') = '' or f.sale_year = (p_filters ->> 'sale_year')::smallint)
      and f.currency = v_currency_filter
      and (v_start is null or make_date(f.sale_year, f.sale_month, 1) >= date_trunc('month', v_start::timestamp)::date)
      and (v_end is null or make_date(f.sale_year, f.sale_month, 1) <= date_trunc('month', v_end::timestamp)::date)
    group by f.sale_year, f.sale_month
    having count(*) >= v_threshold
  ) as grouped;

  return jsonb_build_object(
    'available', true,
    'sampleSize', v_count,
    'minimumSampleSize', v_threshold,
    'currency', coalesce(v_currency, 'USD'),
    'medianSalePrice', round(v_median, 2),
    'averageSalePrice', round(v_mean, 2),
    'medianListedPrice', round(v_asking_median, 2),
    'averageListedPrice', round(v_asking_mean, 2),
    'averageAskingDifference', round(v_difference, 2),
    'minimumSalePrice', round(v_min, 2),
    'maximumSalePrice', round(v_max, 2),
    'saleCount', v_count,
    'trend', v_trend
  );
end;
$$;

create or replace function public.market_delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processing bigint;
  v_consent bigint;
begin
  delete from market_private.market_contribution_processing where user_id = p_user_id;
  get diagnostics v_processing = row_count;
  delete from market_private.market_consent where user_id = p_user_id;
  get diagnostics v_consent = row_count;
  return jsonb_build_object(
    'deleted', true,
    'processingRecords', v_processing,
    'consentRecords', v_consent,
    'factsRemovedByCascade', true
  );
end;
$$;

comment on schema market_private is
  'Private HerdHarbor Market Analytics processing and de-identified facts; no client table access.';
comment on table market_private.market_facts is
  'Allowlisted de-identified market facts only. Raw sales and account/user identifiers are prohibited.';
comment on function public.market_aggregate(uuid, jsonb) is
  'Returns aggregates only after post-filter privacy suppression; never returns raw market facts.';

revoke all on function market_private.safe_numeric(text) from public, anon, authenticated;
revoke all on function market_private.safe_date(text) from public, anon, authenticated;
revoke all on function market_private.age_bucket(integer) from public, anon, authenticated;
revoke all on function public.market_record_consent(uuid, boolean, text, timestamptz, timestamptz, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.market_process_contribution(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.market_aggregate(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.market_delete_account_data(uuid) from public, anon, authenticated;

grant execute on function public.market_record_consent(uuid, boolean, text, timestamptz, timestamptz, boolean, text, text, text) to service_role;
grant execute on function public.market_process_contribution(uuid, text, text, text, text, text) to service_role;
grant execute on function public.market_aggregate(uuid, jsonb) to service_role;
grant execute on function public.market_delete_account_data(uuid) to service_role;

commit;

-- Required acceptance checks after review and deployment:
-- 1. anon/authenticated cannot select market_private tables or execute raw RPCs.
-- 2. Four matching facts return only available=false; five return aggregates.
-- 3. Repeating the same sale/item upserts one contribution and one fact.
-- 4. Correcting a Completed sale updates the same fact; cancellation deletes it.
-- 5. market_delete_account_data cascades processing links and linked facts.
