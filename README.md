# HerdHarbor Pre-Alpha v0.2.1

## Interface and Pedigree Workflow Update

This build preserves the existing browser data key used by v0.2.0, so current tester records should remain available after replacing `index.html`. Testers should still export a backup before updating.

## New in v0.2.1

### Cleaner interface

- Simplified and grouped sidebar navigation
- More whitespace and calmer card styling
- Collapsible desktop sidebar
- Improved mobile spacing and pedigree controls
- Existing HerdHarbor navy, teal, green, cream, and gray palette retained

### Light and dark appearance

- Persistent light/dark toggle in the app header
- New-user default follows the device appearance
- Light, dark, and system options in Settings
- The selected appearance remains after closing the app
- Printable pedigrees always use a clean white page

### Easier pedigree workflow

- Five-step guided pedigree builder:
  1. Animal and source
  2. Parents
  3. Grandparents
  4. Great-grandparents
  5. Review and save
- Each ancestor can be linked to an existing record, entered as a new ancestor, or left unknown
- Simplified duplicate warnings
- Save an unfinished pedigree as a draft and resume later
- Drafts are listed on the Pedigrees page
- Drag-and-drop pedigree upload
- Large JPG and PNG photos are automatically resized and compressed
- PDF limit increased to 1.25 MB for this browser-only build

### Printable sale pedigree

- Print from an animal profile, completed pedigree, or pedigree details
- Includes:
  - animal identity and registration information
  - parents, grandparents, and great-grandparents
  - seller and buyer fields
  - sale date and price
  - transfer/certificate number
  - notes
  - buyer and seller signature lines
- Browser print dialog supports physical printing or Save as PDF

## Important limitations

- Records, drafts, and uploaded documents are still stored only in the browser
- There are no cloud accounts or cross-device synchronization
- Automatic OCR is not included
- PDFs cannot be compressed in the browser
- Clearing browser storage may erase records
- Export regular JSON backups

## Install on the tester site

1. Open `https://app.herdharbor.com`.
2. Export a JSON backup from **Settings → Export backup**.
3. Open the `HERDHARBOR-APP` GitHub repository.
4. Upload this package's `index.html` to the repository root.
5. Replace the existing `index.html`.
6. Commit directly to `main` with:

   `Release v0.2.1 interface and pedigree workflow`

7. Wait for GitHub Pages to redeploy.
8. Open:

   `https://app.herdharbor.com/?v=21`

9. Press `Ctrl + F5` on desktop if an older version appears.

## Rollback

The existing GitHub release `v0.2.0-pre-alpha` remains the rollback copy.
