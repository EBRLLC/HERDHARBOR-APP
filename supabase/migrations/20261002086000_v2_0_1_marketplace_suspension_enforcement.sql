begin;

create or replace function herdharbor_private.marketplace_is_active_member(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select target_user is not null
     and exists (
       select 1
       from public.marketplace_public_profiles p
       where p.user_id=target_user
         and p.marketplace_status='active'
     );
$$;
revoke all on function herdharbor_private.marketplace_is_active_member(uuid) from public,anon;
grant execute on function herdharbor_private.marketplace_is_active_member(uuid) to authenticated;

-- Direct listing writes must stop when Marketplace access is suspended.
drop policy if exists marketplace_listings_owner_insert on public.marketplace_listings;
create policy marketplace_listings_owner_insert on public.marketplace_listings for insert to authenticated
  with check (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  );

drop policy if exists marketplace_listings_owner_update on public.marketplace_listings;
create policy marketplace_listings_owner_update on public.marketplace_listings for update to authenticated
  using (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  )
  with check (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  );

-- Split photo/attribute policies so suspended sellers may still read/delete
-- their own records but cannot add new Marketplace content.
drop policy if exists marketplace_listing_photos_owner_all on public.marketplace_listing_photos;
create policy marketplace_listing_photos_owner_select on public.marketplace_listing_photos for select to authenticated
  using (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_photos.listing_id
        and l.seller_id=(select auth.uid())
    )
  );
create policy marketplace_listing_photos_owner_insert on public.marketplace_listing_photos for insert to authenticated
  with check (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_photos.listing_id
        and l.seller_id=(select auth.uid())
    )
  );
create policy marketplace_listing_photos_owner_delete on public.marketplace_listing_photos for delete to authenticated
  using (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_photos.listing_id
        and l.seller_id=(select auth.uid())
    )
  );

drop policy if exists marketplace_listing_attributes_owner_all on public.marketplace_listing_attributes;
create policy marketplace_listing_attributes_owner_select on public.marketplace_listing_attributes for select to authenticated
  using (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_attributes.listing_id
        and l.seller_id=(select auth.uid())
    )
  );
create policy marketplace_listing_attributes_owner_insert on public.marketplace_listing_attributes for insert to authenticated
  with check (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_attributes.listing_id
        and l.seller_id=(select auth.uid())
    )
  );
create policy marketplace_listing_attributes_owner_update on public.marketplace_listing_attributes for update to authenticated
  using (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  )
  with check (
    (select auth.uid())=seller_id
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  );
create policy marketplace_listing_attributes_owner_delete on public.marketplace_listing_attributes for delete to authenticated
  using (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_attributes.listing_id
        and l.seller_id=(select auth.uid())
    )
  );

-- RLS is bypassed inside SECURITY DEFINER seller RPCs, so enforce the same
-- suspension boundary at the table itself for seller-originated listing writes.
create or replace function herdharbor_private.marketplace_enforce_active_listing_writer()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
declare seller uuid;
begin
  seller := case when tg_op='DELETE' then old.seller_id else new.seller_id end;
  if caller is not null
     and caller=seller
     and tg_op<>'DELETE'
     and not herdharbor_private.marketplace_is_active_member(caller) then
    raise exception 'marketplace access suspended' using errcode='42501';
  end if;
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function herdharbor_private.marketplace_enforce_active_listing_writer() from public,anon,authenticated;
drop trigger if exists marketplace_enforce_active_listing_writer on public.marketplace_listings;
create trigger marketplace_enforce_active_listing_writer
before insert or update or delete on public.marketplace_listings
for each row execute function herdharbor_private.marketplace_enforce_active_listing_writer();

create or replace function herdharbor_private.marketplace_enforce_active_conversation_creator()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is not null
     and caller=new.created_by
     and not herdharbor_private.marketplace_is_active_member(caller) then
    raise exception 'marketplace access suspended' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function herdharbor_private.marketplace_enforce_active_conversation_creator() from public,anon,authenticated;
drop trigger if exists marketplace_enforce_active_conversation_creator on public.marketplace_conversations;
create trigger marketplace_enforce_active_conversation_creator
before insert on public.marketplace_conversations
for each row execute function herdharbor_private.marketplace_enforce_active_conversation_creator();

create or replace function herdharbor_private.marketplace_enforce_active_message_sender()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is not null
     and caller=new.sender_id
     and not herdharbor_private.marketplace_is_active_member(caller) then
    raise exception 'marketplace access suspended' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function herdharbor_private.marketplace_enforce_active_message_sender() from public,anon,authenticated;
drop trigger if exists marketplace_enforce_active_message_sender on public.marketplace_messages;
create trigger marketplace_enforce_active_message_sender
before insert on public.marketplace_messages
for each row execute function herdharbor_private.marketplace_enforce_active_message_sender();

create or replace function herdharbor_private.marketplace_enforce_active_reviewer()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is not null
     and caller=new.reviewer_id
     and not herdharbor_private.marketplace_is_active_member(caller) then
    raise exception 'marketplace access suspended' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function herdharbor_private.marketplace_enforce_active_reviewer() from public,anon,authenticated;
drop trigger if exists marketplace_enforce_active_reviewer on public.marketplace_reviews;
create trigger marketplace_enforce_active_reviewer
before insert on public.marketplace_reviews
for each row execute function herdharbor_private.marketplace_enforce_active_reviewer();

-- Suspended Marketplace accounts may clean up existing files, but cannot upload
-- or replace Marketplace objects while suspended.
drop policy if exists marketplace_storage_owner_insert on storage.objects;
create policy marketplace_storage_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('marketplace-public','marketplace-message-attachments')
    and owner_id=(select auth.uid()::text)
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  );

drop policy if exists marketplace_storage_owner_update on storage.objects;
create policy marketplace_storage_owner_update on storage.objects for update to authenticated
  using (
    bucket_id in ('marketplace-public','marketplace-message-attachments')
    and owner_id=(select auth.uid()::text)
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  )
  with check (
    bucket_id in ('marketplace-public','marketplace-message-attachments')
    and owner_id=(select auth.uid()::text)
    and herdharbor_private.marketplace_is_active_member((select auth.uid()))
  );

comment on function herdharbor_private.marketplace_is_active_member(uuid) is
  'Marketplace-only access boundary. Suspension never changes private HerdHarbor account or herd-record access.';

commit;
