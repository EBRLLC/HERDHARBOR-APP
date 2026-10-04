-- HerdHarbor Stack C7C — canonical Marketplace cleanup, moderation and contract hardening.
-- This migration intentionally removes abandoned Marketplace runtime objects that
-- survived the prior rolled-back/abandoned build and conflict with the C7 contract.

-- ---------------------------------------------------------------------------
-- Marketplace-only account suspension.
-- This does not suspend or disable the HerdHarbor application account.
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_account_suspensions (
  suspension_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suspended_at timestamptz not null default now(),
  suspended_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  prior_profile_status text,
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id) on delete restrict,
  lift_reason text
);

create unique index if not exists marketplace_account_suspensions_one_active
on public.marketplace_account_suspensions(user_id)
where lifted_at is null;

alter table public.marketplace_reports
  drop constraint if exists marketplace_reports_target_type_check;

alter table public.marketplace_reports
  add constraint marketplace_reports_target_type_check
  check (target_type in ('listing','user','conversation','message'));

alter table public.marketplace_reports
  add column if not exists reported_user_id uuid references auth.users(id) on delete set null;

alter table public.marketplace_reports
  add column if not exists target_snapshot jsonb not null default '{}'::jsonb;

alter table public.marketplace_account_suspensions enable row level security;
revoke all privileges on table public.marketplace_account_suspensions from anon, authenticated;

-- C7 hot-path indexes. These match the supported rate-limit, inbox,
-- moderation, favorite and public-browse access patterns.
create index if not exists marketplace_messages_sender_rate_idx
on public.marketplace_messages(sender_id, created_at desc);

create index if not exists marketplace_reports_reporter_rate_idx
on public.marketplace_reports(reporter_id, created_at desc);

create index if not exists marketplace_moderation_actions_created_idx
on public.marketplace_moderation_actions(created_at desc, id desc);

create index if not exists marketplace_favorites_user_created_idx
on public.marketplace_favorites(user_id, created_at desc);

create index if not exists marketplace_listings_public_newest_idx
on public.marketplace_listings(published_at desc, id)
where state='available';

create index if not exists marketplace_public_profiles_status_updated_idx
on public.marketplace_public_profiles(marketplace_status, updated_at desc);

create index if not exists marketplace_account_suspensions_active_created_idx
on public.marketplace_account_suspensions(suspended_at desc)
where lifted_at is null;

create or replace function herdharbor_private.marketplace_current_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $c7c_active$
  select exists (
    select 1
    from public.account_access a
    join auth.users u on u.id = a.user_id
    left join public.registration_policy rp on rp.singleton = true
    where a.user_id = (select auth.uid())
      and lower(coalesce(a.account_status,'')) = 'active'
      and not exists (
        select 1
        from public.marketplace_account_suspensions s
        where s.user_id = a.user_id
          and s.lifted_at is null
      )
      and (
        coalesce(rp.enabled,false) = false
        or rp.enforcement_started_at is null
        or u.created_at < rp.enforcement_started_at
        or exists (
          select 1
          from public.registration_profiles reg
          where reg.user_id = a.user_id
            and reg.age_verified_at is not null
        )
      )
  )
$c7c_active$;

revoke all on function herdharbor_private.marketplace_current_account_active() from public, anon;
grant execute on function herdharbor_private.marketplace_current_account_active() to authenticated;

create or replace function public.marketplace_member_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c7c_member_session$
declare
  actor uuid := auth.uid();
  result jsonb;
  suspended boolean := false;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select exists (
    select 1
    from public.marketplace_account_suspensions s
    where s.user_id=actor and s.lifted_at is null
  ) into suspended;

  select jsonb_build_object(
    'user_id',actor,
    'account_role',a.account_role,
    'account_status',a.account_status,
    'membership_tier',a.membership_tier,
    'marketplace_access_ready',herdharbor_private.marketplace_current_account_active(),
    'marketplace_suspended',suspended,
    'seller_public_id',p.public_id,
    'marketplace_status',coalesce(p.marketplace_status,'not_created')
  )
  into result
  from public.account_access a
  left join public.marketplace_public_profiles p on p.user_id=a.user_id
  where a.user_id=actor
  limit 1;

  if result is null then
    raise exception 'Account access profile is unavailable' using errcode='42501';
  end if;

  return result;
end
$c7c_member_session$;

revoke all on function public.marketplace_member_session() from public, anon;
grant execute on function public.marketplace_member_session() to authenticated;

drop trigger if exists marketplace_prevent_owner_self_lockout
on public.marketplace_public_profiles;

drop function if exists herdharbor_private.marketplace_prevent_owner_self_lockout();

-- Seller-profile suspension and full Marketplace-account suspension are distinct.
-- A seller-only suspension hides selling surfaces but does not block buying/messages.
-- Conversely, an active account suspension must not be bypassed by reactivating
-- only the public seller profile.
create or replace function herdharbor_private.marketplace_prevent_suspended_account_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $c7c_account_activation_guard$
begin
  if new.marketplace_status='active'
    and exists (
      select 1
      from public.marketplace_account_suspensions s
      where s.user_id=new.user_id
        and s.lifted_at is null
    )
  then
    raise exception 'Reactivate the Marketplace account suspension before activating the seller profile'
      using errcode='42501';
  end if;

  return new;
end
$c7c_account_activation_guard$;

revoke all on function herdharbor_private.marketplace_prevent_suspended_account_activation()
from public, anon, authenticated;

drop trigger if exists marketplace_prevent_suspended_account_activation
on public.marketplace_public_profiles;

create trigger marketplace_prevent_suspended_account_activation
before insert or update on public.marketplace_public_profiles
for each row
execute function herdharbor_private.marketplace_prevent_suspended_account_activation();

-- ---------------------------------------------------------------------------
-- Remove abandoned triggers that conflict with C7 behavior.
-- - Old "active member" triggers incorrectly require a seller profile, blocking
--   legitimate buyer messaging and draft listing workflows.
-- - Old unread trigger double increments C7 unread_count.
-- - Old pedigree sanitizer rewrites the canonical C5/C7 snapshot schema.
-- - Old saved-search trigger writes to an abandoned notification subsystem.
-- ---------------------------------------------------------------------------

drop trigger if exists marketplace_enforce_active_conversation_creator on public.marketplace_conversations;
drop trigger if exists marketplace_enforce_active_listing_writer on public.marketplace_listings;
drop trigger if exists marketplace_notify_saved_searches on public.marketplace_listings;
drop trigger if exists marketplace_sanitize_public_pedigree on public.marketplace_listings;
drop trigger if exists marketplace_enforce_active_message_sender on public.marketplace_messages;
drop trigger if exists marketplace_message_unread on public.marketplace_messages;
drop trigger if exists marketplace_message_rate_limit on public.marketplace_messages;
drop trigger if exists marketplace_enforce_active_reviewer on public.marketplace_reviews;

-- C7 owns message mutation end-to-end. Keep the former 20/minute protection here
-- rather than relying on a legacy trigger outside the supported migration stack.
create or replace function public.marketplace_member_send_message(
  conversation_id_value uuid,
  body_value text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c7c_send_message$
declare
  actor uuid := auth.uid();
  safe_body text := btrim(coalesce(body_value,''));
  result_id uuid;
  recent_count integer;
begin
  if actor is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  if char_length(safe_body)<1 or char_length(safe_body)>5000 then
    raise exception 'Message must be between 1 and 5000 characters' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marketplace-message-rate:'||actor::text,0));

  select count(*) into recent_count
  from public.marketplace_messages m
  where m.sender_id=actor
    and m.created_at>now()-interval '1 minute';

  if recent_count>=20 then
    raise exception 'Message rate limit exceeded' using errcode='54000';
  end if;

  if exists (
    select 1
    from public.marketplace_conversation_members mine
    join public.marketplace_conversation_members other
      on other.conversation_id=mine.conversation_id and other.user_id<>mine.user_id
    join public.marketplace_blocks b
      on (b.blocker_id=mine.user_id and b.blocked_id=other.user_id)
      or (b.blocker_id=other.user_id and b.blocked_id=mine.user_id)
    where mine.conversation_id=conversation_id_value and mine.user_id=actor
  ) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  if exists (
    select 1
    from public.marketplace_conversation_members other
    join public.marketplace_account_suspensions s
      on s.user_id=other.user_id and s.lifted_at is null
    where other.conversation_id=conversation_id_value
      and other.user_id<>actor
  ) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  insert into public.marketplace_messages(conversation_id,sender_id,body)
  values(conversation_id_value,actor,safe_body)
  returning id into result_id;

  update public.marketplace_conversations
  set updated_at=now()
  where id=conversation_id_value;

  update public.marketplace_conversation_members
  set unread_count=unread_count+1
  where conversation_id=conversation_id_value
    and user_id<>actor;

  return result_id;
end
$c7c_send_message$;

revoke all on function public.marketplace_member_send_message(uuid,text) from public, anon;
grant execute on function public.marketplace_member_send_message(uuid,text) to authenticated;

create unique index if not exists marketplace_conversations_listing_creator_unique
on public.marketplace_conversations(listing_id,created_by)
where listing_id is not null;

-- Serialize first-contact creation for the same buyer/listing pair. Without this,
-- two simultaneous clicks can both miss the existing-conversation lookup.
create or replace function public.marketplace_member_open_listing_conversation(listing_id_value uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c7c_open_conversation$
declare
  actor uuid := auth.uid();
  seller uuid;
  existing_id uuid;
  new_id uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Sign in with an active HerdHarbor account to message sellers' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(listing_id_value::text||':'||actor::text,0));

  select l.seller_id into seller
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=listing_id_value
    and l.state='available'
    and p.marketplace_status='active'
    and not exists (
      select 1 from public.marketplace_account_suspensions s
      where s.user_id=l.seller_id and s.lifted_at is null
    )
    and (l.expires_at is null or l.expires_at>now());

  if seller is null then raise exception 'Listing unavailable' using errcode='22023'; end if;
  if seller=actor then raise exception 'You cannot message your own listing' using errcode='22023'; end if;

  if exists (
    select 1 from public.marketplace_blocks b
    where (b.blocker_id=actor and b.blocked_id=seller)
       or (b.blocker_id=seller and b.blocked_id=actor)
  ) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  select c.id into existing_id
  from public.marketplace_conversations c
  where c.listing_id=listing_id_value
    and exists(select 1 from public.marketplace_conversation_members m where m.conversation_id=c.id and m.user_id=actor)
    and exists(select 1 from public.marketplace_conversation_members m where m.conversation_id=c.id and m.user_id=seller)
  order by c.created_at
  limit 1;

  if existing_id is not null then return existing_id; end if;

  insert into public.marketplace_conversations(listing_id,created_by)
  values(listing_id_value,actor)
  returning id into new_id;

  insert into public.marketplace_conversation_members(conversation_id,user_id,role)
  values(new_id,actor,'buyer'),(new_id,seller,'seller');

  return new_id;
end
$c7c_open_conversation$;

revoke all on function public.marketplace_member_open_listing_conversation(uuid) from public, anon;
grant execute on function public.marketplace_member_open_listing_conversation(uuid) to authenticated;

-- Self-target reports are invalid. Without this guard a seller/message author
-- could report their own content and make the Admin queue attribute abuse back
-- to the reporter.
create or replace function public.marketplace_member_submit_report(
  target_type_value text,
  target_id_value text,
  reason_value text,
  details_value text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $c7c_submit_report$
declare
  actor uuid := auth.uid();
  safe_type text := lower(btrim(coalesce(target_type_value,'')));
  safe_reason text := left(btrim(coalesce(reason_value,'')),240);
  safe_details text := left(btrim(coalesce(details_value,'')),2000);
  target_uuid uuid;
  reported_user uuid;
  target_snapshot jsonb := '{}'::jsonb;
  recent_count integer;
  result_id uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Sign in to report Marketplace content' using errcode='42501';
  end if;

  if safe_type not in ('listing','user','conversation','message') or safe_reason='' then
    raise exception 'Invalid report' using errcode='22023';
  end if;

  begin
    target_uuid := target_id_value::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid report target' using errcode='22023';
  end;

  perform pg_advisory_xact_lock(hashtextextended('marketplace-report-rate:'||actor::text,0));

  select count(*) into recent_count
  from public.marketplace_reports r
  where r.reporter_id=actor
    and r.created_at>now()-interval '1 hour';

  if recent_count>=10 then
    raise exception 'Report rate limit exceeded' using errcode='54000';
  end if;

  if safe_type='listing' then
    select
      l.seller_id,
      jsonb_build_object(
        'animal_name',l.animal_name,
        'species',l.species,
        'breed',l.breed,
        'sex',l.sex,
        'variety_color',l.variety_color,
        'price_cents',l.price_cents,
        'currency',l.currency,
        'location_city',l.location_city,
        'location_region',l.location_region,
        'description',left(coalesce(l.description,''),2000),
        'state',l.state,
        'seller_label',coalesce(nullif(p.rabbitry_name,''),nullif(p.display_name,''),'Marketplace member')
      )
    into reported_user,target_snapshot
    from public.marketplace_listings l
    join public.marketplace_public_profiles p on p.user_id=l.seller_id
    where l.id=target_uuid
      and l.state='available'
      and p.marketplace_status='active'
      and l.seller_id<>actor;

    if reported_user is null then
      raise exception 'Listing unavailable' using errcode='22023';
    end if;

  elsif safe_type='user' then
    select
      p.user_id,
      jsonb_build_object(
        'display_name',p.display_name,
        'rabbitry_name',p.rabbitry_name,
        'city',p.city,
        'region',p.region,
        'about',left(coalesce(p.about,''),2000),
        'marketplace_status',p.marketplace_status
      )
    into reported_user,target_snapshot
    from public.marketplace_public_profiles p
    where p.public_id=target_uuid
      and p.user_id<>actor;

    if reported_user is null then
      raise exception 'Profile unavailable' using errcode='22023';
    end if;

  elsif safe_type='conversation' then
    if not herdharbor_private.marketplace_current_user_is_conversation_member(target_uuid) then
      raise exception 'Conversation unavailable' using errcode='42501';
    end if;

    select
      cm.user_id,
      jsonb_build_object(
        'listing_name',coalesce(l.animal_name,'Marketplace conversation'),
        'message_excerpt',coalesce((
          select left(m.body,1000)
          from public.marketplace_messages m
          where m.conversation_id=target_uuid
            and m.sender_id=cm.user_id
          order by m.created_at desc,m.id desc
          limit 1
        ),'')
      )
    into reported_user,target_snapshot
    from public.marketplace_conversation_members cm
    left join public.marketplace_conversations conv on conv.id=cm.conversation_id
    left join public.marketplace_listings l on l.id=conv.listing_id
    where cm.conversation_id=target_uuid
      and cm.user_id<>actor
    order by cm.joined_at
    limit 1;

    if reported_user is null then
      raise exception 'Conversation unavailable' using errcode='42501';
    end if;

  elsif safe_type='message' then
    select
      m.sender_id,
      jsonb_build_object(
        'body',left(m.body,2000),
        'created_at',m.created_at,
        'conversation_id',m.conversation_id
      )
    into reported_user,target_snapshot
    from public.marketplace_messages m
    where m.id=target_uuid
      and m.sender_id<>actor
      and herdharbor_private.marketplace_current_user_is_conversation_member(m.conversation_id);

    if reported_user is null then
      raise exception 'Message unavailable' using errcode='42501';
    end if;
  end if;

  insert into public.marketplace_reports(
    reporter_id,target_type,target_id,reported_user_id,target_snapshot,reason,details
  )
  values(
    actor,safe_type,target_uuid::text,reported_user,target_snapshot,safe_reason,safe_details
  )
  returning id into result_id;

  return result_id;
end
$c7c_submit_report$;

revoke all on function public.marketplace_member_submit_report(text,text,text,text)
from public, anon;

grant execute on function public.marketplace_member_submit_report(text,text,text,text)
to authenticated;

-- Member-level blocking is conversation based so sellers can block buyers that
-- do not have public seller profiles. The peer account ID never leaves SQL.
drop function if exists public.marketplace_member_block_profile(uuid);

drop function if exists public.marketplace_member_conversation_block_state(uuid);

create or replace function public.marketplace_member_conversation_block_state(
  conversation_id_value uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $c7c_block_state$
declare
  actor uuid := auth.uid();
  peer uuid;
  blocked_by_me boolean;
  blocked_by_peer boolean;
  peer_suspended boolean;
begin
  if actor is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  select cm.user_id into peer
  from public.marketplace_conversation_members cm
  where cm.conversation_id=conversation_id_value
    and cm.user_id<>actor
  order by cm.joined_at
  limit 1;

  if peer is null then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  select
    exists (
      select 1 from public.marketplace_blocks b
      where b.blocker_id=actor and b.blocked_id=peer
    ),
    exists (
      select 1 from public.marketplace_blocks b
      where b.blocker_id=peer and b.blocked_id=actor
    ),
    exists (
      select 1 from public.marketplace_account_suspensions s
      where s.user_id=peer and s.lifted_at is null
    )
  into blocked_by_me,blocked_by_peer,peer_suspended;

  return jsonb_build_object(
    'blocked_by_me',blocked_by_me,
    'blocked_by_peer',blocked_by_peer,
    'peer_suspended',peer_suspended,
    'messaging_blocked',blocked_by_me or blocked_by_peer or peer_suspended
  );
end
$c7c_block_state$;

revoke all on function public.marketplace_member_conversation_block_state(uuid)
from public, anon;

grant execute on function public.marketplace_member_conversation_block_state(uuid)
to authenticated;


create or replace function public.marketplace_member_set_conversation_block(
  conversation_id_value uuid,
  blocked_value boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $c7c_set_block$
declare
  actor uuid := auth.uid();
  peer uuid;
begin
  if actor is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  select cm.user_id into peer
  from public.marketplace_conversation_members cm
  where cm.conversation_id=conversation_id_value
    and cm.user_id<>actor
  order by cm.joined_at
  limit 1;

  if peer is null then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  if coalesce(blocked_value,false) then
    insert into public.marketplace_blocks(blocker_id,blocked_id)
    values(actor,peer)
    on conflict do nothing;
    return true;
  end if;

  delete from public.marketplace_blocks
  where blocker_id=actor
    and blocked_id=peer;

  return false;
end
$c7c_set_block$;

revoke all on function public.marketplace_member_set_conversation_block(uuid,boolean)
from public, anon;

grant execute on function public.marketplace_member_set_conversation_block(uuid,boolean)
to authenticated;

-- ---------------------------------------------------------------------------
-- Abuse moderation for all Marketplace participants, including buyers that do
-- not have seller profiles.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_owner_admin_summary_v2()
returns table (
  open_reports bigint,
  suspended_sellers bigint,
  suspended_accounts bigint,
  removed_listings bigint,
  available_listings bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $c7c_admin_summary$
begin
  if auth.uid() is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  return query
  select
    (select count(*)::bigint from public.marketplace_reports r where r.status in ('open','reviewing')),
    (select count(*)::bigint
       from public.marketplace_public_profiles p
       where p.marketplace_status='suspended'
         and not exists (
           select 1 from public.marketplace_account_suspensions s
           where s.user_id=p.user_id and s.lifted_at is null
         )),
    (select count(*)::bigint from public.marketplace_account_suspensions s where s.lifted_at is null),
    (select count(*)::bigint from public.marketplace_listings l where l.state='removed'),
    (select count(*)::bigint from public.marketplace_listings l
       join public.marketplace_public_profiles p on p.user_id=l.seller_id
       where l.state='available' and p.marketplace_status='active'
         and not exists (
           select 1 from public.marketplace_account_suspensions s
           where s.user_id=l.seller_id and s.lifted_at is null
         )
         and (l.expires_at is null or l.expires_at>now()));
end
$c7c_admin_summary$;

revoke all on function public.marketplace_owner_admin_summary_v2() from public, anon;
grant execute on function public.marketplace_owner_admin_summary_v2() to authenticated;

-- Seller administration excludes accounts under full Marketplace suspension.
-- Those accounts are managed only through the Suspended Accounts view until the
-- account-level suspension is lifted, preventing conflicting reactivation paths.
create or replace function public.marketplace_owner_admin_sellers(
  status_value text default '',
  query_value text default '',
  limit_value integer default 100,
  offset_value integer default 0
)
returns table (
  public_id uuid,
  display_name text,
  rabbitry_name text,
  city text,
  region text,
  verification_status text,
  marketplace_status text,
  active_listing_count bigint,
  removed_listing_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $c7c_sellers$
declare
  actor uuid := auth.uid();
  safe_status text := lower(btrim(coalesce(status_value,'')));
  safe_query text := left(btrim(coalesce(query_value,'')),120);
  safe_limit integer := least(greatest(coalesce(limit_value,100),1),200);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if safe_status <> '' and safe_status not in ('active','suspended','closed') then
    raise exception 'Invalid seller status' using errcode='22023';
  end if;

  return query
  select
    p.public_id,
    p.display_name,
    p.rabbitry_name,
    p.city,
    p.region,
    p.verification_status,
    p.marketplace_status,
    count(*) filter (where l.state='available')::bigint,
    count(*) filter (where l.state='removed')::bigint,
    p.updated_at
  from public.marketplace_public_profiles p
  left join public.marketplace_listings l on l.seller_id=p.user_id
  where not exists (
      select 1
      from public.marketplace_account_suspensions s
      where s.user_id=p.user_id and s.lifted_at is null
    )
    and (safe_status='' or p.marketplace_status=safe_status)
    and (
      safe_query=''
      or p.display_name ilike '%' || safe_query || '%'
      or p.rabbitry_name ilike '%' || safe_query || '%'
      or p.city ilike '%' || safe_query || '%'
      or p.region ilike '%' || safe_query || '%'
    )
  group by
    p.public_id,p.display_name,p.rabbitry_name,p.city,p.region,
    p.verification_status,p.marketplace_status,p.updated_at
  order by
    case p.marketplace_status when 'suspended' then 0 when 'active' then 1 else 2 end,
    p.updated_at desc,
    p.public_id
  limit safe_limit offset safe_offset;
end
$c7c_sellers$;

revoke all on function public.marketplace_owner_admin_sellers(text,text,integer,integer)
from public, anon;

grant execute on function public.marketplace_owner_admin_sellers(text,text,integer,integer)
to authenticated;

create or replace function public.marketplace_owner_admin_reports_v2(
  status_value text default ''
)
returns table (
  report_id uuid,
  target_type text,
  target_id text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  target_label text,
  target_state text,
  target_excerpt text,
  reported_label text,
  can_suspend_account boolean,
  account_suspended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $c7c_admin_reports$
declare
  actor uuid := auth.uid();
  safe_status text := lower(btrim(coalesce(status_value,'')));
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if safe_status <> '' and safe_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode='22023';
  end if;

  return query
  with report_context as (
    select
      r.*,
      l.animal_name as listing_name,
      l.state as listing_state,
      l.seller_id as listing_seller_id,
      up.user_id as profile_user_id,
      coalesce(nullif(up.rabbitry_name,''),nullif(up.display_name,'')) as profile_label,
      msg.sender_id as message_sender_id,
      left(msg.body,300) as message_excerpt,
      conv.listing_id as conversation_listing_id,
      (
        select cm.user_id
        from public.marketplace_conversation_members cm
        where cm.conversation_id=conv.id
          and cm.user_id<>r.reporter_id
        order by cm.joined_at
        limit 1
      ) as conversation_other_user_id,
      (
        select left(m2.body,300)
        from public.marketplace_messages m2
        where m2.conversation_id=conv.id
          and m2.sender_id<>r.reporter_id
        order by m2.created_at desc,m2.id desc
        limit 1
      ) as conversation_excerpt
    from public.marketplace_reports r
    left join public.marketplace_listings l
      on r.target_type='listing'
     and r.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and l.id=r.target_id::uuid
    left join public.marketplace_public_profiles up
      on r.target_type='user'
     and r.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and up.public_id=r.target_id::uuid
    left join public.marketplace_messages msg
      on r.target_type='message'
     and r.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and msg.id=r.target_id::uuid
    left join public.marketplace_conversations conv
      on r.target_type='conversation'
     and r.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and conv.id=r.target_id::uuid
    where safe_status='' or r.status=safe_status
  ),
  resolved as (
    select
      rc.*,
      coalesce(
        rc.reported_user_id,
        case
          when rc.target_type='listing' then rc.listing_seller_id
          when rc.target_type='user' then rc.profile_user_id
          when rc.target_type='message' then rc.message_sender_id
          when rc.target_type='conversation' then rc.conversation_other_user_id
          else null
        end
      ) as effective_reported_user_id
    from report_context rc
  )
  select
    x.id,
    x.target_type,
    x.target_id,
    x.reason,
    x.details,
    x.status,
    x.created_at,
    x.resolved_at,
    case
      when x.target_type='listing' then
        coalesce(x.listing_name,nullif(x.target_snapshot->>'animal_name',''),'Listing unavailable')
      when x.target_type='user' then
        coalesce(
          x.profile_label,
          nullif(x.target_snapshot->>'rabbitry_name',''),
          nullif(x.target_snapshot->>'display_name',''),
          'Seller unavailable'
        )
      when x.target_type='message' then 'Reported message'
      when x.target_type='conversation' then
        coalesce(
          'Conversation about '||coalesce(cl.animal_name,nullif(x.target_snapshot->>'listing_name','')),
          'Reported conversation'
        )
      else initcap(replace(x.target_type,'_',' '))
    end,
    case
      when x.target_type='listing' then
        coalesce(x.listing_state,nullif(x.target_snapshot->>'state',''),'unavailable')
      when x.target_type='user' then
        coalesce(rp.marketplace_status,nullif(x.target_snapshot->>'marketplace_status',''),'unavailable')
      when x.effective_reported_user_id is not null and susp.user_id is not null then 'suspended'
      else ''
    end,
    case
      when x.target_type='listing' then coalesce(nullif(x.target_snapshot->>'description',''),'')
      when x.target_type='user' then coalesce(nullif(x.target_snapshot->>'about',''),'')
      when x.target_type='message' then
        coalesce(nullif(x.target_snapshot->>'body',''),x.message_excerpt,'')
      when x.target_type='conversation' then
        coalesce(nullif(x.target_snapshot->>'message_excerpt',''),x.conversation_excerpt,'')
      else ''
    end,
    coalesce(
      nullif(rp.rabbitry_name,''),
      nullif(rp.display_name,''),
      nullif(x.target_snapshot->>'seller_label',''),
      nullif(x.target_snapshot->>'rabbitry_name',''),
      nullif(x.target_snapshot->>'display_name',''),
      'Marketplace member'
    ),
    (
      x.effective_reported_user_id is not null
      and x.effective_reported_user_id<>x.reporter_id
      and not exists (
        select 1
        from public.account_access aa
        where aa.user_id=x.effective_reported_user_id
          and lower(coalesce(aa.account_role,''))='owner'
          and lower(coalesce(aa.account_status,''))='active'
      )
    ),
    susp.user_id is not null
  from resolved x
  left join public.marketplace_public_profiles rp on rp.user_id=x.effective_reported_user_id
  left join public.marketplace_account_suspensions susp
    on susp.user_id=x.effective_reported_user_id and susp.lifted_at is null
  left join public.marketplace_listings cl on cl.id=x.conversation_listing_id
  order by
    case x.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    x.created_at asc,
    x.id;
end
$c7c_admin_reports$;

revoke all on function public.marketplace_owner_admin_reports_v2(text) from public, anon;
grant execute on function public.marketplace_owner_admin_reports_v2(text) to authenticated;


create or replace function public.marketplace_owner_admin_resolve_report_v2(
  report_id_value uuid,
  resolution_value text,
  reason_value text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $c7c_resolve_report$
declare
  actor uuid := auth.uid();
  resolution_name text := lower(btrim(coalesce(resolution_value,'')));
  reason_text text := left(btrim(coalesce(reason_value,'')),1000);
  report_row public.marketplace_reports%rowtype;
  target_uuid uuid;
  target_user uuid;
  prior_state text;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if resolution_name not in ('dismiss','resolve','remove_listing','suspend_seller','suspend_account') then
    raise exception 'Unsupported report resolution' using errcode='22023';
  end if;

  select * into report_row
  from public.marketplace_reports
  where id=report_id_value
  for update;

  if not found then raise exception 'Marketplace report is unavailable' using errcode='22023'; end if;
  if report_row.status in ('resolved','dismissed') then
    raise exception 'Marketplace report is already closed' using errcode='22023';
  end if;
  if resolution_name in ('remove_listing','suspend_seller','suspend_account') and reason_text='' then
    raise exception 'Moderation reason is required' using errcode='22023';
  end if;

  if resolution_name='remove_listing' then
    if report_row.target_type <> 'listing' then
      raise exception 'remove_listing requires a listing report' using errcode='22023';
    end if;
    begin
      target_uuid:=report_row.target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Report target is invalid' using errcode='22023';
    end;

    select l.state into prior_state
    from public.marketplace_listings l
    where l.id=target_uuid
    for update;

    if not found then
      raise exception 'Reported listing is unavailable' using errcode='22023';
    end if;

    update public.marketplace_listings
    set state='removed',updated_at=now()
    where id=target_uuid;

  elsif resolution_name='suspend_seller' then
    if report_row.target_type <> 'user' then
      raise exception 'suspend_seller requires a seller report' using errcode='22023';
    end if;
    begin
      target_uuid:=report_row.target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Report target is invalid' using errcode='22023';
    end;

    select p.marketplace_status into prior_state
    from public.marketplace_public_profiles p
    where p.public_id=target_uuid
    for update;

    if not found then
      raise exception 'Reported seller is unavailable' using errcode='22023';
    end if;

    update public.marketplace_public_profiles
    set marketplace_status='suspended',updated_at=now()
    where public_id=target_uuid;

  elsif resolution_name='suspend_account' then
    target_user:=report_row.reported_user_id;

    if target_user is null then
      begin
        target_uuid:=report_row.target_id::uuid;
      exception when invalid_text_representation then
        raise exception 'Report target is invalid' using errcode='22023';
      end;

      if report_row.target_type='listing' then
        select l.seller_id into target_user
        from public.marketplace_listings l
        where l.id=target_uuid;
      elsif report_row.target_type='user' then
        select p.user_id into target_user
        from public.marketplace_public_profiles p
        where p.public_id=target_uuid;
      elsif report_row.target_type='message' then
        select m.sender_id into target_user
        from public.marketplace_messages m
        where m.id=target_uuid;
      elsif report_row.target_type='conversation' then
        select cm.user_id into target_user
        from public.marketplace_conversation_members cm
        where cm.conversation_id=target_uuid
          and cm.user_id<>report_row.reporter_id
        order by cm.joined_at
        limit 1;
      end if;
    end if;

    if target_user is null
      or target_user=actor
      or target_user=report_row.reporter_id
      or exists (
        select 1
        from public.account_access a
        where a.user_id=target_user
          and lower(coalesce(a.account_role,''))='owner'
          and lower(coalesce(a.account_status,''))='active'
      )
    then
      raise exception 'Reported Marketplace account is unavailable for suspension' using errcode='22023';
    end if;

    select p.marketplace_status into prior_state
    from public.marketplace_public_profiles p
    where p.user_id=target_user
    for update;

    insert into public.marketplace_account_suspensions(
      user_id,suspended_by,reason,prior_profile_status,suspended_at,lifted_at,lifted_by,lift_reason
    )
    values(target_user,actor,reason_text,prior_state,now(),null,null,null)
    on conflict(user_id) where lifted_at is null do update
    set suspended_by=excluded.suspended_by,
        reason=excluded.reason,
        prior_profile_status=excluded.prior_profile_status,
        suspended_at=now(),
        lifted_by=null,
        lift_reason=null;

    update public.marketplace_public_profiles
    set marketplace_status='suspended',updated_at=now()
    where user_id=target_user and marketplace_status='active';
  end if;

  update public.marketplace_reports
  set status=case when resolution_name='dismiss' then 'dismissed' else 'resolved' end,
      resolved_at=now()
  where id=report_id_value;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,resolution_name,report_row.target_type,report_row.target_id,reason_text,
    jsonb_build_object(
      'report_id',report_id_value,
      'previous_target_state',coalesce(prior_state,'')
    )
  );

  return jsonb_build_object(
    'report_id',report_id_value,
    'status',case when resolution_name='dismiss' then 'dismissed' else 'resolved' end,
    'resolution',resolution_name
  );
end
$c7c_resolve_report$;

revoke all on function public.marketplace_owner_admin_resolve_report_v2(uuid,text,text) from public, anon;
grant execute on function public.marketplace_owner_admin_resolve_report_v2(uuid,text,text) to authenticated;


create or replace function public.marketplace_owner_admin_suspensions()
returns table (
  suspension_id uuid,
  suspended_at timestamptz,
  reason text,
  display_name text,
  rabbitry_name text,
  marketplace_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $c7c_suspensions$
begin
  if auth.uid() is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  return query
  select
    s.suspension_id,s.suspended_at,s.reason,p.display_name,p.rabbitry_name,p.marketplace_status
  from public.marketplace_account_suspensions s
  left join public.marketplace_public_profiles p on p.user_id=s.user_id
  where s.lifted_at is null
  order by s.suspended_at desc,s.suspension_id;
end
$c7c_suspensions$;

revoke all on function public.marketplace_owner_admin_suspensions() from public, anon;
grant execute on function public.marketplace_owner_admin_suspensions() to authenticated;

create or replace function public.marketplace_owner_admin_reactivate_account(
  suspension_id_value uuid,
  reason_value text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $c7c_reactivate$
declare
  actor uuid := auth.uid();
  reason_text text := left(btrim(coalesce(reason_value,'')),1000);
  row_value public.marketplace_account_suspensions%rowtype;
begin
  if actor is null or public.herdharbor_account_role() <> 'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;
  if reason_text='' then raise exception 'Moderation reason is required' using errcode='22023'; end if;

  select * into row_value
  from public.marketplace_account_suspensions
  where suspension_id=suspension_id_value and lifted_at is null
  for update;

  if not found then raise exception 'Marketplace suspension is unavailable' using errcode='22023'; end if;

  update public.marketplace_account_suspensions
  set lifted_at=now(),lifted_by=actor,lift_reason=reason_text
  where suspension_id=row_value.suspension_id
    and lifted_at is null;

  if row_value.prior_profile_status is not null then
    update public.marketplace_public_profiles
    set marketplace_status=row_value.prior_profile_status,updated_at=now()
    where user_id=row_value.user_id and marketplace_status='suspended';
  end if;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,'reactivate_account','user',row_value.suspension_id::text,reason_text,
    jsonb_build_object('suspension_id',row_value.suspension_id)
  );

  return true;
end
$c7c_reactivate$;

revoke all on function public.marketplace_owner_admin_reactivate_account(uuid,text) from public, anon;
grant execute on function public.marketplace_owner_admin_reactivate_account(uuid,text) to authenticated;

-- Match server-side Storage limits to the Marketplace listing uploader.
update storage.buckets
set public=false,
    file_size_limit=8388608,
    allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[]
where id='marketplace-public';

-- Storage object names are limited to Marketplace-generated path shapes.
create or replace function herdharbor_private.marketplace_storage_object_insert_allowed(
  object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $c7c_storage_insert$
declare
  listing_text text;
  listing_uuid uuid;
begin
  if not herdharbor_private.marketplace_current_account_active() then
    return false;
  end if;

  if object_name ~ '^profiles/avatar-[A-Za-z0-9-]+\.(jpg|png|webp)$' then
    return true;
  end if;

  if object_name !~ '^listings/[0-9a-fA-F-]{36}/photo-[0-5]-[A-Za-z0-9-]+\.(jpg|png|webp)$' then
    return false;
  end if;

  listing_text := split_part(object_name,'/',2);
  begin
    listing_uuid := listing_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.marketplace_listings l
    where l.id=listing_uuid
      and l.seller_id=(select auth.uid())
      and l.state<>'removed'
  );
end
$c7c_storage_insert$;

revoke all on function herdharbor_private.marketplace_storage_object_insert_allowed(text)
from public, anon;

grant execute on function herdharbor_private.marketplace_storage_object_insert_allowed(text)
to authenticated;

drop policy if exists marketplace_storage_member_own_insert on storage.objects;
create policy marketplace_storage_member_own_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='marketplace-public'
  and owner_id=(select auth.uid())::text
  and herdharbor_private.marketplace_storage_object_insert_allowed(name)
);

-- ---------------------------------------------------------------------------
-- Seller Storage mutations must not destroy moderation evidence.
-- Full Marketplace-account suspension also blocks media mutation.
-- ---------------------------------------------------------------------------

create or replace function herdharbor_private.marketplace_storage_object_mutable(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $c7c_storage_mutable$
  select
    herdharbor_private.marketplace_current_account_active()
    and (
      object_name like 'profiles/%'
      or (
        object_name like 'listings/%'
        and not exists (
          select 1
          from public.marketplace_listing_photos ph
          join public.marketplace_listings l on l.id=ph.listing_id
          where ph.storage_path=object_name
            and ph.seller_id=(select auth.uid())
            and l.state='removed'
        )
      )
    )
$c7c_storage_mutable$;

revoke all on function herdharbor_private.marketplace_storage_object_mutable(text)
from public, anon;

grant execute on function herdharbor_private.marketplace_storage_object_mutable(text)
to authenticated;

drop policy if exists marketplace_storage_member_own_update on storage.objects;
create policy marketplace_storage_member_own_update
on storage.objects
for update
to authenticated
using (
  bucket_id='marketplace-public'
  and owner_id=(select auth.uid())::text
  and herdharbor_private.marketplace_storage_object_mutable(name)
  and herdharbor_private.marketplace_storage_object_insert_allowed(name)
)
with check (
  bucket_id='marketplace-public'
  and owner_id=(select auth.uid())::text
  and herdharbor_private.marketplace_storage_object_mutable(name)
  and herdharbor_private.marketplace_storage_object_insert_allowed(name)
);

drop policy if exists marketplace_storage_member_own_delete on storage.objects;
create policy marketplace_storage_member_own_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='marketplace-public'
  and owner_id=(select auth.uid())::text
  and herdharbor_private.marketplace_storage_object_mutable(name)
);

-- ---------------------------------------------------------------------------
-- Public media paths must never expose internal auth-user UUID prefixes.
-- Public media is signed by the marketplace-public-media Edge Function instead.
-- ---------------------------------------------------------------------------

drop policy if exists marketplace_storage_public_read on storage.objects;
drop function if exists public.marketplace_public_listing_media_v2(uuid[]);
drop function if exists public.marketplace_public_seller_media_v2(uuid);
drop function if exists herdharbor_private.marketplace_public_media_allowed(text);

-- ---------------------------------------------------------------------------
-- Remove abandoned public RPC generations. C7 supports only:
--   marketplace_public_*_v2 (except media, now Edge-signed)
--   marketplace_member_*
--   marketplace_owner_admin_*
--   marketplace_reset_pedigree_snapshot_on_source_change
-- ---------------------------------------------------------------------------

do $c7c_drop_legacy_functions$
declare
  function_row record;
begin
  for function_row in
    select p.oid,
           format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'marketplace_add_deposit_record',
        'marketplace_agreement_templates',
        'marketplace_attach_agreement',
        'marketplace_block_profile',
        'marketplace_confirm_listing',
        'marketplace_delete_saved_search',
        'marketplace_deposit_records',
        'marketplace_dispute_review',
        'marketplace_inbox',
        'marketplace_listing_extension',
        'marketplace_mark_notification_read',
        'marketplace_moderate_report',
        'marketplace_moderation_queue',
        'marketplace_my_favorites',
        'marketplace_my_listings',
        'marketplace_my_notifications',
        'marketplace_open_listing_conversation',
        'marketplace_public_agreement',
        'marketplace_public_listing',
        'marketplace_public_pedigree',
        'marketplace_public_profile',
        'marketplace_refresh_seller_notifications',
        'marketplace_save_agreement_template',
        'marketplace_save_search',
        'marketplace_saved_searches',
        'marketplace_search_listings',
        'marketplace_seller_feedback',
        'marketplace_seller_feedback_summary',
        'marketplace_submit_report',
        'marketplace_submit_review',
        'marketplace_trust_indicators',
        'marketplace_update_listing_extensions',
        'marketplace_update_listing_state',
        'marketplace_owner_browse_facets',
        'marketplace_owner_delete_listing',
        'marketplace_owner_favorite_ids',
        'marketplace_owner_herd_animals',
        'marketplace_owner_listing_pedigree_preview',
        'marketplace_owner_listing_preview',
        'marketplace_owner_listings',
        'marketplace_owner_pedigree_source',
        'marketplace_owner_preview_media',
        'marketplace_owner_profile_editor',
        'marketplace_owner_profile_preview',
        'marketplace_owner_save_listing',
        'marketplace_owner_save_profile',
        'marketplace_owner_search_preview',
        'marketplace_owner_seller_preview',
        'marketplace_owner_set_listing_photos',
        'marketplace_owner_set_pedigree_snapshot',
        'marketplace_owner_toggle_favorite'
      )
  loop
    execute 'drop function if exists '||function_row.signature;
  end loop;
end
$c7c_drop_legacy_functions$;

-- Abandoned feature tables are empty in the pre-launch schema and are not part
-- of the supported C1-C7 contract.
drop table if exists public.marketplace_listing_agreements;
drop table if exists public.marketplace_deposit_records;
drop table if exists public.marketplace_agreement_templates;
drop table if exists public.marketplace_notifications;
drop table if exists public.marketplace_reviews;
drop table if exists public.marketplace_saved_searches;

-- Empty scaffolds from the abandoned build have no current C7 API/UI contract.
drop table if exists public.marketplace_listing_attributes;
drop table if exists public.marketplace_message_attachments;

-- C7C replaces these C6 report/summary contracts with moderation-aware versions.
drop function if exists public.marketplace_owner_admin_summary();
drop function if exists public.marketplace_owner_admin_reports(text);
drop function if exists public.marketplace_owner_admin_resolve_report(uuid,text,text);

-- Remove their private implementation helpers after callers/triggers are gone.
drop function if exists herdharbor_private.marketplace_enforce_active_conversation_creator();
drop function if exists herdharbor_private.marketplace_enforce_active_listing_writer();
drop function if exists herdharbor_private.marketplace_enforce_active_message_sender();
drop function if exists herdharbor_private.marketplace_enforce_active_reviewer();
drop function if exists herdharbor_private.marketplace_is_active_member(uuid);
drop function if exists herdharbor_private.marketplace_is_admin();
drop function if exists herdharbor_private.marketplace_is_conversation_member(uuid);
drop function if exists herdharbor_private.marketplace_conversation_is_blocked(uuid);
drop function if exists herdharbor_private.marketplace_message_rate_limit();
drop function if exists herdharbor_private.marketplace_message_unread();
drop function if exists herdharbor_private.marketplace_notify_saved_searches();
drop function if exists herdharbor_private.marketplace_sanitize_listing_pedigree();
drop function if exists herdharbor_private.marketplace_sanitize_public_pedigree(jsonb);
