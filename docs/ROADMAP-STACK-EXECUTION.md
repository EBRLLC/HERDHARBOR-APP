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
- **Final head SHA:** `7ac4a0a58dbf694242b825ae65fee883d3223a61`
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
- **Full CI result:** Alpha v1.8.2 CI #215 — PASS on exact final head `7ac4a0a58dbf694242b825ae65fee883d3223a61`; release/security, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/architecture/config, source-mutation guard, and Android review bundle all passed
- **Manual validation still required:** live/test-mode Stripe validation for early-trial checkout billing date, canceled checkout retry, cancel/reactivate, payment-failure recovery, subscription deletion -> Free Adult webhook/email, and a real over-five-animal Free Adult account; verify deployed Edge Functions have existing Stripe/Resend secrets
- **Known risks:** Stripe/webhook delivery remains asynchronous and provider outages can temporarily leave the UI on the last verified access state; production secret/configuration and external Stripe behavior cannot be proven solely by repository CI; idempotent checkout intentionally prioritizes duplicate-session prevention
- **Exact requirements inherited by next phase:** preserve trusted backend trial authority, protected-role precedence, non-destructive Free Adult fallback, five-active-animal growth ceiling, Junior separation, asynchronous fail-open billing, Stripe secret isolation, no auth redesign, no normalized-sync authority change, and whole-app v1.8.2 identity

---

## Completed Phase 5 — Paper Pedigree AI production hardening

- **Roadmap phase:** Phase 5 — Paper Pedigree AI production hardening
- **PR number:** #145
- **PR title:** feat: harden paper pedigree AI for production
- **Branch:** `feat/harden-paper-pedigree-ai-production`
- **Base branch:** `feat/complete-production-trial-free-adult`
- **Base SHA:** `7ac4a0a58dbf694242b825ae65fee883d3223a61`
- **Validated implementation head SHA:** `c8cf37ac9b1423c7a285c34d508dedac8b4972ee`
- **Final head SHA:** `aceff2b9de5f512907a1b0b598345a56b4bd3b3e`
- **Parent PR:** #143
- **Application version:** 1.8.2
- **Component/build identities changed:** no whole-app release identity changed; `herdharbor-cloud.js` browser asset revision advances from `?v=20` to `?v=21`; `paper-pedigree-import-v1.8.2.js` asset revision advances from `?v=1` to `?v=2`; Paper Pedigree core contract/version remains v1.8.2
- **Production behavior changed:** the existing authenticated Paper Pedigree AI Edge Function now returns stable sanitized failure codes, has a bounded configurable provider timeout, rejects malformed/duplicate-role structured output, avoids document/provider response content in logs, adds layout/partial-document/handwriting-safe extraction instructions, returns aggregate extraction diagnostics, and records best-effort privacy-safe aggregate outcome metrics; the browser preserves extraction confidence provenance, exposes all supported extracted fields for correction, highlights low-confidence values, requires explicit reviewed-against-source confirmation before canonical mutation, and uses a narrow sanitized secure-function diagnostic bridge
- **Production behavior intentionally NOT changed:** the AI still cannot mutate farm state directly; user review remains mandatory; the existing paper-pedigree import core remains authoritative for matching/conflict handling/lineage; source images remain local attachment data rather than canonical cloud farm state; no auth redesign; no normalized-sync authority change; no multi-photo merge; application release remains 1.8.2
- **Files/modules now owning the feature:** `paper-pedigree-import-core-v1.8.2.js` remains canonical import/matching/planning owner; `paper-pedigree-import-v1.8.2.js` owns capture/review/confirmation UI and the single explicit commit path; `supabase/functions/paper-pedigree-extract/index.ts` owns authenticated provider extraction, validation, diagnostics, timeout, and metric emission; `herdharbor-cloud.js` owns the narrow sanitized Edge Function diagnostic transport; `supabase/v1.8.3-paper-pedigree-ai-metrics.sql` defines aggregate production metrics
- **Canonical state owner:** existing HerdHarbor animal/pedigree state through the current import core and `HerdHarborApp.commitState`; canonical parent relationships remain `sireId` / `damId`
- **Public entry points introduced:** `HerdHarborCloud.invokeFunctionWithDiagnostics(name, body)` exposes only sanitized `code`, user-safe message, optional `retryable`, and bounded `retryAfter`; existing `HerdHarborPaperPedigreeImport.open/start` and core APIs remain the feature entry points
- **Compatibility paths retained:** existing `HerdHarborCloud.invokeFunction` remains available; Paper Pedigree UI falls back to it if the diagnostic bridge is unavailable; existing manual pedigree builder and Quick Add launch paths remain; single-photo reviewed workflow remains authoritative
- **Compatibility paths removed:** reviewed fields no longer rewrite AI extraction confidence to 1.0; malformed structured provider output is no longer allowed to fall into generic parsing/normalization behavior
- **Database/schema changes:** added `supabase/v1.8.3-paper-pedigree-ai-metrics.sql` defining a service-role-only daily aggregate table and allowlisted metric-increment RPC; no migration is auto-applied
- **Edge Function changes:** `paper-pedigree-extract` adds stable diagnostic taxonomy, provider timeout, fail-closed structured validation, safer logging, layout tolerance instructions, aggregate diagnostics, and best-effort aggregate metric calls
- **Environment variables/secrets required:** existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`; existing optional `OPENAI_PEDIGREE_MODEL` and `PAPER_PEDIGREE_DAILY_LIMIT`; new optional `PAPER_PEDIGREE_PROVIDER_TIMEOUT_MS` bounded to 5–60 seconds with a 30-second default
- **Monitoring changes:** no complete pedigree/farm/image/provider content is sent to monitoring; added database aggregate counters for extraction requests, structured drafts, correction-required drafts, rejected outputs, rate-limit hits, and provider failures; correction-required rate is derived from aggregate counters
- **Migration requirements:** apply `supabase/v1.8.3-paper-pedigree-ai-metrics.sql` before expecting production aggregate metrics; deploy the updated `paper-pedigree-extract` Edge Function with existing provider/Supabase secrets; metric recording is best-effort so a staggered migration does not block extraction
- **Rollback procedure:** revert PR #145 browser/Edge Function changes and restore cloud/pedigree asset revisions; aggregate metrics table/RPC may remain inert or be separately rolled back by an authorized operator; canonical farm data requires no migration rollback because AI never directly mutates it
- **Tests added:** `tests/paper-pedigree-production-hardening-v1.8.3.test.cjs`
- **Tests modified:** `tests/paper-pedigree-runtime-v1.8.2.test.cjs`; `tests/stability-release.test.cjs`; `tests/current-shell-asset-identity-v1.6.7.test.cjs`; `tests/tablet-layout-login-color.test.cjs`; `tests/workflow-phase1-v1.7.1.test.cjs`; `tests/launch-hardening.test.cjs`; `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #220 — PASS on exact final head `aceff2b9de5f512907a1b0b598345a56b4bd3b3e`; complete UTC and America/New_York regression discovery, release/security, lifecycle/state-integrity, monitoring build/architecture/config, source-mutation guard, and Android review bundle passed.
- **Manual validation still required:** deploy/apply the aggregate metrics migration in an authorized environment; verify production Edge Function secrets and timeout configuration; test representative clear/rotated/perspective/partial rabbit pedigree photos and confirm uncertain fields/warnings; verify provider timeout/rate-limit behavior against the deployed provider; handwriting reliability is intentionally not claimed
- **Known risks:** provider vision quality varies by document quality/layout; low-confidence and ambiguous fields still require human judgment; aggregate metrics are unavailable until the SQL migration is applied; sanitized browser diagnostics depend on the Supabase Functions error context retaining the response body; multi-photo merge is deferred because safe deterministic per-image provenance/conflict resolution is not yet implemented
- **Exact requirements inherited by next phase:** preserve the single reviewed AI mutation boundary, canonical matching/conflict/lineage ownership, local source-image privacy, server-only provider keys, authenticated fail-closed extraction, stable safe diagnostics, aggregate-only telemetry, no multi-photo merge without provenance design, Phase 4 subscription protections, Phase 1/2 cloud contracts, and whole-app v1.8.2 identity

---

## Completed Phase 6A — Monitoring non-blocking startup

- **Roadmap phase:** Phase 6A — Monitoring non-blocking startup
- **PR number:** #147
- **PR title:** perf: decouple monitoring from application startup
- **Branch:** `perf/decouple-monitoring-from-application-startup`
- **Base branch:** `feat/harden-paper-pedigree-ai-production`
- **Base SHA:** `aceff2b9de5f512907a1b0b598345a56b4bd3b3e`
- **Validated implementation head SHA:** `d633808b71ebe908073cb05c13356be1a06e86de`
- **Final head SHA:** ledger-closure commit for this phase; the immediate child phase must correct this line to the exact final green parent SHA after the closure commit is revalidated, because a commit cannot contain its own Git SHA
- **Parent PR:** #145
- **Application version:** 1.8.2
- **Component/build identities changed:** no monitoring release/build identity changed; PWA bootstrap browser/cache asset revision advances from `pwa.js?v=30` to `pwa.js?v=31`; whole-app build ID remains `cloud-sync-v2-state-integrity-1`
- **Production behavior changed:** normal application boot no longer waits for monitoring configuration or the bundled monitoring SDK; monitoring begins independently as early as the PWA bootstrap can attach; application boot is one-shot; a bounded eight-item in-memory early error/rejection queue preserves practical startup visibility until monitoring settles; queued failures are flushed through the existing monitoring API only if monitoring attaches; temporary early listeners are removed when monitoring settles
- **Production behavior intentionally NOT changed:** monitoring is not disabled; config -> bundled SDK ordering remains; monitoring privacy/sampling/release/build metadata are unchanged; PR #137/#138 cloud failure provenance/retry/session telemetry is unchanged; PWA update flow and Cloud Sync independence are unchanged; authentication, domain state, normalized-sync authority, and whole-app release remain unchanged
- **Files/modules now owning the feature:** `pwa.js` owns startup ordering, monitoring attachment coordination, bounded early-failure buffering, application-module boot, and PWA update registration; existing monitoring browser/core/instrumentation modules remain monitoring behavior/privacy owners
- **Canonical state owner:** no domain state ownership change; `pwa.js` owns bootstrap sequencing only
- **Public entry points introduced:** none; existing `window.HerdHarborPWA` and `window.HerdHarborMonitoring` public surfaces remain unchanged
- **Compatibility paths retained:** existing optional monitoring config and bundled SDK loading; fail-open behavior when config/SDK cannot load; normal monitoring global instrumentation after attach; existing service-worker update UX
- **Compatibility paths removed:** `loadMonitoring(bootApplication)` is no longer the application boot gate
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none added; existing environment-driven Sentry DSN/config generation remains unchanged
- **Monitoring changes:** startup timing/attachment only; bounded early bootstrap errors can be reported after attach; no new private metadata fields; cloud-sync telemetry contract remains intact
- **Migration requirements:** none; deploy updated `pwa.js?v=31`, `index.html`, and service-worker shell references together
- **Rollback procedure:** revert PR #147 and restore PWA asset revision v30; monitoring resumes gating application boot as before; no data migration rollback is required
- **Tests added:** `tests/monitoring-startup-nonblocking-v1.8.3.test.cjs`
- **Tests modified:** `tests/monitoring-integration-v1.5.1.test.cjs`; `tests/current-shell-asset-identity-v1.6.7.test.cjs`; `tests/launch-hardening.test.cjs`; `tests/pwa-update-regression-v1.5.0.test.cjs`; `tests/runtime-consolidation-v1.5.1.test.cjs`; `tests/stability-release.test.cjs`; `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #225 — PASS on validated implementation head `d633808b71ebe908073cb05c13356be1a06e86de`; release/security, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/architecture/config, source-mutation guard, and Android review bundle all passed. The ledger-closure head is revalidated before Phase 6B.
- **Manual validation still required:** measure/observe a cold mobile/PWA start under slow or blocked monitoring asset delivery; confirm base UI/modules become usable without waiting for monitoring; verify a controlled early bootstrap exception is captured after delayed monitoring attachment in a non-production test environment
- **Known risks:** errors occurring before `pwa.js` itself executes cannot be buffered by this bridge; if monitoring asset delivery hangs indefinitely, temporary listeners remain installed but the queue is capped at eight entries and application boot remains independent; external network timing cannot be fully reproduced by static repository CI
- **Exact requirements inherited by next phase:** preserve monitoring-independent one-shot boot, bounded early-error queue semantics, fail-open monitoring, current monitoring release/build/privacy and cloud-error telemetry contracts, PWA update independence, Phase 5 AI protections, Phase 4 subscription protections, Phase 1/2 cloud contracts, and whole-app v1.8.2 identity

---

## Phase 6B — Runtime extraction: Animals / Profile

- **Status:** pending
- **Required base branch:** `perf/decouple-monitoring-from-application-startup`
- **Required base:** exact final green Phase 6A ledger-closure head
- **Parent PR:** #147
- **Application version target for this phase:** remain 1.8.2

At Phase 6B start, first correct the inherited Phase 6A `Final head SHA` line to the exact final green parent SHA, then inspect repository HEAD, PR #147 diff, current animal/profile runtime tests, branch ancestry, callers, and open PR overlap before extraction.
