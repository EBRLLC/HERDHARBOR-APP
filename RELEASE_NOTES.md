# HerdHarbor Pre-Alpha v0.2.14

This release adds a per-device mobile screen rotation control while preserving the protected PWA and cloud-sync behavior from v0.2.13.

## Highlights

- Added an Auto-rotate On/Off switch to Settings
- Defaults mobile devices to portrait lock so the app does not rotate unexpectedly
- Stores the preference only on the current device instead of adding it to cloud farm records
- Uses the native Screen Orientation API when the installed app and browser support it
- Uses a portrait guard on browsers that cannot provide a native orientation lock
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

Existing account and livestock data uses the same storage key and Supabase table. The rotation preference is separate from farm data, and no tester record migration is required.
