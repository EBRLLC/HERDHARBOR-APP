# HerdHarbor Alpha v1.8.2

Alpha v1.8.2 is the formal release closeout for the animal-first workflow, breeder workflow, Genetics V2, and related v1.8.2 modules that were built incrementally on top of Alpha v1.8.1.

## Animal-first workflow

- Full-page, deep-linkable animal profiles with Overview, Health, Breeding, Genetics, Pedigree, Shows, Production, and History tabs.
- Today/reminder routing opens the relevant animal and workflow context.
- Existing Animal, Health, Breeding, Pedigree, Shows, Production, Sales, and Transfer stores remain canonical.
- Workflow actions return to the originating animal/profile context instead of forcing the breeder to navigate back through modules.

## Breeding, litters, sales and transfer

- Continuous Pairing → Bred → Pregnancy Check → Due → Birth → Weaning lifecycle.
- Recording a birth automatically creates the required linked offspring animal profiles.
- Litter Workspace supports bulk offspring identity, weights, health records, loss records, reversible weaning safeguards, and evaluation/disposition.
- Evaluation can continue directly into canonical Sales & Customers records and HerdHarbor member transfer.
- Breeding Next-Action guidance is derived from canonical records instead of creating a second task database.
- Breeding Performance Analytics adds dam, sire, pairing, conception, litter, live-birth, weaning-survival, and data-coverage views.

## Rabbit Genetics V2

- Evidence-strength labels distinguish DNA-confirmed, offspring-proven, pedigree/parent-derived, breeder-recorded, phenotype-inferred, and predicted evidence.
- Strong deterministic inheritance can populate exact offspring genetics without converting unresolved outcomes into certainty.
- Breeder-selected goals rank compatible mates using the breeder's current herd and clearly separate target probability from evidence confidence.
- Proof-breeding guidance uses real offspring records as evidence without treating failure to produce a recessive trait as proof of non-carrier status.
- Recorded offspring feed back into parent evidence and future breeding guidance automatically.
- `What this litter taught us` summarizes real offspring evidence inside the Litter Workspace.

## Mobile web install entry

Alpha v1.8.2 safely restores the mobile web installation affordance that was rolled back after the earlier authentication regression.

The replacement implementation:

- lives entirely inside the canonical `pwa.js` controller;
- never injects install behavior into `herdharbor-build.js` or the auth/bootstrap path;
- delegates Android/Chromium installation to the existing `beforeinstallprompt` flow;
- shows Safari Add to Home Screen guidance on iPhone/iPad;
- falls back to browser installation guidance when a native prompt is unavailable;
- hides itself when HerdHarbor is already running standalone/installed;
- responds to resize/orientation/install-state changes without creating a second PWA engine.

Regression coverage explicitly rejects moving the mobile install entry back into authentication/bootstrap code.

## Release identity and platform closeout

- Web/build identity: Alpha v1.8.2 / `animal-first-genetics-mobile-install-1`.
- Web manifest: v1.8.2.
- PWA shell/cache: rotated to the v1.8.2 generation; `pwa.js` delivery advanced to revision 31.
- Android: `versionName 1.8.2`, `versionCode 16`.
- TWA manifest: v1.8.2 / code 16.
- Bundled Android web manifest: corrected from its stale historical 1.6.1 identity to v1.8.2.
- Monitoring: `HerdHarbor@1.8.2` with the checked-in DSN remaining blank.
- CI, monitored Pages publishing, and manual production acceptance move to authoritative v1.8.2 workflows.

## Subscription/account policy

This release does not change the approved launch policy:

- Junior remains free.
- Member remains $14.99/month.
- Business remains Coming Soon.
- The September launch trial remains active through September 30, 2026.
- The subscription hard launch remains October 1, 2026 at 12:00 AM Eastern.
- Existing stored records are not deleted when an account falls back to Junior.
- v1.8.1 Stripe, referral, Member-credit, email, and registration-safety modules are intentionally carried forward as stable domain engines.

## Authentication safety

The recent web sign-in recovery path remains intact. Alpha v1.8.2 does not move mobile-install logic into that path and does not weaken authentication locks, session validation, secure token storage, cloud hydration, or fail-closed behavior.

## Verification gate

The release PR must pass:

- repository security audit;
- current v1.8.2 release identity audit;
- mobile PWA install architecture contract;
- focused `test:v1.8.2` suite;
- complete `tests/*.test.cjs` suite in UTC;
- complete `tests/*.test.cjs` suite in America/New_York;
- production monitoring build/config verification;
- unsigned Android v1.8.2 bundle build.

Production publishing remains exact-SHA and monitored. The manual production-acceptance workflow remains opt-in for protected membership/RLS and synthetic-only Sentry checks.
