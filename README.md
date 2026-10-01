# HerdHarbor

HerdHarbor is an installable farm management application for breeders, homesteaders, and small farms, with specialized depth in rabbit management.

## Platform

HerdHarbor brings farm records into one account-based application, including:

- animal profiles, identification, status, photos, parentage, and history
- breeding, pregnancy, birth, litter, offspring, weaning, and pedigree workflows
- rabbit genetics plus multi-species genetics/reference support
- health records, measurements, health insights, and an educational symptom guide
- tasks and recurring work
- production, hay, budgeting, profitability, analytics, and reporting
- customers, reservations, sales, payments, transfers, invoices, receipts, and printable records
- spreadsheet import/export and downloadable safety backups
- protected cloud synchronization, conflict handling, cross-device recovery, and offline use
- installable web-app support plus the Android Trusted Web Activity package

## Product positioning

HerdHarbor is a farm management app. Rabbit management is the product's strongest specialty, especially breeding, litters, pedigrees, genetics, and rabbit-focused record workflows.

The application can store records for multiple supported livestock species, but product-facing copy should not describe HerdHarbor solely as a rabbitry app or expose internal engine/runtime/module version labels.

## Accounts and subscriptions

Public account paths include Junior and Member. Business remains unavailable until its separate release is complete.

Founder is an eligibility-controlled membership tier and is not a public signup choice. Eligible Founder accounts retain their protected Founder billing rate; ordinary accounts cannot select Founder pricing.

Referral IDs are optional. Qualified referrals earn stackable Member-month credits under the backend referral policy. Subscription and payment state is server-authoritative and subscription changes do not delete stored farm records.

## Data-safety architecture

HerdHarbor keeps an offline working copy for responsive local use while protecting signed-in cloud data with serialized writes, compare-and-swap conflict checks, protected merge behavior, dirty-state tracking, account-generation fences, and bounded recovery snapshots.

Authentication and Supabase data requests are not cached by the service worker. Existing account-boundary protections prevent one signed-in account from adopting another account's local state.

Normal account recovery and application updates must not require members to clear browser/site storage manually.

## AI-assisted workflows

Some AI-assisted capabilities are production-deployed but controlled-access. A release-version change does not make hidden capabilities public.

AI-assisted extraction must remain review-first and cannot bypass the canonical Animal, Health, Breeding, or pedigree save owners. Provider credentials remain server-side, image usage is quota-guarded, and failure paths must fail closed without corrupting canonical farm records.

See `V2.0.0-PRODUCTION-RELEASE-CONTRACT.md` for the current release boundary.

## Stable component identities

Established runtime components may keep older component identities in filenames when the component itself has not been replaced. They are compatibility identifiers, not normal user-facing product versions.

Historical SQL migration files and historical release documentation remain intact as implementation history.

## Development and verification

Node.js 22 or newer is required for repository tooling.

- `npm ci` installs pinned build/monitoring dependencies.
- `npm test` runs the complete repository test suite.
- `npm run test:v2.0.0` runs the current stable release regression and release-reference audit.
- `npm run test:release` runs the repository security audit and current release identity gate.
- `npm run test:state-integrity` runs the lifecycle state-integrity E2E gate.

The current release gate intentionally inherits earlier behavioral regression coverage instead of deleting proven tests when the whole-app release changes.

Production secrets are supplied through approved GitHub/Supabase environments and are never committed to browser source.

## Install and deployment

The production application is served from `https://app.herdharbor.com`.

On iPhone/iPad, Safari can install the web app through **Share → Add to Home Screen**. Other supported browsers can use HerdHarbor's **Install app** control or their browser installation option.

Production deployment is performed from an explicitly reviewed `main` commit through the protected release workflow. A PR or release document alone does not mean that version is live.
