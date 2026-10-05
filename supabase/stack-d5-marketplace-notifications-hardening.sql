-- Stack D5 — Marketplace notification inbox + final hardening.
-- Deliberately does NOT recreate the abandoned C7 marketplace_notifications/saved-search subsystem.

create table if not exists public.marketplace_notification_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint marketplace_notification_inbox_type_check
    check(notification_type in (
      'message',
      'listing_expiration',
      'listing_lifecycle',
      'moderation_warning',
      'seller_status',
      'account_status',
      'saved_search'
    )),
  constraint marketplace_notification_inbox_key_check
    check(char_length(dedupe_key) between 1 and 240),
  constraint marketplace_notification_inbox_title_check
    check(char_length(title) between 1 and 160),
  constraint marketplace_notification_inbox_body_check
    check(char_length(body) between 1 and 600),
  constraint marketplace_notification_inbox_metadata_check
    check(jsonb_typeof(metadata)='object'),
  unique(user_id,dedupe_key)
);

create index if not exists marketplace_notification_inbox_user_unread_idx
  on public.marketplace_notification_inbox(user_id,created_at desc)
  where read_at is null;

alter table public.marketplace_notification_inbox enable row level security;
revoke all on table public.marketplace_notification_inbox from public,anon,authenticated;

create or replace function herdharbor_private.marketplace_enqueue_member_notification(
  user_id_value uuid,
  type_value text,
  dedupe_key_value text,
  title_value text,
  body_value text,
  entity_type_value text default '',
  entity_id_value text default '',
  metadata_value jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $d5_enqueue$
declare
  safe_type text := lower(btrim(coalesce(type_value,'')));
  safe_key text := left(btrim(coalesce(dedupe_key_value,'')),240);
  safe_title text := left(btrim(coalesce(title_value,'')),160);
  safe_body text := left(btrim(coalesce(body_value,'')),600);
  safe_entity_type text := left(lower(btrim(coalesce(entity_type_value,''))),80);
  safe_entity_id text := left(btrim(coalesce(entity_id_value,'')),160);
  safe_metadata jsonb := coalesce(metadata_value,'{}'::jsonb);
  result_id uuid;
begin
  if user_id_value is null
    or safe_type not in ('message','listing_expiration','listing_lifecycle','moderation_warning','seller_status','account_status','saved_search')
    or safe_key=''
    or safe_title=''
    or safe_body=''
    or jsonb_typeof(safe_metadata)<>'object'
  then
    raise exception 'Invalid Marketplace notification' using errcode='22023';
  end if;

  insert into public.marketplace_notification_inbox(
    user_id,notification_type,dedupe_key,title,body,entity_type,entity_id,metadata
  )
  values(
    user_id_value,safe_type,safe_key,safe_title,safe_body,safe_entity_type,safe_entity_id,safe_metadata
  )
  on conflict(user_id,dedupe_key) do nothing
  returning id into result_id;

  if result_id is null then
    select n.id into result_id
    from public.marketplace_notification_inbox n
    where n.user_id=user_id_value and n.dedupe_key=safe_key;
  end if;

  return result_id;
end
$d5_enqueue$;

revoke all on function herdharbor_private.marketplace_enqueue_member_notification(uuid,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;

create or replace function herdharbor_private.marketplace_notify_new_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $d5_message_trigger$
declare
  recipient record;
begin
  for recipient in
    select m.user_id
    from public.marketplace_conversation_members m
    where m.conversation_id=new.conversation_id
      and m.user_id<>new.sender_id
      and m.muted_at is null
  loop
    perform herdharbor_private.marketplace_enqueue_member_notification(
      recipient.user_id,
      'message',
      'message:'||new.id::text,
      'New Marketplace message',
      'You have a new private Marketplace message.',
      'conversation',
      new.conversation_id::text,
      jsonb_build_object('message_id',new.id)
    );
  end loop;

  return new;
end
$d5_message_trigger$;

revoke all on function herdharbor_private.marketplace_notify_new_message()
  from public,anon,authenticated;

drop trigger if exists marketplace_notification_message_insert
  on public.marketplace_messages;
create trigger marketplace_notification_message_insert
after insert on public.marketplace_messages
for each row execute function herdharbor_private.marketplace_notify_new_message();

create or replace function herdharbor_private.marketplace_notify_user_warning()
returns trigger
language plpgsql
security definer
set search_path=''
as $d5_warning_trigger$
begin
  perform herdharbor_private.marketplace_enqueue_member_notification(
    new.user_id,
    'moderation_warning',
    'warning:'||new.id::text,
    'Marketplace warning',
    new.warning_text,
    'warning',
    new.id::text,
    jsonb_build_object('warning_id',new.id)
  );
  return new;
end
$d5_warning_trigger$;

revoke all on function herdharbor_private.marketplace_notify_user_warning()
  from public,anon,authenticated;

drop trigger if exists marketplace_notification_warning_insert
  on public.marketplace_user_warnings;
create trigger marketplace_notification_warning_insert
after insert on public.marketplace_user_warnings
for each row execute function herdharbor_private.marketplace_notify_user_warning();

create or replace function herdharbor_private.marketplace_notify_listing_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $d5_listing_trigger$
declare
  notification_title text;
  notification_body text;
begin
  if old.state is not distinct from new.state then
    return new;
  end if;

  if new.state='available' then
    notification_title:='Listing available';
    notification_body:='Your listing "'||left(coalesce(new.animal_name,'Marketplace listing'),100)||'" is available in Marketplace Browse.';
  elsif new.state='pending' then
    notification_title:='Listing marked pending';
    notification_body:='Your listing "'||left(coalesce(new.animal_name,'Marketplace listing'),100)||'" is hidden from normal Browse while pending.';
  elsif new.state='sold' then
    notification_title:='Listing marked sold';
    notification_body:='Your listing "'||left(coalesce(new.animal_name,'Marketplace listing'),100)||'" is marked sold and no longer appears in normal Browse.';
  elsif new.state='archived' then
    notification_title:='Listing archived';
    notification_body:='Your listing "'||left(coalesce(new.animal_name,'Marketplace listing'),100)||'" is archived and hidden from normal Browse.';
  elsif new.state='expired' then
    notification_title:='Listing expired';
    notification_body:='Your listing "'||left(coalesce(new.animal_name,'Marketplace listing'),100)||'" expired. Reconfirm it to return it to Browse.';
  elsif new.state='removed' then
    notification_title:='Listing removed from Marketplace';
    notification_body:='A Marketplace listing was removed from discovery by moderation.';
  else
    return new;
  end if;

  perform herdharbor_private.marketplace_enqueue_member_notification(
    new.seller_id,
    'listing_lifecycle',
    'listing-state:'||new.id::text||':'||new.state||':'||coalesce(new.updated_at::text,now()::text),
    notification_title,
    notification_body,
    'listing',
    new.id::text,
    jsonb_build_object('state',new.state)
  );

  return new;
end
$d5_listing_trigger$;

revoke all on function herdharbor_private.marketplace_notify_listing_lifecycle()
  from public,anon,authenticated;

drop trigger if exists marketplace_notification_listing_lifecycle
  on public.marketplace_listings;
create trigger marketplace_notification_listing_lifecycle
after update of state on public.marketplace_listings
for each row execute function herdharbor_private.marketplace_notify_listing_lifecycle();

create or replace function herdharbor_private.marketplace_notify_seller_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $d5_seller_status_trigger$
declare
  notification_title text;
  notification_body text;
begin
  if old.marketplace_status is not distinct from new.marketplace_status then
    return new;
  end if;

  if new.marketplace_status='suspended' then
    notification_title:='Marketplace selling suspended';
    notification_body:='Your Marketplace seller profile is suspended. Your private HerdHarbor records are unchanged.';
  elsif new.marketplace_status='active' then
    notification_title:='Marketplace selling active';
    notification_body:='Your Marketplace seller profile is active.';
  elsif new.marketplace_status='closed' then
    notification_title:='Marketplace seller profile closed';
    notification_body:='Your Marketplace seller profile is closed. Your private HerdHarbor records are unchanged.';
  else
    return new;
  end if;

  perform herdharbor_private.marketplace_enqueue_member_notification(
    new.user_id,
    'seller_status',
    'seller-status:'||new.public_id::text||':'||new.marketplace_status||':'||coalesce(new.updated_at::text,now()::text),
    notification_title,
    notification_body,
    'seller',
    new.public_id::text,
    jsonb_build_object('marketplace_status',new.marketplace_status)
  );

  return new;
end
$d5_seller_status_trigger$;

revoke all on function herdharbor_private.marketplace_notify_seller_status()
  from public,anon,authenticated;

drop trigger if exists marketplace_notification_seller_status
  on public.marketplace_public_profiles;
create trigger marketplace_notification_seller_status
after update of marketplace_status on public.marketplace_public_profiles
for each row execute function herdharbor_private.marketplace_notify_seller_status();

create or replace function herdharbor_private.marketplace_notify_account_suspension()
returns trigger
language plpgsql
security definer
set search_path=''
as $d5_account_status_trigger$
declare
  notification_title text;
  notification_body text;
  dedupe text;
begin
  if tg_op='INSERT' then
    notification_title:='Marketplace access suspended';
    notification_body:='Your Marketplace account access is suspended. Your main HerdHarbor account and private herd records are unchanged.';
    dedupe:='account-suspension:'||new.suspension_id::text||':suspended';
  elsif old.lifted_at is null and new.lifted_at is not null then
    notification_title:='Marketplace access restored';
    notification_body:='Your Marketplace account access has been restored.';
    dedupe:='account-suspension:'||new.suspension_id::text||':lifted';
  else
    return new;
  end if;

  perform herdharbor_private.marketplace_enqueue_member_notification(
    new.user_id,
    'account_status',
    dedupe,
    notification_title,
    notification_body,
    'account',
    new.user_id::text,
    jsonb_build_object(
      'suspension_id',new.suspension_id,
      'lifted',new.lifted_at is not null
    )
  );

  return new;
end
$d5_account_status_trigger$;

revoke all on function herdharbor_private.marketplace_notify_account_suspension()
  from public,anon,authenticated;

drop trigger if exists marketplace_notification_account_suspension_insert
  on public.marketplace_account_suspensions;
create trigger marketplace_notification_account_suspension_insert
after insert on public.marketplace_account_suspensions
for each row execute function herdharbor_private.marketplace_notify_account_suspension();

drop trigger if exists marketplace_notification_account_suspension_lift
  on public.marketplace_account_suspensions;
create trigger marketplace_notification_account_suspension_lift
after update of lifted_at on public.marketplace_account_suspensions
for each row execute function herdharbor_private.marketplace_notify_account_suspension();

create or replace function public.marketplace_member_refresh_notifications()
returns jsonb
language plpgsql
security definer
set search_path=''
as $d5_refresh$
declare
  actor uuid := auth.uid();
  inserted_count integer := 0;
  expired_count integer := 0;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  expired_count:=public.marketplace_member_refresh_listing_lifecycle();

  insert into public.marketplace_notification_inbox(
    user_id,notification_type,dedupe_key,title,body,entity_type,entity_id,metadata
  )
  select
    actor,
    'listing_expiration',
    'listing-expiry:'||l.id::text||':'||l.expires_at::text,
    'Marketplace listing expires soon',
    'Your listing "'||left(coalesce(l.animal_name,'Marketplace listing'),100)||'" expires soon. Reconfirm it to keep it in Browse.',
    'listing',
    l.id::text,
    jsonb_build_object('expires_at',l.expires_at)
  from public.marketplace_listings l
  where l.seller_id=actor
    and l.state='available'
    and l.expires_at is not null
    and l.expires_at>now()
    and l.expires_at<=now()+interval '5 days'
  on conflict(user_id,dedupe_key) do nothing;

  get diagnostics inserted_count=row_count;

  return jsonb_build_object(
    'expiration_reminders_created',inserted_count,
    'expired_listings_refreshed',expired_count
  );
end
$d5_refresh$;

revoke all on function public.marketplace_member_refresh_notifications()
  from public,anon;
grant execute on function public.marketplace_member_refresh_notifications()
  to authenticated;

create or replace function public.marketplace_member_notifications(
  limit_value integer default 50,
  offset_value integer default 0
)
returns table(
  notification_id uuid,
  notification_type text,
  title text,
  body text,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz,
  read boolean
)
language plpgsql
stable
security definer
set search_path=''
as $d5_list$
declare
  actor uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(limit_value,50),1),200);
  safe_offset integer := greatest(coalesce(offset_value,0),0);
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  return query
  select
    n.id,n.notification_type,n.title,n.body,n.entity_type,n.entity_id,
    n.metadata,n.created_at,n.read_at is not null
  from public.marketplace_notification_inbox n
  where n.user_id=actor
  order by n.created_at desc,n.id desc
  limit safe_limit offset safe_offset;
end
$d5_list$;

revoke all on function public.marketplace_member_notifications(integer,integer)
  from public,anon;
grant execute on function public.marketplace_member_notifications(integer,integer)
  to authenticated;

create or replace function public.marketplace_member_mark_notification_read(
  notification_id_value uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $d5_read$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  update public.marketplace_notification_inbox
  set read_at=coalesce(read_at,now())
  where id=notification_id_value and user_id=actor;

  return found;
end
$d5_read$;

revoke all on function public.marketplace_member_mark_notification_read(uuid)
  from public,anon;
grant execute on function public.marketplace_member_mark_notification_read(uuid)
  to authenticated;

create or replace function public.marketplace_member_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path=''
as $d5_read_all$
declare
  actor uuid := auth.uid();
  changed integer;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  update public.marketplace_notification_inbox
  set read_at=now()
  where user_id=actor and read_at is null;

  get diagnostics changed=row_count;
  return changed;
end
$d5_read_all$;

revoke all on function public.marketplace_member_mark_all_notifications_read()
  from public,anon;
grant execute on function public.marketplace_member_mark_all_notifications_read()
  to authenticated;

create or replace function public.marketplace_member_mark_entity_notifications_read(
  entity_type_value text,
  entity_id_value text
)
returns integer
language plpgsql
security definer
set search_path=''
as $d5_read_entity$
declare
  actor uuid := auth.uid();
  safe_type text := lower(btrim(coalesce(entity_type_value,'')));
  safe_id text := btrim(coalesce(entity_id_value,''));
  changed integer;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if safe_type='' or safe_id='' then
    raise exception 'Notification entity is required' using errcode='22023';
  end if;

  update public.marketplace_notification_inbox
  set read_at=coalesce(read_at,now())
  where user_id=actor
    and entity_type=safe_type
    and entity_id=safe_id
    and read_at is null;

  get diagnostics changed=row_count;
  return changed;
end
$d5_read_entity$;

revoke all on function public.marketplace_member_mark_entity_notifications_read(text,text)
  from public,anon;
grant execute on function public.marketplace_member_mark_entity_notifications_read(text,text)
  to authenticated;

create or replace function public.marketplace_member_notification_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $d5_summary$
declare
  actor uuid := auth.uid();
  unread_notifications integer;
  message_summary jsonb;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select count(*)::integer into unread_notifications
  from public.marketplace_notification_inbox n
  where n.user_id=actor and n.read_at is null;

  message_summary:=public.marketplace_member_message_summary();

  return jsonb_build_object(
    'unread_notifications',coalesce(unread_notifications,0),
    'unread_messages',coalesce((message_summary->>'unread_messages')::integer,0),
    'unread_conversations',coalesce((message_summary->>'unread_conversations')::integer,0)
  );
end
$d5_summary$;

revoke all on function public.marketplace_member_notification_summary()
  from public,anon;
grant execute on function public.marketplace_member_notification_summary()
  to authenticated;
