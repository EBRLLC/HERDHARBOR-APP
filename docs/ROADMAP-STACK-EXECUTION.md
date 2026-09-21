# HerdHarbor Roadmap Stack Execution Ledger

> Execution ledger only. Repository code, branch ancestry, PR diffs, and current tests are authoritative. If this document disagrees with code, correct this document before continuing.

## Stack invariants

- Every roadmap implementation phase uses its own PR.
- Every child branch starts from the final green head of its immediate parent phase.
- Development stack is not flattened while phases are in progress.
- No PR is merged automatically.
- Whole-application version remains **1.8.2** until the formal Phase 8 v1.8.3 release PR.
- Component/build identities may advance independently of the whole-app release when the owning component changes.
- Normalized sync is not unrestricted production authority unless a later explicit rollout decision proves and promotes it safely.

---

## Completed Phase 1 — Production cloud-sync telemetry

- **Roadmap phase:** Phase 1 — production cloud-sync telemetry validation
- **PR number:** #138
- **PR title:** fix: validate production cloud-sync telemetry contract
- **Branch:** `fix/validate-production-cloud-sync-telemetry`
- **Base branch:** `main`
- **Base SHA:** `f9c0c09cdcd6e09aafb6d4c662b375005372b4fa`
- **Final head SHA:** `2de04e15bd7cc5af83503512be876167d6cd9a02`
- **Parent PR:** none; parent is current `main`
- **Application version:** 1.8.2
- **Component/build identities changed:** legacy cloud-sync build -> `legacy-full-state-observability-3`; monitoring build -> `phase1-monitoring-review-3`; monitoring release remains `HerdHarbor@1.6.1`
- **Production behavior changed:** originating provider/runtime `Error` provenance is preserved where available; cloud failures carry sanitized provider diagnostics plus retry/session-refresh outcome metadata; race-reload failure path emits the same telemetry contract
- **Production behavior intentionally NOT changed:** legacy full-state sync remains authoritative; retry budget remains bounded; no normalized-sync activation; no sign-in redesign; app release remains 1.8.2
- **Files/modules now owning the feature:** `herdharbor-cloud.js`; `monitoring/herdharbor-monitoring-instrumentation.mjs`; `monitoring/herdharbor-monitoring-core.mjs`
- **Canonical state owner:** legacy full-state cloud sync remains authoritative
- **Public entry points introduced:** existing `herdharbor:cloud-sync-failure` event contract was extended with safe provenance/retry fields; no new user-facing API
- **Compatibility paths retained:** structured non-`Error` provider failures still report handled-message telemetry without manufacturing a stack
- **Compatibility paths removed:** monitoring adapter no longer creates a synthetic provider `Error` solely to obtain a stack
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none added
- **Monitoring changes:** cloud provider/runtime stack provenance, retry attempts/result, session-refresh attempted/result, sanitized provider details/hints
- **Migration requirements:** none
- **Rollback procedure:** revert PR #138 commits; legacy sync authority is otherwise unchanged
- **Tests added:** none as new files
- **Tests modified:** `tests/cloud-sync-observability-retry-v1.8.2.test.cjs`
- **Full CI result:** Alpha v1.8.2 CI #204 — PASS on exact final head
- **Manual validation still required:** verify the next naturally occurring production provider failure has provider/runtime-origin stack where an actual `Error` exists and contains no private state/credentials
- **Known risks:** structured provider failures that are not JavaScript `Error` objects cannot provide a genuine exception stack; root cause can remain unknown when provider evidence is insufficient
- **Exact requirements inherited by next phase:** preserve PR #137/#138 telemetry contract, bounded retry/session-refresh behavior, private-state redaction, legacy authority, and v1.8.2 whole-app identity

---

## Completed Phase 2 — Controlled normalized-sync rollout infrastructure

- **Roadmap phase:** Phase 2 — controlled normalized-sync rollout
- **PR number:** #139
- **PR title:** feat: add controlled normalized-sync rollout guardrails
- **Branch:** `feat/controlled-normalized-sync-rollout`
- **Base branch:** `fix/validate-production-cloud-sync-telemetry`
- **Base SHA:** `2de04e15bd7cc5af83503512be876167d6cd9a02`
- **Final head SHA:** `e44d5373c81f574c09ea8d82aca3f9f318cd2f48`
- **Parent PR:** #138
- **Application version:** 1.8.2
- **Component/build identities changed:** `cloud-sync-rollout-control-1`; rollout control version `1.0-rollout-guardrails`; cohort gate version `1.0-controlled-cohort`; reconciliation version `1.0-safe-reconciliation`; these modules identify target release 1.8.3 but do not bump the application
- **Production behavior changed:** none by default; rollout control machinery, deterministic cohort evaluation, reconciliation metrics, and read-only schema preflight were added but are not wired into unrestricted production authority
- **Production behavior intentionally NOT changed:** no SQL auto-application; no cohort enabled; no mass migration; no normalized authoritative read/write activation; no legacy deletion; no sign-in redesign
- **Files/modules now owning the feature:** `cloud-sync-stage-policy-v1.8.3.js` remains stage-policy owner; `cloud-sync-rollout-control-v1.8.3.js` owns promotion/rollback guardrails; `cloud-sync-cohort-gate-v1.8.3.js` owns rollout eligibility; `cloud-sync-reconciliation-v1.8.3.js` owns privacy-safe rollout parity metrics; existing record-store/shadow/dual-write/read-fallback modules remain authoritative for their domains
- **Canonical state owner:** database sync manifest remains the sole persisted rollout-stage owner using `legacy -> shadow -> dual_write -> normalized`; legacy full-state remains authoritative through shadow and dual_write
- **Public entry points introduced:** globals `HerdHarborCloudSyncCohortGate`, `HerdHarborCloudSyncReconciliation`, `HerdHarborCloudSyncRolloutControl`
- **Compatibility paths retained:** existing shadow bootstrap, normalized record store, dual-write coordinator, normalized-read fallback, and legacy rollback path
- **Compatibility paths removed:** none
- **Database/schema changes:** no schema applied; added read-only `supabase/v1.8.3-cloud-sync-rollout-preflight.sql`; existing v1.8.3 normalized schema/guard SQL remains prerequisite
- **Edge Function changes:** none
- **Environment variables/secrets required:** none added
- **Monitoring changes:** privacy-safe aggregate rollout metrics can represent bootstrap failures, normalized-write failures, normalized-read fallback, conflicts, and reconciliation error rate; no record payloads are emitted
- **Migration requirements:** before any real promotion, authorized operators must apply the existing normalized-record schema and legacy guard in documented order, then pass the read-only preflight
- **Rollback procedure:** adjacent stage rollback toward legacy using the existing generation-guarded manifest transition policy; rollback is intentionally less restrictive than promotion
- **Tests added:** `tests/cloud-sync-cohort-gate-v1.8.3.test.cjs`; `tests/cloud-sync-reconciliation-v1.8.3.test.cjs`; `tests/cloud-sync-rollout-control-v1.8.3.test.cjs`; `tests/cloud-sync-rollout-preflight-v1.8.3.test.cjs`
- **Tests modified:** `tests/cloud-shadow-bootstrap-v1.8.3.test.cjs`; `package.json` v1.8.3 test gate
- **Full CI result:** Alpha v1.8.2 CI #206 — PASS on exact final head
- **Manual validation still required:** authorized schema application/preflight and internal-cohort rollout evidence are required before any production promotion
- **Known risks:** rollout control is intentionally disconnected from production runtime; schema drift or stale manifest verification must fail closed; normalized authority remains unproven until an explicit controlled rollout
- **Exact requirements inherited by next phase:** preserve manifest stage ownership, default-off cohorts, legacy recovery, schema preflight, safe aggregate telemetry, PR #138 error telemetry, and no unrestricted normalized authority

---

## Completed Phase 3 — Animal-first workflow consolidation

- **Roadmap phase:** Phase 3 — animal-first workflow consolidation
- **PR number:** #141
- **PR title:** feat: consolidate animal-first workflows
- **Branch:** `feat/consolidate-animal-first-workflows`
- **Base branch:** `feat/controlled-normalized-sync-rollout`
- **Base SHA:** `e44d5373c81f574c09ea8d82aca3f9f318cd2f48`
- **Final head SHA:** `c5262e4650e3f22a49a75fe6acba8469879fe8d8`
- **Parent PR:** #139
- **Application version:** 1.8.2
- **Component/build identities changed:** animal action router remains component version `1.8.3`; no whole-app build/release bump
- **Production behavior changed:** Phase Two animal profile now routes canonical actions through one action router; Edit/Status and Print Pedigree use narrow existing-runtime wrappers; profile-scoped Quick Add uses the same router; Today animal targets prefer the canonical Phase Two profile; modal-based canonical actions return to the same animal/profile tab; narrow-screen profile behavior is hardened
- **Production behavior intentionally NOT changed:** domain forms/engines and state ownership are not replaced; normalized-sync authority unchanged; auth unchanged; no new domain record types
- **Files/modules now owning the feature:** `animal-action-router-v1.8.3.js` owns profile action dispatch/return; `flow-phase2-v1.8.2.js` owns canonical Phase Two animal profile navigation/rendering; `workflow-phase1-v1.7.1.js` supplies contextual Quick Add/Today derivation; `herdharbor-app-runtime.js` still owns the underlying canonical edit and pedigree-print forms through narrow wrappers
- **Canonical state owner:** existing HerdHarbor domain arrays/engines remain authoritative; health weight remains canonical health data; sire/dam remain canonical `sireId`/`damId`
- **Public entry points introduced:** `HerdHarborAnimalActionRouter.open/canHandle/returnSurfaceFor`; narrow `HerdHarborApp.openAnimalEditor`; narrow `HerdHarborApp.openAnimalPedigreePrint`; existing `HerdHarborFlowPhase2.openAnimalProfile` is the preferred animal-profile navigation entry point
- **Compatibility paths retained:** older Phase One profile hub remains fallback only when Phase Two is unavailable
- **Compatibility paths removed:** Phase Two `openCoreAction()` bridge and its legacy modal return/bypass state were removed from normal profile action routing
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none added
- **Monitoring changes:** none
- **Migration requirements:** none
- **Rollback procedure:** revert PR #141 commits; existing Phase One profile compatibility path remains available
- **Tests added:** `tests/animal-first-consolidation-v1.8.3.test.cjs`
- **Tests modified:** `tests/animal-action-router-v1.8.3.test.cjs`; `tests/flow-phase1-v1.8.2.test.cjs`; `tests/workflow-phase1-v1.7.1.test.cjs`; `package.json` v1.8.3 test gate
- **Full CI result:** Alpha v1.8.2 CI #209 — PASS on exact final head
- **Manual validation still required:** targeted physical-device UX validation is useful for complex modal return behavior and smallest supported mobile viewport; automated contracts are green
- **Known risks:** Phase One profile compatibility code still exists until every remaining caller/deep link is proven migrated; action-return polling depends on canonical form surface selectors staying stable
- **Exact requirements inherited by next phase:** reuse the animal action router and Phase Two profile; do not duplicate domain forms/state; preserve return-to-animal behavior, mobile contracts, canonical health/pedigree/breeding ownership, and the Phase 1/2 cloud contracts

---

## Completed Phase 4 — Trial / subscription production completion

- **Roadmap phase:** Phase 4 — Trial / subscription production completion
- **PR number:** #143
- **PR title:** feat: complete production trial and Free Adult experience
- **Branch:** `feat/complete-production-trial-free-adult`
- **Base branch:** `feat/consolidate-animal-first-workflows`
- **Base SHA:** `c5262e4650e3f22a49a75fe6acba8469879fe8d8`
- **Final head SHA:** `3ca76a2221992c83ed9c82ffa5c6f7a0440ef15c`
- **Parent PR:** #141
- **Application version:** 1.8.2
- **Component/build identities changed:** no whole-app or cloud-sync build identity changed; subscription launch/provider asset revisions advance to `?v=2` in the runtime loader and service-worker shell so the hardened client code invalidates older cached copies
- **Production behavior changed:** initial Member trial dates are accepted only from the authenticated backend snapshot derived from Supabase Auth `user.created_at`; unverified browser/local state cannot create or extend a trial; one-calendar-month trial semantics remain New York-local with legacy pre-launch floor; Free Adult is the permanent adult fallback after trial/paid access ends; Free Adult permits five active animals while allowing an existing over-limit herd to remain managed/reduced; early Member checkout preserves remaining trial time using the authoritative trial end as Stripe billing anchor; checkout is client single-flight and server-idempotent; checkout/payment errors preserve current access; ended adult subscriptions fall back to Free Adult; protected Owner/Admin/Founder/manual-override ownership is retained through billing webhooks; Junior remains separate
- **Production behavior intentionally NOT changed:** authentication/session architecture is unchanged; no credit card is required to begin the trial; no herd records are deleted on downgrade/cancellation; normalized-sync authority is unchanged; Owner/Admin/Founder/manual overrides are not converted to subscription ownership; Junior enrollment is not redesigned; application release remains 1.8.2
- **Files/modules now owning the feature:** `supabase/functions/_shared/subscription-trial.ts` owns calendar-month trial calculation; `supabase/functions/subscription-billing/index.ts` owns authoritative subscription snapshot and checkout creation; `supabase/functions/subscription-webhook/index.ts` owns Stripe event reconciliation/fallback state; `subscription-launch-v1.8.1.js` owns client access-policy projection and experience state; `subscription-stripe-provider-v1.8.0.js` owns Stripe browser bridge/checkout UX; `subscription-engine-v1.8.0.js` remains subscription panel/state shell; `herdharbor-membership-v1.6.1.js` remains base membership/role policy
- **Canonical state owner:** authenticated backend account/subscription records and Supabase Auth account creation time; browser subscription state is advisory until verified for the current authenticated user
- **Public entry points introduced:** `HerdHarborSubscriptionLaunch.getExperienceState()` for trusted user-facing access state; existing `HerdHarborStripeSnapshotTrust.isVerified()` remains the browser trust gate
- **Compatibility paths retained:** existing subscription engine local cache remains fail-open display state and cannot manufacture trial authority; existing membership APIs and Junior flow remain compatible; legacy pre-launch date floor remains in the server trial helper
- **Compatibility paths removed:** client `launch_trial_fallback` no longer manufactures Member trial access from local time/unverified state; adult subscription-end fallback is no longer mislabeled as Junior
- **Database/schema changes:** none
- **Edge Function changes:** `subscription-billing` persists server-resolved subscription status, preserves early-trial billing anchor, and uses Stripe idempotency for checkout; `subscription-webhook` preserves Owner/Admin/Founder/manual ownership and sets ended adult paid access to Free Adult; shared subscription email copy reflects Free Adult fallback
- **Environment variables/secrets required:** no new secrets; existing Supabase service-role configuration, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET`, and existing Resend configuration remain required by their current server functions
- **Monitoring changes:** no new telemetry payload fields; existing subscription-engine operational-failure reporting is retained and billing remains fail-open to base app startup
- **Migration requirements:** no SQL migration; deploy the updated subscription billing/webhook/shared-email Edge Function code with existing secrets/configuration; existing `account_access.subscription_status` is reused
- **Rollback procedure:** revert PR #143 client and Edge Function changes and restore prior asset revisions; no destructive herd migration is performed, and Free Adult status values are already understood by the retained launch policy
- **Tests added:** `tests/subscription-production-completion-v1.8.3.test.cjs`
- **Tests modified:** `tests/subscription-trial-v1.8.2.test.cjs`; `tests/subscription-launch-v1.8.1.test.cjs`; `tests/subscription-stripe-v1.8.1.test.cjs`; `tests/subscription-email-delivery-v1.8.1.test.cjs`; `tests/subscription-engine-v1.8.0.test.cjs`; `tests/stability-release.test.cjs`; `package.json` v1.8.3 gate
- **Full CI result:** Alpha v1.8.2 CI #213 — PASS on exact final head `3ca76a2221992c83ed9c82ffa5c6f7a0440ef15c`; release/security, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/architecture/config, source-mutation guard, and Android review bundle all passed
- **Manual validation still required:** live/test-mode Stripe validation for early-trial checkout billing date, canceled checkout retry, cancel/reactivate, payment-failure recovery, subscription deletion -> Free Adult webhook/email, and a real over-five-animal Free Adult account; verify deployed Edge Functions have existing Stripe/Resend secrets
- **Known risks:** Stripe/webhook delivery remains asynchronous and provider outages can temporarily leave the UI on the last verified access state; production secret/configuration and external Stripe behavior cannot be proven solely by repository CI; idempotent checkout intentionally prioritizes duplicate-session prevention
- **Exact requirements inherited by next phase:** preserve trusted backend trial authority, protected-role precedence, non-destructive Free Adult fallback, five-active-animal growth ceiling, Junior separation, asynchronous fail-open billing, Stripe secret isolation, no auth redesign, no normalized-sync authority change, and whole-app v1.8.2 identity

---

## Phase 5 — Paper Pedigree AI production hardening

- **Status:** pending
- **Required base branch:** `feat/complete-production-trial-free-adult`
- **Required base SHA:** `3ca76a2221992c83ed9c82ffa5c6f7a0440ef15c`
- **Parent PR:** #143
- **Application version target for this phase:** remain 1.8.2

At Phase 5 start, re-read this ledger and verify it against repository HEAD, PR #143 diff, current tests, branch ancestry, and open PR overlap before creating the child branch.
