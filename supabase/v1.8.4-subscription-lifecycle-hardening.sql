-- HerdHarbor Alpha v1.8.4: subscription lifecycle hardening.
-- Separates Founder eligibility from complimentary manual overrides, adds a
-- recoverable webhook processing lease, and tightens subscription-table access.

begin;

alter table public.subscription_events
  add column if not exists processing_started_at timestamptz;

update public.subscription_events
set processing_started_at = coalesce(processing_started_at, created_at)
where event_status = 'processing'
  and processing_started_at is null;

create index if not exists subscription_events_processing_lease_idx
  on public.subscription_events(event_status, processing_started_at)
  where event_status = 'processing';

-- Founder is a paid $7.99/month eligibility class. Existing Founder grants were
-- historically stored as manual_override, which accidentally made them
-- permanently complimentary. Preserve Founder eligibility while removing that
-- protected-access semantic.
update public.account_access
set membership_source = 'founder',
    override_expires_at = null,
    updated_at = now()
where membership_tier = 'founder'
  and membership_source = 'manual_override';

create or replace function public.admin_set_membership(
  target_user uuid,
  new_tier text,
  change_reason text default null,
  expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  old_tier text;
  old_source text;
  next_source text;
  next_expiry timestamptz;
begin
  actor_role := public.herdharbor_account_role();

  if actor_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  if new_tier not in ('junior', 'founder', 'member', 'business') then
    raise exception 'Invalid membership tier';
  end if;

  select membership_tier, membership_source
  into old_tier, old_source
  from public.account_access
  where user_id = target_user
  for update;

  if old_tier is null then
    raise exception 'Account not found';
  end if;

  -- Founder means eligible for the private $7.99 paid plan. Other admin tier
  -- assignments remain explicit complimentary/manual overrides.
  next_source := case when new_tier = 'founder' then 'founder' else 'manual_override' end;
  next_expiry := case when new_tier = 'founder' then null else expires_at end;

  update public.account_access
  set membership_tier = new_tier,
      membership_source = next_source,
      override_expires_at = next_expiry,
      updated_at = now()
  where user_id = target_user;

  insert into public.admin_audit_log (
    actor_user_id,
    target_user_id,
    action,
    previous_membership_tier,
    new_membership_tier,
    previous_membership_source,
    new_membership_source,
    reason,
    override_expires_at
  )
  values (
    auth.uid(),
    target_user,
    case when new_tier = 'founder' then 'founder_eligibility_granted' else 'membership_override_created' end,
    old_tier,
    new_tier,
    old_source,
    next_source,
    change_reason,
    next_expiry
  );
end;
$$;

revoke all on function public.admin_set_membership(uuid,text,text,timestamptz) from public;
revoke all on function public.admin_set_membership(uuid,text,text,timestamptz) from anon;
revoke all on function public.admin_set_membership(uuid,text,text,timestamptz) from authenticated;
grant execute on function public.admin_set_membership(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.admin_set_membership(uuid,text,text,timestamptz) to service_role;

-- The browser only reads its own subscription rows. All writes are performed by
-- trusted Edge Functions with the service role.
revoke all on table public.subscriptions from anon;
revoke all on table public.subscription_events from anon;
revoke all on table public.subscription_payments from anon;
revoke all on table public.subscription_referrals from anon;
revoke all on table public.subscription_credits from anon;
revoke all on table public.subscription_overrides from anon;

revoke insert, update, delete, truncate, references, trigger on table public.subscriptions from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.subscription_events from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.subscription_payments from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.subscription_referrals from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.subscription_credits from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.subscription_overrides from authenticated;

grant select on table public.subscriptions to authenticated;
grant select on table public.subscription_events to authenticated;
grant select on table public.subscription_payments to authenticated;
grant select on table public.subscription_referrals to authenticated;
grant select on table public.subscription_credits to authenticated;
grant select on table public.subscription_overrides to authenticated;

-- Avoid per-row auth.uid() evaluation on the subscription RLS paths.
drop policy if exists "users read own subscription" on public.subscriptions;
create policy "users read own subscription"
on public.subscriptions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own subscription events" on public.subscription_events;
create policy "users read own subscription events"
on public.subscription_events for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own payments" on public.subscription_payments;
create policy "users read own payments"
on public.subscription_payments for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own referrals" on public.subscription_referrals;
create policy "users read own referrals"
on public.subscription_referrals for select to authenticated
using (referrer_user_id = (select auth.uid()));

drop policy if exists "users read own credits" on public.subscription_credits;
create policy "users read own credits"
on public.subscription_credits for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own subscription overrides" on public.subscription_overrides;
create policy "users read own subscription overrides"
on public.subscription_overrides for select to authenticated
using (user_id = (select auth.uid()));

-- Cover subscription foreign keys used by lifecycle cleanup and account history.
create index if not exists subscriptions_plan_id_idx
  on public.subscriptions(plan_id);
create index if not exists subscription_events_user_id_idx
  on public.subscription_events(user_id);
create index if not exists subscription_events_subscription_id_idx
  on public.subscription_events(subscription_id);
create index if not exists subscription_payments_user_id_idx
  on public.subscription_payments(user_id);
create index if not exists subscription_payments_subscription_id_idx
  on public.subscription_payments(subscription_id);
create index if not exists subscription_overrides_user_id_idx
  on public.subscription_overrides(user_id);
create index if not exists subscription_overrides_plan_id_idx
  on public.subscription_overrides(plan_id);
create index if not exists subscription_overrides_created_by_idx
  on public.subscription_overrides(created_by);

commit;
