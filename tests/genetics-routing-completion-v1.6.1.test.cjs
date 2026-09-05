const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const release = fs.readFileSync(path.join(root, "herdharbor-release-v1.6.1.js"), "utf8");
const build = fs.readFileSync(path.join(root, "herdharbor-build.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("release router provides one callable animal genetics entry point", () => {
  assert.match(release, /function openAnimalGenetics\(animalId\)/);
  assert.match(release, /HerdHarborRabbitGeneticsV2\?\.openProfile\?\.\(animal\.id\)/);
  assert.match(release, /HerdHarborBreedingIntelligence\?\.openGeneticProfile\?\.\(animal\.id\)/);
  assert.match(release, /window\.HerdHarborAnimalGenetics\s*=\s*Object\.freeze/);
});

test("visible genetics actions are captured and routed by selected animal id", () => {
  assert.match(release, /\[data-gv2-profile\]/);
  assert.match(release, /\[data-animal-genetics\]/);
  assert.match(release, /\[data-genetics-animal-id\]/);
  assert.match(release, /\[data-bi-action=\\"genetics\\"\]/);
  assert.match(release, /text !== "genetics"/);
  assert.match(release, /animalIdFromTrigger\(trigger\)/);
  assert.match(release, /event\.stopImmediatePropagation\(\)/);
});

test("current release build and PWA cache move together while preserving the v1.6.6 mobile hotfix", () => {
  assert.match(build, /version:\s*"1\.7\.0"/);
  assert.match(build, /buildId:\s*"multispecies-genetics-foundation-1"/);
  assert.match(build, /build:\s*"1\.7\.0-alpha-multispecies-genetics-foundation-1"/);
  assert.match(worker, /herdharbor-shell-v1\.7\.0-alpha-multispecies-genetics-foundation-1/);
  assert.match(worker, /herdharbor-release-v1\.6\.1\.js\?v=1\.7\.0/);
});
