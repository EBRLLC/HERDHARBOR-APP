# Optional Tools Lazy Loading Audit

## Baseline

- Starting `main` SHA: `ac2513cd78b93a8728ed11cc15e4ec48390a70cc`
- PR #131 is merged into `main`.
- `herdharbor-app-runtime.js` and `herdharbor-index-shell.css` are present on `main`.
- Open pull requests at branch creation: none.
- No overlapping active PR was found.

## Ownership audit

### Spreadsheet tooling

`spreadsheet-import.js` publishes `window.HerdHarborSpreadsheet` and owns:

- XLSX import
- XLSX farm-record export
- Excel import-template generation
- breeding/birth Excel reports
- production Excel reports

ExcelJS is required by all of those workbook operations.

JSZip is used directly by spreadsheet import to normalize prefixed workbook XML before a compatibility retry. It is not required by export/report/template operations.

### QR tooling

`qrcode-generator-1.4.4.js` is used by the printable animal/cage/pen QR-card workflow. It is independent of spreadsheet functionality.

## Loader architecture

`herdharbor-optional-tools.js` is the single owner of optional dependency URLs.

- `ensureSpreadsheetTools()` loads ExcelJS and the existing spreadsheet runtime.
- `ensureSpreadsheetTools({ importSupport: true })` additionally loads JSZip for XLSX import.
- `ensureQrTools()` loads only the QR generator.
- dependency loads are Promise-based and de-duplicated while in flight
- scripts are loaded as classic scripts with explicit ordering
- every successful network/script load is followed by API validation
- failed loader-owned script tags are removed so a later action can retry

## Startup changes

Removed unconditional `index.html` loads for:

- `vendor/jszip-3.10.1.min.js`
- `vendor/exceljs-4.4.0.min.js`
- `vendor/qrcode-generator-1.4.4.js`
- `spreadsheet-import.js?v=17`

Added the small `herdharbor-optional-tools.js?v=1` loader to normal startup.

The modified app runtime uses component cache revision `herdharbor-app-runtime.js?v=2`. The whole application release remains v1.8.2.

## User-action load points

Spreadsheet tools load only when the user requests:

- Excel farm-record export
- Excel import template
- breeding/birth Excel report
- production Excel report
- XLSX import

JSZip loads only for XLSX import.

QR tooling loads only after an explicit Print QR cards action.

Affected controls are guarded/disabled while loading. Optional-tool failures are surfaced on the requested operation and do not turn into application startup failures.

## Service worker / offline

The four heavy optional assets are no longer mandatory `APP_SHELL` entries.

They remain network-first/runtime-cacheable:

- `/vendor/jszip-3.10.1.min.js`
- `/vendor/exceljs-4.4.0.min.js`
- `/vendor/qrcode-generator-1.4.4.js`
- `/spreadsheet-import.js`

Expected behavior:

- first-ever offline use without a previously cached optional dependency: that optional action fails softly and can be retried later
- after a successful online load: the service worker can fall back to the cached optional asset while offline
- the rest of HerdHarbor remains usable when optional tooling is unavailable

## Startup-size comparison

Raw optional source formerly referenced unconditionally:

- ExcelJS: 947,702 bytes
- JSZip: 97,630 bytes
- spreadsheet importer: 151,041 bytes
- QR generator: 56,658 bytes
- total: 1,253,031 bytes (approximately 1.25 MB)

The new optional loader is approximately 3 KB.

Direct `index.html` script references change from 17 to 14.

Mandatory `APP_SHELL` entries change from 108 to 105.

This is raw/uncompressed source-size accounting, not a claim about exact network transfer savings.

## Protected scope

No auth, signup/sign-in, password recovery, subscription/trial, cloud-sync authority, normalized-sync cutover, Supabase SQL, spreadsheet format/business logic, QR payload/layout, storage key, application state schema, or whole-app release identity change is part of this PR.

## Validation contract

Dedicated regression coverage checks:

- no heavy optional dependency is loaded by `index.html`
- canonical dependency ownership
- sequential import dependency order
- concurrent and later-call de-duplication
- export/report paths do not load import-only JSZip
- spreadsheet and QR dependency separation
- API validation
- clean failure and retry
- existing action integration
- service-worker optional caching/offline fallback structure

Final CI acceptance and branch synchronization are tracked on Draft PR #132. The PR must not be merged automatically.
