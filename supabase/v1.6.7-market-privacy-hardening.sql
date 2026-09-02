-- HerdHarbor Alpha v1.6.7: Market Analytics privacy and consent hardening.
-- Apply after supabase/v1.6.5-market-analytics-foundation.sql.
-- This migration makes opt-out destructive for prior market contributions and
-- withholds exact minimum/maximum sale values until a stronger sample threshold.

begin;

insert into market_private.market_config(key, value)
values ('minimum_extreme_sample_size', '10'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

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
  v_removed bigint := 0;
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

  if not p_enabled then
    delete from market_private.market_contribution_processing
    where user_id = p_user_id;
    get diagnostics v_removed = row_count;
    -- market_facts rows are removed by the contribution_id ON DELETE CASCADE.
  end if;

  return jsonb_build_object(
    'enabled', p_enabled,
    'consentVersion', p_consent_version,
    'updatedAt', v_now,
    'priorContributionsRemoved', case when p_enabled then false else true end,
    'processingRecordsRemoved', v_removed
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
  v_extreme_threshold integer := 10;
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
  v_result jsonb;
begin
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

  select coalesce((value #>> '{}')::integer, 10) into v_extreme_threshold
  from market_private.market_config where key = 'minimum_extreme_sample_size';
  v_extreme_threshold := greatest(coalesce(v_extreme_threshold, 10), v_threshold, 10);

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

  v_result := jsonb_build_object(
    'available', true,
    'sampleSize', v_count,
    'minimumSampleSize', v_threshold,
    'minimumExtremeSampleSize', v_extreme_threshold,
    'currency', coalesce(v_currency, 'USD'),
    'medianSalePrice', round(v_median, 2),
    'averageSalePrice', round(v_mean, 2),
    'medianListedPrice', round(v_asking_median, 2),
    'averageListedPrice', round(v_asking_mean, 2),
    'averageAskingDifference', round(v_difference, 2),
    'saleCount', v_count,
    'trend', v_trend
  );

  if v_count >= v_extreme_threshold then
    v_result := v_result || jsonb_build_object(
      'minimumSalePrice', round(v_min, 2),
      'maximumSalePrice', round(v_max, 2)
    );
  end if;

  return v_result;
end;
$$;

comment on function public.market_record_consent(uuid, boolean, text, timestamptz, timestamptz, boolean, text, text, text) is
  'Records explicit Market Analytics consent. Disabling consent removes prior contributed facts for that account.';
comment on function public.market_aggregate(uuid, jsonb) is
  'Returns privacy-suppressed aggregates only: averages/medians at >=5; exact extrema at >=10 by default; never raw facts.';

revoke all on function public.market_record_consent(uuid, boolean, text, timestamptz, timestamptz, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.market_aggregate(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.market_record_consent(uuid, boolean, text, timestamptz, timestamptz, boolean, text, text, text) to service_role;
grant execute on function public.market_aggregate(uuid, jsonb) to service_role;

commit;

-- v1.6.7 production acceptance:
-- 1. Opt in, contribute a Completed sale, then opt out: market_facts must be removed by cascade.
-- 2. 1-4 matching facts return only available=false/minimumSampleSize.
-- 3. 5-9 matching facts return averages/medians but no minimumSalePrice/maximumSalePrice keys.
-- 4. 10+ matching facts may return extrema.
-- 5. Currency and all other filters remain applied before every privacy threshold.
