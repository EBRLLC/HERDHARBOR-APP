# HerdHarbor v1.7.5 PWA Update Now Hotfix

This hotfix repairs the Update Now flow without auto-activating service workers or clearing user data.

## Production symptom

The Update Now button could remain stuck on Updating when a waiting worker did not produce a controllerchange event. A hard refresh loaded the current runtime, confirming the failure was in update activation/reload handling rather than the repaired animal UI.

## Fix

- guard against multiple simultaneous activation attempts
- wait for the existing controllerchange success path
- add an 8-second activation timeout
- refresh the registration on timeout
- fall back to a cache-busted navigation when activation stalls
- restore the button to Retry Update if postMessage itself fails
- preserve Update Now / Later user control and unsaved-work guidance
- preserve all farm state and Cloud Sync behavior
- cache-bust the updater script from pwa.js?v=29 to pwa.js?v=30

## Validation

Focused PWA updater regression tests passed. The complete HerdHarbor regression suite passed after updating the two shell-identity contracts to the intentional pwa.js?v=30 asset revision.
