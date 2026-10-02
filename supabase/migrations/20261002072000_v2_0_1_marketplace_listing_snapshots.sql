begin;
create index if not exists marketplace_listings_seller_source_idx
  on public.marketplace_listings(seller_id,source_animal_id)
  where source_animal_id is not null;
comment on column public.marketplace_listings.public_snapshot is
  'Explicit seller-selected listing snapshot. Public read APIs must project approved fields and must never return this JSON object wholesale.';
commit;
