-- S20 isolated approval contract. Staging review required; NOT deployed.
-- Approval state is NEVER stored in user-writable sync-manifest metadata.
CREATE SCHEMA IF NOT EXISTS herdharbor_internal;
REVOKE ALL ON SCHEMA herdharbor_internal FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS herdharbor_internal.s20_cutover_approval (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source_updated_at timestamptz NOT NULL,
  source_checksum text NOT NULL CHECK (source_checksum LIKE 'hh64:%'),
  backup_verified boolean NOT NULL DEFAULT false,
  legacy_clients_closed boolean NOT NULL DEFAULT false,
  approved_at timestamptz
);
ALTER TABLE herdharbor_internal.s20_cutover_approval ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE herdharbor_internal.s20_cutover_approval FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.herdharbor_sync_s20_cutover_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $s20$
  SELECT EXISTS (
    SELECT 1
    FROM herdharbor_internal.s20_cutover_approval a
    JOIN public.herdharbor_sync_manifest m ON m.user_id = a.user_id
    JOIN public.herdharbor_user_data d ON d.user_id = a.user_id
    WHERE a.user_id = (SELECT auth.uid())
      AND a.backup_verified IS TRUE
      AND a.legacy_clients_closed IS TRUE
      AND a.approved_at IS NOT NULL
      AND m.cutover_stage = 'dual_write'
      AND m.legacy_snapshot_updated_at = d.updated_at
      AND a.source_updated_at = d.updated_at
      AND a.source_checksum = m.metadata ->> 'source_checksum'
  );
$s20$;

REVOKE ALL ON FUNCTION public.herdharbor_sync_s20_cutover_ready()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herdharbor_sync_s20_cutover_ready()
TO authenticated;

-- Privileged operator inserts approval after independent recovery proof only:
-- INSERT INTO herdharbor_internal.s20_cutover_approval
-- (user_id,source_updated_at,source_checksum,backup_verified,
--  legacy_clients_closed,approved_at)
-- VALUES (..., ..., ..., true, true, now());
-- Never expose direct writes to this table to the public Data API.
