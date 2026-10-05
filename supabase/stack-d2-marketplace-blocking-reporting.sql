-- Stack D2 — Marketplace blocking + reporting hardening.
-- Extends canonical Stack C tables/functions. Does not create a second block/report system.

alter table public.marketplace_reports
  add column if not exists category text not null default 'other',
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb;

do $d2_constraints$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='marketplace_reports_category_check'
      and conrelid='public.marketplace_reports'::regclass
  ) then
    alter table public.marketplace_reports
      add constraint marketplace_reports_category_check
      check(category in (
        'spam',
        'fraud_scam',
        'harassment',
        'unsafe_sale',
        'animal_welfare',
        'prohibited_content',
        'privacy',
        'impersonation',
        'other'
      ));
  end if;

  if not exists(
    select 1 from pg_constraint
    where conname='marketplace_reports_evidence_refs_array_check'
      and conrelid='public.marketplace_reports'::regclass
  ) then
    alter table public.marketplace_reports
      add constraint marketplace_reports_evidence_refs_array_check
      check(jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)<=20);
  end if;
end
$d2_constraints$;

create or replace function public.marketplace_member_user_block_state(
  seller_public_id_value uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $d2_block_state$
declare
  actor uuid := auth.uid();
  peer uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select p.user_id into peer
  from public.marketplace_public_profiles p
  where p.public_id=seller_public_id_value;

  if peer is null or peer=actor then
    raise exception 'Marketplace member unavailable' using errcode='22023';
  end if;

  return jsonb_build_object(
    'blocked_by_me',exists(
      select 1 from public.marketplace_blocks b
      where b.blocker_id=actor and b.blocked_id=peer
    ),
    'blocked_by_peer',exists(
      select 1 from public.marketplace_blocks b
      where b.blocker_id=peer and b.blocked_id=actor
    )
  );
end
$d2_block_state$;

revoke all on function public.marketplace_member_user_block_state(uuid)
  from public, anon;
grant execute on function public.marketplace_member_user_block_state(uuid)
  to authenticated;

create or replace function public.marketplace_member_set_user_block(
  seller_public_id_value uuid,
  blocked_value boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $d2_block$
declare
  actor uuid := auth.uid();
  peer uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Active HerdHarbor account required' using errcode='42501';
  end if;

  select p.user_id into peer
  from public.marketplace_public_profiles p
  where p.public_id=seller_public_id_value;

  if peer is null or peer=actor then
    raise exception 'Marketplace member unavailable' using errcode='22023';
  end if;

  if coalesce(blocked_value,false) then
    insert into public.marketplace_blocks(blocker_id,blocked_id)
    values(actor,peer)
    on conflict do nothing;

    update public.marketplace_conversation_members mine
    set archived_at=coalesce(mine.archived_at,now())
    where mine.user_id=actor
      and exists(
        select 1
        from public.marketplace_conversation_members other
        where other.conversation_id=mine.conversation_id
          and other.user_id=peer
      );

    return true;
  end if;

  delete from public.marketplace_blocks
  where blocker_id=actor and blocked_id=peer;

  return false;
end
$d2_block$;

revoke all on function public.marketplace_member_set_user_block(uuid,boolean)
  from public, anon;
grant execute on function public.marketplace_member_set_user_block(uuid,boolean)
  to authenticated;

create or replace function public.marketplace_member_submit_report_v2(
  target_type_value text,
  target_id_value text,
  category_value text,
  details_value text default '',
  evidence_refs_value jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $d2_report$
declare
  actor uuid := auth.uid();
  safe_category text := lower(btrim(coalesce(category_value,'other')));
  safe_refs jsonb := coalesce(evidence_refs_value,'[]'::jsonb);
  result_id uuid;
begin
  if actor is null or not herdharbor_private.marketplace_current_account_active() then
    raise exception 'Sign in to report Marketplace content' using errcode='42501';
  end if;

  if safe_category not in (
    'spam',
    'fraud_scam',
    'harassment',
    'unsafe_sale',
    'animal_welfare',
    'prohibited_content',
    'privacy',
    'impersonation',
    'other'
  ) then
    raise exception 'Invalid report category' using errcode='22023';
  end if;

  if jsonb_typeof(safe_refs)<>'array' or jsonb_array_length(safe_refs)>20 then
    raise exception 'Invalid report evidence references' using errcode='22023';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(safe_refs) item
    where jsonb_typeof(item)<>'string'
       or char_length(trim(both '"' from item::text))>160
  ) then
    raise exception 'Invalid report evidence references' using errcode='22023';
  end if;

  result_id := public.marketplace_member_submit_report(
    target_type_value,
    target_id_value,
    safe_category,
    details_value
  );

  update public.marketplace_reports
  set category=safe_category,
      evidence_refs=safe_refs
  where id=result_id
    and reporter_id=actor;

  return result_id;
end
$d2_report$;

revoke all on function public.marketplace_member_submit_report_v2(text,text,text,text,jsonb)
  from public, anon;
grant execute on function public.marketplace_member_submit_report_v2(text,text,text,text,jsonb)
  to authenticated;
