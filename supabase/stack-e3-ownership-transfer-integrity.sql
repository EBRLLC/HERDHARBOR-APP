-- Stack E3 — accepted ownership integrity and expiry audit.
-- Extends the canonical transfer audit vocabulary only.

alter table public.herdharbor_direct_transfer_events
  drop constraint if exists herdharbor_direct_transfer_event_type_check;

alter table public.herdharbor_direct_transfer_events
  add constraint herdharbor_direct_transfer_event_type_check
  check (event_type in ('created','previewed','prepared','accepted','declined','cancelled','expired'));

comment on table public.herdharbor_direct_transfer_events is
  'Canonical immutable lifecycle audit for HerdHarbor direct animal transfers, including automatic expiry.';
