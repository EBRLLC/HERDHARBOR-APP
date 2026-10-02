begin;

create schema if not exists herdharbor_private;
revoke all on schema herdharbor_private from public, anon;
grant usage on schema herdharbor_private to authenticated;

create table if not exists public.marketplace_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  rabbitry_name text not null default '',
  avatar_path text not null default '',
  city text not null default '',
  region text not null default '',
  about text not null default '',
  species_breeds jsonb not null default '[]'::jsonb,
  member_since timestamptz not null default now(),
  verification_status text not null default 'none' check (verification_status in ('none','pending','verified')),
  marketplace_status text not null default 'active' check (marketplace_status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  source_animal_id text,
  state text not null default 'draft' check (state in ('draft','available','pending','sold','archived','expired','removed')),
  animal_name text not null default '',
  species text not null default '',
  breed text not null default '',
  sex text not null default '',
  dob date,
  variety_color text not null default '',
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency text not null default 'USD',
  location_city text not null default '',
  location_region text not null default '',
  description text not null default '',
  pedigree_status text not null default 'none',
  registration_status text not null default '',
  public_snapshot jsonb not null default '{}'::jsonb,
  pedigree_visibility text not null default 'hidden',
  pedigree_depth integer not null default 0 check (pedigree_depth between 0 and 8),
  public_pedigree jsonb,
  published_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_listings_seller_state_idx on public.marketplace_listings(seller_id,state);
create index if not exists marketplace_listings_browse_idx on public.marketplace_listings(state,species,breed,sex);
create index if not exists marketplace_listings_price_idx on public.marketplace_listings(price_cents) where state='available';
create index if not exists marketplace_listings_expires_idx on public.marketplace_listings(expires_at) where state='available';

create table if not exists public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  alt_text text not null default '',
  created_at timestamptz not null default now(),
  unique(listing_id,storage_path)
);
create index if not exists marketplace_listing_photos_listing_idx on public.marketplace_listing_photos(listing_id,sort_order);

create table if not exists public.marketplace_listing_attributes (
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  attribute_key text not null,
  attribute_value text not null default '',
  created_at timestamptz not null default now(),
  primary key(listing_id,attribute_key)
);

create table if not exists public.marketplace_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,listing_id)
);
create index if not exists marketplace_favorites_listing_idx on public.marketplace_favorites(listing_id);

create table if not exists public.marketplace_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.marketplace_listings(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_conversation_members (
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'participant' check (role in ('buyer','seller','participant')),
  unread_count integer not null default 0 check (unread_count >= 0),
  muted_at timestamptz,
  archived_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create index if not exists marketplace_conversation_members_user_idx on public.marketplace_conversation_members(user_id,joined_at desc);

create or replace function herdharbor_private.marketplace_is_conversation_member(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.marketplace_conversation_members m
       where m.conversation_id=target_conversation
         and m.user_id=(select auth.uid())
     );
$$;
revoke all on function herdharbor_private.marketplace_is_conversation_member(uuid) from public, anon;
grant execute on function herdharbor_private.marketplace_is_conversation_member(uuid) to authenticated;

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists marketplace_messages_conversation_idx on public.marketplace_messages(conversation_id,created_at,id);

create table if not exists public.marketplace_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.marketplace_messages(id) on delete cascade,
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null default '',
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_at timestamptz not null default now()
);
create index if not exists marketplace_message_attachments_message_idx on public.marketplace_message_attachments(message_id);

create table if not exists public.marketplace_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('listing','user','conversation','message')),
  target_id text not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists marketplace_reports_status_idx on public.marketplace_reports(status,created_at);

create table if not exists public.marketplace_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references auth.users(id) on delete restrict,
  action_type text not null,
  target_type text not null,
  target_id text not null,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_moderation_actions_target_idx on public.marketplace_moderation_actions(target_type,target_id,created_at desc);

create table if not exists public.marketplace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  listing_id uuid references public.marketplace_listings(id) on delete cascade,
  conversation_id uuid references public.marketplace_conversations(id) on delete cascade,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists marketplace_notifications_dedupe_idx on public.marketplace_notifications(user_id,dedupe_key) where dedupe_key is not null;
create index if not exists marketplace_notifications_unread_idx on public.marketplace_notifications(user_id,created_at desc) where read_at is null;

alter table public.marketplace_public_profiles enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_photos enable row level security;
alter table public.marketplace_listing_attributes enable row level security;
alter table public.marketplace_favorites enable row level security;
alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_conversation_members enable row level security;
alter table public.marketplace_messages enable row level security;
alter table public.marketplace_message_attachments enable row level security;
alter table public.marketplace_blocks enable row level security;
alter table public.marketplace_reports enable row level security;
alter table public.marketplace_moderation_actions enable row level security;
alter table public.marketplace_notifications enable row level security;

revoke all on public.marketplace_public_profiles, public.marketplace_listings, public.marketplace_listing_photos,
  public.marketplace_listing_attributes, public.marketplace_favorites, public.marketplace_conversations,
  public.marketplace_conversation_members, public.marketplace_messages, public.marketplace_message_attachments,
  public.marketplace_blocks, public.marketplace_reports, public.marketplace_moderation_actions,
  public.marketplace_notifications from anon,authenticated;

-- Browser access is intentionally limited to the six tables the client touches directly.
-- Everything else is reachable only through the owner-checked Marketplace RPC boundary.
grant select on public.marketplace_public_profiles, public.marketplace_listings,
  public.marketplace_listing_photos, public.marketplace_favorites, public.marketplace_messages
  to authenticated;
grant select (conversation_id,user_id) on public.marketplace_conversation_members to authenticated;

grant insert (user_id,display_name,rabbitry_name,avatar_path,city,region,about,species_breeds)
  on public.marketplace_public_profiles to authenticated;
grant update (user_id,display_name,rabbitry_name,avatar_path,city,region,about,species_breeds)
  on public.marketplace_public_profiles to authenticated;

grant insert (seller_id,source_animal_id,state,animal_name,species,breed,sex,dob,variety_color,price_cents,currency,
  location_city,location_region,description,pedigree_status,registration_status,public_snapshot)
  on public.marketplace_listings to authenticated;
grant update (pedigree_visibility,pedigree_depth,public_pedigree)
  on public.marketplace_listings to authenticated;
grant delete on public.marketplace_listings to authenticated;

grant insert (listing_id,seller_id,storage_path,sort_order,alt_text)
  on public.marketplace_listing_photos to authenticated;
grant delete on public.marketplace_listing_photos to authenticated;

grant select,insert,delete on public.marketplace_favorites to authenticated;
grant update (user_id,listing_id) on public.marketplace_favorites to authenticated;

grant insert (conversation_id,sender_id,body) on public.marketplace_messages to authenticated;
grant update (unread_count,muted_at,archived_at)
  on public.marketplace_conversation_members to authenticated;

create policy marketplace_profiles_owner_select on public.marketplace_public_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy marketplace_profiles_owner_insert on public.marketplace_public_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy marketplace_profiles_owner_update on public.marketplace_public_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy marketplace_profiles_owner_delete on public.marketplace_public_profiles for delete to authenticated using ((select auth.uid())=user_id);

create policy marketplace_listings_owner_select on public.marketplace_listings for select to authenticated using ((select auth.uid())=seller_id);
create policy marketplace_listings_owner_insert on public.marketplace_listings for insert to authenticated with check ((select auth.uid())=seller_id);
create policy marketplace_listings_owner_update on public.marketplace_listings for update to authenticated using ((select auth.uid())=seller_id) with check ((select auth.uid())=seller_id);
create policy marketplace_listings_owner_delete on public.marketplace_listings for delete to authenticated using ((select auth.uid())=seller_id);

create policy marketplace_listing_photos_owner_all on public.marketplace_listing_photos for all to authenticated
  using (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_photos.listing_id
        and l.seller_id=(select auth.uid())
    )
  )
  with check (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_photos.listing_id
        and l.seller_id=(select auth.uid())
    )
  );
create policy marketplace_listing_attributes_owner_all on public.marketplace_listing_attributes for all to authenticated
  using (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_attributes.listing_id
        and l.seller_id=(select auth.uid())
    )
  )
  with check (
    (select auth.uid())=seller_id
    and exists (
      select 1 from public.marketplace_listings l
      where l.id=marketplace_listing_attributes.listing_id
        and l.seller_id=(select auth.uid())
    )
  );
create policy marketplace_favorites_owner_all on public.marketplace_favorites for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create policy marketplace_conversations_member_select on public.marketplace_conversations for select to authenticated
  using (herdharbor_private.marketplace_is_conversation_member(id));
create policy marketplace_conversation_members_member_select on public.marketplace_conversation_members for select to authenticated
  using (herdharbor_private.marketplace_is_conversation_member(conversation_id));
create policy marketplace_conversation_members_self_update on public.marketplace_conversation_members for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create policy marketplace_messages_member_select on public.marketplace_messages for select to authenticated
  using (herdharbor_private.marketplace_is_conversation_member(conversation_id));
create policy marketplace_messages_member_insert on public.marketplace_messages for insert to authenticated
  with check ((select auth.uid())=sender_id and herdharbor_private.marketplace_is_conversation_member(conversation_id));
create policy marketplace_messages_sender_update on public.marketplace_messages for update to authenticated
  using ((select auth.uid())=sender_id and herdharbor_private.marketplace_is_conversation_member(conversation_id))
  with check ((select auth.uid())=sender_id and herdharbor_private.marketplace_is_conversation_member(conversation_id));

create policy marketplace_message_attachments_member_select on public.marketplace_message_attachments for select to authenticated
  using (herdharbor_private.marketplace_is_conversation_member(conversation_id));
create policy marketplace_message_attachments_uploader_insert on public.marketplace_message_attachments for insert to authenticated
  with check ((select auth.uid())=uploader_id and herdharbor_private.marketplace_is_conversation_member(conversation_id));
create policy marketplace_message_attachments_uploader_delete on public.marketplace_message_attachments for delete to authenticated
  using ((select auth.uid())=uploader_id and herdharbor_private.marketplace_is_conversation_member(conversation_id));

create policy marketplace_blocks_owner_all on public.marketplace_blocks for all to authenticated
  using ((select auth.uid())=blocker_id) with check ((select auth.uid())=blocker_id);
create policy marketplace_reports_owner_select on public.marketplace_reports for select to authenticated using ((select auth.uid())=reporter_id);
create policy marketplace_reports_owner_insert on public.marketplace_reports for insert to authenticated with check ((select auth.uid())=reporter_id);
create policy marketplace_notifications_owner_select on public.marketplace_notifications for select to authenticated using ((select auth.uid())=user_id);
create policy marketplace_notifications_owner_update on public.marketplace_notifications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy marketplace_notifications_owner_delete on public.marketplace_notifications for delete to authenticated using ((select auth.uid())=user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
 ('marketplace-public','marketplace-public',false,10485760,array['image/jpeg','image/png','image/webp']),
 ('marketplace-message-attachments','marketplace-message-attachments',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
 public=excluded.public,
 file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

create policy marketplace_storage_owner_select on storage.objects for select to authenticated
  using (bucket_id in ('marketplace-public','marketplace-message-attachments') and owner_id=(select auth.uid()::text));
create policy marketplace_storage_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('marketplace-public','marketplace-message-attachments') and owner_id=(select auth.uid()::text));
create policy marketplace_storage_owner_update on storage.objects for update to authenticated
  using (bucket_id in ('marketplace-public','marketplace-message-attachments') and owner_id=(select auth.uid()::text))
  with check (bucket_id in ('marketplace-public','marketplace-message-attachments') and owner_id=(select auth.uid()::text));
create policy marketplace_storage_owner_delete on storage.objects for delete to authenticated
  using (bucket_id in ('marketplace-public','marketplace-message-attachments') and owner_id=(select auth.uid()::text));

comment on table public.marketplace_listings is 'Marketplace shared-data domain. source_animal_id is private seller metadata and is never a public lookup key.';
comment on table public.marketplace_messages is 'Marketplace messaging is server-native and intentionally independent from HerdHarbor private herd synchronization.';

commit;
