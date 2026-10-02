begin;

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text not null default '',
  verified_transaction boolean not null default true,
  status text not null default 'visible' check (status in ('visible','hidden','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id,reviewer_id,seller_id),
  check (seller_id<>reviewer_id)
);
create index if not exists marketplace_reviews_seller_idx on public.marketplace_reviews(seller_id,status,created_at desc);
create index if not exists marketplace_reviews_listing_idx on public.marketplace_reviews(listing_id);

alter table public.marketplace_reviews enable row level security;
revoke all on public.marketplace_reviews from anon;
grant select on public.marketplace_reviews to authenticated;

create policy marketplace_reviews_party_select on public.marketplace_reviews for select to authenticated
  using ((select auth.uid()) in (seller_id,reviewer_id));

alter table public.marketplace_reports
  drop constraint if exists marketplace_reports_target_type_check;
alter table public.marketplace_reports
  add constraint marketplace_reports_target_type_check
  check (target_type in ('listing','user','conversation','message','review'));

create or replace function public.marketplace_submit_review(
  target_listing_id uuid,
  review_rating integer,
  review_feedback text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare seller uuid;
declare review_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if review_rating<1 or review_rating>5 then raise exception 'rating must be between 1 and 5'; end if;

  select l.seller_id into seller
  from public.marketplace_listings l
  where l.id=target_listing_id and l.state='sold';

  if seller is null or seller=caller then raise exception 'verified transaction unavailable' using errcode='42501'; end if;

  if not exists (
    select 1
    from public.marketplace_conversations c
    join public.marketplace_conversation_members m on m.conversation_id=c.id
    where c.listing_id=target_listing_id
      and m.user_id=caller
      and m.role='buyer'
  ) then
    raise exception 'verified transaction unavailable' using errcode='42501';
  end if;

  insert into public.marketplace_reviews(listing_id,seller_id,reviewer_id,rating,feedback,verified_transaction)
  values(target_listing_id,seller,caller,review_rating,left(coalesce(review_feedback,''),2500),true)
  returning id into review_id;

  return review_id;
exception
  when unique_violation then
    raise exception 'feedback already submitted for this transaction';
end;
$$;
revoke all on function public.marketplace_submit_review(uuid,integer,text) from public,anon;
grant execute on function public.marketplace_submit_review(uuid,integer,text) to authenticated;

create or replace function public.marketplace_seller_feedback_summary(target_public_id uuid)
returns table (
  review_count bigint,
  average_rating numeric,
  verified_review_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
  select
    count(r.id),
    round(avg(r.rating)::numeric,2),
    count(r.id) filter (where r.verified_transaction=true)
  from public.marketplace_public_profiles p
  left join public.marketplace_reviews r
    on r.seller_id=p.user_id and r.status='visible'
  where p.public_id=target_public_id
    and p.marketplace_status='active'
  group by p.user_id;
$$;
revoke all on function public.marketplace_seller_feedback_summary(uuid) from public;
grant execute on function public.marketplace_seller_feedback_summary(uuid) to anon,authenticated;

create or replace function public.marketplace_seller_feedback(
  target_public_id uuid,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  review_id uuid,
  rating smallint,
  feedback text,
  verified_transaction boolean,
  reviewer_label text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    r.id,r.rating,r.feedback,r.verified_transaction,
    coalesce(nullif(rp.rabbitry_name,''),nullif(rp.display_name,''),'Verified buyer'),
    r.created_at
  from public.marketplace_public_profiles seller
  join public.marketplace_reviews r on r.seller_id=seller.user_id and r.status='visible'
  left join public.marketplace_public_profiles rp on rp.user_id=r.reviewer_id and rp.marketplace_status='active'
  where seller.public_id=target_public_id
    and seller.marketplace_status='active'
  order by r.created_at desc,r.id
  limit least(greatest(coalesce(result_limit,20),1),50)
  offset greatest(coalesce(result_offset,0),0);
$$;
revoke all on function public.marketplace_seller_feedback(uuid,integer,integer) from public;
grant execute on function public.marketplace_seller_feedback(uuid,integer,integer) to anon,authenticated;

create or replace function public.marketplace_dispute_review(
  target_review_id uuid,
  dispute_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare report_id uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if nullif(trim(dispute_reason),'') is null then raise exception 'dispute reason is required'; end if;

  if not exists (
    select 1 from public.marketplace_reviews r
    where r.id=target_review_id and r.seller_id=caller
  ) then raise exception 'review unavailable' using errcode='42501'; end if;

  update public.marketplace_reviews set status='disputed',updated_at=now() where id=target_review_id;
  insert into public.marketplace_reports(reporter_id,target_type,target_id,reason,details)
  values(caller,'review',target_review_id::text,'Seller disputed review',left(trim(dispute_reason),2000))
  returning id into report_id;
  return report_id;
end;
$$;
revoke all on function public.marketplace_dispute_review(uuid,text) from public,anon;
grant execute on function public.marketplace_dispute_review(uuid,text) to authenticated;

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
  if report_target_type not in ('listing','user','conversation','message','review') then raise exception 'invalid report target'; end if;
  if nullif(trim(report_target_id),'') is null or nullif(trim(report_reason),'') is null then raise exception 'report target and reason are required'; end if;
  select count(*) into recent_count from public.marketplace_reports r where r.reporter_id=caller and r.created_at>now()-interval '1 hour';
  if recent_count>=10 then raise exception 'report rate limit exceeded'; end if;
  if report_target_type='conversation' and not herdharbor_private.marketplace_is_conversation_member(report_target_id::uuid) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  if report_target_type='review' and not exists(select 1 from public.marketplace_reviews r where r.id=report_target_id::uuid) then
    raise exception 'review unavailable';
  end if;
  insert into public.marketplace_reports(reporter_id,target_type,target_id,reason,details)
  values(caller,report_target_type,report_target_id,left(trim(report_reason),240),left(coalesce(report_details,''),2000))
  returning id into report_id;
  return report_id;
end;
$$;
revoke all on function public.marketplace_submit_report(text,text,text,text) from public,anon;
grant execute on function public.marketplace_submit_report(text,text,text,text) to authenticated;

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

  if moderation_action='hide_listing' then
    if report_row.target_type<>'listing' then raise exception 'hide_listing requires a listing report'; end if;
    update public.marketplace_listings set state='removed',updated_at=now() where id=report_row.target_id::uuid;
  elsif moderation_action='hide_review' then
    if report_row.target_type<>'review' then raise exception 'hide_review requires a review report'; end if;
    update public.marketplace_reviews set status='hidden',updated_at=now() where id=report_row.target_id::uuid;
  elsif moderation_action='suspend_marketplace' then
    if report_row.target_type<>'user' then raise exception 'suspend_marketplace requires a user report'; end if;
    update public.marketplace_public_profiles set marketplace_status='suspended',updated_at=now() where public_id=report_row.target_id::uuid;
  elsif moderation_action not in ('warn','dismiss') then
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

commit;
