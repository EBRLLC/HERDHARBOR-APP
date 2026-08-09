# HerdHarbor Pre-Alpha v0.5.3

HerdHarbor is an installable farm and livestock recordkeeping app for the current private tester group.

## Current capabilities

- Protected email/password accounts and password recovery
- Cloud synchronization with an offline device copy
- Visible sync status, last-confirmed timestamp, and a manual **Sync now** control in Settings
- Automatic record-by-record merging when two devices change different records or fields
- Conflict detection when two devices change the same field or one deletes a record the other edits
- Atomic cloud updates so a stale device cannot silently overwrite newer records
- Automatic local recovery snapshots before material changes or conflict resolution
- Installable PWA for Android, iPhone/iPad, Windows, macOS, and supported browsers
- Portrait-only orientation for the installed mobile app
- Animals, breeding, births and litters, pedigrees, health, tasks, budgeting, production and sales, photos, farm branding, breed memory, and dark mode
- Customer and buyer records with phone, email, address, and private farm notes
- Multi-animal quotes, reservations, and completed sales with discounts, tax/fees, balances, and Available/Reserved/Sold status handling
- Deposits and payments with receipts and exactly one linked Budget income record per payment
- Printable invoices, receipts, bills of sale, and animal or cage/pen QR cards
- Private QR deep links that open the correct animal after the farm owner signs in
- Downloadable animal-transfer files containing the animal and a three-generation pedigree, with duplicate-safe import into another HerdHarbor account
- Species-aware breeding schedules with pregnancy checks, expected-birth preparation, due dates, and deterministic task reminders
- Birth outcomes for born alive, stillborn, fostered, lost, and weaned young, with expected-weaning reminders
- One-step offspring creation with individual names, tags, sex, sire, dam, birth-record links, and automatic pedigree connections
- Breeding success, birth survival, and dam-performance reports with year filtering and downloadable Excel reports
- Monthly and full-year Budget views with 12-month income, operating-expense, capital-expense, net, cost-per-head, budget-versus-actual, transaction, and CSV reporting
- Daily, weekly, every-two-weeks, monthly, and custom recurring tasks with duplicate-safe next occurrences
- A Today workflow that keeps overdue work visible until it is completed or rescheduled
- Task search plus status, category, and animal filters, with one-tap move-to-tomorrow and dashboard completion
- Quantity-based egg, broiler, dairy, hay, and custom farm-product records with sold, household, feed, stored, donated, and waste allocations
- One-tap egg, milk, broiler, hay, and custom-product entry plus safe repeat-last-entry cloning
- Daily, weekly, monthly, and yearly production totals with product, species, animal, and date filters
- Revenue, average unit price, on-farm use, donation, waste rate, production-drop warnings, and animal/group comparisons
- Individual-animal production history plus printable and downloadable Excel Production & Sales reports
- Optional flock, herd, batch, hay-field, and cutting names preserved through cloud sync and Excel import/export
- Linked product-sale income that updates Budgeting without duplicate transactions
- Reviewed `.xlsx`/`.xlsm` imports for Animals, Customers, Sales, Payments, Breeding, Births, Production, actual transactions, annual planned budgets, and Medical records
- Row-by-row import corrections with a downloadable issue report
- Downloadable Excel import template with duplicate and validation checks
- One-click Excel export for Animals, Customers, Sales, Payments, Breeding, Births, Medical, Production, actual Budgeting, and annual planned budgets
- JSON backup export and import

## Data-safety design

The application state remains in `localStorage` for immediate offline operation. Each signed-in account also has:

- a last-confirmed cloud base used for safe three-way merges and conflict checks;
- a per-user offline recovery copy;
- a dirty marker retained until cloud confirmation;
- serialized writes so older requests cannot finish after newer requests;
- compare-and-swap updates using the cloud row's `updated_at` value;
- IndexedDB recovery snapshots retained on the device.

Authentication and Supabase data requests are never handled by the service-worker cache. The service worker caches only the static application shell.

## Install

Open `https://app.herdharbor.com`, sign in, then use **Install app** or **Settings → Install HerdHarbor**. On iPhone and iPad, use Safari's **Share → Add to Home Screen**.

## Important tester guidance

- Keep periodic downloaded JSON backups for important farm records.
- HerdHarbor automatically combines non-overlapping changes from multiple devices. If it reports a true same-field conflict, both copies are retained; open **Account** and choose which copy to keep.
- Review every spreadsheet import before confirming it. Imports add records and never replace the current farm record.
- Annual budget columns remain yearly planned figures. They never become dated actual transactions.
- Do not clear browser/site data while unsynced changes are present.
- Report issues through the in-app **Send feedback** button.
- Use **Settings → Cloud sync** to confirm the latest cloud save before switching devices.

## Deployment

The live custom domain is configured by `CNAME` and deployed from the `main` branch through GitHub Pages.
