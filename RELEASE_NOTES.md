# HerdHarbor Pre-Alpha v0.2.15

This release corrects the ineffective v0.2.14 rotation control by making the installed HerdHarbor PWA portrait-only.

## Highlights

- Changed the web app manifest orientation from `any` to `portrait`
- Removed the Auto-rotate setting because web browsers cannot provide a dependable cross-platform On/Off lock
- Removed the portrait warning overlay that covered the app without preventing device rotation
- Kept the installed mobile experience portrait-only at the application-manifest level
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

Existing accounts and livestock data use the same storage key and Supabase table. No tester record migration is required. Existing Home Screen installations may need to be removed and installed again before the operating system adopts the changed orientation manifest.
