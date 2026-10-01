# HerdHarbor 2.0.0

HerdHarbor 2.0.0 is the stable production release of the HerdHarbor farm management application, with specialized rabbit-management workflows.

## Production capabilities

HerdHarbor 2.0.0 includes the production systems already carried by the current application:

- animal and farm record management
- rabbit-focused breeding, litter, pedigree, and genetics workflows
- health records and health insights
- tasks and recurring work
- sales and customer records
- production, profitability, analytics, and reporting tools
- protected account access and cross-device cloud synchronization
- local recovery and conflict-handling protections
- subscription billing, Founder eligibility, Junior access, referrals, and subscription credits
- installable web application support for desktop and mobile
- Android Trusted Web Activity packaging
- production monitoring and release telemetry

## Cloud-sync authority

The 2.0.0 application does not automatically mass-enable normalized sync or remove the retained recovery path. Normalized-sync rollout remains controlled by the existing readiness, cohort, reconciliation, dual-write, fallback, and rollback contracts. Legacy full-state recovery remains retained unless an explicitly reviewed rollout advances an eligible account.

No production schema migration or sync-cohort expansion is triggered merely by changing the whole-app version to 2.0.0.

## AI-assisted workflows

The repository contains production-deployed AI-assisted capabilities, but the 2.0.0 version promotion does not make hidden capabilities public by itself.

- Paper Pedigree photo reading is production-hardened behind authenticated processing, explicit review, quota, provenance, duplicate/conflict, and fail-closed validation controls. Its AI read action remains unavailable to standard accounts unless the existing controlled-access gate enables it.
- Voice-assisted entry remains production-deployed but controlled-access only. It prepares review drafts and does not directly persist canonical farm records.
- Photo-assisted record entry remains production-deployed but controlled-access only. It prepares review drafts and hands final saves to canonical Animal or Health forms.
- AI image usage controls remain active with per-user and global daily safeguards.
- Multi-photo pedigree merging remains deferred until deterministic provenance and conflict-presentation contracts exist.

No hidden AI capability should be advertised as generally available until its separate public-release decision is completed.

## Stable component identities

The whole application is version 2.0.0. Established internal component filenames and independent component versions are retained where the component itself has not been replaced. A file carrying a v1.8.x, v1.7.x, or v1.6.x component identity is not stale solely because the whole application is now 2.0.0.

Normal member-facing UI should show product feature names rather than internal engine, runtime, module, adapter, or build versions. Settings/About may show the whole-app version for support.

## Release identity

- whole-app version: 2.0.0
- release channel: stable
- canonical build ID: `v2.0.0-release-1`
- Android versionName: 2.0.0
- Android versionCode: 19
- Android package: `com.ebrllc.herdharbor`
- monitoring release: `HerdHarbor@2.0.0`

The PWA/service-worker cache identity is promoted in the dedicated 2.0.0 PWA cutover phase rather than being changed implicitly by this contract phase.

## Release safety

The release remains blocked by any unresolved data-loss path, account-boundary violation, stale-client overwrite risk, destructive billing transition, broken update path, weakened security/RLS control, or required regression failure.

Historical release documents remain historical records and are not rewritten to pretend older releases were 2.0.0.
