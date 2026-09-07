-- HerdHarbor Alpha v1.8.1 closeout
-- Completes credit-only Member entitlement, cross-device signup intent,
-- referral reward reversal accounting, and scheduled subscription maintenance.
begin;

-- Credits may become the effective Member entitlement after Stripe access ends.
alter table public.account_access drop constraint if exists account_access_membership_source_check;
alter table public.account_access
  add constraint account_access_membership_source_check
  check (membership_source in ('default','subscription','subscription_credit','founder','manual_override'));

alter table public.subscription_credits
  add column if not exists reversal_reason text,
  add column if not exists reversal_reference text;

alter table public.subscription_referrals
  add column if not exists reversal_reason text,
  add column if not exists reversal_reference text;

create table if not exists public.subscription_credit_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_id uuid not null unique references public.subscription_credits(id) on delete restrict,
  plan_id text not null default 'member' references public.subscription_plans(id),
  status text not null default 'active' check (status in ('active','completed','reversed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  source text not null,
  source_reference text,
  activated_at timestamptz not null default now(),
  completed_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.subscription_credit_entitlements is
  'Auditable Member access periods funded by subscription month credits after paid Stripe access ends.';
create unique index if not exists subscription_credit_entitlements_one_active_uq
  on public.subscription_credit_entitlements(user_id)
  where status = 'active';
create index if not exists subscription_credit_entitlements_expiry_idx
  on public.subscription_credit_entitlements(status,ends_at,user_id);

-- When a qualifying referral is later reversed after a reward was already
-- promised/used, a pending offset reduces a future referral reward instead of
-- destructively editing a consumed credit.
create table if not exists public.subscription_referral_reward_offsets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  months integer not null default 1 check (months > 0),
  status text not null default 'pending' check (status in ('pending','canceled','settled')),
  source_reference text not null unique,
  reason text not null,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.subscription_referral_reward_offsets is
  'Future referral reward offsets used when a reward was already reserved/applied before a qualifying renewal was reversed.';
create index if not exists subscription_referral_reward_offsets_user_idx
  on public.subscription_referral_reward_offsets(user_id,status,created_at);

-- Pre-auth signup choices are staged server-side by an HMAC-like hash derived
-- from the normalized email plus a server secret. The raw email is not stored.
create table if not exists public.registration_intents (
  email_hash text primary key check (email_hash ~ '^[a-f0-9]{64}$'),
  requested_plan text not null check (requested_plan in ('junior','member')),
  referral_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);
comment on table public.registration_intents is
  'Private short-lived signup plan/referral intents keyed by a server-derived email hash for cross-device confirmation.';
create index if not exists registration_intents_expiry_idx on public.registration_intents(expires_at);

-- Private maintenance token used only by the database scheduler and the
-- subscription-maintenance Edge Function. It is generated in the database and
-- never committed to source control.
create table if not exists public.subscription_maintenance_config (
  id text primary key,
  maintenance_token text not null check (char_length(maintenance_token) >= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.subscription_maintenance_config(id,maintenance_token)
values (
  'primary',
  replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
)
on conflict (id) do nothing;

alter table public.subscription_credit_entitlements enable row level security;
alter table public.subscription_referral_reward_offsets enable row level security;
alter table public.registration_intents enable row level security;
alter table public.subscription_maintenance_config enable row level security;

revoke all on table public.subscription_credit_entitlements from anon, authenticated;
revoke all on table public.subscription_referral_reward_offsets from anon, authenticated;
revoke all on table public.registration_intents from anon, authenticated;
revoke all on table public.subscription_maintenance_config from anon, authenticated;
grant select on table public.subscription_credit_entitlements to service_role;
grant select,insert,update,delete on table public.subscription_referral_reward_offsets to service_role;
grant select,insert,update,delete on table public.registration_intents to service_role;
grant select on table public.subscription_maintenance_config to service_role;

drop policy if exists "users read own credit entitlements" on public.subscription_credit_entitlements;
create policy "users read own credit entitlements"
  on public.subscription_credit_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on table public.subscription_credit_entitlements to authenticated;

-- Atomically completes an expired credit period, honors paid-through time, and
-- consumes exactly one available Member-month credit only after the October
-- hard launch. Stripe active/trialing/past_due state always has priority.
create or replace function public.activate_member_credit_entitlement(
  target_user uuid,
  requested_start timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_launch constant timestamptz := timestamptz '2026-10-01 00:00:00-04';
  v_access public.account_access%rowtype;
  v_sub public.subscriptions%rowtype;
  v_ent public.subscription_credit_entitlements%rowtype;
  v_credit public.subscription_credits%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_entitlement_id uuid := gen_random_uuid();
  v_remaining integer := 0;
  v_protected boolean := false;
begin
  if target_user is null then
    raise exception 'A user id is required.';
  end if;

  select * into v_access
  from public.account_access
  where user_id = target_user
  for update;
  if not found then
    return jsonb_build_object('activated',false,'reason','account_access_missing');
  end if;

  v_protected := lower(coalesce(v_access.account_role,'user')) in ('owner','admin')
    or lower(coalesce(v_access.membership_source,'')) in ('founder','manual_override')
    or lower(coalesce(v_access.membership_tier,'')) = 'founder';
  if v_protected then
    return jsonb_build_object('activated',false,'reason','protected_entitlement');
  end if;

  if v_now < v_launch then
    return jsonb_build_object('activated',false,'reason','launch_trial','eligibleAt',v_launch);
  end if;

  select * into v_ent
  from public.subscription_credit_entitlements
  where user_id = target_user and status = 'active'
  order by ends_at desc
  limit 1
  for update;

  if found then
    if v_ent.ends_at > v_now then
      update public.account_access
      set membership_tier='member', membership_source='subscription_credit',
          subscription_status='credit_active', updated_at=v_now
      where user_id=target_user;
      return jsonb_build_object(
        'activated',false,'active',true,'reason','existing_credit_entitlement',
        'entitlementId',v_ent.id,'startsAt',v_ent.starts_at,'endsAt',v_ent.ends_at,
        'creditId',v_ent.credit_id
      );
    end if;

    update public.subscription_credit_entitlements
    set status='completed', completed_at=v_now, updated_at=v_now
    where id=v_ent.id and status='active';
  end if;

  select * into v_sub
  from public.subscriptions
  where user_id=target_user
  for update;

  if found and lower(coalesce(v_sub.status,'')) in ('active','trialing','past_due') then
    return jsonb_build_object(
      'activated',false,'reason','stripe_priority','subscriptionStatus',v_sub.status,
      'paidThrough',v_sub.current_period_end
    );
  end if;

  if v_sub.current_period_end is not null and v_sub.current_period_end > v_now then
    return jsonb_build_object(
      'activated',false,'reason','paid_through','eligibleAt',v_sub.current_period_end
    );
  end if;

  select * into v_credit
  from public.subscription_credits
  where user_id=target_user
    and plan_id='member'
    and credit_type='free_month'
    and status='available'
    and effective_at <= v_now
    and (expires_at is null or expires_at > v_now)
  order by effective_at,created_at
  limit 1
  for update skip locked;

  if not found then
    if lower(coalesce(v_access.membership_source,''))='subscription_credit' then
      update public.account_access
      set membership_tier='junior', membership_source='default',
          subscription_status=coalesce(nullif(v_sub.status,''),'expired'), updated_at=v_now
      where user_id=target_user;

      insert into public.subscription_notification_outbox(
        user_id,subscription_id,event_type,dedupe_key,payload
      )
      values(
        target_user,v_sub.id,'junior_fallback',
        'credit-fallback:' || target_user::text || ':' || to_char(v_now,'YYYYMMDDHH24'),
        jsonb_build_object('plan','junior','reason','member_credits_exhausted')
      )
      on conflict (dedupe_key) do nothing;
    end if;
    return jsonb_build_object('activated',false,'reason','no_available_credit','fallbackPlan','junior');
  end if;

  v_start := greatest(v_now,coalesce(requested_start,v_now),coalesce(v_sub.current_period_end,v_now));
  v_end := v_start + interval '1 month';

  update public.subscription_credits
  set status='applied', applied_at=v_start,
      applied_reference='credit-entitlement:' || v_entitlement_id::text,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'credit_entitlement_id',v_entitlement_id,
        'credit_entitlement_start',v_start,
        'credit_entitlement_end',v_end
      ),
      updated_at=v_now
  where id=v_credit.id and status='available';

  if not found then
    return jsonb_build_object('activated',false,'reason','credit_claim_race');
  end if;

  insert into public.subscription_credit_entitlements(
    id,user_id,credit_id,plan_id,status,starts_at,ends_at,source,source_reference,metadata
  )
  values(
    v_entitlement_id,target_user,v_credit.id,'member','active',v_start,v_end,
    v_credit.source,v_credit.source_reference,
    jsonb_build_object('credit_reason',v_credit.reason)
  );

  update public.account_access
  set membership_tier='member', membership_source='subscription_credit',
      subscription_status='credit_active', updated_at=v_now
  where user_id=target_user;

  select count(*)::integer into v_remaining
  from public.subscription_credits
  where user_id=target_user and plan_id='member' and credit_type='free_month'
    and status in ('available','reserved')
    and effective_at <= v_now
    and (expires_at is null or expires_at > v_now);

  insert into public.subscription_notification_outbox(
    user_id,subscription_id,event_type,dedupe_key,payload
  )
  values(
    target_user,v_sub.id,'member_credit_started',
    'credit-entitlement-started:' || v_entitlement_id::text,
    jsonb_build_object(
      'plan','member','creditId',v_credit.id,'reason',coalesce(v_credit.reason,'Member month credit'),
      'accessStartsAt',v_start,'accessEndsAt',v_end,'creditsRemaining',v_remaining
    )
  )
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'activated',true,'active',true,'reason','member_credit',
    'entitlementId',v_entitlement_id,'creditId',v_credit.id,
    'startsAt',v_start,'endsAt',v_end,'creditsRemaining',v_remaining
  );
end;
$$;
revoke all on function public.activate_member_credit_entitlement(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_member_credit_entitlement(uuid,timestamptz) to service_role;

-- Scheduled maintenance uses pg_cron + pg_net to invoke the authenticated-by-
-- token maintenance Edge Function. The token is read at execution time and is
-- never embedded in the stored cron command.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='herdharbor-subscription-maintenance-hourly' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'herdharbor-subscription-maintenance-hourly',
  '7 * * * *',
  $cron$
    select net.http_post(
      url := 'https://okynebbksifqppwicghj.supabase.co/functions/v1/subscription-maintenance',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-HerdHarbor-Maintenance',(
          select maintenance_token from public.subscription_maintenance_config where id='primary'
        )
      ),
      body := jsonb_build_object('source','database_cron','requestedAt',now())
    );
  $cron$
);

commit;
