# HerdHarbor Pre-Alpha v0.2.13

HerdHarbor is an installable farm and livestock recordkeeping app for the current private tester group.

## Current capabilities

- Protected email/password accounts and password recovery
- Cloud synchronization with an offline device copy
- Conflict detection when two devices edit the same account
- Atomic cloud updates so a stale device cannot silently overwrite newer records
- Automatic local recovery snapshots before material changes or conflict resolution
- Installable PWA for Android, iPhone/iPad, Windows, macOS, and supported browsers
- Animals, breeding, litters, pedigrees, health, tasks, budgeting, photos, farm branding, breed memory, and dark mode
- JSON backup export and import

## Data-safety design

The application state remains in `localStorage` for immediate offline operation. Each signed-in account also has:

- a last-confirmed cloud base used for conflict checks;
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
- If HerdHarbor reports a sync conflict, both copies are retained. Open **Account** and choose which copy to keep.
- Do not clear browser/site data while unsynced changes are present.
- Report issues through the in-app **Send feedback** button.

## Deployment

The live custom domain is configured by `CNAME` and deployed from the `main` branch through GitHub Pages.
