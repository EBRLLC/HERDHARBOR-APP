# Optional Tools Lazy Loading Audit

## Baseline

- Starting `main` SHA: `ac2513cd78b93a8728ed11cc15e4ec48390a70cc`
- Final synchronized `main` SHA before documentation finalization: `ac2513cd78b93a8728ed11cc15e4ec48390a70cc`
- Final validated implementation head before this documentation-only commit: `3ebe9b4bec03f3d3c875ba241e829cf6314d88fc`
- PR: #132 — `perf: lazy-load spreadsheet and QR tooling`
- Branch: `perf/lazy-load-heavy-tools`
- PR #131 is merged into the baseline.
- No overlapping active PR was found during the final implementation check.

A Git commit cannot embed its own resulting SHA in its contents. The exact post-documentation branch head is recorded in PR #132's final description and completion report after the documentation commit receives final CI.

## Startup change

The following heavy optional assets are no longer loaded unconditionally by `index.html`:

- `vendor/exceljs-4.4.0.min.js` — 947,702 bytes
- `vendor/jszip-3.10.1.min.js` — 97,630 bytes
- `spreadsheet-import.js?v=17` — 151,041 bytes
- `vendor/qrcode-generator-1.4.4.js` — 56,658 bytes

Total raw/uncompressed optional JavaScript removed from the unconditional startup path: 1,253,031 bytes, approximately 1.25 MB.

The small `herdharbor-optional-tools.js?v=1` loader is loaded normally before the application runtime.

The modified application runtime uses component/cache revision `herdharbor-app-runtime.js?v=2`. The whole application release remains v1.8.2.

## Loader architecture

`herdharbor-optional-tools.js` is the canonical owner of the four optional asset URLs.

### Spreadsheet group

- `ensureSpreadsheetTools()` loads ExcelJS and `spreadsheet-import.js`.
- `ensureSpreadsheetTools({ importSupport: true })` additionally loads JSZip before ExcelJS and the spreadsheet runtime.
- JSZip is import-only because it is used by XLSX import compatibility handling; export/report/template actions do not load it.
- Spreadsheet dependency ordering is explicit and sequential.
- callers receive Promises.
- concurrent requests share the same in-flight load through the canonical URL keyed `inFlight` map.
- already-loaded validated APIs are reused without another script request.
- every loaded script is checked for its expected published API.
- failed loader-owned script nodes are removed so a later action can retry.

### QR group

- `ensureQrTools()` loads only `vendor/qrcode-generator-1.4.4.js`.
- QR loading is independent from ExcelJS, JSZip, and `spreadsheet-import.js`.
- repeated QR actions reuse the validated loaded library.
- failed QR loads reject only the requested feature action and can be retried.

No ESM conversion or unrelated startup `async` behavior was introduced.

## Integration points

Every current spreadsheet-dependent application action goes through `ensureSpreadsheetToolsReady()` before using the spreadsheet API:

1. breeding/birth Excel report — `#download-breeding-report`
2. production Excel report — `#download-production-report`
3. full farm-record Excel export — `#export-excel`
4. spreadsheet template download — `#download-spreadsheet-template`
5. spreadsheet import — `handleSpreadsheetImport()`

Spreadsheet import requests `{ importSupport: true }`, causing JSZip to load only for import.

The printable animal/cage/pen QR-card workflow goes through `ensureQrToolsReady()` before QR generation. No separate QR path bypassing that gate was found.

## Regression repairs

### Animal-transfer cleanup

The accidental spreadsheet-style cleanup in `handleTransferImport()` was removed.

Transfer import once again clears the actual existing file input through:

`event.target.value = ""`

It does not reference an undefined `input`, does not disable/re-enable spreadsheet controls, and does not invoke optional spreadsheet loading.

Transfer validation, duplicate handling, provenance, rollback, persistence, Junior limits, and payload semantics were not changed.

### Spreadsheet input cleanup

`handleSpreadsheetImport()` captures:

`const input = event.currentTarget;`

It disables that input while the requested tooling/import is active and its `finally` block always:

- clears `input.value`
- restores `input.disabled = false`

This applies to success, loader failure, workbook/parser failure, validation failure, and importer cancellation/throw paths that unwind through the handler.

### Stale service-worker assumptions

Tests now validate the new ownership contract instead of requiring `spreadsheet-import.js?v=17` in mandatory `APP_SHELL`.

The mandatory shell includes `herdharbor-optional-tools.js?v=1`. The four heavy optional assets remain excluded from mandatory precache.

The runtime cache revision assertions were also updated from `herdharbor-app-runtime.js?v=1` to the component revision `?v=2`; the application release remains v1.8.2.

## Service worker / offline

Mandatory `APP_SHELL` includes:

- `herdharbor-optional-tools.js?v=1`

Mandatory `APP_SHELL` does not include:

- JSZip
- ExcelJS
- qrcode-generator
- `spreadsheet-import.js`

The four heavy optional paths remain in `NETWORK_FIRST_PATHS`.

For a successful same-origin network response, the existing service-worker helper caches a valid `basic` response. If a later network request fails, `networkFirst()` falls back to `caches.match(request)`.

Offline contract:

- first-ever offline use of an uncached optional feature may fail with its feature-specific error while HerdHarbor itself remains running
- an optional asset previously loaded successfully online can be served from the service-worker cache where the current strategy supports it
- no guaranteed first-use offline availability is claimed

## Regression coverage

`tests/optional-tools-lazy-loading.test.cjs` covers:

- no eager heavy-tool loads from `index.html`
- one canonical URL per optional dependency
- ordered spreadsheet dependency loading
- concurrent and subsequent load reuse
- JSZip import-only behavior
- QR/spreadsheet separation
- failed-load removal and retry
- expected-API validation
- all spreadsheet and QR action integration points
- heavy assets excluded from mandatory `APP_SHELL`
- runtime/network-first optional asset coverage
- successful online optional response caching and later offline cache fallback
- first-use offline cache miss behavior
- transfer-import cleanup isolation
- spreadsheet import clear/re-enable cleanup

Existing direct-transfer tests were not weakened.

## Protected scope

No intentional changes were made to:

- authentication, signup/sign-in, password recovery, or session hydration
- Owner/Admin/Founder or Junior/Member access policy
- subscription, trial, or Stripe behavior
- production cloud-sync authority, normalized sync activation, shadow sync, dual write, or normalized reads
- Supabase SQL
- application state schema or storage keys
- spreadsheet workbook format/business rules
- QR payload, card layout, URLs, or print format
- animal-transfer semantics
- whole-application version

## Validation

Final implementation CI before this documentation-only commit was **Alpha v1.8.2 CI #177 — PASS** on `3ebe9b4bec03f3d3c875ba241e829cf6314d88fc`.

Web, security and regression:

- `npm ci --no-audit --no-fund` — pass
- `npm run test:release` — pass
- repository security audit invoked by `test:release` — pass
- `npm run test:state-integrity` — pass
- complete discovered test suite in UTC — pass
- complete discovered test suite in America/New_York — pass
- production monitoring build — pass
- bundled monitoring architecture validation — pass
- monitoring configuration validation — pass
- source-mutation check — pass

Android:

- v1.8.2 release identity — pass
- Android SDK setup — pass
- unsigned release bundle — pass
- bundle verification — pass

The complete discovery passes include the repository's v1.8.2 and v1.8.3 test files. The standalone `npm run test:v1.8.2` and `npm run test:v1.8.3` aliases were not separately invoked by name in the existing CI workflow.

The application-runtime compile test and VM execution of the optional loader provide syntax coverage for the modified runtime/loader sources.

CI runs `git diff --exit-code` after test/build activity to detect source mutation. The workflow does not separately invoke `git diff --check`; final review therefore does not claim that exact shell command was run.

## Final acceptance rule

This documentation-only commit must receive a fresh full CI pass, and the branch must still be 0 behind current `main`, before PR #132 is reported safe to move out of Draft.

Do not merge or enable auto-merge as part of this work.
