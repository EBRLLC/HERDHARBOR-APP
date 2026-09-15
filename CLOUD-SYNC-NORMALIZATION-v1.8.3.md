# HerdHarbor Cloud Sync Normalization v1.8.3

## Purpose

The current production cloud layer stores a user's complete HerdHarbor application state as one `herdharbor_user_data.app_state` JSON document. That made the first cloud implementation simple, but it means a small edit can require serializing and replacing a multi-megabyte snapshot.

v1.8.3 starts the migration to row-granular cloud storage so one animal, litter, health entry, pedigree record, task, or settings section can be synchronized without replacing unrelated data.

This branch is a foundation only. Nothing in this PR is loaded by `index.html`, and the SQL does not modify or backfill `herdharbor_user_data`. Production continues using the existing v1.8.2 full-state sync until the normalized path has been shadow-tested and verified.

## Storage model

`herdharbor_sync_records` stores one logical record per `(user_id, namespace, record_id)`.

Initial namespace targets are:

- `animals` — one row per animal ID
- `litters` — one row per litter ID
- `health` — one row per health-record ID
- `pedigrees` — one row per pedigree/document record ID
- `tasks` — one row per task ID
- `shows` — one row per show/event record ID
- `sales` — one row per sale/transfer record ID
- `settings` — singleton settings records where appropriate

The payload remains JSONB inside each logical record for now. This is deliberate: it cuts synchronization granularity immediately without forcing every feature's internal object shape into a relational schema in the same release. High-value domains can be further normalized later if query/reporting requirements justify it.

Every row has a monotonically increasing `record_version`. The browser adapter supports `expectedVersion`, giving the normalized path optimistic concurrency instead of replacing another device's newer row silently. Deletions use tombstones (`deleted_at`) so a deletion can synchronize across devices before eventual cleanup.

`herdharbor_sync_manifest` tracks migration state per user. Supported stages are `legacy`, `shadow`, `dual_write`, and `normalized`.

## Rollout plan

### Phase A — schema and adapter foundation (this PR)

Create the new tables, RLS, optimistic versioning, tombstones, migration manifest, and a browser record-store adapter. Do not load the adapter in production and do not migrate user data.

### Phase B — deterministic legacy mapper

Add an explicit mapper from the current `app_state` shape into normalized namespaces. It must preserve IDs, dates, references, deleted state, and all feature-specific fields. Add round-trip tests against representative full-state fixtures before any cloud writes are enabled.

### Phase C — shadow backfill and verification

For opted-in internal/test accounts only, read the legacy snapshot, write normalized records, then reconstruct a state object from normalized storage and compare canonical fingerprints. The legacy table remains authoritative. Record verification in the manifest only when the round trip matches.

### Phase D — dual write

After shadow verification is stable, write both the existing full-state snapshot and changed normalized records. Reads still use the legacy snapshot. Measure record-level failure/conflict rates and Sentry diagnostics before expanding the cohort.

### Phase E — normalized reads with rollback

For verified users, read normalized records first while retaining the last known good legacy snapshot as rollback protection. Any integrity failure falls back to the legacy path and marks the account for review rather than deleting data.

### Phase F — retire full-state writes

Only after all supported state sections have deterministic mappings, multi-device conflict tests pass, and production telemetry is stable should full `app_state` replacement writes be disabled. Legacy rows should be retained for a defined recovery period before any separate cleanup migration is considered.

## Safety requirements

The migration must remain reversible until Phase F. No rollout step may delete the existing `herdharbor_user_data` row, silently discard an unknown top-level state section, or mark an account normalized before a canonical round-trip comparison succeeds.

All normalized tables use owner-scoped RLS (`user_id = auth.uid()`). The browser must never be allowed to write another user's record. Provider errors should continue through the privacy-safe monitoring path added by the v1.8.2 hotfix; raw record payloads must not be sent to Sentry.

## Next implementation slice

The next commit on this PR should build the deterministic mapper/reassembler for the current production state shape and add fixture-based round-trip tests. After that is green, the first shadow-write integration can be implemented behind a disabled-by-default feature flag.
