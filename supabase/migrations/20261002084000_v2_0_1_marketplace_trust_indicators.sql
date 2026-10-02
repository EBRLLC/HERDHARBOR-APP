begin;

create or replace function public.marketplace_trust_indicators(target_public_id uuid)
returns table (
  marketplace_member_since timestamptz,
  verification_status text,
  sold_listing_count bigint,
  accepted_transfer_count bigint,
  repeat_transfer_recipient_count bigint,
  verified_review_count bigint,
  average_rating numeric
)
language sql
stable
security definer
set search_path=''
as $$
  select
    p.member_since,
    p.verification_status,
    (select count(*) from public.marketplace_listings l where l.seller_id=p.user_id and l.state='sold'),
    (select count(*) from public.herdharbor_direct_animal_transfers t where t.sender_id=p.user_id and t.accepted_at is not null),
    (
      select count(*)
      from (
        select t.recipient_id
        from public.herdharbor_direct_animal_transfers t
        where t.sender_id=p.user_id and t.accepted_at is not null
        group by t.recipient_id
        having count(*)>=2
      ) repeat_recipients
    ),
    (select count(*) from public.marketplace_reviews r where r.seller_id=p.user_id and r.status='visible' and r.verified_transaction=true),
    (select round(avg(r.rating)::numeric,2) from public.marketplace_reviews r where r.seller_id=p.user_id and r.status='visible' and r.verified_transaction=true)
  from public.marketplace_public_profiles p
  where p.public_id=target_public_id
    and p.marketplace_status='active'
  limit 1;
$$;

revoke all on function public.marketplace_trust_indicators(uuid) from public;
grant execute on function public.marketplace_trust_indicators(uuid) to anon,authenticated;

comment on function public.marketplace_trust_indicators(uuid) is
  'Factual Marketplace trust indicators only. No composite score or hidden weighting. Accepted transfer counts are aggregates and never expose counterpart identities.';

commit;
