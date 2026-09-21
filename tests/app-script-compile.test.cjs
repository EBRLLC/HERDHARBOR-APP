const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const animalProfileRuntime = fs.readFileSync(path.join(root, "animal-profile-runtime-v1.8.3.js"), "utf8");
const breedingLitterRuntime = fs.readFileSync(path.join(root, "breeding-litter-runtime-v1.8.3.js"), "utf8");
const healthRuntime = fs.readFileSync(path.join(root, "health-runtime-v1.8.3.js"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

assert.ok(scripts.length > 0, "index.html retains the early inline bootstrap script");
assert.ok(appRuntime.trim(), "external application runtime is present");
assert.ok(animalProfileRuntime.trim(), "extracted Animals/Profile runtime is present");
assert.ok(breedingLitterRuntime.trim(), "extracted Breeding/Litter runtime is present");
assert.ok(healthRuntime.trim(), "extracted Health runtime is present");
assert.doesNotThrow(() => new Function(animalProfileRuntime), "extracted Animals/Profile runtime compiles");
assert.doesNotThrow(() => new Function(breedingLitterRuntime), "extracted Breeding/Litter runtime compiles");
assert.doesNotThrow(() => new Function(healthRuntime), "extracted Health runtime compiles");
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
