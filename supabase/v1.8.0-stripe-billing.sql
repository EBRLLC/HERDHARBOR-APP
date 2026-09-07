-- HerdHarbor Alpha v1.8.0 — Stripe billing integration
begin;

create table if not exists public.subscription_plans (
  id text primary key,
  label text not null,
  active boolean not null default true,
  billing_interval text not null default 'month' check (billing_interval in ('month','year')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'usd',
  max_active_animals integer check (max_active_animals is null or max_active_animals >= 0),
  provider_price_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plan_prices (
  id text primary key,
  plan_id text not null references public.subscription_plans(id) on delete cascade,
  billing_interval text not null check (billing_interval in ('month','year')),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd',
  provider text not null default 'stripe',
  provider_price_id text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,billing_interval)
);

insert into public.subscription_plans (id,label,active,billing_interval,price_cents,currency,max_active_animals,provider_price_id,metadata)
values
 ('junior','Junior',true,'month',0,'usd',5,null,'{"release":"1.8.0"}'::jsonb),
 ('founder','Founder Member',true,'month',999,'usd',null,'price_1UCOktGIRukEX5RKPo6jm6Vr','{"release":"1.8.0","stripe":true}'::jsonb),
 ('member','Member',true,'month',1499,'usd',null,'price_1UCOjrGIRukEX5RK9my06yUP','{"release":"1.8.0","stripe":true}'::jsonb),
 ('business','HerdHarbor Business',true,'month',4999,'usd',null,'price_1UCOuYGIRukEX5RKo6LUWZq3','{"release":"1.8.0","stripe":true}'::jsonb)
on conflict (id) do update set
 label=excluded.label,active=excluded.active,billing_interval=excluded.billing_interval,
 price_cents=excluded.price_cents,currency=excluded.currency,max_active_animals=excluded.max_active_animals,
 provider_price_id=excluded.provider_price_id,metadata=public.subscription_plans.metadata||excluded.metadata,updated_at=now();

insert into public.subscription_plan_prices (id,plan_id,billing_interval,price_cents,currency,provider,provider_price_id)
values
 ('founder_month','founder','month',999,'usd','stripe','price_1UCOktGIRukEX5RKPo6jm6Vr'),
 ('founder_year','founder','year',11000,'usd','stripe','price_1UCOwAGIRukEX5RK34xr9dQS'),
 ('member_month','member','month',1499,'usd','stripe','price_1UCOjrGIRukEX5RK9my06yUP'),
 ('member_year','member','year',15000,'usd','stripe','price_1UCOvPGIRukEX5RKJA05IDmb'),
 ('business_month','business','month',4999,'usd','stripe','price_1UCOuYGIRukEX5RKo6LUWZq3'),
 ('business_year','business','year',55000,'usd','stripe','price_1UCOnnGIRukEX5RK36kjzNZ6')
on conflict (id) do update set plan_id=excluded.plan_id,billing_interval=excluded.billing_interval,
 price_cents=excluded.price_cents,currency=excluded.currency,provider=excluded.provider,
 provider_price_id=excluded.provider_price_id,active=true,updated_at=now();

create table if not exists public.subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_id text references public.subscription_plans(id),
 status text not null default 'not_configured' check (status in ('not_configured','incomplete','trialing','active','past_due','unpaid','canceled','expired','incomplete_expired','founder','free_junior','resubscribed')),
 billing_interval text not null default 'month' check (billing_interval in ('month','year')),
 price_cents integer check (price_cents is null or price_cents >= 0),
 currency text not null default 'usd', provider text not null default 'none',
 provider_customer_id text, provider_subscription_id text,
 current_period_start timestamptz,current_period_end timestamptz,trial_ends_at timestamptz,
 cancel_at_period_end boolean not null default false,canceled_at timestamptz,grace_period_ends_at timestamptz,
 promotion_code text,metadata jsonb not null default '{}'::jsonb,provider_updated_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id),unique(provider,provider_subscription_id)
);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id,status);

create table if not exists public.subscription_events (
 id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,
 subscription_id uuid references public.subscriptions(id) on delete set null,provider text not null default 'internal',
 provider_event_id text,event_type text not null,event_status text not null default 'received',payload jsonb not null default '{}'::jsonb,
 occurred_at timestamptz,processed_at timestamptz,created_at timestamptz not null default now(),unique(provider,provider_event_id)
);
create table if not exists public.subscription_payments (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 subscription_id uuid references public.subscriptions(id) on delete set null,provider text not null,provider_payment_id text,
 amount_cents integer not null check(amount_cents>=0),currency text not null default 'usd',status text not null,
 description text,invoice_url text,occurred_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),unique(provider,provider_payment_id)
);
create table if not exists public.subscription_referrals (
 id uuid primary key default gen_random_uuid(),referrer_user_id uuid not null references auth.users(id) on delete cascade,
 referred_user_id uuid references auth.users(id) on delete set null,referral_code text,status text not null default 'pending'
 check(status in ('pending','qualified','active','reversed','expired')),qualified_at timestamptz,activated_at timestamptz,reversed_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(referrer_user_id,referred_user_id)
);
create table if not exists public.subscription_credits (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 credit_type text not null default 'free_month' check(credit_type in ('free_month','amount','promotion','manual')),
 quantity integer not null default 1 check(quantity>0),amount_cents integer check(amount_cents is null or amount_cents>=0),currency text not null default 'usd',
 source text not null,source_reference text,status text not null default 'available' check(status in ('available','reserved','applied','expired','reversed')),
 effective_at timestamptz not null default now(),expires_at timestamptz,applied_at timestamptz,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.subscription_overrides (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 override_type text not null check(override_type in ('complimentary','founder','promotion','support')),plan_id text references public.subscription_plans(id),
 starts_at timestamptz not null default now(),ends_at timestamptz,reason text,created_by uuid references auth.users(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);

alter table public.account_access add column if not exists subscription_status text not null default 'not_configured';

alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_referrals enable row level security;
alter table public.subscription_credits enable row level security;
alter table public.subscription_overrides enable row level security;

drop policy if exists "subscription plans readable by signed in users" on public.subscription_plans;
create policy "subscription plans readable by signed in users" on public.subscription_plans for select to authenticated using(active=true);
drop policy if exists "subscription prices readable by signed in users" on public.subscription_plan_prices;
create policy "subscription prices readable by signed in users" on public.subscription_plan_prices for select to authenticated using(active=true);
drop policy if exists "users read own subscription" on public.subscriptions;
create policy "users read own subscription" on public.subscriptions for select to authenticated using(user_id=auth.uid());
drop policy if exists "users read own subscription events" on public.subscription_events;
create policy "users read own subscription events" on public.subscription_events for select to authenticated using(user_id=auth.uid());
drop policy if exists "users read own payments" on public.subscription_payments;
create policy "users read own payments" on public.subscription_payments for select to authenticated using(user_id=auth.uid());
drop policy if exists "users read own referrals" on public.subscription_referrals;
create policy "users read own referrals" on public.subscription_referrals for select to authenticated using(referrer_user_id=auth.uid());
drop policy if exists "users read own credits" on public.subscription_credits;
create policy "users read own credits" on public.subscription_credits for select to authenticated using(user_id=auth.uid());
drop policy if exists "users read own subscription overrides" on public.subscription_overrides;
create policy "users read own subscription overrides" on public.subscription_overrides for select to authenticated using(user_id=auth.uid());

create or replace function public.subscription_account_snapshot() returns jsonb language sql stable security invoker set search_path=public as $$
with cs as (select * from public.subscriptions where user_id=auth.uid() limit 1),
rs as (select count(*) filter(where status='active')::integer successful_referrals from public.subscription_referrals where referrer_user_id=auth.uid()),
cr as (select coalesce(sum(quantity) filter(where credit_type='free_month' and status in('available','reserved')),0)::integer free_months_remaining,
 coalesce(sum(quantity) filter(where credit_type='free_month' and status in('available','reserved','applied')),0)::integer free_months_earned,
 coalesce(sum(quantity) filter(where credit_type='free_month' and status='applied'),0)::integer free_months_used from public.subscription_credits where user_id=auth.uid()),
rp as (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'createdAt',p.occurred_at,'amountCents',p.amount_cents,'currency',p.currency,'status',p.status,'description',coalesce(p.description,'Subscription payment')) order by p.occurred_at desc),'[]'::jsonb) rows from (select * from public.subscription_payments where user_id=auth.uid() order by occurred_at desc limit 25)p)
select jsonb_build_object('status',coalesce(cs.status,'not_configured'),'plan',cs.plan_id,'billingInterval',coalesce(cs.billing_interval,'month'),
'priceCents',cs.price_cents,'currency',coalesce(cs.currency,'usd'),'currentPeriodStart',cs.current_period_start,'currentPeriodEnd',cs.current_period_end,
'trialEndsAt',cs.trial_ends_at,'cancelAtPeriodEnd',coalesce(cs.cancel_at_period_end,false),'canceledAt',cs.canceled_at,'gracePeriodEndsAt',cs.grace_period_ends_at,
'provider',coalesce(cs.provider,'none'),'providerCustomerId',cs.provider_customer_id,'providerSubscriptionId',cs.provider_subscription_id,
'referral',jsonb_build_object('successfulReferrals',coalesce(rs.successful_referrals,0),'freeMonthsEarned',coalesce(cr.free_months_earned,0),'freeMonthsUsed',coalesce(cr.free_months_used,0),'freeMonthsRemaining',coalesce(cr.free_months_remaining,0)),
'paymentHistory',rp.rows,'refreshedAt',now()) from (select 1)a left join cs on true cross join rs cross join cr cross join rp;
$$;
grant execute on function public.subscription_account_snapshot() to authenticated;

create or replace function public.subscription_referral_milestone(active_referrals integer) returns table(threshold integer,free_months integer)
language sql immutable as $$ select * from (values(5,1),(20,3)) rules(threshold,free_months) where active_referrals>=threshold order by threshold $$;

commit;
