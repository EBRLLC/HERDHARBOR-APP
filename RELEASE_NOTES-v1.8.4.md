# HerdHarbor Alpha v1.8.4

Alpha v1.8.4 is a production-stability release built on the v1.8.3 application and domain architecture.

## What changed

- normalized-sync rollout readiness is explicitly bound to schema/RLS/RPC preflight, cohort gating, bootstrap, reconciliation, dual-write degradation handling, normalized-read fallback, guarded writer preparation, adjacent rollback, and retained legacy recovery
- cloud-sync telemetry now reports the correct whole-app release identity and preserves provider/runtime exception provenance without manufacturing monitoring stacks
- cross-device lifecycle/state-integrity regressions remain protected for breeding, litter, offspring, weight, sale, transfer, conflicts, tombstones, recovery, and task recurrence
- PWA/service-worker update behavior is locked to explicit waiting-worker activation, scoped shell-cache rotation, network-first release assets, offline shell fallback, and same-origin GET-only cache handling
- authentication architecture remains frozen and regression-protected for startup, session restoration, deadlock prevention, bounded auth requests, and one canonical Supabase browser client
- subscription/payment-state behavior remains non-destructive across checkout failure, renewal failure, cancellation, Free Adult fallback, protected roles, Junior, Founder/manual authority, referrals, and backend-owned trial state
- one aggregate v1.8.4 end-to-end release-regression gate binds the critical user journeys together
- runtime efficiency hardening reduces mandatory PWA precache scope, keeps optional assets runtime-cacheable, and removes eager voice/photo AI loading for non-test users

## Production authority

Normalized sync is **not mass-enabled** by this release. Legacy full-state sync remains the authoritative recovery path unless an explicitly controlled operator rollout advances an eligible cohort through the documented adjacent stages.

No production schema is applied automatically by the application release. No cohort is enabled automatically.

## AI live testing

AI production code remains deployed in v1.8.4 for controlled live testing. Voice-assisted entry and photo-assisted entry are hidden from ordinary users and lazy-load only after explicit tester enablement. Paper Pedigree remains deployed while its AI-read action is hidden from non-test browsers.

The public AI launch remains deferred to v2.0.1. v1.8.4 is the controlled production-test period, not the public AI release.

## Stable component identities

Carried-forward engine/module filenames retain their established component versions. Files named v1.8.3, v1.8.2, v1.8.1, v1.7.x, or v1.6.x are not renamed solely because the whole application is now Alpha v1.8.4.

## Release identity

- web/package/manifest: 1.8.4
- build ID: `alpha-v1.8.4-release-1`
- Android versionName: 1.8.4
- Android versionCode: 18
- monitoring release: `HerdHarbor@1.8.4`
- PWA shell: `herdharbor-shell-v1.8.4-alpha-v1.8.4-release-1`

## Review and deployment

This release is delivered through the stacked v1.8.4 stability PR series. PRs are not auto-merged. Production deployment and optional production-acceptance workflows remain separate reviewed actions.
