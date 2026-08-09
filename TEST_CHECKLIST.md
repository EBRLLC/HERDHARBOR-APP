# HerdHarbor v0.5.1 Launch-Hardening Checklist

## Customers and animal sales

- Add, edit, search, and delete an unused customer; confirm a customer referenced by a sale cannot be deleted
- Create a multi-animal sale and confirm each selected animal appears once with its asking price
- Confirm the same animal cannot be placed on two active Draft or Reserved sales
- Move a sale through Draft, Reserved, Completed, and Cancelled and confirm its animals move through For Sale, Reserved, Sold, and back to For Sale as appropriate
- Confirm discount and tax/fee values cannot be negative and that the total, paid amount, and balance reconcile
- Edit a customer or sale and confirm linked payment descriptions in Budgeting update without creating extra transactions
- Delete a sale and confirm its payments and linked Budget income are removed only after confirmation

## Payments, documents, and QR cards

- Record a Deposit and a Payment with date, method, reference, and notes and confirm payment above the remaining balance is rejected
- Confirm each payment creates exactly one linked Animal Sales income record in Budgeting and editing it opens the source Payment form
- Edit and delete a payment and confirm the linked Budget record updates or is removed without duplication
- Print an invoice, receipt, and bill of sale and confirm the farm, customer, animals, totals, payment history, pedigree summary, and signature lines are readable
- Print one animal QR card, one cage/pen card, and bulk cards for the current animal filter
- Scan a QR card while signed out, sign in to the owning account, and confirm HerdHarbor opens only the referenced animal
- Confirm the QR library and cards work from the installed app's cached shell while offline

## Digital animal transfers

- Download a transfer from a completed sale and confirm it contains only the subject animal, transfer identifiers, buyer/seller labels, and up to three pedigree generations
- Import the transfer into another account and confirm the subject becomes Active while new pedigree-only ancestors become Ancestor Only
- Confirm imported sire, dam, grandparent, and great-grandparent links point to the correct imported or matched records
- Import the same file again and confirm the transfer is skipped instead of duplicating the animal
- Confirm an existing ancestor is matched by registration number, tattoo, or tag rather than duplicated
- Confirm an invalid or partially failing transfer rolls back without leaving partial animals or transfer history

## Excel customers, sales, and payments

- Export records and confirm Customers, Sales, and Payments sheets contain typed dates and amounts with readable frozen headers
- Confirm a multi-animal sale uses one row per animal and retains one sale number, customer, status, totals, and payment history after reimport
- Confirm payment-linked Budget transactions are excluded from the Budgeting sheet and recreated exactly once from Payments during import
- Confirm spreadsheet import rejects duplicate active animal sales, unknown customers or animals, invalid statuses, negative values, and overpayments
- Download the template and confirm Customers, Sales, and Payments sheets and their validation lists are present
- Edit customers, sales, and payments on separate devices and confirm record-level cloud merging preserves non-overlapping changes

## Animals and pedigree builder hotfix

- Open Animals and confirm the status filter defaults to Active and only exact Active-status records appear initially
- Select Any status and confirm Active, Breeding, Growing, Retired, For Sale, Reserved, Sold, Deceased, and Ancestor Only records can still be shown
- Select Ancestor Only and confirm ancestor records remain available without appearing in the default Active view
- Open the Guided Pedigree Builder and confirm its header shows v0.5.0 instead of v0.2.1

## Breeding and pregnancy workflow

- Record rabbit, cattle, goat, sheep, pig, horse, and dog breedings and confirm species-appropriate pregnancy-check, preparation, expected-birth, and weaning dates are suggested
- Confirm testers can override every suggested date without the app changing it back
- Record natural, artificial insemination, embryo transfer, and other breeding methods
- Mark pregnancy checks Pending, Positive, Negative, Inconclusive, or Not checked and confirm the breeding status follows the result
- Confirm a negative pregnancy result closes future preparation and expected-birth reminders without deleting the breeding history
- Confirm positive or confirmed breedings retain pregnancy-check history and keep the expected-birth reminder
- Edit a breeding from a second device and confirm non-overlapping field changes merge automatically
- Change the same breeding field differently on two devices and confirm normal protected conflict handling remains active

## Births, litters, and offspring

- Record Unassisted, Assisted, Cesarean, Induced, and Unknown birth types
- Record born alive, stillborn, fostered in, fostered out, later lost, and weaned counts and confirm negative, fractional, or impossible totals are rejected
- Link a birth to a breeding and confirm the breeding becomes Delivered and its pregnancy/birth reminders close
- Confirm the expected-weaning date follows the linked animal species and can be overridden
- Confirm one deterministic weaning task is created and saving again or merging from another device does not duplicate it
- Create kept offspring from a birth and provide an individual name, tag, and sex for each animal
- Confirm every created offspring receives the birth date, species, breed, location, sire, dam, and source-birth record
- Open offspring pedigrees and confirm the linked sire and dam appear automatically
- Run offspring creation from two devices based on the same birth and confirm deterministic IDs prevent duplicate animals
- Delete a birth record and confirm already-created offspring animals are preserved while their source-birth links are cleared safely

## Breeding reports

- Filter breeding history by All years and a selected year and confirm all totals and detail rows use the same period
- Confirm conception rate, delivery rate, live-born, stillborn, lost, weaned, and survival rate reconcile to the underlying records
- Compare dams and confirm breedings, confirmed pregnancies, births, live-born, weaned, and average live-born counts are correct
- Download the Breeding & Birth report and confirm Overview, Dam Performance, Breeding History, and Birth History sheets open cleanly
- Confirm report dates are typed dates, counts are typed whole numbers, rates are typed percentages, headers are frozen/readable, and no formulas or values are clipped

## Full-year budgeting

- Switch Budget view between Monthly and Full year and confirm the selected mode remains active while changing species or transaction filters
- Select 2026 in Full year and confirm only transactions dated January 1 through December 31, 2026 are included
- Confirm Income, Operating expenses, Capital expenses, Net, and Cost per head match the sum of the twelve monthly views
- Confirm the monthly breakdown always shows January through December, including zero-activity months
- Confirm yearly category plans equal the sum of the monthly budgets entered in that year
- Confirm a monthly head-count override still applies only to that month and Full year averages all available overrides in the selected year
- Confirm the Full year transaction list includes every matching 2026 record and no 2025 or 2027 records
- Export CSV in Monthly and Full year modes and confirm the filename and included records match the selected period
- Switch to Full year and confirm Production & Sales automatically uses January 1 through December 31 of the selected year
- Change years in Full year mode and confirm the annual planned budget section follows the same selected year

## Hay production and sales

- Confirm Hay appears beside Eggs, Milk, and Broilers in Quick entry and in the Product form
- Confirm a new Hay entry defaults to Whole operation and bales
- Record square bales, round bales, pounds, kilograms, and tons without combining incompatible units in reports
- Add harvested, sold, fed, stored, donated, and spoiled quantities and confirm allocations cannot exceed total hay
- Add a field or cutting name and confirm comparisons label it as Field / Cutting
- Add hay sale income and confirm exactly one linked Other Income transaction is created and updated without duplication
- Import Hay, hay bales, round hay bales, and fodder from Excel and confirm they normalize to Hay
- Download the Excel template and confirm Hay plus bale units appear in the Production validation lists
- Export and reimport Hay production and confirm product, unit, quantities, field/cutting name, customer, income, and notes round-trip unchanged

## Recurring tasks and daily workflow

- Create daily, weekly, every-two-weeks, monthly, and custom-day tasks and confirm each schedule label is correct
- Complete each recurring task and confirm exactly one open next occurrence is created with the same title, category, animal, notes, and recurrence
- Reopen and complete the same task again and confirm a second next occurrence is not created
- On two devices, complete the same recurring task from the same cloud base and confirm the deterministic next occurrence merges without duplication
- Create monthly tasks due January 29, 30, and 31 and confirm the next dates clamp to the last valid February date, including February 29 in a leap year
- Confirm one-time tasks do not create a next occurrence
- Complete a recurring task several intervals late and confirm HerdHarbor schedules the next future occurrence without creating missed-date backlog records
- Confirm Today includes both tasks due today and overdue tasks
- Confirm Upcoming excludes today and overdue tasks
- Filter by category, linked animal, completion state, and search text
- Select **Tomorrow** and confirm the task moves to tomorrow without changing its recurrence
- Complete a task from the dashboard **Today’s work** panel and confirm the Task screen and cloud copy update
- Confirm task controls remain readable and tappable on phone and desktop sizes

## Faster production entry

- Open Budgeting and confirm Eggs, Milk, Broilers, Hay, and Custom product quick-entry buttons open the correct form defaults
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
- Confirm the workbook opens with Overview, Animals, Customers, Sales, Payments, Breeding, Births, Medical, Production, Budgeting, and Annual Budget sheets
- Confirm headers are readable, frozen, filtered, and date/currency columns retain their types
- Confirm animal parent references, source-birth references, medical-to-animal links, and animal-assigned transactions use a unique record reference
- Confirm breeding dam/sire links, pregnancy dates/results, methods, and statuses remain typed and readable
- Confirm birth links, parent links, outcome counts, expected-weaning dates, and offspring source-birth links round-trip unchanged
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

- Download the HerdHarbor Excel template from Settings and confirm it opens with Instructions, Animals, Customers, Sales, Payments, Breeding, Births, Production, Budgeting, Annual Budget, and Medical sheets
- Import a workbook containing valid rows in every supported data sheet
- Confirm the review screen shows correct ready, skipped, warning, and error counts
- Confirm no records are added before **Import records** is selected
- Confirm approved animals, customers, sales, payments, breedings, births, production, transactions, annual plans, and medical records appear in their normal app sections
- Import the same workbook again and confirm duplicate records are skipped
- Confirm Medical and animal-assigned Budgeting rows match animals by tag, tattoo, registration number, or unique name
- Confirm missing or ambiguous animal references are rejected without changing existing records
- Confirm sire and dam references connect when they match an existing or newly imported animal
- Confirm imported breeding and birth IDs link correctly and imported offspring attach to the matching source-birth record
- Confirm imported linked births mark the related breeding Delivered and generate no duplicate reminders
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
- Test animals, breeding, births and litters, offspring creation, pedigrees, health, tasks, budgeting, production and sales, photos, breed memory, and dark mode
- Test JSON export/import
- Test on phone and desktop sizes
