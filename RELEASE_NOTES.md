# HerdHarbor Pre-Alpha v0.3.01

This release adds reviewed Excel imports for Animals, actual Budgeting transactions, annual planned budgets, and Medical records while preserving the current farm record and cloud-sync safeguards.

## Highlights

- Added `.xlsx` and `.xlsm` workbook upload from Settings
- Added automatic Animals, actual transaction, annual planned budget, and Medical sheet recognition
- Added flexible column-name matching for common existing farm spreadsheets
- Added compatibility handling for valid Excel workbooks that use prefixed SpreadsheetML XML
- Added annual planned budgets that stay separate from monthly actual transactions
- Added support for Breeding, Growing, and Retired animal statuses
- Preserved neutered-sex labels and additional imported animal details in notes
- Preserved condition, treatment, medication, dose, provider, medical cost, follow-up status, and notes in Medical imports
- Corrected Excel date handling so U.S. timezones do not shift dates backward
- Added a review screen with valid-record counts, row errors, warnings, and duplicate skips
- Made spreadsheet imports additive so current records are never replaced
- Added animal matching by ID/tag, tattoo, registration number, or unique name
- Added parent matching for imported sires and dams
- Added a downloadable HerdHarbor Excel import template with a separate Annual Budget sheet
- Kept spreadsheet contents on the tester's device; only confirmed HerdHarbor records enter normal cloud sync
- Added all-or-nothing local commit behavior so a failed browser save rolls back the import
- Changed the web app manifest orientation from `any` to `portrait`
- Removed the Auto-rotate setting because web browsers cannot provide a dependable cross-platform On/Off lock
- Removed the portrait warning overlay that covered the app without preventing device rotation
- Kept the installed mobile experience portrait-only at the application-manifest level
- Added a complete PWA manifest, correct 192px and 512px icons, standalone launching, and app installation controls
- Added a versioned offline application shell
- Bundled the Supabase browser client locally so an installed app can open without relying on a third-party CDN
- Excluded authentication, database, storage, feedback, and all cross-origin requests from service-worker caching
- Added serialized cloud writes and atomic conflict checks
- Prevented an older device copy from silently overwriting newer cloud records
- Preserved local records when a session expires or sign-in is temporarily unavailable
- Added automatic IndexedDB recovery snapshots
- Added explicit conflict resolution with both local and cloud copies protected
- Blocked sign-out when unsynced records cannot be confirmed in the cloud
- Added a downloadable safety backup from the Account panel
- Added safe update prompts that protect unsynced records before reloading

## Tester note

Existing accounts and livestock data use the same storage key and Supabase table. No tester record migration is required. Spreadsheet imports append approved records to the current farm and skip duplicates or invalid rows.
