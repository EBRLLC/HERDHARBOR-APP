# HerdHarbor v1.8.3 Controlled Normalized-Sync Rollout

## Scope and authority

This document defines the operator procedure for the v1.8.3 normalized-sync rollout infrastructure. It does **not** authorize a whole-app v1.8.3 release or unrestricted production cutover.

The database manifest remains the only authoritative persisted sync stage:

`legacy -> shadow -> dual_write -> normalized`

The intermediate operational steps below are rollout procedures, not a second persisted state machine.

Legacy full-state data remains the authoritative recovery path through `shadow` and `dual_write`. No step in this procedure deletes `herdharbor_user_data`.

## Default production state

The rollout is default-off.

- The v1.8.3 control-plane modules are not loaded by the production page.
- The cohort gate requires `enabled: true`; disabled means no account is eligible.
- Shadow bootstrap still requires its explicit feature gate.
- Percentage cohorts are deterministic, bounded to 0-100%, and are never active merely because a percentage was configured.
- No browser load applies SQL or alters production schema.

## Ordered schema application

Apply schema only through an authorized Supabase/database change procedure. Do not embed these files into normal web-app startup.

1. Confirm current production application identity is HerdHarbor Alpha v1.8.3, legacy full-state sync remains authoritative, normalized authority is still gated, and production cloud telemetry is available.
2. Apply `supabase/v1.8.3-cloud-sync-normalized-records.sql`.
3. Apply `supabase/v1.8.3-cloud-sync-cutover-legacy-guard.sql`.
4. Run the read-only `supabase/v1.8.3-cloud-sync-rollout-preflight.sql`.
5. Do not enable any cohort unless the preflight reports every prerequisite present.
6. Re-run preflight after any schema/RPC/trigger repair before promotion.

The schema migrations use additive tables/functions/guards and are designed to be reapplied safely where their own `if exists`/`if not exists`/`create or replace` contracts allow. A failed migration is a stop condition: do not partially infer readiness from the objects that happened to succeed.

## Schema readiness contract

Before any `legacy -> shadow` promotion, verify all of the following:

- normalized records table exists
- sync manifest table exists
- RLS is enabled on both normalized tables
- owner-only read policies remain present
- atomic batch RPC exists
- verification RPC exists
- stage-transition RPC exists
- guarded normalized-writer preparation RPC exists
- legacy stale-client write guard trigger exists and is enabled

The JavaScript rollout control represents this as `schemaStatus.verified === true` plus every required schema check.

## Cohort policy

Start with explicit internal allowlist mode.

Allowed modes are:

- `allowlist`: only specifically listed internal/test accounts
- `percentage`: deterministic percentage assignment
- `allowlist-or-percentage`: explicit internal accounts plus deterministic percentage assignment

Do not use percentage rollout until explicit internal testing has succeeded. An Owner/Admin role is not itself a security bypass; eligibility must still come through the configured rollout cohort mechanism.

## Stage policy

### legacy

Authority: legacy full-state sync.

Entry: default.

Promotion to shadow requires:

- verified schema
- monitoring/telemetry available
- rollback path available
- explicit cohort eligibility

Rollback destination: none.

### shadow

Authority: legacy.

Purpose: idempotent normalized bootstrap/write plus verification without changing read authority.

Success evidence:

- bootstrap completes or safely resumes
- normalized verification is current
- reconciliation reports no missing, unexpected, or differing records
- no unresolved conflicts
- no bootstrap failures
- telemetry contains only aggregate/safe metadata

Promotion to dual_write additionally requires current verification and healthy reconciliation.

Rollback destination: legacy.

### dual_write

Authority: legacy.

Purpose: save legacy first, then normalized. A normalized failure must degrade safely without converting a successful legacy save into data loss.

Success evidence:

- legacy saves remain successful
- normalized writes remain healthy
- reconciliation stays within the configured error threshold
- no unresolved conflicts
- normalized-read validation produces no fallback during the acceptance window
- guarded normalized writer can be prepared

Preparing the normalized writer is not a promotion and must leave the manifest in `dual_write`.

Rollback destination: shadow.

### normalized

Authority: normalized reads/writes with retained legacy recovery/rollback protection.

Entry requires:

- current normalized verification
- guarded writer readiness
- verified schema/legacy guard
- telemetry and rollback availability
- healthy reconciliation
- no observed normalized-read fallback in the acceptance window
- explicit cohort eligibility

Rollback destination: dual_write.

No mass migration or legacy cleanup is part of this PR.

## Reconciliation metrics

Only aggregate metrics may be emitted:

- records compared
- records matching
- records differing
- missing normalized records
- unexpected normalized records
- unresolved conflicts
- bootstrap failures
- dual-write failures
- normalized-read fallback count
- reconciliation error rate

Do not emit record IDs, record bodies, full farm state, animal data, notes, credentials, or provider payload dumps.

## Promotion blocking

Promotion must stop when any required guard fails, including:

- schema not verified
- telemetry unavailable
- rollback unavailable
- account outside the rollout cohort
- stage transition illegal
- verification stale/missing
- reconciliation not yet observed where required
- reconciliation error rate above threshold
- unresolved conflicts
- bootstrap failures
- normalized write failures
- normalized-read fallback observed before normalized authority
- normalized writer not prepared for final promotion

Do not alter an assertion or threshold merely to force a promotion.

## Rollback

Rollback is intentionally less restrictive than promotion. If the current manifest stage has a defined rollback target, the control plane may move one adjacent stage toward legacy even when rollout telemetry/cohort checks are unhealthy.

The existing database transition guard increments generation on stage change so stale clients cannot silently overwrite the new stage.

After rollback, verification/writer readiness must be re-established before a later re-promotion.

## Failure behavior

- Schema/preflight failure: stop; no cohort enablement.
- Shadow bootstrap failure: retain legacy authority; retry/resume only through the gated bootstrap.
- Reconciliation mismatch: block promotion.
- Dual-write normalized failure: legacy save remains authoritative; record aggregate failure and reconcile before retrying promotion.
- Normalized-read fallback: block final promotion/expansion and investigate.
- Rollback failure: treat as a release blocker; do not expand the cohort.

## Production activation boundary

This PR supplies the control machinery and tests. It intentionally does not add these modules to `index.html` or otherwise enable unrestricted production runtime activation.

A later explicitly authorized rollout change must provide the production configuration, chosen internal account cohort, schema preflight evidence, monitoring availability, and rollback evidence before wiring the control plane into runtime.
