# HerdHarbor Google Play submission

This folder contains the submission material for **HerdHarbor Alpha v1.0.0**.

## Android package

- Package ID: `com.herdharbor.app`
- Version name: `1.0.0-alpha`
- Version code: `1`
- Minimum SDK: `23`
- Compile and target SDK: `36`
- Delivery format: signed Android App Bundle (`.aab`)
- Web origin: `https://app.herdharbor.com`
- Privacy policy: `https://herdharbor.com/privacy/`
- Account deletion: `https://herdharbor.com/delete-account/`
- Support: `https://herdharbor.com/support/`

The Android source is in `../android/` and is generated from `../twa-manifest.json` with Bubblewrap. It opens the existing installable HerdHarbor web app as a Trusted Web Activity and falls back to a secure Custom Tab when digital-asset verification is not yet available.

## Before the first Play Console upload

1. Create the app in Play Console using package ID `com.herdharbor.app` and choose the **App** and **Business** options that match HerdHarbor.
2. Enroll in Play App Signing.
3. Create a private upload key outside this repository. Never commit a `.jks`, `.keystore`, password, or `keystore.properties` file.
4. Open `android/` in the current Android Studio, choose **Build > Generate Signed Bundle / APK > Android App Bundle**, and sign the release with the upload key.
5. Upload the signed `.aab` to the internal or closed alpha track.
6. Copy the SHA-256 fingerprint for the **Play app-signing certificate** from Play Console. Replace the placeholder in `assetlinks.template.json`, publish the completed file as `https://app.herdharbor.com/.well-known/assetlinks.json`, and verify the association before inviting testers.
7. Complete the store listing, Data safety, account deletion, content rating, target audience, ads, app access, and privacy-policy sections with the prepared material in this folder.

The private signing key and the final Play app-signing fingerprint are account-owned credentials and cannot safely be stored in public Git.

## Store assets

- `assets/app-icon-512.png`: Play listing icon, 512 × 512.
- `assets/feature-graphic-1024x500.png`: Play feature graphic, 1024 × 500.
- Add at least two real in-app phone screenshots in Play Console. Four 1080 × 1920 screenshots are recommended.
- Add four real tablet screenshots for strong large-screen presentation after confirming the release on 7-inch and 10-inch devices.

Do not use mock screens that show functionality HerdHarbor does not provide.
