# HerdHarbor Alpha v1.8.4

HerdHarbor is an installable livestock and farm recordkeeping application in active alpha development. The current release is **Alpha v1.8.4**.

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

## Alpha v1.8.4 consolidated release

The current release formalizes Cloud Sync V2, lifecycle state-integrity safeguards, and the production subscription/account layer without replacing HerdHarbor authentication, membership storage, or established domain engines. Cloud Sync V2 keeps normal edits protected locally first, retries recoverable cloud work automatically, and reserves the Needs attention state for true conflicts or non-recoverable failures.

Public account plans are:

- **Junior — Free**
- **Member — $14.99/month**
- **Business — Coming Soon**

Founder is an internal entitlement and is not a public signup choice.

Eligible adult accounts receive one calendar month of Member trial access based on the authenticated backend account creation time. No credit card is required to begin the trial. If Member access later ends, eligible adult accounts fall back non-destructively to Free Adult; existing records remain available and Free Adult permits up to five active animals for new growth. Junior remains a separate account path.

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

Existing farm records are not deleted when a subscription changes. Free Adult preserves existing adult records while enforcing the five-active-animal growth ceiling; Junior remains separately governed.

## Versioned runtime modules

The repository intentionally contains some runtime modules with older version numbers in their filenames. Those files are established domain engines that remain part of v1.8.3—for example the v1.6.1 analytics/rabbit-genetics layers and v1.7.x standards, health, and multi-species genetics layers. They should not be renamed or removed solely because their filename predates v1.8.3.

Likewise, historical SQL files under `supabase/` are migration lineage and are retained even when their filenames contain earlier release numbers.

The authoritative current release identity is defined by the v1.8.4 build, manifest, package, PWA, Android, monitoring, and CI/deployment configuration.

## Development and verification

Node.js 22 or newer is required for repository tooling.

- `npm ci` installs the pinned monitoring/build dependencies.
- `npm test` runs the complete regression suite.
- `npm run test:v1.8.4` runs the complete v1.8.3 development/release regression layer on top of the retained v1.8.2 compatibility gates.
- `npm run test:release` verifies the current v1.8.4 repository identity and hardening contract.
- `.github/workflows/v1.8.4-ci.yml` is the consolidated pull-request CI workflow.
- `.github/workflows/v1.8.4-production-pages.yml` is the authoritative monitored GitHub Pages publisher.
- `.github/workflows/v1.8.4-production-acceptance.yml` provides explicit manual production acceptance checks.

Production secrets are supplied by the approved GitHub/Supabase environments and are never committed to source control. The checked-in monitoring configuration intentionally contains a blank DSN and is replaced during the production build.

## Install and deployment

The live application is served from `https://app.herdharbor.com`. The custom domain is configured by `CNAME`, and production static assets are published from the exact reviewed `main` commit through GitHub Pages.

On iPhone/iPad, use Safari **Share → Add to Home Screen**. Other supported browsers can use HerdHarbor's **Install app** control or their browser installation option.

## Tester guidance

Keep periodic downloaded backups for important records, confirm cloud sync before switching devices, review spreadsheet imports before committing them, and do not clear browser/site data while unsynced changes are present. The Symptom Guide is educational and does not diagnose or replace licensed veterinary care.

See `RELEASE_NOTES-v1.8.4.md` for the current release contract.
