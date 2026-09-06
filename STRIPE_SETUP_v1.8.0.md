# HerdHarbor v1.8.0 — Stripe activation

The v1.8.0 Stripe integration is intentionally split between the browser, Supabase Edge Functions, and Stripe. No Stripe secret key, webhook secret, card number, CVC, or bank credential belongs in the browser or GitHub repository.

## Production Supabase resources

- Project: `okynebbksifqppwicghj`
- Authenticated billing function: `subscription-billing`
- Stripe webhook function: `subscription-webhook`
- Webhook URL: `https://okynebbksifqppwicghj.supabase.co/functions/v1/subscription-webhook`

## Required Supabase project secrets

Set these directly in Supabase project secrets. Never commit them.

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`

The standard Supabase runtime variables (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) are supplied by the Edge Functions environment.

## Stripe webhook events

Register the webhook URL above for:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Use the signing secret generated for that exact Stripe webhook endpoint as `STRIPE_WEBHOOK_SIGNING_SECRET`.

## Verified live recurring prices

These IDs were verified directly against the connected HerdHarbor Stripe live account. Stripe IDs are case-sensitive; lowercase `l` characters must not be changed to uppercase `I`.

| Plan | Interval | Amount | Stripe Price ID |
| --- | --- | ---: | --- |
| Founder Member | Monthly | $9.99 | `price_1UCOktGlRukEX5RKPo6jm6Vr` |
| Founder Member | Yearly | $110.00 | `price_1UCOwAGlRukEX5RK34xr9dQS` |
| Member | Monthly | $14.99 | `price_1UCOjrGlRukEX5RK9my06yUP` |
| Member | Yearly | $150.00 | `price_1UCOvPGlRukEX5RKJA05lDmb` |
| HerdHarbor Business | Monthly | $49.99 | `price_1UCOuYGlRukEX5RKo6LUWZq3` |
| HerdHarbor Business | Yearly | $550.00 | `price_1UCOnnGlRukEX5RK36kjzNZ6` |

The billing Edge Function uses a server-side allowlist. A browser request cannot substitute an arbitrary Stripe Price ID.

## Activation order

1. Confirm the six Stripe prices are in the intended mode and match the server allowlist.
2. Set the matching Stripe secret key in Supabase project secrets.
3. Register the webhook endpoint in the same Stripe mode.
4. Copy that endpoint's signing secret into Supabase project secrets.
5. Test Checkout, successful payment, failed payment, cancel-at-period-end, reactivation, yearly billing, Customer Portal, and sign-out/sign-in persistence.
6. Verify webhook retries are idempotent and the Supabase subscription row matches Stripe.
7. Only after the complete test matrix passes, enable HerdHarbor's billing entitlement feature flag.

`billingEnabled` remains false until this validation is complete so payment integration work cannot accidentally change existing member access.
