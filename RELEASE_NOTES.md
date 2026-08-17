# HerdHarbor Alpha v1.0.3

## v1.0.3 workflow and storage efficiency

- Stopped no-op saves from rewriting the complete farm record or starting unnecessary cloud work.
- Kept device-only theme and sidebar preferences local without creating recovery snapshots or uploading unchanged farm data.
- Removed conflicting code paths that recreated the redundant current-user cache after cloud synchronization.
- Deduplicated recovery points and bounded their IndexedDB footprint while retaining up to six recent safety states.
- Reduced the target size of newly uploaded animal photos and operation logos.
- Coalesced rapid search updates for Animals, Tasks, and Sales to reduce repeated layout and rendering work.
- Added a Device storage card in Settings with active-record size, total origin usage, estimated available space, and persistence status.
- Retained the existing storage key, cloud schema, account records, and backup format so no farm-data migration is required.
- Kept four-generation printed pedigrees on one landscape page with the restored readable type scale.

## v1.0.0 alpha and Google Play readiness

- Promoted every current user-facing build label to alpha and standardized the release as HerdHarbor v1.0.0.
- Preserved the existing internal browser-storage key so current tester records continue loading without migration or duplication.
- Added Google Play package configuration for version code 1 and Android 16 / API level 36.
- Added store-listing copy, Data safety guidance, account-deletion links, release notes, and submission checklists.
- Preserved the v0.5.4 tablet-containment and login-theme corrections as part of the v1.0.0 alpha release.

## v0.5.4 tablet layout and login color correction

- Constrained the document, app shell, workspace, views, grids, cards, rows, and dialogs to the available tablet width so the page cannot slide into an empty blue area.
- Made long activity messages, spreadsheet filenames, labels, and supporting text wrap inside their cards instead of pushing adjacent panels out of place.
- Changed tablet dashboard and budget layouts to a single content column before the sidebar makes either column too narrow.
- Kept wide tables and pedigree charts usable with contained horizontal scrolling instead of widening the entire document.
- Compacted top-bar actions at tablet portrait widths while retaining their accessible labels and touch targets.
- Made sign-in, sign-up, password recovery, inputs, messages, and autofill colors explicitly follow HerdHarbor's light or dark theme with AA text contrast.
- Preserved existing account data, cloud records, local recovery, storage keys, and the installed phone app's portrait preference; no data migration is required.

## v0.5.3 mobile pedigree and storage correction

- View Pedigree now renders a real in-app ancestry chart from the saved pedigree record on phones.
- Print Pedigree now uses an in-app mobile preview instead of relying on a blocked popup.
- Printed ancestry honors the saved pedigree mapping even when the animal record does not yet have direct parent links.
- Removed the redundant third full farm-state copy that was exhausting mobile `localStorage`; the active state, cloud merge baseline, IndexedDB recovery, and downloadable backups remain protected.

## Mobile pedigree hotfix

- Completed pedigree records now use a mobile-safe tap handler in installed-app mode.
- Pedigree PDFs no longer rely on embedded PDF viewers that fail in iOS/Android standalone apps.
- Phone-size pedigree actions meet a 44-pixel touch target and remain visible across the card width.
- Modals use dynamic viewport and safe-area sizing, scroll smoothly, and prevent background scrolling.
- Dark-mode colors were completed for mobile modal headers and pedigree source controls.
- Existing pedigree images and PDFs migrate automatically from limited localStorage into expanded IndexedDB attachment storage.
- New pedigree attachments and draft sources are stored outside the main farm record, preventing them from exhausting record storage.
- Full JSON and account safety backups reattach stored pedigree documents before download.

## Launch hardening

- Added signed-in account-deletion requests from Settings.
- Added direct links to public privacy, terms, support, and deletion pages.
- Clarified that clearing local data does not delete a cloud account.
- Expanded dark-mode text contrast coverage in Settings, dialogs, tables, and detail fields.
- Bumped the offline app shell so installed testers receive the fixes.

This release adds a complete customer-to-sale workflow while preserving existing animals, pedigrees, breeding and birth records, farm data, cloud synchronization, storage keys, recurring tasks, budgets, and production records.

## Sales, customers, QR cards, and transfers

- Added customer records with phone, email, mailing address, and private notes
- Added multi-animal Draft, Reserved, Completed, and Cancelled sales with item prices, discounts, tax/fees, due dates, terms, and balances
- Added Available, Reserved, and Sold animal workflow handling without removing the existing animal status choices
- Added deposits and payments with method, reference, notes, and overpayment protection
- Linked each received payment to exactly one Budget income transaction so invoices do not count as revenue before money is received
- Added printable invoices, receipts, and bills of sale with farm and buyer contact details, animal identity, pedigree summary, payment history, and signature lines
- Added printable animal and cage/pen QR cards, including bulk cards for the current animal filter
- Added authenticated QR deep links that open the selected animal without exposing farm data publicly
- Added downloadable transfer files with a subject animal and up to three pedigree generations
- Added duplicate-safe transfer import that matches existing ancestors by registration, tattoo, or tag and preserves pedigree relationships
- Added Customers, Sales, and Payments sheets to Excel import, export, and the downloadable template
- Kept customers, sales, payments, and transfer history inside the existing farm record and record-level multi-device merge system

## Tester-requested hotfix

- The Animals tab now defaults its status filter to Active so ancestor-only and other non-active records do not fill the initial animal list
- Any status and Ancestor Only remain available in the status filter whenever testers need those records
- The Guided Pedigree Builder now reads the shared current app version instead of displaying the stale v0.2.1 label
- No animal, ancestry, cloud-sync, account, or storage data format changed

## Highlights

- Added species-aware breeding schedules for rabbits, cattle, goats, sheep, pigs, horses, and dogs
- Added breeding method, pregnancy-check date and result, confirmation date, preparation date, expected birth date, status, and notes
- Added deterministic pregnancy-check, prepare-for-birth, expected-birth, and weaning tasks that do not duplicate across devices
- Added birth and litter records for live births, stillbirths, fostered in/out, later losses, and weaned young
- Added expected-weaning dates and reminders based on species or a tester-selected date
- Added one-step individual offspring creation with name, tag, sex, sire, dam, date of birth, source-birth record, and automatic pedigree links
- Added breeding history, conception rate, delivery rate, birth survival, and dam-performance reports with all-year or single-year filtering
- Added a downloadable Breeding & Birth report with Overview, Dam Performance, Breeding History, and Birth History sheets
- Added Breeding and Births sheets to Excel import, export, and the downloadable template
- Added source-birth references to Animals so exported offspring round-trip back to the correct birth record
- Kept imported records in review until explicit confirmation and kept all new data inside the existing farm record and cloud merge system

## Continued v0.3.08 capabilities

- Added a Monthly / Full year Budget view switch
- Added year selection based on the years present in transactions, monthly budgets, and annual plans
- Full-year mode calculates income, operating expenses, capital expenses, net, cost per head, and all matching transactions for January 1 through December 31
- Added a January-through-December table showing each month's income, operating expenses, capital expenses, and net
- Full-year budget comparisons sum the monthly category budgets entered for the selected year
- Full-year cost per head averages the available monthly head-count overrides and otherwise uses active animals
- Full-year CSV export includes every matching transaction in the selected year
- Switching Budget to Full year aligns Production & Sales to that same year's date range
- Added Hay as a built-in Production & Sales product and one-tap quick entry
- Added bales, square bales, round bales, and tons as production units
- Added hay defaults, field/cutting comparisons, linked Other Income transactions, and hay-specific form labels
- Added Hay and common aliases to Excel import, export, template validation, and production reports
- Preserved existing monthly views, custom products, farm records, and cloud synchronization without a migration

## Continued daily-workflow capabilities

- Added daily, weekly, every-two-weeks, monthly, and custom-day recurring tasks
- Completing a recurring task creates exactly one next occurrence while preserving completed history
- Added deterministic occurrence IDs so the same completion on two devices merges without creating duplicate tasks
- Added month-end clamping so January 29–31 monthly tasks remain valid in February and continue correctly afterward
- Late recurring-task completion advances to the next future occurrence instead of creating a backlog of already-overdue copies
- Added Today, Upcoming, Overdue, All open, and Completed task views
- Kept overdue work in Today until it is completed or explicitly rescheduled
- Added task search plus category and animal filters
- Added one-tap **Tomorrow** rescheduling
- Added a dashboard **Today’s work** panel with one-tap completion and recurring-task creation
- Added Feeding, Cleaning, Milking, Production, Breeding, Nest box, Weaning, Health, Maintenance, and Other task categories
- Preserved one-time tasks and existing tester records without a migration

## Continued production reporting capabilities

- Added one-tap entry buttons for eggs, milk, broilers, hay, and custom farm products
- Added **Repeat last entry** and per-row Repeat actions that copy the source values into a new dated record without copying its ID or linked transaction
- Added date-range, product, species, and animal filters
- Added daily, weekly, monthly, and yearly production totals without combining incompatible units
- Added average sale price per egg, dozen, gallon, bird, pound, kilogram, or custom unit
- Added exact produced, sold, used-on-farm, stored, donated, wasted, waste-rate, and revenue totals
- Added individual-animal production history for dairy cows and other tracked livestock
- Added comparisons between animals, flocks, herds, species, whole-operation records, and broiler batches
- Added an optional group, flock, herd, or batch name to Production entries
- Added basic warnings when filtered waste reaches 10% or the newest daily output is at least 25% below three or more recent entries
- Added printable Production & Sales reports
- Added a six-sheet Excel report with Overview, Product Totals, Period Totals, Comparisons, Production History, and Warnings
- Added group/flock/herd/batch support to Production Excel import, full record export, and the downloadable template
- Preserved linked sale-income deduplication and the v0.3.04 field-level multi-device merge
- Preserved the existing storage key, Supabase table, account records, and farm-data structure; no migration is required

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
