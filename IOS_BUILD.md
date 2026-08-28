# HerdHarbor iOS and TestFlight build

HerdHarbor uses Capacitor to package the existing offline-capable web application as an iOS app. The Apple bundle identifier is `com.ebrllc.herdharbor`, matching the Android application identifier.

## Codemagic prerequisites

1. Create the HerdHarbor iOS app record in App Store Connect using bundle identifier `com.ebrllc.herdharbor`.
2. In App Store Connect, create an App Store Connect API key with App Manager access.
3. In Codemagic team settings, connect that key under **Developer Portal** and name the integration `herdharbor-app-store`.
4. In Codemagic code-signing settings, generate or fetch an Apple Distribution certificate and an App Store provisioning profile for `com.ebrllc.herdharbor`.
5. In the HerdHarbor Codemagic application, select `main`, check for `codemagic.yaml`, and run **HerdHarbor iOS TestFlight**.

The workflow stages the current production web files, synchronizes the Capacitor iOS project, applies Apple signing, creates a signed IPA, and uploads it to App Store Connect. Distribution to external testers remains a manual App Store Connect action so export-compliance, beta-review, and tester information can be confirmed before release.

## Local macOS maintenance

```sh
npm ci
npm run sync:ios
npx cap open ios
```

The generated `web/`, CocoaPods, archives, and IPA files are intentionally ignored. Source web releases continue to deploy through the existing GitHub Pages workflow, and the Android Bubblewrap project is unchanged.
