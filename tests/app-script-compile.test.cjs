const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const animalProfileRuntime = fs.readFileSync(path.join(root, "animal-profile-runtime-v1.8.3.js"), "utf8");
const breedingLitterRuntime = fs.readFileSync(path.join(root, "breeding-litter-runtime-v1.8.3.js"), "utf8");
const healthRuntime = fs.readFileSync(path.join(root, "health-runtime-v1.8.3.js"), "utf8");
const taskRuntime = fs.readFileSync(path.join(root, "task-runtime-v1.8.3.js"), "utf8");
const salesCustomerRuntime = fs.readFileSync(path.join(root, "sales-customer-runtime-v1.8.3.js"), "utf8");
const productionReportingRuntime = fs.readFileSync(path.join(root, "production-reporting-runtime-v1.8.3.js"), "utf8");
const settingsRuntime = fs.readFileSync(path.join(root, "settings-runtime-v1.8.3.js"), "utf8");
const voiceAssistedEntry = fs.readFileSync(path.join(root, "voice-assisted-entry-v1.8.3.js"), "utf8");
const photoAssistedEntry = fs.readFileSync(path.join(root, "photo-assisted-entry-v1.8.3.js"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

assert.ok(scripts.length > 0, "index.html retains the early inline bootstrap script");
assert.ok(appRuntime.trim(), "external application runtime is present");
assert.ok(animalProfileRuntime.trim(), "extracted Animals/Profile runtime is present");
assert.ok(breedingLitterRuntime.trim(), "extracted Breeding/Litter runtime is present");
assert.ok(healthRuntime.trim(), "extracted Health runtime is present");
assert.ok(taskRuntime.trim(), "extracted Task runtime is present");
assert.ok(salesCustomerRuntime.trim(), "extracted Sales/Customer runtime is present");
assert.ok(productionReportingRuntime.trim(), "extracted Production/Reporting runtime is present");
assert.ok(settingsRuntime.trim(), "extracted Settings runtime is present");
assert.ok(voiceAssistedEntry.trim(), "reviewed voice-assisted entry runtime is present");
assert.ok(photoAssistedEntry.trim(), "reviewed photo-assisted entry runtime is present");
assert.doesNotThrow(() => new Function(animalProfileRuntime), "extracted Animals/Profile runtime compiles");
assert.doesNotThrow(() => new Function(breedingLitterRuntime), "extracted Breeding/Litter runtime compiles");
assert.doesNotThrow(() => new Function(healthRuntime), "extracted Health runtime compiles");
assert.doesNotThrow(() => new Function(taskRuntime), "extracted Task runtime compiles");
assert.doesNotThrow(() => new Function(salesCustomerRuntime), "extracted Sales/Customer runtime compiles");
assert.doesNotThrow(() => new Function(productionReportingRuntime), "extracted Production/Reporting runtime compiles");
assert.doesNotThrow(() => new Function(settingsRuntime), "extracted Settings runtime compiles");
assert.doesNotThrow(() => new Function(voiceAssistedEntry), "reviewed voice-assisted entry runtime compiles");
assert.doesNotThrow(() => new Function(photoAssistedEntry), "reviewed photo-assisted entry runtime compiles");
assert.doesNotThrow(
  () => new Function(appRuntime),
  "external application runtime compiles"
);
scripts.forEach((source, index) => {
  assert.doesNotThrow(
    () => new Function(source),
    `inline application script ${index + 1} compiles`
  );
});

console.log("application runtime and inline bootstrap scripts compile");
