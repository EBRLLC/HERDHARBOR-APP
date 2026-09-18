# Index Shell Decomposition Audit

## Baseline

- Starting `main` SHA: `1bae9f6b65c5cc1984f495ad07f1a31d8caebc6d`
- Branch: `refactor/index-shell-decomposition`
- Purpose: structural decomposition of `index.html` without intentional behavior changes.

## Protected behavior

- Whole-application release identity remains whatever current `main` declares.
- Authentication behavior is frozen for this refactor.
- Production cloud-sync authority and cutover behavior are frozen.
- v1.8.3 normalized-sync modules remain foundation-only and disconnected from production.
- No Supabase SQL is applied by this work.

## Open PR overlap at baseline

- PR #126 — normalized cloud-sync foundation. It does not modify the current production `index.html` load path; do not duplicate or activate it.
- PR #124 — animal-first UX work. It overlaps `herdharbor-build.js` and `service-worker.js`; avoid those files unless extracted asset loading/offline parity requires a narrow change.
- PR #120 — state-integrity test-only work.

PR #130 is already merged into the starting baseline and is treated as authoritative current-main behavior.

## Decomposition rule

Move code first; redesign architecture later. Preserve effective script execution order, CSS cascade order, storage-wrapper ordering, event names, DOM IDs, storage keys, release/build identities, authentication behavior, and production cloud behavior.

## Status

Inventory and dependency mapping in progress. No runtime behavior has been intentionally changed by this audit document.
