"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

function pngInfo(relativePath) {
  const data = fs.readFileSync(path.join(root, relativePath));
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25]
  };
}

const packageJson = readJson("package.json");
const capacitor = readJson("capacitor.config.json");
const codemagic = read("codemagic.yaml");
const project = read("ios/App/App.xcodeproj/project.pbxproj");
const infoPlist = read("ios/App/App/Info.plist");
const nativeBridge = read("scripts/native-bridge.js");
const pwa = read("pwa.js");
const appIcon = pngInfo("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");

assert.equal(packageJson.version, "1.2.0");
assert.equal(packageJson.engines.node, ">=22");
assert.equal(packageJson.dependencies["@capacitor/ios"], "8.5.0");
assert.match(packageJson.scripts["sync:ios"], /cap sync ios/);

assert.equal(capacitor.appId, "com.ebrllc.herdharbor");
assert.equal(capacitor.appName, "HerdHarbor");
assert.equal(capacitor.webDir, "web");
assert.equal(capacitor.server.iosScheme, "https");
assert.equal(capacitor.server.cleartext, false);

assert.match(codemagic, /name: HerdHarbor iOS TestFlight/);
assert.match(codemagic, /bundle_identifier: com\.ebrllc\.herdharbor/);
assert.match(codemagic, /XCODE_PROJECT: ios\/App\/App\.xcodeproj/);
assert.match(codemagic, /xcode-project build-ipa/);
assert.match(codemagic, /app_store_connect:/);

assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.ebrllc\.herdharbor/);
assert.match(project, /MARKETING_VERSION = 1\.2\.0/);
assert.match(infoPlist, /<key>NSCameraUsageDescription<\/key>/);
assert.match(infoPlist, /<key>NSPhotoLibraryUsageDescription<\/key>/);
assert.match(nativeBridge, /Share\.share/);
assert.match(nativeBridge, /Filesystem\.writeFile/);
assert.match(pwa, /Capacitor\?\.isNativePlatform/);

assert.deepEqual([appIcon.width, appIcon.height], [1024, 1024]);
assert.ok(![4, 6].includes(appIcon.colorType), "App Store icon must not contain an alpha channel");

console.log("iOS and Codemagic v1.2.0 readiness tests passed");
