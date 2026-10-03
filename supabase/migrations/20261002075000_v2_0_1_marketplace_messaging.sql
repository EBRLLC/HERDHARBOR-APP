begin;

create or replace function public.marketplace_open_listing_conversation(target_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid := (select auth.uid());
  seller uuid;
  existing_id uuid;
  new_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;

  select l.seller_id into seller
  from public.marketplace_listings l
  join public.marketplace_public_profiles p on p.user_id=l.seller_id
  where l.id=target_listing_id
    and l.state in ('available','pending')
    and p.marketplace_status='active';

  if seller is null then raise exception 'listing unavailable'; end if;
  if seller=caller then raise exception 'cannot message your own listing'; end if;

  if exists (
    select 1 from public.marketplace_blocks b
    where (b.blocker_id=caller and b.blocked_id=seller)
       or (b.blocker_id=seller and b.blocked_id=caller)
  ) then raise exception 'conversation unavailable' using errcode='42501'; end if;

  select c.id into existing_id
  from public.marketplace_conversations c
  where c.listing_id=target_listing_id
    and exists(select 1 from public.marketplace_conversation_members m where m.conversation_id=c.id and m.user_id=caller)
    and exists(select 1 from public.marketplace_conversation_members m where m.conversation_id=c.id and m.user_id=seller)
  order by c.created_at
  limit 1;

  if existing_id is not null then return existing_id; end if;

  insert into public.marketplace_conversations(listing_id,created_by)
  values(target_listing_id,caller)
  returning id into new_id;

  insert into public.marketplace_conversation_members(conversation_id,user_id,role)
  values (new_id,caller,'buyer'),(new_id,seller,'seller');

  return new_id;
end;
$$;
revoke all on function public.marketplace_open_listing_conversation(uuid) from public,anon;
grant execute on function public.marketplace_open_listing_conversation(uuid) to authenticated;

create or replace function public.marketplace_inbox(folder text default 'all')
returns table (
  conversation_id uuid,
  listing_id uuid,
  listing_name text,
  member_role text,
  unread_count integer,
  muted boolean,
  archived boolean,
  other_public_id uuid,
  other_display_name text,
  other_rabbitry_name text,
  last_message_at timestamptz,
  last_message_preview text
)
language sql
stable
security definer
set search_path=''
as $$
  with mine as (
    select m.*
    from public.marketplace_conversation_members m
    where m.user_id=(select auth.uid())
      and (
        lower(coalesce(folder,'all'))='all'
        or (lower(folder)='buying' and m.role='buyer')
        or (lower(folder)='selling' and m.role='seller')
        or (lower(folder)='unread' and m.unread_count>0)
      )
  )
  select
    c.id,
    c.listing_id,
    coalesce(l.animal_name,'Marketplace conversation'),
    mine.role,
    mine.unread_count,
    mine.muted_at is not null,
    mine.archived_at is not null,
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
    where other.conversation_id=c.id and other.user_id<>(select auth.uid())
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
$$;
revoke all on function public.marketplace_inbox(text) from public,anon;
grant execute on function public.marketplace_inbox(text) to authenticated;

create or replace function herdharbor_private.marketplace_message_unread()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.marketplace_conversation_members
  set unread_count=unread_count+1
  where conversation_id=new.conversation_id and user_id<>new.sender_id;

  update public.marketplace_conversations
  set updated_at=new.created_at
  where id=new.conversation_id;
  return new;
end;
$$;

drop trigger if exists marketplace_message_unread on public.marketplace_messages;
create trigger marketplace_message_unread
after insert on public.marketplace_messages
for each row execute function herdharbor_private.marketplace_message_unread();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='marketplace_messages'
  ) then
    alter publication supabase_realtime add table public.marketplace_messages;
  end if;
end $$;

comment on function public.marketplace_open_listing_conversation(uuid) is
  'Authenticated listing-linked conversation opener. Seller identity comes from the listing; clients cannot spoof membership.';
comment on function public.marketplace_inbox(text) is
  'Private member inbox projection with Buying/Selling/Unread filters. Returns only conversations the authenticated caller belongs to.';

commit;
