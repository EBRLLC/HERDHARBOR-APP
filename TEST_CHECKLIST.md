# HerdHarbor v0.3.01 Release Checklist

## Excel spreadsheet import

- Download the HerdHarbor Excel template from Settings and confirm it opens with Instructions, Animals, Budgeting, and Medical sheets
- Import a workbook containing valid rows in all three data sheets
- Confirm the review screen shows correct ready, skipped, warning, and error counts
- Confirm no records are added before **Import records** is selected
- Confirm approved animals, transactions, and medical records appear in their normal app sections
- Import the same workbook again and confirm duplicate records are skipped
- Confirm Medical and animal-assigned Budgeting rows match animals by tag, tattoo, registration number, or unique name
- Confirm missing or ambiguous animal references are rejected without changing existing records
- Confirm sire and dam references connect when they match an existing or newly imported animal
- Confirm invalid dates, amounts, status values, and unsupported species are flagged by sheet and row
- Confirm a legacy `.xls` file is rejected with instructions to resave it as `.xlsx`
- Confirm a workbook over 10 MB and a workbook over 5,000 data rows are rejected
- Confirm the imported records reach **Saved to cloud**, survive reload, and appear on a second device
- Confirm the spreadsheet itself is never sent through an app network request

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
- Confirm HerdHarbor pauses instead of silently overwriting either copy
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
- Test animals, breeding, litters, pedigrees, health, tasks, budgeting, photos, breed memory, and dark mode
- Test JSON export/import
- Test on phone and desktop sizes
