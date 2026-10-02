begin;

create or replace function herdharbor_private.marketplace_is_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.account_access a
       where a.user_id=(select auth.uid())
         and a.account_role in ('owner','admin')
         and a.account_status='active'
     );
$$;
revoke all on function herdharbor_private.marketplace_is_admin() from public,anon;
grant execute on function herdharbor_private.marketplace_is_admin() to authenticated;

create or replace function herdharbor_private.marketplace_conversation_is_blocked(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.marketplace_conversation_members me
    join public.marketplace_conversation_members other
      on other.conversation_id=me.conversation_id and other.user_id<>me.user_id
    join public.marketplace_blocks b
      on (b.blocker_id=me.user_id and b.blocked_id=other.user_id)
      or (b.blocker_id=other.user_id and b.blocked_id=me.user_id)
    where me.conversation_id=target_conversation
      and me.user_id=(select auth.uid())
  );
$$;
revoke all on function herdharbor_private.marketplace_conversation_is_blocked(uuid) from public,anon;
grant execute on function herdharbor_private.marketplace_conversation_is_blocked(uuid) to authenticated;

drop policy if exists marketplace_messages_member_insert on public.marketplace_messages;
create policy marketplace_messages_member_insert on public.marketplace_messages for insert to authenticated
  with check (
    (select auth.uid())=sender_id
    and herdharbor_private.marketplace_is_conversation_member(conversation_id)
    and not herdharbor_private.marketplace_conversation_is_blocked(conversation_id)
  );

create or replace function herdharbor_private.marketplace_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare recent_count integer;
begin
  select count(*) into recent_count
  from public.marketplace_messages m
  where m.sender_id=new.sender_id
    and m.created_at>now()-interval '1 minute';
  if recent_count>=20 then
    raise exception 'message rate limit exceeded' using errcode='P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_message_rate_limit on public.marketplace_messages;
create trigger marketplace_message_rate_limit
before insert on public.marketplace_messages
for each row execute function herdharbor_private.marketplace_message_rate_limit();

create or replace function public.marketplace_submit_report(
  report_target_type text,
  report_target_id text,
  report_reason text,
  report_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare report_id uuid;
declare recent_count integer;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if report_target_type not in ('listing','user','conversation','message') then raise exception 'invalid report target'; end if;
  if nullif(trim(report_target_id),'') is null or nullif(trim(report_reason),'') is null then raise exception 'report target and reason are required'; end if;
  select count(*) into recent_count from public.marketplace_reports r where r.reporter_id=caller and r.created_at>now()-interval '1 hour';
  if recent_count>=10 then raise exception 'report rate limit exceeded'; end if;
  if report_target_type='conversation' and not herdharbor_private.marketplace_is_conversation_member(report_target_id::uuid) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  insert into public.marketplace_reports(reporter_id,target_type,target_id,reason,details)
  values(caller,report_target_type,report_target_id,left(trim(report_reason),240),left(coalesce(report_details,''),2000))
  returning id into report_id;
  return report_id;
end;
$$;
revoke all on function public.marketplace_submit_report(text,text,text,text) from public,anon;
grant execute on function public.marketplace_submit_report(text,text,text,text) to authenticated;

create or replace function public.marketplace_block_profile(target_public_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare target_user uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select p.user_id into target_user from public.marketplace_public_profiles p where p.public_id=target_public_id;
  if target_user is null or target_user=caller then raise exception 'profile unavailable'; end if;
  insert into public.marketplace_blocks(blocker_id,blocked_id) values(caller,target_user) on conflict do nothing;
end;
$$;
revoke all on function public.marketplace_block_profile(uuid) from public,anon;
grant execute on function public.marketplace_block_profile(uuid) to authenticated;

create policy marketplace_reports_admin_select on public.marketplace_reports for select to authenticated
  using (herdharbor_private.marketplace_is_admin());
create policy marketplace_reports_admin_update on public.marketplace_reports for update to authenticated
  using (herdharbor_private.marketplace_is_admin())
  with check (herdharbor_private.marketplace_is_admin());
create policy marketplace_moderation_admin_select on public.marketplace_moderation_actions for select to authenticated
  using (herdharbor_private.marketplace_is_admin());
create policy marketplace_moderation_admin_insert on public.marketplace_moderation_actions for insert to authenticated
  with check (herdharbor_private.marketplace_is_admin() and moderator_id=(select auth.uid()));
grant select,insert on public.marketplace_moderation_actions to authenticated;

create or replace function public.marketplace_moderation_queue(queue_status text default 'open')
returns table (
  report_id uuid,
  target_type text,
  target_id text,
  reason text,
  details text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not herdharbor_private.marketplace_is_admin() then raise exception 'moderation access denied' using errcode='42501'; end if;
  return query
    select r.id,r.target_type,r.target_id,r.reason,r.details,r.status,r.created_at
    from public.marketplace_reports r
    where nullif(trim(queue_status),'') is null or r.status=queue_status
    order by r.created_at,r.id;
end;
$$;
revoke all on function public.marketplace_moderation_queue(text) from public,anon;
grant execute on function public.marketplace_moderation_queue(text) to authenticated;

create or replace function public.marketplace_moderate_report(
  target_report_id uuid,
  moderation_action text,
  moderation_reason text default ''
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare report_row public.marketplace_reports%rowtype;
begin
  if not herdharbor_private.marketplace_is_admin() then raise exception 'moderation access denied' using errcode='42501'; end if;
  select * into report_row from public.marketplace_reports where id=target_report_id for update;
  if not found then raise exception 'report unavailable'; end if;

  if moderation_action='hide_listing' and report_row.target_type='listing' then
    update public.marketplace_listings set state='removed',updated_at=now() where id=report_row.target_id::uuid;
  elsif moderation_action='suspend_marketplace' and report_row.target_type='user' then
    update public.marketplace_public_profiles set marketplace_status='suspended',updated_at=now() where public_id=report_row.target_id::uuid;
  elsif moderation_action not in ('warn','dismiss','hide_listing','suspend_marketplace') then
    raise exception 'unsupported moderation action';
  end if;

  update public.marketplace_reports
  set status=case when moderation_action='dismiss' then 'dismissed' else 'resolved' end,resolved_at=now()
  where id=target_report_id;

  insert into public.marketplace_moderation_actions(moderator_id,action_type,target_type,target_id,reason,metadata)
  values(caller,moderation_action,report_row.target_type,report_row.target_id,left(coalesce(moderation_reason,''),1000),jsonb_build_object('report_id',target_report_id));
end;
$$;
revoke all on function public.marketplace_moderate_report(uuid,text,text) from public,anon;
grant execute on function public.marketplace_moderate_report(uuid,text,text) to authenticated;

comment on function public.marketplace_moderate_report(uuid,text,text) is
  'Marketplace-only moderation. suspend_marketplace updates only Marketplace profile status and never changes private herd/account access.';

commit;
