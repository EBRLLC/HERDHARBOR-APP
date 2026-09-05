"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");
const release = read("herdharbor-release-v1.6.1.js");
const rabbitUi = read("rabbit-genetics-ui-advanced-v1.6.1.js");
const engine = require(path.join(root, "workflow-engine-v1.7.5.js"));

test("core animal controls remain wired to the canonical modal flows", () => {
  assert.match(html, /id="add-animal"/);
  assert.match(html, /\$\("#add-animal"\)\.addEventListener\("click", \(\) => openAnimalForm\(\)\)/);
  assert.match(html, /\$\$\("\[data-view-animal\]", root\)\.forEach\(\(button\) => button\.addEventListener\("click", \(\) => openAnimalDetail\(button\.dataset\.viewAnimal\)\)\)/);
  assert.match(html, /\$\$\("\[data-edit-animal\]", root\)\.forEach\(\(button\) => button\.addEventListener\("click", \(\) => openAnimalForm\(button\.dataset\.editAnimal\)\)\)/);
  assert.match(html, /function openAnimalForm\(id = ""\)/);
  assert.match(html, /function openAnimalDetail\(id\)/);
  assert.match(html, /function openModal\(title, content, kicker = "HerdHarbor"\)/);
});

test("v1.7.5 engine stays available for development without joining browser startup", () => {
  assert.equal(engine.VERSION, "1.7.5");
  assert.equal(engine.CONTRACT.id, "HH-WORKFLOW-ENGINE-001");
  assert.doesNotMatch(build, /workflow-engine-v1\.7\.5\.js/);
  assert.doesNotMatch(worker, /workflow-engine-v1\.7\.5\.js/);
  assert.match(build, /Runtime recovery: keep the reviewed v1\.7\.1 browser startup path intact/);
  assert.match(worker, /interaction-recovery-1/);
});

test("genetics routing remains narrowly scoped and does not consume View/Edit/Add clicks", () => {
  assert.match(release, /if \(text !== "genetics" && text !== "open genetics" && text !== "view genetics"\) return null/);
  assert.match(release, /if \(!button\.closest\?\.\("\.animal-card, #modal-content, #modal, \[data-animal-id\]"\)\) return null/);
  assert.match(rabbitUi, /footer\.appendChild\?\.\(button\)/);
  assert.doesNotMatch(rabbitUi, /footer\.innerHTML\s*=/);
});

test("recovery changes do not alter the published application identity", () => {
  assert.match(build, /version: "1\.7\.1"/);
  assert.match(build, /buildId: "multispecies-genetics-foundation-1"/);
  assert.match(worker, /herdharbor-shell-v1\.7\.1-alpha-multispecies-genetics-foundation-1-hotfix-1-interaction-recovery-1/);
});
