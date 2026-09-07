# HerdHarbor Alpha v1.8.1

Alpha v1.8.1 is the current account, subscription, referral, registration-safety, email-notification, and repository-hardening release. It builds on the standalone v1.8.0 Subscription Engine and preserves HerdHarbor's established animal, breeding, genetics, health, show, production, analytics, cloud-sync, and storage engines.

## Subscription launch policy

- Launch-trial window begins September 6, 2026.
- Ordinary accounts receive Member-level access through September 30, 2026.
- Subscription hard launch is October 1, 2026 at 12:00 AM Eastern Time.
- Founder remains an internal entitlement and is not a public signup choice.
- Owner/admin access and active manual overrides remain protected.
- After hard launch, accounts without another qualifying entitlement fall back to Junior instead of losing their records.
- Junior retains the existing five-active-animal transition limit while previously stored records remain preserved.

Hardlocked policy dates:

- Trial start: `2026-09-06T00:00:00-04:00`
- Subscription hard launch: `2026-10-01T00:00:00-04:00`

## Public subscription plans

- **Junior — Free**
- **Member — $14.99/month**
- **Business — Coming Soon**

Member billing is month-to-month using the Stripe billing-cycle anchor established by the subscription. Founder is assigned internally rather than exposed through public checkout.

## Stripe subscription integration

- Stripe checkout, Customer Portal access, cancellation/reactivation, webhook synchronization, and paid-entitlement refresh are integrated with the standalone subscription architecture.
- Stripe secret keys and webhook signing secrets remain server-side.
- The browser reuses the established HerdHarbor cloud/auth transport rather than creating a second Supabase client.
- Webhook-synchronized paid state is recognized before browser refresh finishes so active paid users do not temporarily downgrade during launch enforcement.

## Registration safety and fraud controls

New signup collects the adult account holder's legal first and last name, date of birth, phone, country, region, postal code, optional organization name, intended usage type, and required attestations.

- Account holders must self-report an age of 18 or older.
- Youth use requires an adult-managed account with the required parent/legal-guardian supervision or approval attestation.
- Full date of birth is used to calculate age but is not retained in the server-side registration profile.
- Registration profile data is written through the authenticated server function; browser roles do not receive direct table access.
- Repeated phone use can flag an account for review without automatically blocking legitimate shared-household use.
- Existing accounts created before the rollout cutoff are grandfathered from the new profile-completion gate.

This is a self-reported age gate and attestation system, not government-ID identity verification.

## Referral IDs and Member-month credits

- Every eligible account can use a separate public HerdHarbor Referral ID rather than exposing an authentication/database UUID.
- Referral entry is optional. A blank referral field never delays or blocks signup.
- Invalid nonblank IDs must be corrected or removed before signup continues.
- Self-referral is prohibited and one referred account can have only one referrer.
- Referral attachment is captured at signup.
- The initial Member subscription payment does not qualify the referral.
- The referral qualifies after the referred Member's first successful monthly renewal.
- Every five qualified referrals earns one stackable Member-month credit.
- Admins can add auditable Member-month credits without assigning Founder and without recording a fake Stripe charge.
- Available credits can cover one future monthly renewal without moving the Stripe billing-cycle anchor.

## Subscription notifications

The v1.8.1 notification pipeline supports provider-neutral outbox events and the production email delivery layer for subscription lifecycle notices, including upcoming paid renewal, upcoming free renewal, referral reward earned, free month applied, and payment failure. Delivery credentials remain outside source control.

## Member-facing subscription UI

The Subscription area is presented as a normal member account center rather than exposing implementation architecture. It shows the current plan/status and billing controls while keeping internal standalone-engine/provider details out of routine member copy.

## Repository and deployment hardening

- Current release identity is aligned across package metadata, lockfile, web manifest, Android TWA manifest, Android Gradle versioning, PWA fallback metadata, monitoring configuration, and the shared build object.
- The PWA shell is rotated to the current v1.8.1 build family while preserving network-first handling for release-critical assets.
- Duplicate legacy release-review workflows are replaced by consolidated v1.8.1 CI, production Pages, and manual production-acceptance workflows.
- Production Pages deployment checks out the exact `main` SHA, runs the current release regressions, requires a production Sentry DSN, builds monitored assets, verifies the staged artifact, and publishes that reviewed payload.
- Historical Supabase migrations and older-named stable runtime/domain engines remain intentionally preserved; they are not treated as obsolete merely because their filename predates v1.8.1.

## Compatibility contract

v1.8.1 does not replace the proven HerdHarbor auth client, does not introduce a second browser Supabase client, and does not delete or migrate existing farm records solely because of subscription state. Stable older-version domain modules remain part of the v1.8.1 runtime where they are still authoritative.
