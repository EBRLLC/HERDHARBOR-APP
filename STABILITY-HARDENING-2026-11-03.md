# HerdHarbor 2.0.2 stability hardening verification

## Scope and source

Starting production/main commit: `d909eff69080262b0ba2bd9ba1ad497027347f7c`.
The audited commit is still the latest main, including PR #522's iOS subscription repair.
Working branch: `maintenance/2.0.2-stability-performance-hardening`.
The ending source revision is the head commit of the linked hardening PR; CI must be read against that exact SHA.
Application version remains `2.0.2`.

No production writes, schema changes, migrations, function deployments, billing changes, emails, or merge were performed.
Existing normalized authority, account ownership, rollout/cohort configuration, quota policy, subscription plans and persisted formats remain unchanged.

## Confirmed defects corrected

### High priority: local state protection

- A corrupt/unavailable local read could become default empty state. Canonical reads now distinguish a missing workspace from unreadable data. The runtime pauses editing and displays a recovery message instead of onboarding over a failed read.
- Local commits reject unreadable predecessor state or a corrupt pending-mutation outbox before writing. Existing bytes are retained.
- Failed storage writes preserve the previous in-memory workspace and the durable state. Recovery through an already verified cloud replacement can initialize a previously blocked runtime.
- Blocked browser storage property access no longer aborts state-store script evaluation without reaching the runtime recovery path.

### Medium priority: loading and asynchronous account isolation

- Optional/runtime scripts have a 20-second deadline, listener/timer cleanup, missing-API rejection and explicit retry support.
- Failed route scripts are removed so reopening a feature requests a fresh script instead of waiting for an event that has already fired.
- PWA dependency chains share in-flight completion, retry a completed network failure once, report failed initialization and do not automatically register a second copy after an ambiguous timeout.
- A failed optional initializer does not prevent other subscribers from finishing.
- Account-boundary epochs reject stale A-to-B-to-A tool acquisition and route rendering; repeated navigation only completes the newest route render.

### Medium priority: rabbit inference readiness and efficiency

- Initial/local and verified-cloud hydration schedule reconciliation after the complete genetics engine is ready.
- Scheduled work is abandoned after an account boundary, a changed in-memory workspace, or a newer durable replacement.
- Relevant rabbit input signatures prevent full reconciliation on unrelated task/settings/financial saves. Parent links, color, variety, genetic evidence and Vienna fields remain invalidation inputs.
- Existing inference science, uncertainty/conflicts, DNA/manual evidence protection, and dog isolation are unchanged. Failed recalculation remains retryable and does not block saving primary records.

### Medium priority: AI provider deadlines

- Both extraction deadlines previously ended when HTTP headers arrived. Deadlines now include response-body consumption, with body aborts reported as `provider_timeout`.
- Provider failure responses are classified without reading unnecessary error bodies.
- Consent, server authorization, validated rabbit species restriction, review-only drafts, quota reservations, and no automatic paid retry remain intact.
- Failed attempts still consume the existing reserved attempt budget. No production refund/quota-policy changes are included.

## Measurements

| Measurement | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| HTML-loaded scripts | 43 | 43 | No dependency removed or unsafe startup split |
| Raw startup JavaScript | 1,492,315 bytes | 1,500,234 bytes | Added recovery/loading guards cost 7,919 raw bytes |
| Full inference runs for 40 unrelated task saves, 90 rabbits | 40 | 0 | All relevant evidence changes still reconcile |
| Synthetic computation loop | 1,795.13 ms | 24.46 ms | Persistence stubbed; not an end-to-end device save benchmark |

Reproduce the inference measurement with `node scripts/benchmark-stability-genetics.cjs`.
The baseline source is pinned to the audited SHA. Timings vary by host; inference invocation counts are the stronger result.

Shows/documents/genetics startup registration is coupled to existing navigation and canonical engine composition. No further route split was made without equivalent regression proof.

## UI verification

No additional horizontal-layout defect was reproduced in the reviewed screens, so existing styles and the iOS subscription fix were preserved.
The changed UI is the explicit local-state recovery screen, using existing panel/button styles.

`scripts/verify-stability-responsive.cjs` executed in real headless Chromium with synthetic data and remote application requests blocked:

- 144 screen checks: dashboard, animals, pedigrees, breeding, litters, health, tasks, sales, budget, analytics, settings and subscriptions.
- Widths 320, 375, 390, 412, 768 and 1440 pixels; light and dark themes.
- 12 dog editor dialog checks with no modal horizontal overflow.
- 12 short-viewport field-access checks at 400 pixels high.
- Zero uncaught browser runtime errors.
- Initial rabbit inference appeared without requiring an unrelated edit/save.

The layout checks cover the rendered fixtures, not every possible customer record or every modal variant.
Short viewports model available keyboard space; they do not certify physical iOS/Android keyboard behavior.
Specialized contained analytics/pedigree scrolling was preserved. No global overflow hiding was added.

## Database review (read-only)

Production advisors still identify these nine uncovered FK columns:

| Table | Column |
| --- | --- |
| marketplace_account_suspensions | lifted_by |
| marketplace_account_suspensions | suspended_by |
| marketplace_blocks | blocked_id |
| marketplace_conversations | created_by |
| marketplace_listing_photos | seller_id |
| marketplace_moderation_actions | moderator_id |
| marketplace_reports | reported_user_id |
| marketplace_user_warnings | issued_by |
| marketplace_user_warnings | report_id |

Existing composite/partial indexes were inspected; the cited columns are not their leading covering keys.
Public browsing EXPLAIN uses `marketplace_listings_public_newest_idx` and `marketplace_public_profiles_status_updated_idx`.
The inspected operational marketplace tables have zero estimated live rows in pg_stat_user_tables (public profiles: one); these statistics are approximate.
No measured database bottleneck justified a schema migration in this maintenance PR. No migration is pending from this work.

There are also 25 unused-index advisories. No index was removed from this small, early workload.
Security advisories include 23 RLS-enabled/no-policy tables, five anonymous-callable and 75 authenticated-callable SECURITY DEFINER functions, plus disabled leaked-password protection.
The reviewed public listing/search/pedigree functions deliberately expose available, unexpired listings of active sellers, use an empty search_path, and preserve hidden pedigree restrictions.
The reviewed seller moderation function requires an authenticated Owner and a reason. Function executability alone did not establish an authorization defect.
Existing SQL/security/ownership tests passed; this is not a claim that every privileged function was independently penetration-tested.

References:
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [SECURITY DEFINER exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Leaked-password protection remains a separate, pre-existing production configuration concern; it was not changed under this assignment.

## Executed validation

| Check | Actual local result |
| --- | --- |
| Baseline full suite after npm ci | 1,921 passed; zero failed; four skipped (1,925 total) |
| Final full suite, UTC | 1,944 passed; zero failed; four skipped (1,948 total) |
| Final full suite, America/New_York | 1,944 passed; zero failed; four skipped (1,948 total) |
| New behavioral tests | 23 passed, including loader failure/deadline/retry, A-B-A, storage recovery, inference and AI provider failures |
| Release/security/governance/state-integrity/review commands | Passed; review command's three PostgreSQL-dependent skips are included in the full-suite four skips |
| Root JavaScript syntax; changed Edge Function esbuild bundles | Passed |
| Production monitoring build/config generation | Passed; generated source files restored afterward |
| Fingerprinted Pages candidate | Passed: 168 assets, 50 essential shell files; no publish |
| npm audit --omit=dev | Zero reported vulnerabilities |
| Responsive browser matrix | 144 screens, 12 dialogs, 12 short viewport checks; zero runtime errors |
| Actual service-worker offline reload | Passed; synthetic profile and four animals loaded from cache |
| Actual canine PDFs through Playwright | Four passed: three/four generations, Letter/A4; subject, ancestor, title and disclaimer text verified with pdftotext |
| Existing CLI PDF launcher locally | Timed out with the serverless Chromium binary; unchanged CI gate must still pass using runner Chrome |

An initial baseline attempt before installing pinned dependencies failed three files because esbuild was absent. After npm ci those failures disappeared; no source changes were needed.
The four local skipped tests require disposable PostgreSQL. The existing GitHub workflow executes PostgreSQL restoration/recovery gates and the Android bundle; their exact-head results are release requirements.
No authenticated production user session or real paid AI call was used for testing.

## Files in this change

Production code:
- herdharbor-app-runtime.js
- herdharbor-optional-tools.js
- herdharbor-state-store-v1.8.4.js
- pwa.js
- supabase/functions/paper-pedigree-extract/index.ts
- supabase/functions/record-photo-extract/index.ts

Tests/tooling/documentation:
- tests/stability-hardening-v2.0.2.test.cjs
- tests/ai-provider-deadline-v2.0.2.test.cjs
- tests/mobile-owner-cloud-runtime-handoff-v2.0.0.test.cjs
- tests/storage-efficiency.test.cjs
- scripts/benchmark-stability-genetics.cjs
- scripts/verify-stability-responsive.cjs
- STABILITY-HARDENING-2026-11-03.md

Two existing source-extraction tests were updated for new guarded initialization and the extracted inference helper; their assertions were retained.

## Limits, deployment and rollback

Live Sentry verification is blocked: no Sentry tool or SENTRY_AUTH_TOKEN is available in this session. Repository monitoring tests and the production bundle build passed; no Sentry issue was modified.
Resend's existing transactional sender domain is verified with sending enabled; no notification/configuration changes or test email were sent. Existing billing/email regressions pass; Stripe prices, accounts and subscriptions were not changed.
Physical-device testing and a new authenticated staging round-trip were not performed. No new staging resources/costs were incurred.

Merge readiness requires the exact PR head to pass the existing GitHub web/PostgreSQL, Android and CLI PDF gates. An open PR does not authorize deployment.
After separate merge authorization, normal Pages asset generation supplies revised content fingerprints/cache identity without changing the application version or persisted formats.
The two Edge Functions remain separately identifiable and undeployed; deploying them requires separate authorization. A frontend merge alone does not install their server-side deadline changes.

Rollback: revert the hardening PR through a new reviewed PR and rebuild the Pages artifact. No down-migration or data transformation is needed. If Edge Functions are later separately deployed, restore their prior verified function versions independently. Preserve current user data, outboxes and recovery snapshots throughout rollback.
