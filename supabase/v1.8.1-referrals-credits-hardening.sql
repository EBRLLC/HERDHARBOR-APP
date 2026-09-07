-- HerdHarbor Alpha v1.8.1
-- Security hardening for the referral reward helper.
-- Fixes the Supabase mutable search_path advisor warning without changing behavior.
begin;

create or replace function public.subscription_referral_milestone(active_referrals integer)
returns table(threshold integer,free_months integer)
language sql
immutable
set search_path = public, pg_temp
as $$
  select milestone, 1
  from generate_series(5, greatest(coalesce(active_referrals,0),0), 5) as milestone
  order by milestone;
$$;

commit;
