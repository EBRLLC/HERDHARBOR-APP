# HerdHarbor v1.8.4 Normalized Authority Cutover Runbook

## Purpose

This is the operator runbook for the final controlled validation of HerdHarbor's normalized record-level cloud sync.

It does not authorize a mass rollout, percentage rollout, legacy-sync retirement, destructive migration, or automatic selection of a production user.

The only supported production stage path is:

`legacy -> shadow -> dual_write -> normalized`

Rollback remains:

`normalized -> dual_write -> shadow -> legacy`

The legacy `herdharbor_user_data` row remains the recovery compatibility path. Normalized rows are retained through rollback.

## Validated production baseline — September 25, 2026

PR #224 was validated at the application/schema boundary before any account enrollment.

Validated conditions:

- HerdHarbor application release identity: Alpha v1.8.4
- normalized authority/recovery schema installed in production
- rollout preflight: `verified=true`
- cohort rows: 0
- enabled cohort rows: 0
- non-legacy manifests: 0
- normalized-authority manifests: 0
- normalized records: 0 at the validation checkpoint
- legacy rows: 5 at the validation checkpoint
- authenticated authority/recovery RPC execution: enabled
- anonymous authority/recovery/cohort RPC execution: disabled
- stale-client legacy-write guard: installed and enabled
- Alpha v1.8.4 CI run #125: PASS at head `8a5c3f047e36df55f2412cc6605e522cf9b33873`

These counts are a point-in-time baseline, not permanent invariants. Re-run the current preflight and readiness queries before any trial.

## Hard boundaries

Do not proceed past legacy unless all of the following are true:

- the exact internal/test account has been explicitly approved for the trial
- the approved account UUID is known from the trusted administration path
- the operator is using the latest validated application build
- schema preflight is fully verified
- production monitoring is enabled
- rollback is available
- no unrelated production incident is in progress

Do not:

- choose or infer a test account by scanning `auth.users`
- enroll a real customer merely because an account appears inactive
- use percentage rollout
- mass-enable cohort rows
- manually update `herdharbor_sync_manifest.cutover_stage`
- manually set `normalized_authority_ready`
- delete legacy rows
- delete normalized rows during rollback
- disable the cohort as a substitute for rolling a normalized account back to legacy

## 1. Preflight

Run the checked-in read-only preflight:

`supabase/v1.8.3-cloud-sync-rollout-preflight.sql`

Every required check must be true and the final result must report `verified=true`.

Also confirm the trial account is still at legacy before enrollment. If a manifest already exists in `shadow`, `dual_write`, or `normalized`, stop and reconcile that state instead of beginning a second trial.

The cohort table must remain server-administered. Browser roles must not have direct table mutation access.

## 2. Enroll exactly one approved internal/test account

Only after the account UUID has been explicitly approved, add that one UUID through the trusted database administration path.

Template:

```sql
insert into public.herdharbor_sync_cohort (user_id, enabled, cohort)
values ('<APPROVED_INTERNAL_TEST_USER_UUID>'::uuid, true, 'internal_test')
on conflict (user_id) do update
set
  enabled = excluded.enabled,
  cohort = excluded.cohort,
  updated_at = now();
```

Immediately verify that exactly the intended UUID is enabled and that no additional cohort row was changed.

There is intentionally no browser write RPC for cohort administration.

## 3. Enter shadow and prove round-trip integrity

Sign the approved account into the latest validated app build.

The v1.8.4 rollout runtime is exposed as:

`HerdHarborNormalizedSyncRollout`

Eligibility check:

```js
await HerdHarborNormalizedSyncRollout.checkEligibility()
```

Expected requirements:

- `eligible === true`
- `mode === "allowlist"`
- `percentageEnabled === false`
- `schemaVerified === true`

The runtime bootstraps a legacy account into shadow only through the gated bootstrap path. Legacy remains read/write authority in shadow.

Run three consecutive validation checkpoints:

```js
await HerdHarborNormalizedSyncRollout.validateNow()
await HerdHarborNormalizedSyncRollout.validateNow()
await HerdHarborNormalizedSyncRollout.validateNow()
```

Each pass must be successful. Any mismatch, pending outbox item, read fallback, conflict, bootstrap failure, or provider failure resets the acceptance sequence.

Do not weaken the required pass count. The runtime minimum is three consecutive successful checkpoints.

## 4. Multi-device shadow test

Before dual-write promotion, exercise the same approved account on the intended device pair.

Minimum real-device acceptance:

- phone edit becomes visible on web
- web edit becomes visible on phone
- unrelated records changed near-simultaneously both survive
- same-record different-field edits reconcile without replacing unrelated data
- same-field conflict remains scoped to that record
- offline edit survives close/reopen and uploads after reconnect
- delete/tombstone prevents stale resurrection
- background/foreground, focus, and reconnect paths converge
- Record Birth still opens the exact intended breeding from Today, Breeding, and animal profile

If any test fails, remain in shadow or roll back to legacy.

## 5. Promote to dual_write

Only after three consecutive successful shadow validations and the real-device shadow test:

```js
await HerdHarborNormalizedSyncRollout.promoteToDualWrite()
```

The runtime prepares the guarded normalized writer as part of this transition. If writer preparation fails, the runtime attempts to roll back to shadow.

In dual-write:

- legacy remains authority
- legacy save must succeed first
- normalized record writes follow
- normalized failure must degrade without invalidating the successful legacy save
- unresolved normalized mutations block further promotion

Run another three consecutive successful validation checkpoints in dual-write. The counter is intentionally reset by promotion.

## 6. Multi-device dual-write test

Repeat the multi-device acceptance matrix while the account is in dual-write.

Additionally verify:

- legacy saves remain healthy
- normalized outbox drains completely
- no normalized-read fallback is observed
- reconciliation remains zero-divergence
- provider retry/backoff does not create duplicate records
- delayed/lost responses cannot acknowledge a newer local edit

Any failure blocks normalized authority.

## 7. Promote to normalized authority

Only after the dual-write acceptance sequence is clean:

```js
await HerdHarborNormalizedSyncRollout.promoteToNormalized()
```

Promotion is allowed only through the dedicated guarded authority activation RPC. Generic stage promotion to `normalized` is intentionally rejected.

Immediately after activation the runtime performs a normalized authoritative read verification. If that immediate read cannot be proven safe, the runtime materializes the verified normalized snapshot into the legacy compatibility row and rolls all the way back to legacy.

Expected normalized state:

- stage: `normalized`
- authority marker present
- normalized reads/writes authoritative
- record-level outbox empty after sync
- stale legacy clients blocked by the database guard
- legacy row retained for recovery

## 8. Real multi-device normalized-authority acceptance

Run the full acceptance matrix again with normalized authority active:

- phone -> web -> phone convergence
- near-simultaneous unrelated saves
- same-record different-field reconciliation
- same-field scoped conflict
- offline close/reopen
- immediate close with durable outbox
- delayed responses
- lost response plus idempotent retry
- provider retry/backoff
- delete/tombstone stale-resurrection protection
- already-open device discovers authority change
- reconnect
- background/foreground and focus
- stale installed PWA cannot resume legacy full-state writes
- Record Birth remains correct from all supported entry surfaces

A normalized write failure must leave the local record mutation pending rather than silently clearing it.

A normalized read failure is a stop condition. Do not expand the cohort.

## 9. Rollback drill

A successful trial is not complete until rollback has been exercised.

From normalized authority:

```js
await HerdHarborNormalizedSyncRollout.rollbackToLegacy()
```

The runtime must:

1. drain pending normalized mutations
2. read a verified normalized authoritative snapshot
3. materialize that snapshot into the legacy compatibility row
4. set the recovery lock so stale clients remain blocked
5. transition `normalized -> dual_write -> shadow -> legacy`
6. clear the recovery lock only on return to legacy
7. retain normalized rows

After rollback, verify:

- stage is `legacy`
- `recovery_pending === false`
- legacy snapshot contains the newest normalized edit
- no pending record outbox remains
- both devices converge on the recovered legacy snapshot

If a recovery lock is observed after restart, the v1.8.4 hydration path must resume rollback to legacy before either cloud writer is allowed to proceed.

## 10. End the trial

Only after the account has successfully returned to legacy should the operator disable its cohort row:

```sql
update public.herdharbor_sync_cohort
set enabled = false, updated_at = now()
where user_id = '<APPROVED_INTERNAL_TEST_USER_UUID>'::uuid;
```

Then verify:

- no enabled cohort row remains for that UUID
- manifest is legacy
- recovery lock is false
- no other account changed stage
- normalized rows were retained

Do not delete the cohort row or normalized rows merely to make the dashboard look clean; retained evidence is useful for diagnosis and rollback confidence.

## 11. Stabilization boundary and legacy retirement

Completing one controlled trial does not authorize removal of legacy sync.

Legacy whole-state write/conflict machinery may be considered for retirement only after:

- an explicitly approved internal cohort has completed the full shadow, dual-write, normalized, and rollback drill
- the required real multi-device scenarios pass
- production monitoring shows no unexplained normalized divergence/read fallback/write-loss condition during the defined stabilization review
- rollback remains proven
- a separate review explicitly authorizes retirement

Until that separate authorization, keep:

- `herdharbor_user_data`
- legacy recovery materialization
- stale-client legacy-write guard
- adjacent rollback
- backup/recovery paths

Retirement, when separately authorized, must be its own reviewed change. It must not be bundled into the authority trial.

## Stop conditions

Stop promotion and either remain at the current legacy-authority stage or roll back when any of these occurs:

- preflight is not fully verified
- account identity is uncertain
- unexpected cohort membership exists
- reconciliation differs
- normalized rows are missing or unexpected
- unresolved conflict exists
- outbox does not drain
- normalized write degrades
- normalized read falls back or fails validation
- provider error is unexplained and repeatable
- rollback cannot be proven
- stale client bypasses the legacy-write guard
- unrelated app functionality regresses

Never change a test, threshold, generation check, or safety guard merely to force the next stage.
