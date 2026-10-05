-- Stack D3 — Marketplace moderation extensions.
-- Extends canonical C7 moderation/reporting. Does not replace existing suspension/removal controls.

create table if not exists public.marketplace_user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issued_by uuid not null references auth.users(id) on delete restrict,
  report_id uuid null references public.marketplace_reports(id) on delete set null,
  warning_text text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  constraint marketplace_user_warnings_text_check
    check(char_length(btrim(warning_text)) between 1 and 1000)
);

create index if not exists marketplace_user_warnings_user_created_idx
  on public.marketplace_user_warnings(user_id,created_at desc);

alter table public.marketplace_user_warnings enable row level security;
revoke all on table public.marketplace_user_warnings from public, anon, authenticated;

create or replace function public.marketplace_member_warnings(limit_value integer default 20)
returns table(
  warning_id uuid,
  warning_text text,
  created_at timestamptz,
  acknowledged boolean
)
language plpgsql
stable
security definer
set search_path=''
as $d3_member_warnings$
declare
  actor uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(limit_value,20),1),100);
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  return query
  select w.id,w.warning_text,w.created_at,w.acknowledged_at is not null
  from public.marketplace_user_warnings w
  where w.user_id=actor
  order by w.created_at desc,w.id desc
  limit safe_limit;
end
$d3_member_warnings$;

revoke all on function public.marketplace_member_warnings(integer)
  from public, anon;
grant execute on function public.marketplace_member_warnings(integer)
  to authenticated;

create or replace function public.marketplace_member_acknowledge_warning(warning_id_value uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $d3_ack_warning$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  update public.marketplace_user_warnings
  set acknowledged_at=coalesce(acknowledged_at,now())
  where id=warning_id_value
    and user_id=actor;

  return found;
end
$d3_ack_warning$;

revoke all on function public.marketplace_member_acknowledge_warning(uuid)
  from public, anon;
grant execute on function public.marketplace_member_acknowledge_warning(uuid)
  to authenticated;

create or replace function public.marketplace_owner_admin_set_report_reviewing(
  report_id_value uuid,
  reviewing_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $d3_review$
declare
  actor uuid := auth.uid();
  prior_status text;
  next_status text := case when coalesce(reviewing_value,true) then 'reviewing' else 'open' end;
begin
  if actor is null or public.herdharbor_account_role()<>'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  select r.status into prior_status
  from public.marketplace_reports r
  where r.id=report_id_value
  for update;

  if not found then
    raise exception 'Marketplace report is unavailable' using errcode='22023';
  end if;

  if prior_status not in ('open','reviewing') then
    raise exception 'Closed reports cannot change review state' using errcode='22023';
  end if;

  update public.marketplace_reports
  set status=next_status
  where id=report_id_value;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,
    case when next_status='reviewing' then 'review_report' else 'reopen_report' end,
    'report',
    report_id_value::text,
    case when next_status='reviewing' then 'Report moved to reviewing' else 'Report moved back to open' end,
    jsonb_build_object('previous_status',prior_status,'next_status',next_status)
  );

  return jsonb_build_object(
    'report_id',report_id_value,
    'previous_status',prior_status,
    'status',next_status
  );
end
$d3_review$;

revoke all on function public.marketplace_owner_admin_set_report_reviewing(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.marketplace_owner_admin_set_report_reviewing(uuid,boolean)
  to authenticated;

create or replace function public.marketplace_owner_admin_warn_reported_user(
  report_id_value uuid,
  warning_text_value text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $d3_warn$
declare
  actor uuid := auth.uid();
  safe_warning text := btrim(coalesce(warning_text_value,''));
  report_row public.marketplace_reports%rowtype;
  target_uuid uuid;
  target_user uuid;
  result_id uuid;
begin
  if actor is null or public.herdharbor_account_role()<>'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if char_length(safe_warning)<1 or char_length(safe_warning)>1000 then
    raise exception 'Warning must be between 1 and 1000 characters' using errcode='22023';
  end if;

  select * into report_row
  from public.marketplace_reports
  where id=report_id_value
  for update;

  if not found then
    raise exception 'Marketplace report is unavailable' using errcode='22023';
  end if;

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
    or exists(
      select 1 from public.account_access a
      where a.user_id=target_user
        and lower(coalesce(a.account_role,''))='owner'
        and lower(coalesce(a.account_status,''))='active'
    )
  then
    raise exception 'Reported Marketplace account is unavailable for warning' using errcode='22023';
  end if;

  insert into public.marketplace_user_warnings(user_id,issued_by,report_id,warning_text)
  values(target_user,actor,report_id_value,safe_warning)
  returning id into result_id;

  insert into public.marketplace_moderation_actions(
    moderator_id,action_type,target_type,target_id,reason,metadata
  )
  values(
    actor,'warn_user','user',target_user::text,safe_warning,
    jsonb_build_object('report_id',report_id_value,'warning_id',result_id)
  );

  if report_row.status='open' then
    update public.marketplace_reports
    set status='reviewing'
    where id=report_id_value;
  end if;

  return result_id;
end
$d3_warn$;

revoke all on function public.marketplace_owner_admin_warn_reported_user(uuid,text)
  from public, anon, authenticated;
grant execute on function public.marketplace_owner_admin_warn_reported_user(uuid,text)
  to authenticated;

create or replace function public.marketplace_owner_admin_reports_v3(status_value text default '')
returns table(
  report_id uuid,
  target_type text,
  target_id text,
  category text,
  evidence_refs jsonb,
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
set search_path=''
as $d3_reports$
declare
  actor uuid := auth.uid();
  safe_status text := lower(btrim(coalesce(status_value,'')));
begin
  if actor is null or public.herdharbor_account_role()<>'owner' then
    raise exception 'Marketplace administration is Owner-only' using errcode='42501';
  end if;

  if safe_status<>'' and safe_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode='22023';
  end if;

  return query
  select
    base.report_id,
    base.target_type,
    base.target_id,
    coalesce(r.category,'other'),
    coalesce(r.evidence_refs,'[]'::jsonb),
    base.reason,
    base.details,
    base.status,
    base.created_at,
    base.resolved_at,
    base.target_label,
    base.target_state,
    base.target_excerpt,
    base.reported_label,
    base.can_suspend_account,
    base.account_suspended
  from public.marketplace_owner_admin_reports_v2(safe_status) base
  join public.marketplace_reports r on r.id=base.report_id
  order by
    case base.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    base.created_at asc,
    base.report_id;
end
$d3_reports$;

revoke all on function public.marketplace_owner_admin_reports_v3(text)
  from public, anon, authenticated;
grant execute on function public.marketplace_owner_admin_reports_v3(text)
  to authenticated;
