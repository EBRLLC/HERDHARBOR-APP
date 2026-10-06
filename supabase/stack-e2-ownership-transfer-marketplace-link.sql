-- Stack E2 — link the canonical direct-transfer lifecycle to an existing sold Marketplace listing.
-- This extends herdharbor_direct_animal_transfers; Marketplace does not gain a second transfer store.

alter table public.herdharbor_direct_animal_transfers
  add column if not exists marketplace_listing_id uuid
    references public.marketplace_listings(id) on delete set null;

create unique index if not exists herdharbor_direct_transfer_one_open_marketplace_listing_idx
  on public.herdharbor_direct_animal_transfers (marketplace_listing_id)
  where marketplace_listing_id is not null
    and status in ('pending','accepted');

comment on column public.herdharbor_direct_animal_transfers.marketplace_listing_id is
  'Optional verified link to the seller-owned sold Marketplace listing that originated this canonical direct transfer. Marketplace messages and private listing data are never copied into the transfer payload.';
