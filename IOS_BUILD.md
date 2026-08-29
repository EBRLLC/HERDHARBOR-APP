# HerdHarbor Alpha v1.5.1 iOS build

HerdHarbor uses Capacitor to package the existing offline-capable web application as an iOS app. The Alpha v1.5.1 iOS path stages the same versioned JavaScript, membership, offline-cache, PWA-update, and privacy-safe monitoring assets as the web and Android review builds. The Apple bundle identifier is `com.ebrllc.herdharbor`, matching the Android application identifier.

This branch reconciles the app shell for Alpha v1.5.1. It does not submit or publish a build as part of release acceptance.

## Codemagic prerequisites

1. Create the HerdHarbor iOS app record in App Store Connect using bundle identifier `com.ebrllc.herdharbor`.
2. In App Store Connect, create an App Store Connect API key with App Manager access.
3. In Codemagic team settings, connect that key under **Developer Portal** using the existing `HerdHarbor` App Store Connect integration named in `codemagic.yaml`.
4. In Codemagic code-signing settings, generate or fetch an Apple Distribution certificate and an App Store provisioning profile for `com.ebrllc.herdharbor`.
5. In the HerdHarbor Codemagic application, select `agent/ios-codemagic-build`, check for `codemagic.yaml`, and run **HerdHarbor iOS TestFlight** only after release approval.

6. Add `HERDHARBOR_SENTRY_DSN` as a Codemagic secure environment variable. The GitHub Actions secret is not automatically available to Codemagic; the value must never be committed or printed.

The workflow stages the Alpha v1.5.1 web files, builds the pinned monitoring bundle, generates the production monitoring config from the secure DSN, synchronizes the Capacitor iOS project, applies Apple signing, and creates a signed IPA. It sets marketing version `1.5.1` and uses an Apple build number of at least `10` (the previously submitted build was `9`). It does not include a native Sentry SDK: monitoring is JavaScript-only inside the Capacitor WebView. Upload to App Store Connect and distribution to external testers remain separate, approval-gated actions.

## Local macOS maintenance

```sh
npm ci
npm run build:monitoring
HERDHARBOR_MONITORING_ENVIRONMENT=production HERDHARBOR_BUILD_ID=ios-local HERDHARBOR_SENTRY_DSN='use-a-secure-local-value' npm run build:monitoring-config
npm run sync:ios
npx cap open ios
```

The generated `web/`, CocoaPods, archives, and IPA files are intentionally ignored. Source web releases continue to deploy through the existing GitHub Pages workflow, and the Android Bubblewrap project is unchanged.
