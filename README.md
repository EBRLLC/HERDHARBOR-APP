# HerdHarbor Alpha v1.8.2

HerdHarbor is an installable livestock and farm recordkeeping application in active alpha development. The current release is **Alpha v1.8.2**.

## Current platform

HerdHarbor combines animal records, breeding, pedigrees, genetics, health, shows, production, sales, budgeting, tasks, analytics, cloud synchronization, backups, and an installable PWA/Android experience in one account-based application.

Alpha v1.8.2 closes out the animal-first workflow work that accumulated on top of v1.8.1. Key capabilities now include:

- Full-page animal profiles with Overview, Health, Breeding, Genetics, Pedigree, Shows, Production, and History context.
- Continuous breeding lifecycle from pairing through pregnancy checks, birth/litter management, weaning, evaluation, sale, and member transfer.
- Automatic offspring profiles at birth plus a breeder-first Litter Workspace for weights, health, loss records, weaning, evaluation, sales, and transfers.
- Breeding next-action guidance and historical breeding performance analytics built from canonical HerdHarbor records.
- Rabbit Genetics V2 evidence, automatic inheritance, breeding-goal mate planning, proof-breeding guidance, and automatic learning from recorded offspring.
- Secure member-to-member animal/pedigree transfers, Health Intelligence, Shows/standards, production, sales, budgeting, analytics, and protected cloud synchronization.
- Installable web app support with a mobile web install entry owned by the canonical PWA controller, plus the Android Trusted Web Activity package.

## Subscription and account policy carried forward

Alpha v1.8.2 preserves the approved v1.8.1 subscription/account policy and does not move the October launch date.

Public account plans are:

- **Junior — Free**
- **Member — $14.99/month**
- **Business — Coming Soon**

Founder remains an internal entitlement and is not a public signup choice.

The September 2026 launch trial provides Member-level access through September 30. The subscription hard launch remains **October 1, 2026 at 12:00 AM Eastern**. Accounts without another qualifying entitlement fall back to Junior rather than losing stored records.

### Referrals and Member credits

- Referral IDs are optional during signup; leaving the field blank never blocks registration.
- A referral is attached to the referred account at signup but does not qualify from the initial subscription payment.
- The referral qualifies after the referred Member's first successful monthly renewal.
- Every five qualified referrals earns one stackable Member-month subscription credit.
- Admin-granted Member credits use the same auditable credit system and do not create fake Stripe payments.
- Available credits can cover a future monthly renewal without shifting the Member's billing-cycle anchor.

## Registration safety

New account holders are required to self-report an age of 18 or older and provide the registration profile fields required by the existing signup policy. Youth use is supported through an adult-managed account with the required parent/legal-guardian supervision or approval attestation.

This is an age gate and account-holder attestation system, not government-ID identity verification. Full date of birth is used to calculate age during registration but is not retained in the server-side registration profile.

## Data-safety architecture

HerdHarbor keeps an offline working copy for responsive local use and protects signed-in cloud data with serialized writes, compare-and-swap conflict checks, three-way merge behavior, dirty-state tracking, and bounded IndexedDB recovery snapshots. Authentication and Supabase data requests are not cached by the service worker; only the static application shell is cached.

The v1.8.2 mobile install entry is deliberately implemented in `pwa.js`, which already owns install prompting, iOS guidance, standalone detection, service-worker updates, and `HerdHarborPWA.install()`. It is not implemented in `herdharbor-build.js`, so the install affordance does not participate in the authentication/bootstrap path that caused the earlier mobile regression.

Existing farm records are not deleted when a subscription changes. Junior limits new active-animal transitions while preserving previously stored records.

## Versioned runtime modules

The repository intentionally contains runtime modules with older version numbers in their filenames. Those files are established domain engines that remain part of v1.8.2—for example the v1.6.1 analytics/rabbit-genetics layers, v1.7.x standards/health foundations, and v1.8.1 subscription/account layers. They should not be renamed or removed solely because their filename predates v1.8.2.

Likewise, historical SQL files under `supabase/` are migration lineage and are retained even when their filenames contain earlier release numbers.

The authoritative current release identity is defined by the v1.8.2 build, web manifests, package metadata, PWA shell, Android/TWA package, monitoring configuration, and CI/deployment configuration.

## Development and verification

Node.js 22 or newer is required for repository tooling.

- `npm ci` installs the pinned monitoring/build dependencies.
- `npm run test:v1.8.2` runs the focused current-release regression set.
- `npm run test:release` verifies the v1.8.2 identity, release hardening, and mobile-install architecture contract.
- Pull-request CI additionally runs every `tests/*.test.cjs` file in UTC and America/New_York.
- `.github/workflows/v1.8.2-ci.yml` is the consolidated pull-request CI workflow.
- `.github/workflows/v1.8.2-production-pages.yml` is the authoritative monitored GitHub Pages publisher.
- `.github/workflows/v1.8.2-production-acceptance.yml` provides explicit manual production acceptance checks.

Production secrets are supplied by the approved GitHub/Supabase environments and are never committed to source control. The checked-in monitoring configuration intentionally contains a blank DSN and is replaced during the production build.

## Install and deployment

The live application is served from `https://app.herdharbor.com`. The custom domain is configured by `CNAME`, and production static assets are published from the exact reviewed `main` commit through GitHub Pages.

On iPhone/iPad, HerdHarbor exposes an **Add to Home Screen** entry that routes to Safari installation guidance. On supported Android/Chromium browsers, the mobile **Install app** entry uses the browser's install prompt when available and falls back to the browser menu when needed. Installed/standalone sessions do not show the mobile install entry.

## Tester guidance

Keep periodic downloaded backups for important records, confirm cloud sync before switching devices, review spreadsheet imports before committing them, and do not clear browser/site data while unsynced changes are present. The Symptom Guide is educational and does not diagnose or replace licensed veterinary care.

See `RELEASE_NOTES-v1.8.2.md` for the current release contract.
