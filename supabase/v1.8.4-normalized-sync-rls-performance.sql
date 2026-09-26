-- HerdHarbor v1.8.4
-- Normalize owner-policy auth checks so auth.uid() is initialized once per
-- statement instead of being re-evaluated for every candidate row.
-- Additive policy-only hardening: no application rows are modified.

begin;

drop policy if exists "users read own normalized sync records"
on public.herdharbor_sync_records;

create policy "users read own normalized sync records"
on public.herdharbor_sync_records
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own sync manifest"
on public.herdharbor_sync_manifest;

create policy "users read own sync manifest"
on public.herdharbor_sync_manifest
for select
to authenticated
using (user_id = (select auth.uid()));

commit;
