# HerdHarbor v0.2.14 Release Checklist

## Mobile rotation

- Open Settings and confirm **Auto-rotate: Off** is the default on a device that has no saved preference
- Rotate an Android installed app and confirm HerdHarbor remains upright in portrait
- Turn Auto-rotate on and confirm the app follows the device orientation
- Turn Auto-rotate off again and confirm portrait lock returns
- On an iPhone/iPad or browser without native orientation locking, turn the device sideways and confirm the portrait guard appears
- Reload the app and confirm the selected rotation preference remains on that device
- Sign into the same account on a second device and confirm its rotation preference remains independent

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
