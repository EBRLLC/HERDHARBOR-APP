# HerdHarbor Alpha v1.8.0 — Standalone Subscription Engine

## Release intent

v1.8.0 introduces a new, isolated subscription-management engine. It does **not**
replace `HerdHarborMembership`, `HerdHarborBilling`, `herdharbor-cloud.js`, native
routing, or any animal-record workflow. Existing membership/billing behavior remains
authoritative until a payment provider is explicitly connected to the new engine.

## New subscription tab

The Account navigation now receives a Subscription tab at runtime. The tab is injected
by `subscription-engine-v1.8.0.js` using `data-hh-subscription-engine-tab`; it deliberately
does not register a native `data-route="subscription"` route, preventing collisions with
the existing single-page router.

The panel includes:

- Current account/access snapshot from `HerdHarborMembership`.
- Plan catalog and plan-selection provider hooks.
- Billing period, trial, cancellation, grace-period, next-invoice, and payment-history state.
- Referral credit tracking with the initial HerdHarbor rules:
  - 5 active subscribed referrals = 1 free month.
  - 20 active subscribed referrals = 3 free months.
- Billing portal, checkout, cancel-at-period-end, and reactivation provider interfaces.
- Account role, backend verification, and active-animal usage context.
- Built-in stale-screen and sign-in diagnostics.

## Isolation contract

The engine lives under `window.HerdHarborSubscriptionEngine` and publishes
`herdharbor:subscription-engine-state`. It never assigns `window.HerdHarborBilling`,
does not clear or set Supabase sessions, and does not modify native routes.

The existing release flag `billingEnabled` remains unchanged. This means v1.8.0 can be
reviewed and deployed without silently changing an existing user's entitlement behavior.

## Payment security

HerdHarbor does not store raw card numbers, CVC/CVV values, bank credentials, payment
tokens, or provider secrets. The browser stores only normalized subscription metadata
and safe provider reference IDs. A PCI-compliant processor such as Stripe remains
responsible for payment credentials and payment authorization.

Live payment actions are disabled until a provider adapter is configured. The adapter
contract supports:

- `getSubscriptionSnapshot()`
- `createCheckoutSession(payload)`
- `createPortalSession()`
- `cancelSubscription({ atPeriodEnd: true })`
- `reactivateSubscription()`

Provider redirects are restricted to HTTP(S) destinations.

## Supabase foundation

`supabase/v1.8.0-subscription-engine.sql` adds separate subscription-domain tables:

- `subscription_plans`
- `subscriptions`
- `subscription_events`
- `subscription_referrals`
- `subscription_credits`
- `subscription_payments`
- `subscription_overrides`

All user-linked tables use row-level security. Signed-in clients receive read-only access
to their own subscription data. No authenticated-client write policies are created for
billing authority tables; payment-provider webhooks or trusted server functions are
expected to write through a service role after signature verification.

The migration also provides `subscription_account_snapshot()` and the referral milestone
helper.

## Stale-screen and sign-in guardrails

The engine checks:

- App shell presence.
- Simultaneous app/sign-in surface visibility.
- Auth-session signal versus visible app shell.
- Duplicate subscription tabs/panels.
- Current v1.8.0 build identity.
- Subscription snapshot age.
- Suspicious payment-secret browser-storage key names.
- Legacy billing namespace isolation.

On focus, visibility restoration, auth-session changes, and stale subscription state, the
engine rechecks the display state and asks the existing membership layer to refresh when
a mismatch is detected. It does not mutate the Supabase session.

## Test coverage

`tests/subscription-engine-v1.8.0.test.cjs` covers:

- Standalone API availability.
- State normalization.
- Unknown-plan entitlement rejection.
- Referral milestones.
- Legacy billing namespace isolation.
- Raw payment-credential exclusion.
- Native router isolation.

The first pre-commit test run found an initialization-order defect in persisted-state
normalization. That defect was corrected before the engine was committed. The corrected
isolated suite passes 7/7.

## Activation note

This PR builds the complete standalone subscription domain and provider interface, but it
does not contain Stripe secret keys, webhook secrets, or live Stripe product/price IDs.
Those belong in deployment secrets/server configuration and should not be committed to
the repository.
