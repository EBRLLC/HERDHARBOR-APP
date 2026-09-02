# HerdHarbor Alpha v1.6.6 — Completion Debt Closure & Production Readiness

Alpha v1.6.6 is a reconciliation release stacked on the completed v1.6.5 candidate. Its purpose is to close the remaining incomplete or only partially accepted obligations inherited from Alpha v1.5.0 through v1.6.5 without reopening already-complete product areas.

## Release truth

- **v1.5.0 Shows:** complete and preserved. No feature rebuild is required.
- **v1.5.1 Stability & Memberships:** implementation is preserved; v1.6.6 adds repeatable production acceptance for live Owner/User authorization and controlled Sentry delivery. Billing remains an intentionally disabled provider-ready foundation and is not falsely labeled as a live paid-subscription system.
- **v1.5.2 Growth Charts:** no standalone v1.5.2 release was shipped. Its planned Growth scope was absorbed into the completed Analytics contract carried by v1.6.5.
- **v1.6.0 Analytics:** the original release was partial. v1.6.5 completed the missing Analytics contract; v1.6.6 carries that implementation forward unchanged.
- **v1.6.1 Rabbit Genetics:** the original release was substantial but incomplete. v1.6.5 completed the authoritative schema, structured loci, Lutino, terminology, non-Mendelian safeguards, phenotype identifiers, and runtime contract; v1.6.6 carries that implementation forward.
- **v1.6.5 Analytics/Genetics/Market candidate:** retained as the technical baseline. v1.6.6 closes remaining Market delivery/privacy and production-acceptance debt.

## Market Analytics privacy and reliability hardening

- Contribution queue now retries automatically with bounded backoff after network/function failures instead of waiting indefinitely for another unrelated user action.
- A successful Cloud Sync status can immediately retry queued Market contributions so a sale queued before canonical cloud state arrives does not remain stranded.
- Market consent version advances to `2026-09-v2` because the opt-out contract changed.
- Opting out now clears local contribution receipts and the backend removes that account's prior Market contribution processing rows; de-identified fact rows are removed by cascade.
- The standard aggregation threshold remains **5** observations for averages and medians.
- Exact minimum and maximum sale values are additionally suppressed until at least **10** matching observations are available by default.
- Exact 1–4 sample counts remain suppressed.
- Currency isolation, post-filter privacy thresholds, Completed-sale-only eligibility, correction idempotency, withdrawal behavior, account deletion, and raw-fact protection remain in force.

## v1.5.1 production acceptance closure

New production-only acceptance tooling is included but is never run automatically against production:

- `scripts/sentry-production-acceptance.mjs` sends one synthetic-only controlled event using the configured Sentry DSN. It contains no user, farm, animal, customer, notes, credentials, request body, or cloud-state data.
- `scripts/membership-production-acceptance.mjs` performs read-only authorization checks with dedicated acceptance accounts. It verifies Owner directory access, ordinary User denial, own-row RLS, and optional fresh-account/Junior expectations when those credentials are supplied.
- `.github/workflows/v1.6.6-production-acceptance.yml` is manual-dispatch only and uses the protected `production` environment for optional Market deployment and acceptance checks.

## Market deployment path

The Market service is still not considered operational merely because SQL and Edge Function source exist in GitHub. The production acceptance workflow can, after explicit manual dispatch and environment approval:

1. Apply `supabase/v1.6.5-market-analytics-foundation.sql`.
2. Apply `supabase/v1.6.6-market-privacy-hardening.sql`.
3. Deploy the `market-contribution` Edge Function.
4. Run the selected production acceptance checks.

No production deployment occurs automatically from this PR.

## Release identity

- Web/PWA: **Alpha v1.6.6**
- Build: **`1.6.6-alpha-completion-debt-1`**
- Android `versionName`: **1.6.6**
- Android/TWA `versionCode`: **12**
- Service-worker cache: **`herdharbor-shell-v1.6.6-alpha-completion-debt-1`**

## Explicit non-debt future scope

The following are future roadmap work, not unfinished obligations of v1.5.0–v1.6.5, and v1.6.6 does not misrepresent them as complete:

- Live paid subscription purchasing/store activation. The existing billing adapter remains disabled until provider/store credentials, products, receipt validation, restore-purchase behavior, and explicit commercial activation are approved.
- Full licensed/copyright-controlled ARBA Standard of Perfection content and the complete Optional ARBA Standards & Judging product. The existing standards registry is a foundation/reference layer only.
- HerdHarbor Business, Business Reporting & Operations, Sales/Marketplace expansion, and v2.0 full-release scope.

## Required release gate

Before v1.6.6 is called live:

- its parent v1.6.5 PR must be merged or otherwise present in the release base;
- full UTC and America/New_York regression suites must pass;
- Android/TWA review bundle must pass;
- production Market deployment/acceptance must be explicitly approved and completed if Market is being enabled;
- live membership/Sentry acceptance should be completed with dedicated test accounts/secrets;
- PWA update and post-deployment smoke checks must pass.

This release does not delete, migrate, or hide existing farm records and does not activate billing.
