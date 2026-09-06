-- HerdHarbor Alpha v1.8.1 — October 1 subscription launch trial
-- Existing accounts and every account created before 2026-10-01 00:00 America/New_York
-- receive a launch trial that ends at the hard subscription launch boundary.

begin;

create or replace function public.herdharbor_subscription_launch_policy()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', '1.8.1',
    'phase', case when now() < '2026-10-01 04:00:00+00'::timestamptz then 'launch_trial' else 'subscriptions_live' end,
    'hardLaunchAt', '2026-10-01T04:00:00.000Z',
    'trialEndsAt', '2026-10-01T04:00:00.000Z',
    'freeThrough', '2026-09-30',
    'autoCharge', false
  );
$$;

revoke all on function public.herdharbor_subscription_launch_policy() from public;
grant execute on function public.herdharbor_subscription_launch_policy() to authenticated, service_role;

-- Keep the existing auth.users trigger entry point so sign-up has one atomic path.
-- Before the hard launch, new users start as Member + trialing. At/after the
-- hard launch, new users start on Junior until a paid subscription is confirmed.
create or replace function public.handle_new_herdharbor_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch_at constant timestamptz := '2026-10-01 04:00:00+00'::timestamptz;
  before_launch boolean := coalesce(new.created_at, now()) < launch_at;
begin
  insert into public.account_access (
    user_id,
    account_role,
    membership_tier,
    membership_source,
    account_status,
    subscription_status
  )
  values (
    new.id,
    'user',
    case when before_launch then 'member' else 'junior' end,
    'default',
    'active',
    case when before_launch then 'trialing' else 'not_configured' end
  )
  on conflict (user_id) do nothing;

  if before_launch then
    insert into public.subscriptions (
      user_id,
      plan_id,
      status,
      billing_interval,
      price_cents,
      currency,
      provider,
      trial_ends_at,
      metadata
    )
    select
      new.id,
      'member',
      'trialing',
      'month',
      p.price_cents,
      coalesce(p.currency, 'usd'),
      'none',
      launch_at,
      jsonb_build_object(
        'launch_trial', 'v1.8.1',
        'hard_launch_at', '2026-10-01T04:00:00.000Z',
        'auto_charge', false
      )
    from public.subscription_plans p
    where p.id = 'member'
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Backfill every account that already exists before the hard launch. Preserve
-- manually assigned/founder membership tiers while recording trial billing state.
insert into public.subscriptions (
  user_id,
  plan_id,
  status,
  billing_interval,
  price_cents,
  currency,
  provider,
  trial_ends_at,
  metadata
)
select
  u.id,
  case
    when aa.membership_tier in ('junior', 'founder', 'member', 'business') then aa.membership_tier
    else 'member'
  end,
  'trialing',
  'month',
  p.price_cents,
  coalesce(p.currency, 'usd'),
  'none',
  '2026-10-01 04:00:00+00'::timestamptz,
  jsonb_build_object(
    'launch_trial', 'v1.8.1',
    'hard_launch_at', '2026-10-01T04:00:00.000Z',
    'auto_charge', false,
    'backfilled', true
  )
from auth.users u
left join public.account_access aa on aa.user_id = u.id
left join public.subscription_plans p on p.id = case
  when aa.membership_tier in ('junior', 'founder', 'member', 'business') then aa.membership_tier
  else 'member'
end
where u.created_at < '2026-10-01 04:00:00+00'::timestamptz
on conflict (user_id) do update
set
  plan_id = excluded.plan_id,
  status = 'trialing',
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  trial_ends_at = excluded.trial_ends_at,
  metadata = coalesce(public.subscriptions.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now()
where public.subscriptions.provider = 'none'
  and public.subscriptions.status in ('not_configured', 'trialing');

update public.account_access aa
set
  subscription_status = 'trialing',
  updated_at = now()
from auth.users u
where u.id = aa.user_id
  and u.created_at < '2026-10-01 04:00:00+00'::timestamptz
  and not exists (
    select 1
    from public.subscriptions s
    where s.user_id = aa.user_id
      and s.provider <> 'none'
      and s.status in ('active', 'trialing', 'past_due', 'resubscribed')
  );

comment on function public.herdharbor_subscription_launch_policy() is
  'HerdHarbor v1.8.1 launch-trial policy. Trial is free through 2026-09-30; subscriptions hard-launch 2026-10-01 America/New_York.';

commit;