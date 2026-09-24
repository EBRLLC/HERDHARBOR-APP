# HerdHarbor Cloud Sync Normalization v1.8.3

## Purpose

The current production cloud layer stores a user's complete HerdHarbor application state as one `herdharbor_user_data.app_state` JSON document. That made the first cloud implementation simple, but it means a small edit can require serializing and replacing a multi-megabyte snapshot.

v1.8.3 starts the migration to row-granular cloud storage so a small change can synchronize only the records that changed instead of replacing unrelated state.

The normalization architecture is present in the v1.8.3 repository together with controlled rollout, cohort, reconciliation, bootstrap, dual-write, fallback, and rollback guardrails. Production authority is still intentionally gated: legacy full-state sync remains the recovery and authoritative path until an explicitly authorized operator rollout advances an eligible cohort. No normalization document authorizes mass enablement or deletion of `herdharbor_user_data`.

## Storage model

`herdharbor_sync_records` stores one logical record per `(user_id, namespace, record_id)` with owner-scoped RLS. Each row carries a monotonically increasing `record_version`, and the browser adapter supports `expectedVersion` so concurrent updates can fail as conflicts instead of silently replacing a newer row. Deletions use tombstones (`deleted_at`) so removal can synchronize across devices before cleanup.

`herdharbor_sync_manifest` tracks each user's migration state. Supported stages are `legacy`, `shadow`, `dual_write`, and `normalized`.

The first lossless mapper intentionally uses the `legacy-state` namespace as a compatibility bridge. Top-level non-array values are stored independently. Top-level arrays are split into a manifest plus one row per item. Items with stable IDs keep stable normalized record IDs, while arrays without IDs fall back to deterministic positional IDs. A snapshot manifest preserves the complete root shape and a canonical checksum. Unknown top-level state sections are therefore retained instead of being silently discarded.

This compatibility bridge is not the final semantic namespace layout. After round-trip behavior is proven against real account fixtures, high-value domains can move to dedicated namespaces such as `animals`, `litters`, `health`, `pedigrees`, `tasks`, `shows`, `sales`, and `settings` without changing the normalized table design.

## Implemented foundation

### Phase A — schema and record-store adapter

Implemented in this PR:

- additive `herdharbor_sync_records` and `herdharbor_sync_manifest` tables
- owner-only RLS
- optimistic `record_version` concurrency checks
- tombstone deletion support
- migration stages and rollback metadata
- a browser record-store adapter

The schema does not mutate or backfill the legacy full-state table.

### Phase B — deterministic mapper and reassembler

Implemented in this PR:

- deterministic conversion from any JSON-compatible legacy snapshot into normalized records
- stable IDs for array items that expose `id`, `uuid`, `recordId`, `record_id`, or `key`
- bounded record IDs even when legacy keys or IDs are unusually long
- a root manifest that preserves every top-level state key
- canonical FNV-1a checksums for integrity comparison
- exact reassembly of normalized rows back into the legacy state shape
- tombstone-aware reconstruction
- changed-record planning so unchanged rows are not rewritten
- fixture-based regression coverage for animals, litters, health records, settings, primitive arrays, nested objects, empty collections, reordered object keys, long IDs, missing rows, and tampered rows

A normalization integrity failure raises an explicit error rather than returning a partial state object.

### Phase C — shadow writer and verification controller

The first shadow controller is now implemented but remains disconnected from production runtime.

Safety behavior:

- shadow writes are disabled by default
- disabled mode performs zero provider operations
- an explicit mutation ceiling prevents accidental large write storms
- writes use known `record_version` values when available
- the migration manifest is updated only after all planned record writes succeed
- a provider failure leaves the manifest unadvanced
- a changed shadow write clears any previous verification marker
- canonical verification reconstructs the normalized rows and compares the result against the legacy snapshot
- `normalized_verified_at` is recorded only after a successful round-trip comparison
- a mismatch never records verification
- the shadow controller refuses legacy shadow writes after the account reaches `normalized`
- the controller does not contain a mutation path for `herdharbor_user_data` or `app_state`

The dedicated `test:v1.8.3` suite covers the record store, mapper/reassembler, and shadow safety gates. The repository's full CI also discovers these tests through `tests/*.test.cjs` in both UTC and America/New_York.

## Controlled rollout model

### Phase D — internal shadow integration

Implemented as guarded rollout infrastructure in v1.8.3. The bootstrap and cohort controls remain default-off for unrestricted production use. Internal/test eligibility, verified schema, monitoring availability, rollback readiness, and explicit operator action are required before an account may enter shadow mode. Legacy remains authoritative for reads and recovery.

### Phase E — dual write

After internal shadow verification is stable, write both the existing full-state snapshot and changed normalized records. Reads continue using the legacy snapshot. Measure normalized write failures, version conflicts, verification mismatches, and retry behavior before expanding the cohort.

### Phase F — normalized reads with fallback

For verified users only, read normalized records first while retaining the last known-good legacy snapshot as rollback protection. Any missing manifest, tombstoned required row, unsupported format, checksum mismatch, or reconstruction failure must fall back to the legacy path and mark the account for review rather than deleting data.

### Phase G — retire full-state writes

Only after all supported state sections have deterministic mappings, multi-device conflict tests pass, and production telemetry is stable should full `app_state` replacement writes be disabled. Legacy rows should be retained for a defined recovery period before any separate cleanup migration is considered.

## Safety requirements

The migration remains reversible through the entire shadow and dual-write period. No rollout step may delete the existing `herdharbor_user_data` row, silently discard an unknown top-level state section, mark an account verified after a failed comparison, or mark an account normalized merely because normalized rows exist.

Provider errors must continue through the privacy-safe monitoring path added by the v1.8.2 hotfix. Raw application state, record payloads, animal information, notes, and other user data must never be copied into Sentry telemetry.

## Next stability slice

The remaining work is production-readiness validation, not invention of another sync architecture: verify migration/preflight state, owner-only RLS and required RPCs, stale-client protection, bootstrap resumability, cohort gating, reconciliation evidence, dual-write degradation, normalized-read fallback, adjacent rollback, and writer-preparation guards. Production authority must remain unchanged until those checks pass for an explicitly controlled cohort.
