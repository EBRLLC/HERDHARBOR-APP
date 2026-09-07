-- Follow-up performance hardening for HerdHarbor Direct Transfer.
create index if not exists herdharbor_direct_transfer_events_actor_idx
  on public.herdharbor_direct_transfer_events (actor_id, created_at desc);
