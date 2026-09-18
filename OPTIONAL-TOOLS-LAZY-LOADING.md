# Optional Tools Lazy Loading Audit

## Baseline

- Starting `main` SHA: `ac2513cd78b93a8728ed11cc15e4ec48390a70cc`
- PR #131 is merged into `main`.
- `herdharbor-app-runtime.js` and `herdharbor-index-shell.css` are present on `main`.
- Open pull requests at branch creation: none.
- No overlapping active PR was found.

## Objective

Remove ExcelJS, JSZip, qrcode-generator, and `spreadsheet-import.js` from unconditional startup and make them explicit optional dependencies without changing their business logic.

## Protected scope

No auth, signup/sign-in, password recovery, subscription/trial, cloud-sync authority, normalized-sync cutover, Supabase SQL, spreadsheet format, QR payload/layout, storage-key, state-schema, or whole-app release identity changes are intended.

## Status

Implementation audit in progress. PR remains Draft.
