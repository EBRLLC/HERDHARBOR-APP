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
- **Final head SHA:** `4a79e10bb029917a892e4be466346fbe18724d95`
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

## Completed Phase 6B — Runtime extraction: Animals / Profile

- **Roadmap phase:** Phase 6B — Runtime extraction: Animals / Profile
- **PR number:** #149
- **PR title:** refactor: extract animal and profile runtime domain
- **Branch:** `refactor/extract-animal-profile-runtime-domain`
- **Base branch:** `perf/decouple-monitoring-from-application-startup`
- **Base SHA:** `4a79e10bb029917a892e4be466346fbe18724d95`
- **Validated implementation head SHA:** `b94c7fb825637aa38d81e0cd2515be614c3ed977`
- **Final head SHA:** `98a38b44ab655c1b63f6cdd98f6d55e20ea626c0`
- **Parent PR:** #147
- **Application version:** 1.8.2
- **Component/build identities changed:** no whole-app, cloud-sync, monitoring, or existing domain component identity changed; new extracted component `animal-profile-runtime-v1.8.3.js?v=1` is loaded before the composition runtime
- **Production behavior changed:** no intended user-facing behavior redesign; Animals list/filter, animal create/edit/delete UI/runtime, legacy detail fallback, pedigree preview support used by detail screens, and animal QR-card runtime now execute from the extracted Animals/Profile module rather than the monolithic application runtime
- **Production behavior intentionally NOT changed:** canonical animal state remains the existing `state.animals` array; modern Phase Two profile navigation/rendering remains owned by `flow-phase2-v1.8.2.js`; profile actions remain owned by `animal-action-router-v1.8.3.js`; Free Adult/Junior limits, sale-linked delete protection, sireId/damId, pedigree/import/print behavior, QR deep links, and save/state-integrity semantics are preserved; no auth or normalized-sync authority change; release remains 1.8.2
- **Files/modules now owning the feature:** `animal-profile-runtime-v1.8.3.js` owns Animals list/filter, CRUD form, legacy detail fallback, QR cards, and narrow editor/pedigree-print adapters; `flow-phase2-v1.8.2.js` remains canonical modern profile shell owner; `animal-action-router-v1.8.3.js` remains profile action router; `herdharbor-app-runtime.js` is composition/shared-service owner and delegates to the extracted module
- **Canonical state owner:** unchanged canonical HerdHarbor application state; extracted module receives `getState`/shared services and creates no localStorage/sessionStorage/IndexedDB/domain state store
- **Public entry points introduced:** `window.HerdHarborAnimalProfileRuntime.create(deps)`; existing `HerdHarborApp.openAnimalEditor` and `HerdHarborApp.openAnimalPedigreePrint` remain stable thin public entry points delegating to the extracted owner
- **Compatibility paths retained:** modern Phase Two profile remains preferred; legacy animal detail fallback remains for direct legacy callers; existing Quick Add/deep-link/pedigree record callers continue through composition delegates; existing router public contracts are unchanged
- **Compatibility paths removed:** duplicate monolithic implementations of `animalView`, Animals result/card rendering, animal CRUD, QR pending state/QR cards, and legacy-detail implementation are removed from `herdharbor-app-runtime.js`
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none
- **Monitoring changes:** none; Phase 6A non-blocking startup and Phase 1 cloud telemetry contracts are inherited unchanged
- **Migration requirements:** none; static deployment must include `animal-profile-runtime-v1.8.3.js`, which the Pages artifact gate now verifies
- **Rollback procedure:** revert PR #149 shell/module/runtime/test changes, restoring the prior monolithic Animals/Profile implementation; no state/data migration rollback is required because canonical state shape and persistence were unchanged
- **Tests added:** `tests/runtime-animal-profile-extraction-v1.8.3.test.cjs`
- **Tests modified:** animal-first/router, app compile, release-reference, shell-decomposition, stability, analytics, Junior entry paths, Member cattle workflow, mobile pedigree, optional-tool lazy-loading, sales/customers, storage-efficiency, Pages artifact check, and `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #236 — PASS on exact final head `98a38b44ab655c1b63f6cdd98f6d55e20ea626c0`; current release/security, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/architecture/config, source-mutation guard, and Android v1.8.2 review bundle all passed.
- **Manual validation still required:** exercise Animals filtering, add/edit/reactivate/delete, modern profile navigation/actions/returns, legacy direct detail fallback, cattle fields, photo upload, QR printing/deep links, and sale-linked delete refusal in a deployed browser/PWA
- **Known risks:** the extracted module intentionally depends on injected composition helpers, so load order is contractually important; legacy detail fallback remains temporarily alongside the modern profile by design; later extraction phases must not pull shared helpers into multiple modules or create competing state owners
- **Exact requirements inherited by next phase:** preserve `HerdHarborAnimalProfileRuntime.create(deps)`, modern Phase Two profile authority, `HerdHarborAnimalActionRouter`, narrow `HerdHarborApp.openAnimalEditor/openAnimalPedigreePrint` contracts, canonical single state ownership, animal-limit/state-integrity protections, Phase 6A non-blocking monitoring boot, prior AI/subscription/cloud contracts, and whole-app v1.8.2 identity

---

## Completed Phase 6C — Runtime extraction: Breeding / Litters

- **Roadmap phase:** Phase 6C — Runtime extraction: Breeding / Litters
- **PR number:** #151
- **PR title:** refactor: extract breeding and litter runtime domain
- **Branch:** `refactor/extract-breeding-litter-runtime-domain`
- **Base branch:** `refactor/extract-animal-profile-runtime-domain`
- **Base SHA:** `98a38b44ab655c1b63f6cdd98f6d55e20ea626c0`
- **Validated implementation head SHA:** `9c999733511ec4fc63cdb59f03ef3fa539967843`
- **Final head SHA:** `70f368d6ef12df658998b777d32c11e34fe79611`
- **Parent PR:** #149
- **Application version:** 1.8.2
- **Component/build identities changed:** no whole-app, cloud-sync, monitoring, lifecycle, or existing domain component identity changed; new extracted component `breeding-litter-runtime-v1.8.3.js?v=1` is loaded before the composition runtime
- **Production behavior changed:** no intended workflow redesign; breeding/litter list UI, breeding and birth forms, gestation schedule calculations, automatic reminder synchronization, report snapshot UI helper, birth validation, and legacy offspring-creation compatibility flow now execute from the extracted Breeding/Litter runtime
- **Production behavior intentionally NOT changed:** canonical `state.breedings`, `state.litters`, and `state.animals` remain unchanged; `flow-phase2-lifecycle-v1.8.2.js`, `breeding-litter-workspace-v1.8.2.js`, weaning safeguards, lifecycle integrity, profile action routing/return behavior, Free Adult/Junior animal limits, deterministic IDs, parent/source links, report semantics, and reminder semantics remain authoritative/preserved; no auth or normalized-sync authority change; release remains 1.8.2
- **Files/modules now owning the feature:** `breeding-litter-runtime-v1.8.3.js` owns breeding/litter UI orchestration and legacy offspring compatibility flow; canonical lifecycle/workspace/weaning/integrity engines remain separate unchanged owners; `herdharbor-app-runtime.js` retains composition/shared services and delegates
- **Canonical state owner:** unchanged canonical HerdHarbor application state; extracted module receives `getState` and shared save/integrity helpers and creates no browser persistence or cloud state owner
- **Public entry points introduced:** `window.HerdHarborBreedingLitterRuntime.create(deps)`; existing route/form callers continue through narrow composition delegates
- **Compatibility paths retained:** manual `openOffspringCreator()` remains a compatibility fallback only; the authoritative path is `flow-phase2-lifecycle-v1.8.2.js` automatic born-offspring creation followed by `breeding-litter-workspace-integration-v1.8.2.js` / `HerdHarborBreedingWorkspace` for litter management. Profile breeding actions still route through the existing animal-action router. **Exact removal condition:** remove the manual fallback only after repository search proves there are no direct/un-enhanced litter-card callers and the deployed shell/load-order contract guarantees lifecycle + workspace integration before any litter interaction.
- **Compatibility paths removed:** monolithic breeding report-year state, gestation constants, breeding/litter UI implementations, reminder synchronization implementation, birth validation implementation, and legacy offspring creator are removed from `herdharbor-app-runtime.js`
- **Shared compatibility path intentionally retained:** `completeWorkflowTasks` remains composition-owned because Animals and Breeding/Litters both use it
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none
- **Monitoring changes:** none
- **Migration requirements:** none; static deployment must include `breeding-litter-runtime-v1.8.3.js`, which the Pages artifact gate now verifies
- **Rollback procedure:** revert PR #151 shell/module/runtime/test changes, restoring the prior monolithic breeding/litter implementation; no state/data migration rollback is required
- **Tests added:** `tests/runtime-breeding-litter-extraction-v1.8.3.test.cjs`
- **Tests modified:** breeding/birth helper regression, Junior entry-path gate, optional-tool lazy loading, stability, app compile, release-reference, Pages artifact check, and `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #243 — PASS on exact final head `70f368d6ef12df658998b777d32c11e34fe79611`; current release/security, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/architecture/config, source-mutation guard, and Android v1.8.2 review bundle all passed.
- **Manual validation still required:** exercise breeding add/edit/delete, species schedule recalculation, pregnancy results, birth linking/edit/delete, report download, reminder creation/completion, offspring creation/management, profile breeding return behavior, and weaning safeguards in deployed browser/PWA
- **Known risks:** extracted UI orchestration depends on injected shared services/load order; manual offspring creation intentionally remains only as compatibility fallback behind the canonical lifecycle/workspace integration; later extractions must not duplicate lifecycle/workspace/integrity state mutation
- **Exact requirements inherited by next phase:** preserve `HerdHarborBreedingLitterRuntime.create(deps)`, canonical lifecycle/workspace/weaning/integrity engines, shared `completeWorkflowTasks`, Phase 6B Animals/Profile contracts, Phase 6A monitoring boot contracts, prior AI/subscription/cloud contracts, and whole-app v1.8.2 identity

---

## Completed Phase 6D — Runtime extraction: Health

- **Roadmap phase:** Phase 6D — Runtime extraction: Health
- **PR number:** #153
- **PR title:** refactor: extract health record runtime domain
- **Branch:** `refactor/extract-health-runtime-domain`
- **Base branch:** `refactor/extract-breeding-litter-runtime-domain`
- **Base SHA:** `70f368d6ef12df658998b777d32c11e34fe79611`
- **Validated implementation head SHA:** `9e62af3829db47ba3aa9c6923a1b29aaad765a9f`
- **Final head SHA:** `fe6f2b956ea939d03057721751928ca4b693774c`
- **Parent PR:** #151
- **Application version:** 1.8.2
- **Component/build identities changed:** no whole-app/cloud/monitoring/Health Intelligence identity changed; new extracted component `health-runtime-v1.8.3.js?v=1` is loaded after Breeding/Litter and before composition runtime
- **Production behavior changed:** no intended health-workflow redesign; the basic Health/Weight list and basic health-record create/edit/delete form now execute from the extracted Health runtime; Health-page symptom search delegates back to the existing Symptoms route
- **Production behavior intentionally NOT changed:** canonical basic records remain `state.health`; Weight remains a `state.health` record and no duplicate weight state exists; Phase Two Current Weight still derives from canonical `state.health` using `latestWeightRecord`; `health-intelligence-v1.7.1.js` remains authoritative for episodes, structured care, group records, quarantine, triage and withdrawal context; symptom-guide filtering/rendering remains composition-owned; profile Weight/Observation vs Episode/Care routing and return surfaces are unchanged; no auth, cloud authority, medical/dosing logic, or whole-app release change
- **Files/modules now owning the feature:** `health-runtime-v1.8.3.js` owns basic Health/Weight list and record-form orchestration; `health-intelligence-v1.7.1.js` owns structured episode/care/group intelligence; `flow-phase2-v1.8.2.js` owns profile Current Weight derivation/display and profile health panel; `animal-action-router-v1.8.3.js` owns profile action routing/return surfaces; `herdharbor-app-runtime.js` retains Symptoms route and shared composition helpers and delegates basic Health runtime
- **Canonical state owner:** canonical HerdHarbor application state; `state.health` is the sole basic health/weight record owner; `state.healthIntelligence` remains the existing separate structured Health Intelligence owner; the extracted module creates no browser persistence or side state
- **Public entry points introduced:** `window.HerdHarborHealthRuntime.create(deps)`; existing route-level `renderHealth` and `openHealthForm` callers remain stable through thin composition delegates
- **Compatibility paths retained:** symptom-guide “log observation” continues through the delegated basic `openHealthForm`; profile Weight/Observation actions continue to `#health-form`; Episode/Care actions continue to `#hh-health-intelligence-modal`; existing Health Intelligence API and storage migration compatibility remain unchanged
- **Compatibility paths removed:** monolithic Health list rendering, basic health-record form implementation, weight-unit/ounces UI validation implementation, and Health-page symptom-search form implementation are removed from `herdharbor-app-runtime.js`
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none
- **Monitoring changes:** none
- **Migration requirements:** none; static deployment must include `health-runtime-v1.8.3.js`, now checked by the production Pages artifact gate
- **Rollback procedure:** revert PR #153 shell/module/runtime/test changes to restore prior monolithic basic Health runtime; no health/state data migration rollback is required because canonical state shapes are unchanged
- **Tests added:** `tests/runtime-health-extraction-v1.8.3.test.cjs`
- **Tests modified:** symptom-guide ownership regression, application-script compile, current-release asset/reference audit, production Pages artifact check, and `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #247 — PASS on exact final head `fe6f2b956ea939d03057721751928ca4b693774c`; current release/security, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/architecture/config, source-mutation guard, and Android v1.8.2 review bundle all passed.
- **Manual validation still required:** deployed-browser Health list, add/edit/delete basic record, Weight in each supported unit including lb+oz, profile Add Weight/Observation return behavior, Current Weight display after new/edit/delete weight, symptom-guide observation handoff, Health Intelligence episode/care/group/quarantine flows, and coexistence of legacy/basic and structured Health records
- **Known risks:** two health layers intentionally coexist with different scopes—`state.health` basic records and `state.healthIntelligence` structured intelligence—so later refactors must not collapse or duplicate them casually; extracted module load order/dependency injection is contractual
- **Exact requirements inherited by next phase:** preserve `HerdHarborHealthRuntime.create(deps)`, canonical `state.health` Weight ownership, Phase Two Current Weight derivation, Health Intelligence ownership/APIs, profile action return surfaces, symptom-guide behavior, prior Phase 6A-6C runtime contracts, subscription/AI/cloud protections, and whole-app v1.8.2 identity

---

## Completed Phase 6E — Runtime extraction: Tasks

- **Roadmap phase:** Phase 6E — Runtime extraction: Tasks
- **PR number:** #155
- **PR title:** refactor: extract task runtime domain
- **Branch:** `refactor/extract-task-runtime-domain`
- **Base branch:** `refactor/extract-health-runtime-domain`
- **Base SHA:** `fe6f2b956ea939d03057721751928ca4b693774c`
- **Validated implementation head SHA:** `0cabac6970fe3f012628bfaabb40fbaeefc45909`
- **Final head SHA:** `befd8cf3223191aacb641dacc1c897d134a332c4`
- **Parent PR:** #153
- **Application version:** 1.8.2
- **Component/build identities changed:** new `task-runtime-v1.8.3.js?v=1`; no whole-app/cloud/monitoring identity changed
- **Production behavior changed:** no intended task behavior redesign; recurrence calculation, deterministic next-occurrence generation, task filtering/list UI, create/edit/delete, complete/reopen, and tomorrow rescheduling now execute from the extracted Task runtime
- **Production behavior intentionally NOT changed:** canonical `state.tasks` remains sole task state owner; breeding/birth reminder production remains in Breeding/Litter runtime; dashboard/Today semantics, categories, recurrence behavior, and persistence remain unchanged; no new automation rules; release remains 1.8.2
- **Files/modules now owning the feature:** `task-runtime-v1.8.3.js` owns task-domain behavior/UI/filter state; `breeding-litter-runtime-v1.8.3.js` remains reminder producer; `herdharbor-app-runtime.js` retains composition/dashboard and thin task delegates
- **Canonical state owner:** existing HerdHarbor `state.tasks`; extracted runtime receives canonical state/save helpers and creates no secondary persistence
- **Public entry points introduced:** `window.HerdHarborTaskRuntime.create(deps)`; existing internal composition function names remain as thin delegates for dashboard/Quick Add callers
- **Compatibility paths retained:** dashboard task checkbox and Quick Add task launch continue through delegates; breeding/birth reminder tasks remain compatible canonical records
- **Compatibility paths removed:** monolithic task filter state, recurrence implementation, list/results UI, and task form implementation removed from `herdharbor-app-runtime.js`
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none
- **Monitoring changes:** none
- **Migration requirements:** none; deploy the new static Task runtime asset, verified by Pages artifact gate
- **Rollback procedure:** revert PR #155 shell/runtime/module/test changes; canonical task records require no migration rollback
- **Tests added:** `tests/runtime-task-extraction-v1.8.3.test.cjs`
- **Tests modified:** recurring-task behavioral tests, storage-efficiency ownership assertion, stability, app compile, release reference, Pages artifact gate, and `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #249 — PASS on validated implementation head `0cabac6970fe3f012628bfaabb40fbaeefc45909`; release/security, lifecycle/state-integrity, UTC and America/New_York full discovery, monitoring, source-mutation, and Android all passed. Ledger-closure head is revalidated before Phase 6F.
- **Manual validation still required:** deployed-browser task list/filtering, add/edit/delete, Today/overdue filtering, dashboard complete, tomorrow reschedule, monthly month-end recurrence, custom recurrence, reopen/recomplete idempotency, and breeding/birth reminder coexistence
- **Known risks:** Task runtime relies on injected composition services/load order; reminder producers remain separate intentionally; future Phase 9F automation must reuse this canonical task owner rather than mutate animal lifecycle state directly
- **Exact requirements inherited by next phase:** preserve `HerdHarborTaskRuntime.create(deps)`, canonical `state.tasks`, recurrence/idempotency semantics, external reminder producers, Phase 6A-6D extracted-domain contracts, subscription/AI/cloud protections, and whole-app v1.8.2 identity

---

## Completed Phase 6F — Runtime extraction: Sales / Customers / Transfers

- **Roadmap phase:** Phase 6F — Runtime extraction: Sales / Customers / Transfers
- **PR number:** #157
- **PR title:** refactor: extract sales customer transfer runtime domain
- **Branch:** `refactor/extract-sales-customer-runtime-domain`
- **Base branch:** `refactor/extract-task-runtime-domain`
- **Base SHA:** `befd8cf3223191aacb641dacc1c897d134a332c4`
- **Validated implementation head SHA:** `59778d92498c4024ae2e34de1a2c4f62d319805d`
- **Final head SHA:** `d357cded77f8b138d3c5972464ea50b0dad81ab2`
- **Parent PR:** #155
- **Application version:** 1.8.2
- **Component/build identities changed:** new static component `sales-customer-runtime-v1.8.3.js?v=1`; no whole-app, monitoring, cloud-sync, transfer-service, or Android release identity changed
- **Production behavior changed:** no intended Sales/Customers/Transfers behavior redesign; route UI/filter state, customer CRUD, sale CRUD/detail, deposits/payments, linked Budget income synchronization, sale-driven animal statuses, buyer-document printing, and legacy JSON transfer import/export compatibility now execute from the extracted Sales/Customer runtime
- **Production behavior intentionally NOT changed:** canonical sales/customer/payment/transaction/transfer/animal state shapes are unchanged; asking price remains distinct from actual sale price; hardened direct-transfer and litter-sale-transfer engines, authenticated transfer Edge Function, transfer provenance/deduplication, Free Adult/Junior animal limits, and cloud authority are unchanged; release remains 1.8.2
- **Files/modules now owning the feature:** `sales-customer-runtime-v1.8.3.js` owns route UI/filter state, customer/sale/payment workflows, buyer document printing, and legacy JSON transfer compatibility; `direct-transfer-core-v1.8.2.js` / `direct-transfer-v1.8.2.js` remain authoritative for hardened account-to-account transfer; `litter-sale-transfer-core-v1.8.2.js` / `litter-sale-transfer-v1.8.2.js` remain authoritative for litter-origin sale/transfer; `herdharbor-app-runtime.js` retains composition/shared services and delegates the extracted domain
- **Canonical state owner:** existing HerdHarbor application state arrays `state.customers`, `state.sales`, `state.payments`, `state.transactions`, `state.transfers`, and `state.animals`; extracted module receives canonical state/save/replace services and creates no browser/cloud side state
- **Public entry points introduced:** `window.HerdHarborSalesCustomerRuntime.create(deps)`; route-level composition delegates remain stable for existing callers
- **Compatibility paths retained:** legacy JSON transfer import/export remains compatibility-only and still enforces duplicate detection, record limits, animal allowance, ancestry remapping, rollback on save failure, and privacy-safe transferable fields; hardened direct transfer remains the preferred protected transfer path; buyer document/receipt/invoice behavior is unchanged
- **Compatibility paths removed:** monolithic Sales/Customers route state/UI, customer/sale/payment CRUD, payment-to-Budget synchronization, legacy transfer implementation, and buyer-document implementation are removed from `herdharbor-app-runtime.js`
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none
- **Monitoring changes:** none
- **Migration requirements:** none; deploy the extracted static runtime asset, which is included in shell/service-worker/Pages artifact checks
- **Rollback procedure:** revert PR #157 shell/module/runtime/test changes to restore the previous monolithic Sales/Customers/legacy transfer implementation; no data migration rollback is required because canonical state shapes and transfer schemas were not changed
- **Tests added:** `tests/runtime-sales-customer-extraction-v1.8.3.test.cjs`
- **Tests modified:** Junior animal-entry gating, Member cattle/transfer regression, market-analytics sale-price invariants, optional-tool transfer cleanup ownership, application-script compile, current-release reference audit, stability/shell ownership assertions, production Pages artifact check, and `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #255 — PASS on validated implementation head `59778d92498c4024ae2e34de1a2c4f62d319805d`; current release/security, lifecycle state-integrity, complete UTC and America/New_York repository discovery, monitoring build/architecture/config, source-mutation guard, and Android v1.8.2 review bundle all passed. The ledger-closure head is revalidated before Phase 6G.
- **Manual validation still required:** deployed-browser Sales/Customers list/filtering, customer add/edit/delete protection, sale create/edit/cancel/complete, asking-vs-sale price snapshot, deposits/payment edits/deletes and linked Budget income, invoices/receipts/bill of sale, direct-transfer flows, litter-origin sale/transfer, legacy JSON transfer import duplicate/limit/rollback behavior, and cattle ear-tag field preservation
- **Known risks:** two transfer paths intentionally coexist—hardened direct transfer and legacy JSON compatibility—so later cleanup must not make the compatibility path authoritative or weaken direct-transfer provenance; extracted module dependency injection/load order is contractual
- **Exact requirements inherited by next phase:** preserve `HerdHarborSalesCustomerRuntime.create(deps)`, canonical sales/customer/payment/transaction/transfer/animal state ownership, asking-price vs sale-price distinction, Budget payment synchronization, direct-transfer provenance/deduplication, litter-sale transfer protections, Free Adult/Junior limits, prior Phase 6A-6E runtime contracts, subscription/AI/cloud protections, and whole-app v1.8.2 identity

---

## Completed Phase 6G — Runtime extraction: Production / Reporting

- **Roadmap phase:** Phase 6G — Runtime extraction: Production / Reporting
- **PR number:** #159
- **PR title:** refactor: extract production and reporting runtime domain
- **Branch:** `refactor/extract-production-reporting-runtime-domain`
- **Base branch:** `refactor/extract-sales-customer-runtime-domain`
- **Base SHA:** `d357cded77f8b138d3c5972464ea50b0dad81ab2`
- **Validated implementation head SHA:** `c73fbd8a7a1b20cf197eb8c91bb79de1ace8864d`
- **Final implementation head SHA:** `c73fbd8a7a1b20cf197eb8c91bb79de1ace8864d`
- **Parent PR:** #157
- **Application version:** 1.8.2
- **Component/build identities changed:** new static component `production-reporting-runtime-v1.8.3.js`; no whole-app, monitoring, cloud-sync, subscription, or Android release identity changed
- **Extracted ownership:** Budget route/filter state; monthly and annual budget plan UI helpers; Production record CRUD; linked Production-sale income synchronization; expense/income transaction forms; Production timeline/comparison/warning calculations; printable Production reporting; Budget CSV export; and Excel Production report launch wiring now live in `production-reporting-runtime-v1.8.3.js`
- **Canonical state owners:** existing HerdHarbor application state remains authoritative for `state.productionRecords`, `state.transactions`, `state.budgetPlans`, `state.annualBudgetPlans`, `state.budgetMonthSettings`, and `state.animals`; the extracted runtime receives canonical services and creates no secondary persistence
- **Public entry points introduced:** `window.HerdHarborProductionReportingRuntime.create(deps)`; existing composition delegates remain stable for current callers
- **Compatibility paths retained:** dashboard-level finance summary/composition helpers remain injected; payment-linked transaction edits continue through the Sales/Customer runtime; existing CSV/printable report behavior remains compatible
- **Compatibility paths removed:** monolithic Production/Budget/reporting route state, record CRUD, linked-income synchronization, report calculations, and report-launch implementation were removed from `herdharbor-app-runtime.js` where ownership moved to the extracted runtime
- **Optional tooling:** ExcelJS, JSZip, and spreadsheet-import remain lazy-loaded; the extracted runtime calls `ensureSpreadsheetToolsReady()` only when an Excel report is requested
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none
- **Monitoring changes:** none
- **Migration requirements:** none; deploy the extracted static runtime asset, which is included in shell/service-worker/Pages artifact ownership checks
- **Rollback procedure:** revert PR #159 shell/module/runtime/test changes to restore prior monolithic Production/Reporting ownership; no data migration rollback is required because canonical state shapes were not changed
- **Tests added:** `tests/runtime-production-reporting-extraction-v1.8.3.test.cjs`
- **Tests modified:** Production/Sales, Production reports, budget-year/hay, optional-tool lazy-loading, app compile, shell decomposition, stability/release reference, service-worker/Pages artifact coverage, and `package.json` v1.8.3 development gate
- **Regression repair:** `tests/production-sales.test.cjs` now injects the required `$$` selector dependency; the runtime contract was not weakened
- **Full CI result:** Alpha v1.8.2 CI #266 — PASS on validated implementation head `c73fbd8a7a1b20cf197eb8c91bb79de1ace8864d`; release/security, lifecycle/state-integrity, complete UTC and America/New_York discovery, monitoring build/architecture/configuration, source-mutation guard, and Android v1.8.2 review bundle all passed
- **Manual validation still required:** deployed-browser Budget filters/month/year behavior; Production add/edit/delete/repeat-entry; linked income creation/update/removal; printable Production report; CSV export; Excel report lazy-load/launch; production allocation/waste warnings; and responsive route behavior
- **Known risks:** extracted runtime depends on injected composition services and script load order; Budget/Production calculations share canonical transaction data with Sales/Customers and must not gain a parallel financial store; spreadsheet tooling must remain optional
- **Exact requirements inherited by Phase 6H:** preserve `HerdHarborProductionReportingRuntime.create(deps)`, all Phase 6B-6F extracted runtime APIs, canonical state ownership, optional-tool lazy loading, animal-action router behavior, monitoring startup behavior, cloud/subscription/Paper Pedigree AI contracts, PWA/service-worker order, and whole-app v1.8.2 identity; remove compatibility paths only after repository-wide caller proof



---

## Completed Phase 6H — Runtime decomposition: Settings / final runtime cleanup

- **Roadmap phase:** Phase 6H — Settings / final runtime decomposition
- **PR number:** #161
- **PR title:** refactor: complete application runtime domain decomposition
- **Branch:** `refactor/complete-application-runtime-decomposition`
- **Base branch:** `refactor/extract-production-reporting-runtime-domain`
- **Base SHA:** `bd56f186174211b160f21f87b353e586d068fc85`
- **Validated implementation head SHA:** `274615228d06ac99f3f045277cef127c3efc7def`
- **Parent PR:** #159
- **Application version:** 1.8.2
- **Component/build identities changed:** new static component `settings-runtime-v1.8.3.js?v=1`; no whole-app, cloud-sync, monitoring, subscription, or Android release identity changed
- **Extracted ownership:** Settings route rendering, operation-profile editing, rabbitry branding UI, feedback/account-deletion UI, Settings-owned membership/sync/storage/appearance/Market Analytics/install/demo/resources/export-import orchestration, and Settings event wiring now live in `settings-runtime-v1.8.3.js`
- **Canonical state owners:** existing HerdHarbor application state and existing domain services remain authoritative; Settings receives canonical services and creates no secondary persistence, cloud, subscription, market, storage, import/export, or financial store
- **Public entry points introduced:** `window.HerdHarborSettingsRuntime.create(deps)`; composition keeps narrow `renderSettings()` and feedback delegation for existing callers
- **Compatibility paths retained:** generic theme/navigation/bootstrap helpers remain composition-owned; spreadsheet/import/export/cloud/PWA/membership/Market services remain their existing owners and are injected/delegated
- **Compatibility paths removed:** monolithic Settings route markup/event implementation and Settings-local profile/branding/feedback/account-deletion behavior were removed from `herdharbor-app-runtime.js`
- **Optional tooling:** ExcelJS/JSZip/spreadsheet import remain lazy-loaded through the existing optional-tool service
- **Database/schema changes:** none
- **Edge Function changes:** none
- **Environment variables/secrets required:** none added
- **Monitoring changes:** none
- **Migration requirements:** none; deploy the new static Settings runtime asset, included in shell/service-worker/Pages artifact checks
- **Rollback procedure:** revert PR #161 runtime/shell/test changes to restore Settings ownership to the composition runtime; no data migration rollback is required
- **Tests added:** `tests/runtime-settings-extraction-v1.8.3.test.cjs`
- **Tests modified:** compile, release-reference, shell-decomposition, launch-hardening, optional-tools, phase2 release, stability, storage-efficiency, Pages artifact coverage, and `package.json` v1.8.3 development gate
- **Full CI result:** Alpha v1.8.2 CI #270 — PASS on validated implementation head `274615228d06ac99f3f045277cef127c3efc7def`; ledger-closure head must also pass before Phase 7 branches
- **Manual validation still required:** Settings route on supported mobile/desktop widths; operation profile edit; logo upload/remove; theme/weight preference; Market Analytics consent; sync-now/status refresh; device storage summary; backup/export/import; spreadsheet lazy-load actions; feedback and account deletion launch
- **Known risks:** Settings depends on injected composition/domain services and script load order; cross-domain services must remain authoritative outside Settings; whole-app release remains 1.8.2
- **Exact requirements inherited by Phase 7:** preserve all Phase 6B-6H extracted runtime APIs, canonical domain ownership, optional-tool lazy loading, animal-action router behavior, monitoring startup behavior, cloud/subscription/Paper Pedigree AI contracts, PWA/service-worker order, normalized-sync default-off guardrails, and whole-app v1.8.2 identity
