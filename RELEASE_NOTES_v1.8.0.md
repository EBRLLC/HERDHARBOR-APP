# HerdHarbor Alpha v1.8.0 — Standalone Subscription Engine

v1.8.0 adds a new isolated subscription-management domain without replacing `HerdHarborMembership`, `HerdHarborBilling`, `herdharbor-cloud.js`, native routing, or animal-record workflows.

The new Account > Subscription tab reads existing HerdHarbor account/access context and adds plan display, billing-period state, trial/cancellation/grace-period state, next-invoice and payment history models, referral credits, provider hooks for checkout/portal/cancel/reactivate, and built-in sign-in/stale-screen diagnostics.

Initial referral rules are 5 active subscribed referrals = 1 free month and 20 active subscribed referrals = 3 free months.

The engine is exposed only as `window.HerdHarborSubscriptionEngine` and publishes `herdharbor:subscription-engine-state`. It does not assign `window.HerdHarborBilling`, does not set or clear Supabase sessions, and deliberately avoids `data-route="subscription"` so the native router remains untouched. The existing `billingEnabled` release flag remains false.

`supabase/v1.8.0-subscription-engine.sql` adds separate plan, subscription, event, referral, credit, payment, and override tables with RLS. Signed-in clients receive read-only access to their own billing metadata. No authenticated-client write policies are added to billing authority tables; trusted provider webhooks/server functions must write through service-role authority after provider signature verification.

HerdHarbor does not store raw card numbers, CVC/CVV values, bank credentials, provider secrets, or payment authorization secrets. Live payments remain disabled until a payment-provider adapter is configured with server-side secrets and product/price IDs.

Stale-screen/sign-in guardrails check app-shell presence, overlapping app/auth surfaces, auth-session versus visible shell, duplicate subscription UI instances, release identity, state freshness, suspicious payment-secret storage key names, and legacy billing namespace isolation. Focus, visibility restoration, and auth changes trigger rechecks without mutating the Supabase session.

The v1.8.0 test suite covers engine startup, state normalization, unknown-plan rejection, referral rules, namespace isolation, raw-payment credential exclusion, native-router isolation, build bootstrap, legacy billing-disabled status, and PWA cache/network-first coverage.
