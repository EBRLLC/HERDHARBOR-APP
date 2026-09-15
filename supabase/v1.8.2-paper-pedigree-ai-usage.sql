-- HerdHarbor paper-pedigree AI usage guard.
-- Browser roles cannot read or mutate this ledger. The authenticated Edge Function
-- reserves requests through the service-role-only RPC before calling the AI provider.

create table if not exists public.herdharbor_paper_pedigree_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0,
  last_requested_at timestamptz not null default now(),
  primary key (user_id, usage_date),
  constraint herdharbor_paper_pedigree_ai_usage_count_check
    check (request_count between 0 and 100000)
);

alter table public.herdharbor_paper_pedigree_ai_usage enable row level security;

revoke all on table public.herdharbor_paper_pedigree_ai_usage from anon, authenticated;
grant all on table public.herdharbor_paper_pedigree_ai_usage to service_role;

create or replace function public.herdharbor_reserve_paper_pedigree_ai_request(
  p_user_id uuid,
  p_daily_limit integer default 10
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  reserved_count integer;
begin
  if p_user_id is null then
    return 0;
  end if;

  if p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception 'Paper pedigree daily limit is outside the allowed range.';
  end if;

  insert into public.herdharbor_paper_pedigree_ai_usage (
    user_id,
    usage_date,
    request_count,
    last_requested_at
  ) values (
    p_user_id,
    (now() at time zone 'UTC')::date,
    1,
    now()
  )
  on conflict (user_id, usage_date) do update
    set request_count = public.herdharbor_paper_pedigree_ai_usage.request_count + 1,
        last_requested_at = now()
    where public.herdharbor_paper_pedigree_ai_usage.request_count < p_daily_limit
  returning request_count into reserved_count;

  return coalesce(reserved_count, 0);
end;
$$;

revoke all on function public.herdharbor_reserve_paper_pedigree_ai_request(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.herdharbor_reserve_paper_pedigree_ai_request(uuid, integer)
  to service_role;

comment on table public.herdharbor_paper_pedigree_ai_usage is
  'Service-role-only daily request ledger for authenticated paper pedigree AI extraction.';
comment on function public.herdharbor_reserve_paper_pedigree_ai_request(uuid, integer) is
  'Atomically reserves one paper-pedigree AI request for a signed-in user without exposing the usage ledger to browser roles.';
