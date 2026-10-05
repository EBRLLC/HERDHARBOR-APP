-- Stack D1 — Marketplace messaging hardening on top of canonical Stack C.
-- Keeps message bodies RPC-only while exposing a participant-scoped Realtime event stream.

alter table public.marketplace_messages
  add column if not exists client_request_id uuid;

create unique index if not exists marketplace_messages_sender_request_uidx
  on public.marketplace_messages(sender_id, client_request_id)
  where client_request_id is not null;

create table if not exists public.marketplace_message_events (
  event_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  message_id uuid not null references public.marketplace_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(message_id)
);

create index if not exists marketplace_message_events_conversation_created_idx
  on public.marketplace_message_events(conversation_id, created_at desc);

alter table public.marketplace_message_events enable row level security;
revoke all on table public.marketplace_message_events from public, anon, authenticated;
grant select on table public.marketplace_message_events to authenticated;

drop policy if exists marketplace_message_events_participant_read
  on public.marketplace_message_events;
create policy marketplace_message_events_participant_read
  on public.marketplace_message_events
  for select
  to authenticated
  using (
    herdharbor_private.marketplace_current_account_active()
    and herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id)
  );

create or replace function herdharbor_private.marketplace_emit_message_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $d1_event$
begin
  insert into public.marketplace_message_events(conversation_id, message_id, created_at)
  values(new.conversation_id, new.id, new.created_at)
  on conflict(message_id) do nothing;
  return new;
end
$d1_event$;

revoke all on function herdharbor_private.marketplace_emit_message_event()
  from public, anon, authenticated;

drop trigger if exists marketplace_emit_message_event
  on public.marketplace_messages;
create trigger marketplace_emit_message_event
after insert on public.marketplace_messages
for each row execute function herdharbor_private.marketplace_emit_message_event();

do $d1_realtime$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='marketplace_messages'
    ) then
      execute 'alter publication supabase_realtime drop table public.marketplace_messages';
    end if;

    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='marketplace_message_events'
    ) then
      execute 'alter publication supabase_realtime add table public.marketplace_message_events';
    end if;
  end if;
end
$d1_realtime$;

create or replace function public.marketplace_member_send_message_v2(
  conversation_id_value uuid,
  body_value text,
  client_request_id_value uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $d1_send$
declare
  actor uuid := auth.uid();
  safe_body text := btrim(coalesce(body_value,''));
  result_id uuid;
  existing_conversation uuid;
  existing_body text;
  recent_count integer;
begin
  if actor is null
    or client_request_id_value is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  if char_length(safe_body)<1 or char_length(safe_body)>5000 then
    raise exception 'Message must be between 1 and 5000 characters' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'marketplace-message-request:'||actor::text||':'||client_request_id_value::text,
      0
    )
  );

  select m.id,m.conversation_id,m.body
    into result_id,existing_conversation,existing_body
  from public.marketplace_messages m
  where m.sender_id=actor
    and m.client_request_id=client_request_id_value
  limit 1;

  if result_id is not null then
    if existing_conversation<>conversation_id_value or existing_body<>safe_body then
      raise exception 'Message request identifier was already used' using errcode='22023';
    end if;
    return result_id;
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

  insert into public.marketplace_messages(
    conversation_id,sender_id,body,client_request_id
  )
  values(
    conversation_id_value,actor,safe_body,client_request_id_value
  )
  returning id into result_id;

  update public.marketplace_conversations
  set updated_at=now()
  where id=conversation_id_value;

  update public.marketplace_conversation_members
  set unread_count=unread_count+1,
      archived_at=null
  where conversation_id=conversation_id_value
    and user_id<>actor;

  return result_id;
end
$d1_send$;

revoke all on function public.marketplace_member_send_message_v2(uuid,text,uuid)
  from public, anon;
grant execute on function public.marketplace_member_send_message_v2(uuid,text,uuid)
  to authenticated;

create or replace function public.marketplace_member_set_conversation_preferences(
  conversation_id_value uuid,
  archived_value boolean default null,
  muted_value boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $d1_preferences$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null
    or not herdharbor_private.marketplace_current_account_active()
    or not herdharbor_private.marketplace_current_user_is_conversation_member(conversation_id_value)
  then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  update public.marketplace_conversation_members
  set archived_at=case
        when archived_value is null then archived_at
        when archived_value then coalesce(archived_at,now())
        else null
      end,
      muted_at=case
        when muted_value is null then muted_at
        when muted_value then coalesce(muted_at,now())
        else null
      end
  where conversation_id=conversation_id_value
    and user_id=actor
  returning jsonb_build_object(
    'conversation_id',conversation_id,
    'archived',archived_at is not null,
    'muted',muted_at is not null,
    'unread_count',unread_count
  ) into result;

  if result is null then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;

  return result;
end
$d1_preferences$;

revoke all on function public.marketplace_member_set_conversation_preferences(uuid,boolean,boolean)
  from public, anon;
grant execute on function public.marketplace_member_set_conversation_preferences(uuid,boolean,boolean)
  to authenticated;

create or replace function public.marketplace_member_inbox_v2(folder_value text default 'all')
returns table(
  conversation_id uuid,
  listing_id uuid,
  listing_name text,
  member_role text,
  unread_count integer,
  archived boolean,
  muted boolean,
  other_public_id uuid,
  other_display_name text,
  other_rabbitry_name text,
  last_message_at timestamptz,
  last_message_preview text
)
language plpgsql
stable
security definer
set search_path = ''
as $d1_inbox$
declare
  safe_folder text := lower(btrim(coalesce(folder_value,'all')));
begin
  if auth.uid() is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  if safe_folder not in ('all','buying','selling','unread','archived','muted') then
    safe_folder := 'all';
  end if;

  return query
  with mine as (
    select m.*
    from public.marketplace_conversation_members m
    where m.user_id=(select auth.uid())
      and (
        (safe_folder='archived' and m.archived_at is not null)
        or (
          safe_folder<>'archived'
          and m.archived_at is null
          and (
            safe_folder='all'
            or (safe_folder='buying' and m.role='buyer')
            or (safe_folder='selling' and m.role='seller')
            or (safe_folder='unread' and m.unread_count>0)
            or (safe_folder='muted' and m.muted_at is not null)
          )
        )
      )
  )
  select
    c.id,
    c.listing_id,
    coalesce(l.animal_name,'Marketplace conversation'),
    mine.role,
    mine.unread_count,
    mine.archived_at is not null,
    mine.muted_at is not null,
    op.public_id,
    op.display_name,
    op.rabbitry_name,
    lm.created_at,
    left(coalesce(lm.body,''),180)
  from mine
  join public.marketplace_conversations c on c.id=mine.conversation_id
  left join public.marketplace_listings l on l.id=c.listing_id
  left join lateral (
    select other.user_id
    from public.marketplace_conversation_members other
    where other.conversation_id=c.id
      and other.user_id<>(select auth.uid())
    order by other.joined_at
    limit 1
  ) other_member on true
  left join public.marketplace_public_profiles op on op.user_id=other_member.user_id
  left join lateral (
    select msg.created_at,msg.body
    from public.marketplace_messages msg
    where msg.conversation_id=c.id
    order by msg.created_at desc,msg.id desc
    limit 1
  ) lm on true
  order by coalesce(lm.created_at,c.updated_at,c.created_at) desc,c.id;
end
$d1_inbox$;

revoke all on function public.marketplace_member_inbox_v2(text)
  from public, anon;
grant execute on function public.marketplace_member_inbox_v2(text)
  to authenticated;

create or replace function public.marketplace_member_message_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $d1_summary$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'unread_messages',coalesce(sum(m.unread_count),0),
    'unread_conversations',count(*) filter(where m.unread_count>0),
    'active_conversations',count(*)
  )
  into result
  from public.marketplace_conversation_members m
  where m.user_id=actor
    and m.archived_at is null;

  return coalesce(result,'{"unread_messages":0,"unread_conversations":0,"active_conversations":0}'::jsonb);
end
$d1_summary$;

revoke all on function public.marketplace_member_message_summary()
  from public, anon;
grant execute on function public.marketplace_member_message_summary()
  to authenticated;
