# Index Shell Decomposition Audit

## Baseline

- Starting `main` SHA: `1bae9f6b65c5cc1984f495ad07f1a31d8caebc6d`
- Branch: `refactor/index-shell-decomposition`
- PR: #131 (created and validated in Draft before normal review)
- Purpose: structural decomposition of `index.html` without intentional behavior changes.

## Protected behavior

- Whole-application release identity remains v1.8.2, matching current `main`.
- Authentication behavior is frozen for this refactor.
- Production cloud-sync authority and cutover behavior are frozen.
- v1.8.3 normalized-sync modules remain foundation-only and disconnected from production.
- No Supabase SQL is applied by this work.

## Overlap review

At the final review point there are no other open pull requests overlapping this work.

Historical overlap considered before extraction:

- PR #126 — normalized cloud-sync foundation; retained through merged PR #130 and not activated by this work.
- PR #124 — animal-first UX work touching shared runtime/service-worker areas; retained through merged PR #130.
- PR #120 — state-integrity test work; retained through merged PR #130.
- PR #130 — merged into the starting baseline and treated as authoritative current-main behavior.

## Ownership map

### Early theme bootstrap — intentionally inline

The small first-paint theme bootstrap remains inline in `<head>`.

It:

- reads `localStorage["herdharbor_theme"]`
- reads `prefers-color-scheme`
- writes `document.documentElement.dataset.theme`
- must run before page paint to avoid a theme flash
- does not depend on the main application runtime

This is intentionally not extracted because moving it would add an avoidable fetch/timing dependency to first paint.

### Page-owned shell CSS — `herdharbor-index-shell.css`

The primary page-owned stylesheet moved from the first large inline `<style>` block into `herdharbor-index-shell.css`.

Ownership includes the current page shell, navigation, layouts, forms, modals, responsive behavior, auth-lock presentation, dashboard/view styling, and other selectors that were previously physically stored in `index.html`.

Compatibility requirements:

- stylesheet placement remains at the same effective cascade point
- existing selector text is preserved
- media-query behavior remains unchanged
- print/export styles embedded in JavaScript-generated documents were not moved into this file; they remain inside the application runtime exactly where they were before

### Main classic application runtime — `herdharbor-app-runtime.js`

The single large inline classic application script moved byte-for-byte into `herdharbor-app-runtime.js`.

It continues to own the existing application state and UI runtime, including:

- application bootstrap and initialization
- local application state
- navigation/view rendering
- animal list/profile behavior
- breeding and litter workflows
- health records and symptom flows
- tasks and recurring tasks
- customers, sales, payments, transfers
- production, budgeting, analytics integration points and reports
- settings and admin-facing application integration points
- forms, modal/dialog behavior, import/export handlers
- persistence calls and application-local writes
- application-ready publication through `herdharbor:app-ready`
- the existing `window.HerdHarborApp` compatibility API

Dependency/ordering characteristics:

- remains a classic script; no `async`, `defer`, or `type="module"` was introduced
- loads after the same prerequisite vendor/runtime scripts that preceded the original inline block
- runs after `analytics-v1.6.1.js`, matching the original effective position
- continues to consume existing globals from build, release, membership, billing, access-cache, cloud, admin, symptom, PWA, market analytics, and analytics runtimes
- preserves existing globals, closures, event names, storage keys, DOM IDs, function signatures, and initialization timing because the source text itself is unchanged

### Print/export style fragments — remain inside runtime

Four additional `<style>` text fragments visible when scanning raw `index.html` were not page-level stylesheet blocks. They are string content used by print/export document generation inside the large application script.

Those fragments remain inside `herdharbor-app-runtime.js` because the runtime was moved byte-for-byte.

## Load-path ownership

Each newly extracted asset has one intentional page load path:

- `herdharbor-index-shell.css?v=1` — static stylesheet reference from `index.html`
- `herdharbor-app-runtime.js?v=1` — static classic-script reference from `index.html`

Neither asset is also dynamically loaded by `pwa.js` or `herdharbor-build.js`.

## PWA/offline handling

Both required extracted assets are:

- included once in `service-worker.js` `APP_SHELL`
- included once in `NETWORK_FIRST_PATHS`

This preserves offline-shell availability and follows the existing network-first update strategy without redesigning the service worker.

## Test ownership changes

Tests that previously inspected implementation text physically inside `index.html` were updated to read the new owner file where appropriate.

The new `tests/index-shell-decomposition.test.cjs` verifies:

- only the early theme bootstrap remains as an inline executable script
- page-owned CSS is externally referenced
- the main runtime is externally referenced
- classic script and stylesheet ordering is preserved
- static script/stylesheet references resolve
- static scripts are not duplicated
- both extracted required assets are represented in service-worker precache and network-first handling

Behavioral assertions were retained; source-location assertions were redirected to the owning file instead of being removed.

## Size result

Baseline:

- `index.html`: 824,837 bytes
- inline JavaScript: 509,435 bytes across two executable inline scripts
- raw `<style>` matches: 69,210 bytes, of which 59,157 bytes were the page-level shell stylesheet and the remainder were print/export style strings inside the application script

PR branch:

- `index.html`: 256,671 bytes
- inline JavaScript: 344 bytes, the theme bootstrap only
- page-level inline CSS: 0 bytes
- `herdharbor-app-runtime.js`: 509,091 bytes
- `herdharbor-index-shell.css`: 59,156 bytes

The runtime file is byte-for-byte identical to the original large inline script. The extracted shell stylesheet contains the original page-level stylesheet content; the one-byte size difference is the surrounding newline removed with the former `<style>` wrapper.

## Intentionally left inline

Only the early theme bootstrap remains inline because extracting it would introduce first-paint timing risk with no useful architectural gain.

## Behavior changes

None intended.

## Release/auth/cloud result

- No whole-application version bump.
- No authentication behavior changes.
- No production cloud authority/cutover changes.
- No normalized-sync production activation.
- No storage-model or Supabase migration changes.

## Validation status

The decomposition code head `435e440a9beaf6005bfaaee78acad1adacbe7058` passed Alpha v1.8.2 CI #153 completely, including:

- pinned dependency installation
- current v1.8.2 release contract and repository security audit
- lifecycle/state-integrity E2E gate
- complete test discovery in UTC
- complete test discovery in America/New_York
- monitoring production build and architecture/config validation
- source-mutation check
- Android v1.8.2 release identity and unsigned bundle build/verification

Acceptance rule: PR #131 must have a green CI run on its current head and remain synchronized with current `main` before leaving Draft. This documentation correction changes no runtime, auth, cloud-sync, subscription, PWA, or business-rule source.

## Decomposition rule followed

Move code first; redesign architecture later. No attempt was made to split the 509 KB application runtime into smaller behavioral domains in this PR because doing so would combine physical extraction with ownership redesign and materially increase regression risk.
