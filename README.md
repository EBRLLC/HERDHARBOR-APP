# HerdHarbor Pre-Alpha v0.3.07

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
- Animals, breeding, litters, pedigrees, health, tasks, budgeting, production and sales, photos, farm branding, breed memory, and dark mode
- Daily, weekly, every-two-weeks, monthly, and custom recurring tasks with duplicate-safe next occurrences
- A Today workflow that keeps overdue work visible until it is completed or rescheduled
- Task search plus status, category, and animal filters, with one-tap move-to-tomorrow and dashboard completion
- Quantity-based egg, broiler, dairy, and custom farm-product records with sold, household, feed, stored, donated, and waste allocations
- One-tap egg, milk, broiler, and custom-product entry plus safe repeat-last-entry cloning
- Daily, weekly, monthly, and yearly production totals with product, species, animal, and date filters
- Revenue, average unit price, on-farm use, donation, waste rate, production-drop warnings, and animal/group comparisons
- Individual-animal production history plus printable and downloadable Excel Production & Sales reports
- Optional flock, herd, and batch names preserved through cloud sync and Excel import/export
- Linked product-sale income that updates Budgeting without duplicate transactions
- Reviewed `.xlsx`/`.xlsm` imports for Animals, Production, actual transactions, annual planned budgets, and Medical records
- Row-by-row import corrections with a downloadable issue report
- Downloadable Excel import template with duplicate and validation checks
- One-click Excel export for Animals, Medical, Production, actual Budgeting, and annual planned budgets
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
