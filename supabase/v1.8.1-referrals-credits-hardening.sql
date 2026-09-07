-- HerdHarbor Alpha v1.8.1
-- Release-specific security/performance hardening for referrals and Member credits.
begin;

-- Pin the SQL helper search path so object resolution cannot be influenced by role settings.
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

-- Avoid per-row auth.uid() re-evaluation on the member's own Referral ID policy.
drop policy if exists "users read own referral code" on public.referral_codes;
create policy "users read own referral code"
on public.referral_codes
for select
to authenticated
using (user_id = (select auth.uid()));

-- Cover foreign keys introduced by the v1.8.1 credit/outbox schema.
create index if not exists subscription_credits_created_by_idx
  on public.subscription_credits(created_by)
  where created_by is not null;
create index if not exists subscription_credits_plan_id_idx
  on public.subscription_credits(plan_id);
create index if not exists subscription_notification_outbox_subscription_idx
  on public.subscription_notification_outbox(subscription_id)
  where subscription_id is not null;

commit;
