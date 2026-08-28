# HerdHarbor Alpha v1.5.1 — Phase 1 Stability & Crash Monitoring

Alpha v1.5.1 Phase 1 adds privacy-safe crash and error monitoring infrastructure without changing HerdHarbor memberships, pricing, account access, farm records, or the production data model.

## Added

- Centralized `@sentry/browser` monitoring architecture for browser JavaScript.
- Shared JavaScript coverage for web, installed PWA, Android Trusted Web Activity, and the JavaScript layer of iOS Capacitor.
- Controlled environment, release, build, platform, module, and anonymous-correlation tags.
- User-safe `HH-XXXXXXXX` error reference IDs.
- Monitoring for uncaught JavaScript errors and unhandled promise rejections.
- Startup and PWA/service-worker failure diagnostics.
- Cloud Sync failure diagnostics using metadata-only categories rather than record payloads.
- Authentication failure signals without transmitting credentials or account contents.
- Value-blind localStorage and IndexedDB persistence-failure monitoring.
- Spreadsheet import/export/report failure boundaries without workbook contents.
- Explicit HerdHarbor action breadcrumbs instead of automatic click/form breadcrumbs.
- Duplicate/noise throttling, including longer suppression for expected offline failures.
- Development/test-only controlled Sentry event support.
- Branch review CI that runs the complete test suite in UTC and America/New_York.
- Review-only unsigned Android TWA build verification.
- Manual main-only GitHub Pages deployment workflow that can inject the Browser DSN from a GitHub Actions secret without committing it to source.

## Privacy protections

Sentry events are rebuilt through centralized `beforeSend` and `beforeBreadcrumb` safeguards before transmission.

Monitoring is designed not to transmit passwords, auth/session tokens, Authorization headers, cookies, customer contact data, farm/animal notes, medical/treatment records, financial/payment data, pedigree contents, free-text form contents, uploaded documents/photos, backups, spreadsheet contents, raw application state, localStorage/IndexedDB contents, request bodies, sensitive response bodies, or Cloud Sync payloads.

Only explicit action breadcrumbs and controlled diagnostic metadata are allowed.

## Failure safety

Monitoring is optional. HerdHarbor continues operating if the DSN is missing, Sentry is unreachable, initialization fails, the SDK cannot load, or event transport fails.

## Platform notes

- Web/PWA use the Browser JavaScript Sentry project.
- Android TWA uses the same web-delivered Browser monitoring and does not add a native Android crash SDK in Phase 1.
- iOS Capacitor JavaScript is designed to use the same Browser project when v1.5.1 is later reconciled into the separate iOS build branch.
- Native Swift/Objective-C crash reporting is documented as a separate future Sentry Cocoa implementation and is not added to the already-submitted iOS v1.5.0 Build 9.

## Not included

Alpha v1.5.1 Phase 1 does **not** implement memberships, subscriptions, RevenueCat, StoreKit subscriptions, Google Play Billing, pricing changes, paywalls, free trials, October restrictions, or read-only membership modes.

## Deployment status

This branch is for review only. Do not merge or deploy until Phase 1 acceptance testing is complete and explicitly approved.

A real Sentry delivery test must not be marked PASS until the controlled event is visible in the configured Sentry project.
