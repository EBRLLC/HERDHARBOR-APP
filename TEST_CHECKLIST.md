# HerdHarbor Alpha v1.8.1 Acceptance Checklist

This checklist covers the current v1.8.1 release contract. Automated checks are authoritative where available; manual checks cover browser/device behavior that CI cannot fully prove.

## Release identity

- Confirm `herdharbor-build.js`, `manifest.json`, `package.json`, `package-lock.json`, Android Gradle metadata, TWA metadata, PWA fallback metadata, monitoring metadata, README, and release notes all identify Alpha v1.8.1.
- Confirm the service-worker cache name uses the current v1.8.1 build ID and old HerdHarbor shell caches are removed on activation.
- Confirm the installed PWA displays Version 1.8.1 and the current build identifier in Settings/install status.

## Authentication and registration safety

- Sign in with an existing account and confirm no stale auth overlay or deadlock blocks the application.
- Sign out and sign back in after a hard refresh and after service-worker activation.
- Start a new signup and confirm legal first name, legal last name, date of birth, phone, country, region, postal code, optional organization, intended-use selection, and required attestations are present.
- Enter an under-18 date of birth and confirm signup is blocked with adult account-holder/parent-or-guardian guidance.
- Confirm youth use requires the adult/guardian supervision or approval attestation.
- Confirm full date of birth is not retained in the server-side registration profile.
- Confirm existing grandfathered accounts are not forced through the new registration-completion gate.
- Confirm registration/profile overlays reuse `window.HerdHarborCloud` and do not create a second browser Supabase client.

## Subscription launch policy

- Confirm public choices are Junior and Member, with Business visible only as Coming Soon when shown.
- Confirm Founder is not a public signup or checkout option.
- Confirm Member price is $14.99/month and the subscription renews month-to-month on the Stripe billing-cycle anchor.
- Before October 1, 2026 at 12:00 AM Eastern, confirm qualifying September accounts receive Member-level launch-trial access through September 30.
- At/after hard launch, confirm an account without a paid/manual/credit entitlement falls back to Junior without losing stored records.
- Confirm owner/admin and valid protected/manual entitlements are not downgraded by the launch policy.

## Stripe billing

- Start Member checkout and confirm Stripe Checkout opens successfully.
- Complete a controlled test/approved checkout and confirm webhook-synchronized paid state returns to HerdHarbor without a temporary Junior downgrade.
- Open Customer Portal and confirm the current subscription can be managed there.
- Cancel/reactivate in the approved test path and confirm HerdHarbor reflects the synchronized state.
- Confirm Stripe secret keys and webhook signing secrets are never present in browser source or committed repository files.

## Referrals and Member-month credits

- Leave Referral ID blank during signup and confirm signup proceeds normally.
- Enter an invalid nonblank Referral ID and confirm it must be corrected or cleared before continuing.
- Enter a valid Referral ID and confirm the referral attaches to the new account without revealing the referrer's private identity.
- Confirm self-referral is rejected and a referred account cannot be attached to multiple referrers.
- Confirm the initial Member subscription payment does not qualify the referral.
- Confirm the first successful monthly renewal qualifies the referral exactly once.
- Confirm cancellation before first renewal does not qualify the referral.
- Confirm a failed first renewal remains unqualified until the renewal payment actually succeeds.
- Confirm every five qualified referrals earns one stackable Member-month credit.
- Grant an admin Member-month credit and confirm the audit ledger records the adjustment without creating a fake Stripe payment.
- Confirm available credits do not get consumed while an active paid Stripe entitlement still covers the account.

## Subscription email notifications

- Confirm subscription lifecycle outbox events are generated for the supported notification types.
- Confirm production delivery credentials are read only from the approved server environment.
- Confirm synthetic/test delivery does not include unrelated member, farm, animal, customer, notes, or credential data.

## Data preservation and cloud sync

- Create/edit records while signed in, sync, reload, and confirm the cloud version returns intact.
- Exercise an offline/local edit, reconnect, and confirm dirty-state synchronization completes without deleting records.
- Confirm conflict handling does not silently overwrite a newer cloud version.
- Confirm account/subscription downgrade changes access limits only and does not delete existing farm records.
- Confirm downloaded backup/export still contains the expected records and can be opened by the relevant import/recovery workflow.

## Animal-first workflow and domain regressions

- Open an animal and verify operational actions still launch the correct record workflows.
- Verify breeding lifecycle continuity from planned pairing through birth/litter and offspring handling.
- Verify rabbit genetics, multi-species genetics, pedigree, ARBA/reference, health, show, production, sales, task, and analytics modules still load.
- Verify carried-forward v1.6.x/v1.7.x domain modules remain functional; their older filenames alone are not a defect.
- Run spreadsheet import/export against a controlled sample and confirm validation prevents corrupt or duplicate records.

## Mobile/PWA

- Test iPhone-sized portrait viewport and confirm there is no horizontal page overflow, clipped authentication UI, or inaccessible Subscription controls.
- Test a representative Android/desktop browser viewport and confirm navigation, dialogs, forms, and tables remain contained.
- Install/update the PWA, confirm the update prompt appears when a new service worker is waiting, and confirm Update Now reloads into the new shell.
- Simulate offline mode after one successful load and confirm the static shell opens while protected auth/API requests are not served from the static cache.

## Monitoring and privacy

- Confirm the checked-in Sentry config has a blank DSN and production deployment injects the DSN from the protected environment.
- Confirm a controlled synthetic production acceptance event identifies `HerdHarbor@1.8.1`.
- Confirm monitoring events do not include credentials or full farm/member record payloads.
- Confirm Market Analytics privacy suppression, consent deletion, minimum sample thresholds, and service-role aggregate access regressions remain green.

## Repository hardening

- Run `npm ci`.
- Run `npm run test:release`.
- Run `npm test` in UTC.
- Run `npm test` in `America/New_York`.
- Run `npm run build:monitoring`.
- Confirm the repository security audit reports no private key, provider secret, `.env`, backup/temp artifact, or duplicate browser Supabase client violation.
- Confirm only the three current v1.8.1 GitHub Actions workflows remain active in the repository tree.
- Confirm no obsolete open PR can be merged into current `main`.

## Production release verification

- Merge only from a green reviewed PR whose head SHA has not moved.
- Confirm the resulting `main` merge SHA is the exact SHA checked out by the monitored production Pages workflow.
- Confirm the production Pages job completes successfully through artifact staging and deployment.
- Reload `https://app.herdharbor.com` after deployment and confirm the application identifies v1.8.1 and the current PWA shell.
