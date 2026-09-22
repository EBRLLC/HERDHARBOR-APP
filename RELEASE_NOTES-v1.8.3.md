# HerdHarbor Alpha v1.8.3

HerdHarbor Alpha v1.8.3 is the formal release that consolidates the completed roadmap work stacked above Alpha v1.8.2. This release changes the whole-application identity to v1.8.3 while intentionally preserving stable component filenames and established domain engines.

## Controlled normalized-sync rollout guardrails

The normalized-sync foundation now includes deterministic cohort gating, rollout-stage policy, safe reconciliation metrics, promotion/rollback controls, shadow bootstrap support, dual-write coordination, normalized-read fallback, and a read-only schema preflight.

Normalized sync is **not** mass-enabled by this release. Legacy full-state sync remains the production authority unless a separate controlled rollout explicitly applies the required schema, passes preflight/reconciliation criteria, and intentionally promotes the rollout stage. Legacy rollback remains available.

## Animal-first workflow consolidation

Animal-specific work routes through the canonical animal profile and shared action router. Existing Health, Breeding, Pedigree, Shows, and other domain owners remain authoritative; the profile does not create parallel record stores.

## Trial, Member, Free Adult, and Junior behavior

Eligible adult accounts receive one calendar month of Member trial access from trusted backend account data. Browser/local state cannot manufacture or extend trial authority. No credit card is required to begin the trial.

If adult Member access ends, eligible accounts fall back to Free Adult without deleting herd records. Free Adult allows up to five active animals for new growth while an existing over-limit herd can still be managed and reduced. Junior remains a separate account path. Stripe checkout and webhook handling preserve protected Owner/Admin/Founder/manual-override authority and remain fail-open to core app startup.

## Paper Pedigree AI hardening

Paper Pedigree AI remains a review-first workflow. Image analysis creates a draft for user review and confirmation before canonical pedigree/animal records are changed. Provider failures and uncertain fields do not silently mutate farm state.

## Startup and performance

Monitoring initialization no longer blocks core application startup. Spreadsheet/Excel tooling remains lazy-loaded and is not restored to unconditional startup.

## Runtime decomposition

The large application runtime has been decomposed into dedicated v1.8.3 runtime owners for Animals/Profile, Breeding/Litter, Health, Tasks, Sales/Customers/Transfers, Production/Reporting, and Settings. Canonical application state and existing specialized engines remain authoritative; decomposition does not create duplicate stores.

## Help Center

The in-app How To Center is current for v1.8.3 and includes direct guides for animal entry/editing, pedigrees, breeding/pregnancy/litters, Health/weights, sales/transfers, spreadsheet workflows, QR use, sync/retry/backup/recovery, subscription states, and account basics. Help navigation is included in the offline-capable shell.

## Compatibility and retained components

Stable older-named files remain intentionally carried forward, including established v1.6.x/v1.7.x engines and v1.8.1/v1.8.2 components. Component filenames are not renamed merely to match the whole-app version.

Cloud Sync V2 lifecycle/state-integrity, transfer provenance/deduplication, canonical Health weight ownership, task recurrence/idempotency, subscription authority, privacy-safe monitoring, optional-tool lazy loading, and Paper Pedigree confirmation-before-mutation remain protected contracts.

## Platform/release identity

- Web/package/PWA/manifest: Alpha v1.8.3
- Release build ID: `alpha-v1.8.3-release-1`
- Android/TWA: versionName/appVersion 1.8.3, versionCode/appVersionCode 17
- Monitoring release: `HerdHarbor@1.8.3`
- CI/deployment workflows: v1.8.3 release workflow set

## Deferred production authority

The normalized-sync architecture is present for controlled rollout, but unrestricted normalized production authority remains intentionally deferred until schema application, preflight, cohort evidence, reconciliation, and explicit stage promotion prove it safe.

## Verification

The formal release gate requires repository security audit, release-identity checks, lifecycle/state-integrity, complete UTC and America/New_York regression discovery, monitoring build/configuration/privacy checks, source-mutation cleanliness, Pages artifact checks, and Android release-bundle review.
