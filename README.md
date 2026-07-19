# HerdHarbor Pre-Alpha v0.2.3

## Rabbitry Branding and Animal Photos

This update adds custom rabbitry branding and optional animal profile photos while preserving the existing budgeting, pedigree, breeding, litter, health, task, appearance, and tester-feedback systems.

The browser storage key is unchanged, so existing tester records should carry forward. Every tester should export a backup before updating.

## New in v0.2.3

### Custom rabbitry or farm logo

- Upload a custom logo under **Settings → Rabbitry branding**
- Supports JPG, PNG, and WebP
- Automatically resizes and compresses the logo
- Displays the logo beside the operation name in the app header
- Adds the custom logo to printable sale pedigrees
- Replace the logo at any time
- Remove it and return to the default HerdHarbor logo

### Animal profile photos

- Upload an optional photo when adding or editing an animal
- Supports JPG, PNG, and WebP
- Automatically creates a small compressed profile image
- Shows the photo:
  - on animal cards
  - in the animal detail screen
  - on printable sale pedigrees
- Replace or remove the photo at any time
- Animals without a custom photo continue using the default species icon

### Backup support

Rabbitry logos and animal profile thumbnails are included in the existing JSON backup and restore process.

## Important limitations

- Images are stored only in this browser
- Photos are compressed thumbnails, not full-resolution originals
- Adding photos to many animals can eventually reach the browser's storage limit
- Use default species icons for animals that do not need a photo
- There are still no cloud accounts or cross-device synchronization
- Export backups regularly

## Install on the tester site

1. Open `https://app.herdharbor.com`.
2. Go to **Settings → Export backup**.
3. Open the `HERDHARBOR-APP` GitHub repository.
4. Upload this package's `index.html` to the repository root.
5. Replace the existing `index.html`.
6. Commit directly to `main` with:

   `Release v0.2.3 rabbitry branding and animal photos`

7. Wait for GitHub Pages to redeploy.
8. Open:

   `https://app.herdharbor.com/?v=23`

9. Press `Ctrl + F5` if an older version appears.

## Rollback

Keep the existing v0.2.2, v0.2.1, and v0.2.0 GitHub releases available as rollback copies.
