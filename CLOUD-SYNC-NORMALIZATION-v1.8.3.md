# HerdHarbor Cloud Sync Normalization v1.8.3

## Purpose

The current production cloud layer stores a user's complete HerdHarbor application state as one `herdharbor_user_data.app_state` JSON document. That made the first cloud implementation simple, but it means a small edit can require serializing and replacing a multi-megabyte snapshot.

v1.8.3 starts the migration to row-granular cloud storage so a small change can synchronize only the records that changed instead of replacing unrelated state.

This PR is still non-production foundation work. None of the v1.8.3 normalization modules are loaded by `index.html`, the new SQL has not been applied to production by this branch, and no existing `herdharbor_user_data` row is changed or deleted. Production remains on the v1.8.2 full-state path until shadow verification is deliberately enabled for an internal cohort.

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

## Remaining rollout plan

### Phase D — internal shadow integration

Add a deliberately disabled runtime bootstrap that can be enabled only for an explicit internal/test cohort. It should read the authoritative legacy snapshot, invoke the shadow controller, verify the normalized reconstruction, and publish privacy-safe diagnostics. The legacy snapshot remains authoritative for reads and recovery.

No public account should enter shadow mode automatically.

### Phase E — dual write

After internal shadow verification is stable, write both the existing full-state snapshot and changed normalized records. Reads continue using the legacy snapshot. Measure normalized write failures, version conflicts, verification mismatches, and retry behavior before expanding the cohort.

### Phase F — normalized reads with fallback

For verified users only, read normalized records first while retaining the last known-good legacy snapshot as rollback protection. Any missing manifest, tombstoned required row, unsupported format, checksum mismatch, or reconstruction failure must fall back to the legacy path and mark the account for review rather than deleting data.

### Phase G — retire full-state writes

Only after all supported state sections have deterministic mappings, multi-device conflict tests pass, and production telemetry is stable should full `app_state` replacement writes be disabled. Legacy rows should be retained for a defined recovery period before any separate cleanup migration is considered.

## Safety requirements

The migration remains reversible through the entire shadow and dual-write period. No rollout step may delete the existing `herdharbor_user_data` row, silently discard an unknown top-level state section, mark an account verified after a failed comparison, or mark an account normalized merely because normalized rows exist.

Provider errors must continue through the privacy-safe monitoring path added by the v1.8.2 hotfix. Raw application state, record payloads, animal information, notes, and other user data must never be copied into Sentry telemetry.

## Next implementation slice

The next code slice is the internal shadow bootstrap and cohort gate. It should remain absent from the production page until its feature gate, monitoring events, rollback behavior, and end-to-end fixture tests are complete. After that, the branch can add multi-device conflict simulations before any live Supabase rollout is considered.
