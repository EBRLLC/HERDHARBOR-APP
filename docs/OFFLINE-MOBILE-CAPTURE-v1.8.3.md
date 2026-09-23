# Offline + Mobile Capture Hardening — Alpha v1.8.3

Phase 9G is the final roadmap implementation phase. It hardens the existing mobile/PWA path without creating another canonical or offline data store.

## Architecture

HerdHarbor continues to use its established local/cloud architecture:

- canonical farm state remains in the existing application state/local storage path
- `local-cache-v2-v1.8.2.js` remains the single IndexedDB performance/recovery cache
- Cloud Sync retains dirty-local, conflict, tombstone, retry, recovery-snapshot, and legacy rollback ownership
- normalized-sync rollout guardrails remain unchanged
- safety backup/recovery behavior remains unchanged

Phase 9G does **not** add a second offline database.

## Mobile photo capture

`mobile-capture-v1.8.3.js` prepares Phase 9B record photos before provider analysis:

- rear-camera capture hint through `capture="environment"`
- EXIF/browser-orientation-aware decoding through `createImageBitmap(..., { imageOrientation: "from-image" })` when supported
- aspect-ratio-preserving resize with a 2048-pixel default long edge
- JPEG normalization/compression with bounded retry qualities
- default prepared-image ceiling of 3.5 MB
- no image contents or extracted record values are persisted by the helper
- no provider/API secrets exist in the helper

The existing authenticated `record-photo-extract` Edge Function remains the provider boundary.

## Offline analysis and retry

When a member prepares a photo while offline:

1. the processed analysis payload stays only in the current page's memory
2. no canonical Animal/Health record is created
3. the UI clearly reports that analysis is pending
4. `online`, `pageshow`, or foreground resume may retry the same pending analysis
5. concurrent resume signals share one in-flight request
6. retryable provider failures keep the same draft request pending
7. non-retryable errors clear the pending analysis state
8. a returned provider draft still requires Phase 9B review and canonical form confirmation

Because retries operate only on temporary review-draft analysis, they cannot duplicate canonical farm records.

## Suspend/resume hardening

The existing local cache now also:

- flushes pending cache work on `freeze`
- refreshes its existing cache from canonical local state on foreground visibility
- refreshes from canonical local state on `pageshow`

These are cache/recovery operations only. They do not alter Cloud Sync ownership or create an alternate source of truth.

## Security and privacy

- no new secrets or environment variables
- no new Edge Functions
- no schema/database migration
- no provider key in browser code
- image data is not written to telemetry
- mobile capture helper owns no localStorage, sessionStorage, or IndexedDB persistence
- existing monitoring remains coarse metadata only

## Deployment

Deploy the new static `mobile-capture-v1.8.3.js`, revised photo-entry asset, revised local-cache asset, updated shell/service worker, and normal Pages artifact.

No database migration or Supabase deployment is required for Phase 9G.

## Rollback

Revert Phase 9G static/runtime/test commits. Existing canonical local state, Cloud Sync data, Phase 9B provider integration, and recovery snapshots remain compatible.
