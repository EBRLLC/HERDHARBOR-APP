"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("normal member UI hides internal component and build versions", () => {
  const settings = read("settings-runtime-v1.8.3.js");
  const appRuntime = read("herdharbor-app-runtime.js");
  const genetics = read("multispecies-genetics-ui-v1.7.1.js");
  const breeding = read("breeding-intelligence-v1.6.1.js");
  const subscription = read("subscription-engine-v1.8.0.js");

  assert.match(settings, /detailField\("Version", appVersion\(\)\)/);
  assert.doesNotMatch(settings, /detailField\("Build"/);
  assert.doesNotMatch(settings, /detailField\("Genetics engine"/);
  assert.doesNotMatch(settings, /Version 1\.8\.4 is the production-stability release/);

  assert.doesNotMatch(appRuntime, /Guided pedigree builder · v\$\{APP_VERSION\}/);
  assert.doesNotMatch(genetics, /<small>Adapter<\/small><strong>\$\{esc\(adapter\.version\)\}<\/strong>/);
  assert.doesNotMatch(breeding, /Genetics engine v\$\{/);
  assert.doesNotMatch(breeding, /Snapshot preserved with engine v\$\{/);
  assert.doesNotMatch(breeding, /HerdHarbor v\$\{esc\(snapshot\.appVersion/);
  assert.doesNotMatch(subscription, /Build reports v\$\{buildVersion\}/);
  assert.doesNotMatch(subscription, /v1\.8\.0 engine uses a separate namespace/i);
});

test("internal compatibility metadata remains available without being rendered as product copy", () => {
  const breeding = read("breeding-intelligence-v1.6.1.js");
  const subscription = read("subscription-engine-v1.8.0.js");

  assert.match(breeding, /geneticsEngineVersion:/);
  assert.match(breeding, /engineVersion:/);
  assert.match(subscription, /buildVersion === VERSION/);
  assert.match(subscription, /Release metadata is available\./);
});
