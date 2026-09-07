-- HerdHarbor Alpha v1.8.1
-- Locked referral + subscription-credit policy foundation.
-- Public signup: Junior / Member / Business (coming soon); Founder remains internal-only.
-- Every 5 qualified referrals earns one stackable Member month.
begin;

update public.subscription_plans
set metadata = metadata || case id
  when 'junior' then '{"public_signup":true,"signup_available":true,"subscription_required":false}'::jsonb
  when 'founder' then '{"public_signup":false,"signup_available":false,"internal_only":true}'::jsonb
  when 'member' then '{"public_signup":true,"signup_available":true,"subscription_required":true,"public_billing_interval":"month"}'::jsonb
  when 'business' then '{"public_signup":true,"signup_available":false,"coming_soon":true,"subscription_required":true}'::jsonb
  else '{}'::jsonb
end,
updated_at = now()
where id in ('junior','founder','member','business');

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^HH-[A-Z0-9]{8}$'),
  created_at timestamptz not null default now()
);
comment on table public.referral_codes is 'Server-managed public referral identifiers. Codes never expose auth user UUIDs.';

create table if not exists public.registration_choices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_plan text not null check (requested_plan in ('junior','member')),
  referral_code text,
  created_at timestamptz not null default now()
);
comment on table public.registration_choices is 'Immutable public signup plan/referral choices. Business is coming soon and Founder is never a public choice.';

alter table public.subscription_referrals
  add column if not exists initial_payment_at timestamptz,
  add column if not exists first_renewal_paid_at timestamptz,
  add column if not exists qualifying_invoice_id text;

update public.subscription_referrals set status = 'qualified' where status = 'active';
alter table public.subscription_referrals drop constraint if exists subscription_referrals_status_check;
alter table public.subscription_referrals
  add constraint subscription_referrals_status_check
  check (status in ('pending','subscribed','qualified','reversed','expired'));

create unique index if not exists subscription_referrals_referred_user_uq
  on public.subscription_referrals(referred_user_id)
  where referred_user_id is not null;
create index if not exists subscription_referrals_qualification_idx
  on public.subscription_referrals(referrer_user_id,status,qualified_at);

alter table public.subscription_credits
  add column if not exists plan_id text not null default 'member' references public.subscription_plans(id),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists reason text,
  add column if not exists reserved_at timestamptz,
  add column if not exists reserved_for_period_start timestamptz,
  add column if not exists reserved_for_period_end timestamptz,
  add column if not exists reservation_reference text,
  add column if not exists applied_reference text,
  add column if not exists reversed_at timestamptz;

create unique index if not exists subscription_credits_referral_reward_uq
  on public.subscription_credits(user_id,source_reference)
  where source = 'referral_reward' and source_reference is not null;
create index if not exists subscription_credits_reservation_idx
  on public.subscription_credits(user_id,status,reserved_for_period_start);

create table if not exists public.subscription_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  event_type text not null check (char_length(event_type) between 3 and 80),
  dedupe_key text not null unique check (char_length(dedupe_key) between 3 and 240),
  payload jsonb not null default '{}'::jsonb,
  not_before timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','canceled')),
  attempts integer not null default 0 check (attempts >= 0),
  provider text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.subscription_notification_outbox is 'Provider-neutral subscription notification queue. The email delivery integration consumes this table.';
create index if not exists subscription_notification_outbox_pending_idx
  on public.subscription_notification_outbox(status,not_before,created_at);
create index if not exists subscription_notification_outbox_user_idx
  on public.subscription_notification_outbox(user_id,created_at desc);

alter table public.referral_codes enable row level security;
alter table public.registration_choices enable row level security;
alter table public.subscription_notification_outbox enable row level security;

revoke all on table public.referral_codes from anon, authenticated;
revoke all on table public.registration_choices from anon, authenticated;
revoke all on table public.subscription_notification_outbox from anon, authenticated;

create or replace function public.ensure_referral_code(target_user uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_code text;
  candidate text;
  inserted_code text;
  attempt integer := 0;
begin
  if target_user is null then
    raise exception 'A user id is required.';
  end if;

  select code into existing_code from public.referral_codes where user_id = target_user;
  if existing_code is not null then return existing_code; end if;

  loop
    attempt := attempt + 1;
    candidate := 'HH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.referral_codes(user_id,code)
    values(target_user,candidate)
    on conflict do nothing
    returning code into inserted_code;
    if inserted_code is not null then return inserted_code; end if;
    select code into existing_code from public.referral_codes where user_id = target_user;
    if existing_code is not null then return existing_code; end if;
    if attempt >= 10 then raise exception 'Could not allocate a referral code.'; end if;
  end loop;
end;
$$;
revoke all on function public.ensure_referral_code(uuid) from public, anon, authenticated;
grant execute on function public.ensure_referral_code(uuid) to service_role;

create or replace function public.complete_registration_choice(
  target_user uuid,
  requested_plan_input text,
  referral_code_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_plan text := lower(trim(coalesce(requested_plan_input,'')));
  normalized_referral text := upper(trim(coalesce(referral_code_input,'')));
  existing_choice public.registration_choices%rowtype;
  referrer uuid;
  own_code text;
begin
  if target_user is null then raise exception 'A user id is required.'; end if;

  select * into existing_choice from public.registration_choices where user_id = target_user;
  if found then
    own_code := public.ensure_referral_code(target_user);
    return jsonb_build_object(
      'complete', true,
      'requestedPlan', existing_choice.requested_plan,
      'referralCode', own_code,
      'referredBy', existing_choice.referral_code
    );
  end if;

  if normalized_plan not in ('junior','member') then
    if normalized_plan = 'business' then raise exception 'HerdHarbor Business is coming soon.'; end if;
    raise exception 'Choose Junior or Member.';
  end if;

  own_code := public.ensure_referral_code(target_user);

  if normalized_referral <> '' then
    select user_id into referrer from public.referral_codes where code = normalized_referral;
    if referrer is null then raise exception 'Invalid referral ID. Check the code or remove it to continue.'; end if;
    if referrer = target_user then raise exception 'You cannot refer your own HerdHarbor account.'; end if;
  end if;

  insert into public.registration_choices(user_id,requested_plan,referral_code)
  values(target_user,normalized_plan,nullif(normalized_referral,''));

  if referrer is not null then
    insert into public.subscription_referrals(referrer_user_id,referred_user_id,referral_code,status,metadata)
    values(referrer,target_user,normalized_referral,'pending',jsonb_build_object('attached_at_signup',true))
    on conflict (referred_user_id) where referred_user_id is not null do nothing;
  end if;

  return jsonb_build_object(
    'complete', true,
    'requestedPlan', normalized_plan,
    'referralCode', own_code,
    'referredBy', nullif(normalized_referral,'')
  );
end;
$$;
revoke all on function public.complete_registration_choice(uuid,text,text) from public, anon, authenticated;
grant execute on function public.complete_registration_choice(uuid,text,text) to service_role;

-- Backfill a stable public Referral ID for every account that already exists.
do $$
declare r record;
begin
  for r in select id from auth.users loop
    perform public.ensure_referral_code(r.id);
  end loop;
end $$;

create or replace function public.subscription_referral_milestone(active_referrals integer)
returns table(threshold integer,free_months integer)
language sql
immutable
as $$
  select milestone, 1
  from generate_series(5, greatest(coalesce(active_referrals,0),0), 5) as milestone
  order by milestone;
$$;

create or replace function public.subscription_account_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with cs as (
  select * from public.subscriptions where user_id=auth.uid() limit 1
), rc as (
  select code from public.referral_codes where user_id=auth.uid()
), rs as (
  select
    count(*) filter(where status='qualified')::integer qualified_referrals,
    count(*) filter(where status in ('pending','subscribed'))::integer pending_referrals
  from public.subscription_referrals where referrer_user_id=auth.uid()
), cr as (
  select
    coalesce(sum(quantity) filter(where credit_type='free_month' and status in('available','reserved')),0)::integer free_months_remaining,
    coalesce(sum(quantity) filter(where credit_type='free_month' and status in('available','reserved','applied')),0)::integer free_months_earned,
    coalesce(sum(quantity) filter(where credit_type='free_month' and status='applied'),0)::integer free_months_used
  from public.subscription_credits where user_id=auth.uid() and plan_id='member'
), reserved as (
  select id,source,reason,reserved_for_period_start,reserved_for_period_end
  from public.subscription_credits
  where user_id=auth.uid() and plan_id='member' and status='reserved'
  order by reserved_for_period_start nulls last, created_at
  limit 1
), rp as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'createdAt',p.occurred_at,'amountCents',p.amount_cents,'currency',p.currency,
    'status',p.status,'description',coalesce(p.description,'Subscription payment')) order by p.occurred_at desc),'[]'::jsonb) rows
  from (select * from public.subscription_payments where user_id=auth.uid() order by occurred_at desc limit 25)p
)
select jsonb_build_object(
  'status',coalesce(cs.status,'not_configured'),
  'plan',cs.plan_id,
  'billingInterval',coalesce(cs.billing_interval,'month'),
  'priceCents',cs.price_cents,
  'currency',coalesce(cs.currency,'usd'),
  'currentPeriodStart',cs.current_period_start,
  'currentPeriodEnd',cs.current_period_end,
  'trialEndsAt',cs.trial_ends_at,
  'cancelAtPeriodEnd',coalesce(cs.cancel_at_period_end,false),
  'canceledAt',cs.canceled_at,
  'gracePeriodEndsAt',cs.grace_period_ends_at,
  'provider',coalesce(cs.provider,'none'),
  'providerCustomerId',cs.provider_customer_id,
  'providerSubscriptionId',cs.provider_subscription_id,
  'nextInvoice',case when cs.current_period_end is null then null else jsonb_build_object(
    'date',cs.current_period_end,
    'amountCents',case when reserved.id is not null then 0 else cs.price_cents end,
    'currency',coalesce(cs.currency,'usd'),
    'reason',case when reserved.id is not null then coalesce(reserved.reason,'Member month credit') else null end,
    'creditId',reserved.id
  ) end,
  'referral',jsonb_build_object(
    'code',rc.code,
    'successfulReferrals',coalesce(rs.qualified_referrals,0),
    'qualifiedReferrals',coalesce(rs.qualified_referrals,0),
    'pendingReferrals',coalesce(rs.pending_referrals,0),
    'progressToNextReward',mod(coalesce(rs.qualified_referrals,0),5),
    'rewardEvery',5,
    'freeMonthsEarned',coalesce(cr.free_months_earned,0),
    'freeMonthsUsed',coalesce(cr.free_months_used,0),
    'freeMonthsRemaining',coalesce(cr.free_months_remaining,0)
  ),
  'paymentHistory',rp.rows,
  'refreshedAt',now()
)
from (select 1)a
left join cs on true
left join rc on true
cross join rs cross join cr
left join reserved on true
cross join rp;
$$;
grant execute on function public.subscription_account_snapshot() to authenticated;

commit;
