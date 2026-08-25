"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read("index.html");
const manifest = JSON.parse(read("manifest.json"));
const twa = JSON.parse(read("twa-manifest.json"));
const appGradle = read("android/app/build.gradle");
const worker = read("service-worker.js");
const pwa = read("pwa.js");
const title = read("google-play/listing/en-US/title.txt").trim();
const shortDescription = read("google-play/listing/en-US/short-description.txt").trim();
const fullDescription = read("google-play/listing/en-US/full-description.txt").trim();
const androidManifest = read("android/app/src/main/AndroidManifest.xml");

assert.doesNotMatch(html, /pre[ -]?alpha/i);
assert.equal(manifest.version, "1.4.0");
assert.equal(manifest.display, "standalone");
assert.equal(twa.packageId, "com.ebrllc.herdharbor");
assert.equal(twa.appVersion, "1.4.0-alpha");
assert.equal(twa.appVersionCode, 6);
assert.equal(twa.host, "app.herdharbor.com");
assert.match(appGradle, /applicationId:\s*'com\.ebrllc\.herdharbor'/);
assert.match(appGradle, /namespace "com\.ebrllc\.herdharbor"/);
assert.match(appGradle, /applicationId "com\.ebrllc\.herdharbor"/);
assert.match(appGradle, /compileSdkVersion 36/);
assert.match(appGradle, /targetSdkVersion 36/);
assert.match(appGradle, /versionCode 6/);
assert.match(appGradle, /versionName "1\.4\.0-alpha"/);
assert.match(appGradle, /https:\/\/app\.herdharbor\.com\/manifest\.json/);
assert.match(worker, /breeding-intelligence-core\.js\?v=1\.4\.0/);
assert.match(worker, /breeding-intelligence\.js\?v=1\.4\.0/);
assert.match(pwa, /1\.4\.0-alpha-breeding-intelligence/);
assert.match(androidManifest, /package="com\.ebrllc\.herdharbor"/);
assert.match(androidManifest, /android:allowBackup="false"/);
assert.match(androidManifest, /android:usesCleartextTraffic="false"/);
assert.ok(fs.existsSync(path.join(root, "android/app/src/main/java/com/ebrllc/herdharbor/Application.java")));
assert.ok(fs.existsSync(path.join(root, "android/app/src/main/java/com/ebrllc/herdharbor/DelegationService.java")));
assert.ok(fs.existsSync(path.join(root, "android/app/src/main/java/com/ebrllc/herdharbor/LauncherActivity.java")));
assert.ok(!fs.existsSync(path.join(root, "android/app/src/main/java/com/herdharbor/app/Application.java")));
assert.ok(title.length <= 30, "Play title must be 30 characters or fewer");
assert.ok(shortDescription.length <= 80, "Play short description must be 80 characters or fewer");
assert.ok(fullDescription.length <= 4000, "Play full description must be 4,000 characters or fewer");
assert.ok(fs.statSync(path.join(root, "android/store_icon.png")).size <= 1024 * 1024);
assert.ok(fs.existsSync(path.join(root, "google-play/assets/app-icon-512.png")));
assert.ok(fs.existsSync(path.join(root, "google-play/assets/feature-graphic-1024x500.png")));

console.log("Google Play v1.4.0 alpha readiness tests passed");
