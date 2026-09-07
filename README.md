# HerdHarbor Alpha v1.8.1

HerdHarbor is an installable livestock and farm recordkeeping application in active alpha development. The current release is **Alpha v1.8.1**.

## Current platform

HerdHarbor combines animal records, breeding, pedigrees, genetics, health, shows, production, sales, budgeting, tasks, analytics, cloud synchronization, backups, and an installable PWA/Android experience in one account-based application.

Key capabilities include:

- Animal profiles and searchable livestock records with species-aware fields, photos, status, parentage, and history.
- Breeding and birth/litter workflows with due dates, pregnancy checks, offspring creation, weaning, and pedigree links.
- Rabbit genetics plus the established multi-species genetics architecture, ARBA standards/reference tooling, shows, and youth-show guidance.
- Health records, measurements, health intelligence, and an educational symptom guide with emergency red-flag safeguards.
- Production, sales, customer, payment, budgeting, task, and analytics workflows with spreadsheet import/export and printable records.
- Offline-first local operation with protected cloud synchronization, conflict detection, recovery snapshots, downloadable backups, and safe update handling.
- Installable web app support plus the Android Trusted Web Activity package.

## Alpha v1.8.1 subscription and account release

The current release adds the production subscription-launch layer around the established v1.8.0 Subscription Engine without replacing HerdHarbor authentication or membership storage.

Public account plans are:

- **Junior — Free**
- **Member — $14.99/month**
- **Business — Coming Soon**

Founder is an internal entitlement and is not a public signup choice.

The September 2026 launch trial provides Member-level access through September 30. The subscription hard launch is October 1, 2026 at 12:00 AM Eastern. Accounts without another qualifying entitlement fall back to Junior rather than losing stored records.

### Referrals and Member credits

- Referral IDs are optional during signup; leaving the field blank never blocks registration.
- A referral is attached to the referred account at signup but does not qualify from the initial subscription payment.
- The referral qualifies after the referred Member's first successful monthly renewal.
- Every five qualified referrals earns one stackable Member-month subscription credit.
- Admin-granted Member credits use the same auditable credit system and do not create fake Stripe payments.
- Available credits can cover a future monthly renewal without shifting the Member's billing-cycle anchor.

## Registration safety

New account holders are required to self-report an age of 18 or older and provide the registration profile fields required by the v1.8.1 signup policy. Youth use is supported through an adult-managed account with the required parent/legal-guardian supervision or approval attestation.

This is an age gate and account-holder attestation system, not government-ID identity verification. Full date of birth is used to calculate age during registration but is not retained in the server-side registration profile.

## Data-safety architecture

HerdHarbor keeps an offline working copy for responsive local use and protects signed-in cloud data with serialized writes, compare-and-swap conflict checks, three-way merge behavior, dirty-state tracking, and bounded IndexedDB recovery snapshots. Authentication and Supabase data requests are not cached by the service worker; only the static application shell is cached.

Existing farm records are not deleted when a subscription changes. Junior limits new active-animal transitions while preserving previously stored records.

## Versioned runtime modules

The repository intentionally contains some runtime modules with older version numbers in their filenames. Those files are established domain engines that remain part of v1.8.1—for example the v1.6.1 analytics/rabbit-genetics layers and v1.7.x standards, health, and multi-species genetics layers. They should not be renamed or removed solely because their filename predates v1.8.1.

Likewise, historical SQL files under `supabase/` are migration lineage and are retained even when their filenames contain earlier release numbers.

The authoritative current release identity is defined by the v1.8.1 build, manifest, package, PWA, Android, monitoring, and CI/deployment configuration.

## Development and verification

Node.js 22 or newer is required for repository tooling.

- `npm ci` installs the pinned monitoring/build dependencies.
- `npm test` runs the complete regression suite.
- `npm run test:v1.8.1` runs the current subscription/account release regressions.
- `npm run test:release` verifies the current v1.8.1 repository identity and hardening contract.
- `.github/workflows/v1.8.1-ci.yml` is the consolidated pull-request CI workflow.
- `.github/workflows/v1.8.1-production-pages.yml` is the authoritative monitored GitHub Pages publisher.
- `.github/workflows/v1.8.1-production-acceptance.yml` provides explicit manual production acceptance checks.

Production secrets are supplied by the approved GitHub/Supabase environments and are never committed to source control. The checked-in monitoring configuration intentionally contains a blank DSN and is replaced during the production build.

## Install and deployment

The live application is served from `https://app.herdharbor.com`. The custom domain is configured by `CNAME`, and production static assets are published from the exact reviewed `main` commit through GitHub Pages.

On iPhone/iPad, use Safari **Share → Add to Home Screen**. Other supported browsers can use HerdHarbor's **Install app** control or their browser installation option.

## Tester guidance

Keep periodic downloaded backups for important records, confirm cloud sync before switching devices, review spreadsheet imports before committing them, and do not clear browser/site data while unsynced changes are present. The Symptom Guide is educational and does not diagnose or replace licensed veterinary care.

See `RELEASE_NOTES-v1.8.1.md` for the current release contract.
