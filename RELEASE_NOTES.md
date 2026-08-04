# HerdHarbor Pre-Alpha v0.3.05

This production-and-sales release adds quantity-based farm-product records for egg, broiler, dairy, and other livestock operations while preserving v0.3.04 cloud-sync reliability.

## Highlights

- Added Production & Sales inside Budgeting for eggs, broilers, milk, and custom farm products
- Tracks total production, quantities sold, household use, livestock or calf feed, stored or hatching quantities, donations, and waste
- Adds dairy records by individual cow, species, or whole operation, including milking session and waste/discard reason
- Adds broiler batch quantities and optional processed weight
- Links sale income to Budgeting automatically and updates the same transaction when production records change
- Prevents allocation totals from exceeding the quantity produced
- Adds Product, Quantity Sold, and Unit columns to Budget CSV exports
- Adds Production worksheets to Excel import, readable exports, and the downloadable template
- Keeps production-linked income from being duplicated during Excel round-trip import
- Adds production records to the existing field-level multi-device merge without changing the cloud table or storage key
- Added record-by-record, field-by-field three-way merging using each device's last-confirmed cloud base
- Automatically combines changes made to different animals, medical records, budgets, activity entries, pedigrees, or fields
- Keeps genuine same-field edits and delete-versus-edit cases behind the existing protected conflict choice
- Saves recovery snapshots of both device and cloud copies before an automatic merge
- Rebases edits made during an in-progress merge so rapid saves are not discarded
- Keeps theme and sidebar preferences local to each device instead of treating them as farm-data conflicts
- Preserves the existing storage key, Supabase table, account records, and farm-data structure

## Continued capabilities

- Added a Settings cloud-sync card with the live status, connection state, pending-change state, and last-confirmed cloud timestamp
- Added a clear **Sync now** button without changing automatic synchronization
- Made the sidebar cloud indicator reflect syncing, offline, protected, and attention-required states
- Added one-click Excel export with Overview, Animals, Medical, Budgeting, and Annual Budget sheets
- Kept annual planned budgets separate from dated actual transactions in exported workbooks
- Made exported workbooks compatible with HerdHarbor's reviewed import workflow
- Added a specific **How to fix** explanation to every spreadsheet warning, duplicate, and error
- Added a downloadable CSV issue report so large workbook corrections can be handled outside the review modal
- Added current connection and sync details to tester bug reports without sending livestock records
- Corrected outdated onboarding language that incorrectly said cloud accounts were not available
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

Existing accounts and livestock data use the same storage key and Supabase table. No tester record migration is required. Backups and manual conflict choices remain available for genuine overlapping edits.
