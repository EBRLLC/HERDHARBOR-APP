-- HerdHarbor v1.8.3 shared AI image usage guard.
-- Privacy boundary: these ledgers contain only authenticated user id, feature name,
-- UTC usage date, request count, and last request timestamp. No image contents,
-- extracted record values, prompts, provider responses, or farm state are stored.
--
-- Default application policy:
--   * Paper Pedigree: 10 scans per authenticated user per UTC day
--   * General Photo Entry: 10 scans per authenticated user per UTC day
--   * Shared AI-image backstop: 25 provider calls per UTC day across both features
--
-- Edge Function environment variables may lower or raise these limits without a
-- schema change. This database function is the single atomic reservation point.

create table if not exists public.herdharbor_ai_image_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  usage_date date not null,
  request_count integer not null default 0,
  last_requested_at timestamptz not null default now(),
  primary key (user_id, feature, usage_date),
  constraint herdharbor_ai_image_usage_feature_check
    check (feature in ('paper_pedigree', 'record_photo')),
  constraint herdharbor_ai_image_usage_count_check
    check (request_count between 0 and 100000)
);

create table if not exists public.herdharbor_ai_image_global_usage (
  usage_date date primary key,
  request_count integer not null default 0,
  last_requested_at timestamptz not null default now(),
  constraint herdharbor_ai_image_global_usage_count_check
    check (request_count between 0 and 1000000)
);

alter table public.herdharbor_ai_image_usage enable row level security;
alter table public.herdharbor_ai_image_global_usage enable row level security;

revoke all on table public.herdharbor_ai_image_usage from public, anon, authenticated;
revoke all on table public.herdharbor_ai_image_global_usage from public, anon, authenticated;
grant all on table public.herdharbor_ai_image_usage to service_role;
grant all on table public.herdharbor_ai_image_global_usage to service_role;

create or replace function public.herdharbor_reserve_ai_image_request(
  p_user_id uuid,
  p_feature text,
  p_user_daily_limit integer,
  p_global_daily_limit integer
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today_utc date := (now() at time zone 'UTC')::date;
  user_count integer;
  global_count integer;
begin
  if p_user_id is null then
    return 'invalid_user';
  end if;

  if p_feature not in ('paper_pedigree', 'record_photo') then
    raise exception 'Unsupported HerdHarbor AI image feature.';
  end if;

  if p_user_daily_limit < 1 or p_user_daily_limit > 1000 then
    raise exception 'AI image per-user daily limit is outside the allowed range.';
  end if;

  if p_global_daily_limit < 1 or p_global_daily_limit > 100000 then
    raise exception 'AI image global daily limit is outside the allowed range.';
  end if;

  -- Lock the global row first so all callers take locks in the same order.
  insert into public.herdharbor_ai_image_global_usage (
    usage_date,
    request_count,
    last_requested_at
  ) values (
    today_utc,
    0,
    now()
  )
  on conflict (usage_date) do nothing;

  select request_count
    into global_count
    from public.herdharbor_ai_image_global_usage
   where usage_date = today_utc
   for update;

  if coalesce(global_count, 0) >= p_global_daily_limit then
    return 'global_quota';
  end if;

  insert into public.herdharbor_ai_image_usage (
    user_id,
    feature,
    usage_date,
    request_count,
    last_requested_at
  ) values (
    p_user_id,
    p_feature,
    today_utc,
    0,
    now()
  )
  on conflict (user_id, feature, usage_date) do nothing;

  select request_count
    into user_count
    from public.herdharbor_ai_image_usage
   where user_id = p_user_id
     and feature = p_feature
     and usage_date = today_utc
   for update;

  if coalesce(user_count, 0) >= p_user_daily_limit then
    return 'user_quota';
  end if;

  update public.herdharbor_ai_image_usage
     set request_count = request_count + 1,
         last_requested_at = now()
   where user_id = p_user_id
     and feature = p_feature
     and usage_date = today_utc;

  update public.herdharbor_ai_image_global_usage
     set request_count = request_count + 1,
         last_requested_at = now()
   where usage_date = today_utc;

  return 'reserved';
end;
$$;

revoke all on function public.herdharbor_reserve_ai_image_request(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.herdharbor_reserve_ai_image_request(uuid, text, integer, integer)
  to service_role;

comment on table public.herdharbor_ai_image_usage is
  'Service-role-only per-user daily request ledger for Paper Pedigree and Photo Entry AI image extraction. No image or farm-record data.';
comment on table public.herdharbor_ai_image_global_usage is
  'Service-role-only daily global provider-call counter for HerdHarbor AI image extraction.';
comment on function public.herdharbor_reserve_ai_image_request(uuid, text, integer, integer) is
  'Atomically enforces per-user/per-feature and shared global daily limits before any HerdHarbor AI image provider call.';
