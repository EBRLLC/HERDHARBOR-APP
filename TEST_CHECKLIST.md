# HerdHarbor v0.3.06 Release Checklist

## Faster production entry

- Open Budgeting and confirm Eggs, Milk, Broilers, and Custom product quick-entry buttons open the correct form defaults
- Add an entry, select **Repeat last entry**, and confirm quantities, assignments, customer, notes, and group/batch name are copied to a new record dated today
- Confirm repeating an entry creates a new ID and exactly one new linked income transaction rather than changing or duplicating the source transaction
- Use the Repeat action on a historical row and confirm the source record remains unchanged
- Add a flock, herd, or broiler batch name and confirm it remains after reload and on a second device

## Production reports

- Switch between Today, This week, This month, This year, and All records
- Enter a custom From and To range and confirm the app safely corrects a reversed range
- Filter by product, species, and animal and confirm every total, warning, comparison, and history row updates
- Switch **Totals by** between Day, Week, Month, and Year
- Confirm quantities remain separated by product and unit and are never added across eggs, dozens, gallons, birds, pounds, or custom units
- Confirm product totals show produced, sold, used on farm/stored, donated, waste amount/rate, average sale price, and revenue
- Confirm an individual dairy cow's History action filters to that cow and Milk
- Compare two cows, two named flocks/herds, and two named broiler batches
- With three prior daily entries, add a newest daily quantity at least 25% lower and confirm the production-drop warning appears
- Add 10% or more waste for a report period and confirm the waste warning appears
- Print the report and confirm its totals, comparisons, warnings, and detailed history are readable
- Download the Production report and confirm its Overview, Product Totals, Period Totals, Comparisons, Production History, and Warnings sheets open cleanly
- Confirm the Excel report uses typed dates, numbers, currency, and percentages and keeps long headers readable
- Import/export a Production record with a group/flock/herd/batch name and confirm it round-trips unchanged

## Production and sales

- Add an egg record with collected, sold, household, hatching, and waste quantities
- Confirm allocated quantities cannot exceed the total collected
- Add sale income and confirm exactly one linked **Egg Sales** transaction appears in Budgeting
- Edit the egg quantity and sale amount and confirm the linked transaction updates instead of duplicating
- Remove sale income and confirm only the linked income transaction is removed
- Add a broiler batch with birds processed, birds sold, frozen or household quantities, loss/condemned quantity, and total batch weight
- Add a milk record assigned to an individual cow with morning/evening session, sold, household, calf feed, stored, and discarded quantities
- Confirm milk discard quantity and reason remain visible after reload and on a second device
- Add a custom product and confirm its quantity, unit, sale income, and notes are retained
- Filter Budgeting by month and species and confirm matching production records and summaries appear
- Delete a production record and confirm its linked income is deleted after confirmation
- Edit a production-linked transaction from the transaction table and confirm HerdHarbor opens the source production record

## Automatic multi-device merge

- Start two devices from the same confirmed cloud copy
- Change different animals on each device and confirm both changes save automatically
- Change different fields on the same animal and confirm both field values survive
- Add a medical record on one device and a budgeting record on the other and confirm both survive
- Confirm device theme and sidebar preferences do not create a farm-data conflict
- Edit the same field differently on both devices and confirm synchronization pauses for a protected choice
- Delete a record on one device while editing it on the other and confirm synchronization pauses
- Confirm automatic merging creates recovery snapshots for both the local and cloud copies
- Make another local edit while a merge is saving and confirm the newest edit is rebased and saved
- Confirm automatic sync resumes after a successful merge

## Visible cloud sync

- Open Settings and confirm the cloud card shows the current status, connection, pending-change state, and last-synced timestamp
- Add or edit a record and confirm the card moves through a pending/saving state to **Protected**
- Select **Sync now** and confirm the newest local records reach **Saved to cloud**
- Disconnect the device and confirm HerdHarbor says the offline copy is protected
- Reconnect and confirm pending changes save automatically
- Confirm the sidebar indicator matches the Settings status
- Confirm a genuine overlapping multi-device conflict is shown as action required and neither copy is erased

## Excel record export

- Select **Export records to Excel** from Settings
- Confirm the workbook opens with Overview, Animals, Medical, Production, Budgeting, and Annual Budget sheets
- Confirm headers are readable, frozen, filtered, and date/currency columns retain their types
- Confirm animal parent references, medical-to-animal links, and animal-assigned transactions use a unique animal reference
- Confirm annual planned figures remain annual plans and are not listed as actual transactions
- Confirm production quantities, allocations, waste reasons, batch weights, and sale income remain typed values on the Production sheet
- Confirm production-linked income is not duplicated on the Budgeting sheet and is recreated from Production during import
- Upload the exported workbook to the reviewed importer and confirm the counts, dates, amounts, and animal links round-trip correctly
- Confirm values beginning with `=`, `+`, `-`, or `@` are exported as text rather than executable spreadsheet formulas

## Import diagnostics

- Import a workbook containing invalid dates, amounts, animal references, statuses, species, and weights
- Confirm each problem includes a specific **How to fix** explanation
- Select **Download issue report** and confirm the CSV includes workbook, sheet, row, level, problem, and correction columns
- Confirm the review still imports valid rows only after explicit confirmation

## Excel spreadsheet import

- Download the HerdHarbor Excel template from Settings and confirm it opens with Instructions, Animals, Production, Budgeting, Annual Budget, and Medical sheets
- Import a workbook containing valid rows in all five data sheets
- Confirm the review screen shows correct ready, skipped, warning, and error counts
- Confirm no records are added before **Import records** is selected
- Confirm approved animals, production, transactions, annual plans, and medical records appear in their normal app sections
- Import the same workbook again and confirm duplicate records are skipped
- Confirm Medical and animal-assigned Budgeting rows match animals by tag, tattoo, registration number, or unique name
- Confirm missing or ambiguous animal references are rejected without changing existing records
- Confirm sire and dam references connect when they match an existing or newly imported animal
- Confirm invalid dates, amounts, status values, and unsupported species are flagged by sheet and row
- Confirm annual budget columns create yearly plan records and do not create actual transactions
- Confirm annual plan expense, projected income, and projected net totals reconcile to the source workbook
- Confirm a workbook without a Year column shows the current import year in review
- Confirm Breeding, Growing, and Retired statuses import without excluding active livestock
- Confirm Neutered Male imports as Male while preserving the original label in animal notes
- Confirm medical condition, treatment, medication, dose, provider, cost, follow-up status, and notes remain readable
- Test in a U.S. timezone and confirm Excel dates do not shift backward one day
- Import a valid prefixed-XML `.xlsx` workbook and confirm it opens without a parser error
- Confirm a legacy `.xls` file is rejected with instructions to resave it as `.xlsx`
- Confirm a workbook over 10 MB and a workbook over 5,000 data rows are rejected
- Confirm the imported records reach **Saved to cloud**, survive reload, and appear on a second device
- Confirm the spreadsheet itself is never sent through an app network request
- Import Egg Production, Broiler Production, and Milk Production sheets without a Product column and confirm the sheet name supplies the correct product
- Confirm an imported milk record preserves calf-feed quantity, discarded quantity, discard reason, and optional sale income

## Mobile rotation

- Confirm `manifest.json` reports `"orientation": "portrait"`
- Open Settings and confirm the Auto-rotate control is gone
- Rotate an Android installed app and confirm HerdHarbor remains in portrait
- Add HerdHarbor to an iPhone/iPad Home Screen, launch it from the icon, and confirm it remains in portrait
- Confirm no portrait-warning overlay appears in either portrait or landscape browser windows
- Confirm the regular browser page remains usable if the browser ignores installed-app orientation preferences

## Existing-data protection

- Sign in to an existing tester account and confirm all current records load
- Add an animal and confirm the Account status reaches **Saved to cloud**
- Reload and confirm the animal remains
- Turn off the connection, edit a record, close and reopen the app, and confirm the offline copy remains
- Reconnect and confirm the pending change reaches the cloud
- Confirm signing out is blocked while an unsynced change cannot be saved
- Download an Account safety backup and confirm it contains the current profile and animals

## Multi-device conflict protection

- Open the same test account on two devices
- Make both devices start from the same cloud data
- Take one device offline and edit a record
- Edit and sync a different record on the online device
- Reconnect the offline device
- Confirm HerdHarbor automatically combines changes to different records
- Repeat with both devices changing the same field and confirm HerdHarbor pauses instead of silently overwriting either copy
- Test **Keep this device's records**
- Repeat and test **Use cloud records**

## Installation and updates

- Confirm the manifest reports HerdHarbor with 192px and 512px icons
- Install on Android or a desktop browser
- Add to Home Screen from Safari on iPhone/iPad
- Confirm the installed app opens in standalone mode
- Confirm the app shell opens without a connection for a previously signed-in tester
- Confirm cloud/auth requests are absent from Cache Storage
- Publish a service-worker version change and confirm the update prompt appears
- Confirm an update is paused when unsynced data cannot be protected

## Regression

- Test sign in, sign out, account creation, and password reset
- Confirm no random sign-in flash appears
- Test animals, breeding, litters, pedigrees, health, tasks, budgeting, production and sales, photos, breed memory, and dark mode
- Test JSON export/import
- Test on phone and desktop sizes
