"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const hotfix = read("herdharbor-v1.7.1-stability-hotfix.js");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");

test("animal controls retain their canonical click handlers", () => {
  assert.match(html, /\$\("#add-animal"\)\.addEventListener\("click", \(\) => openAnimalForm\(\)\)/);
  assert.match(html, /\[data-view-animal\]/);
  assert.match(html, /openAnimalDetail\(button\.dataset\.viewAnimal\)/);
  assert.match(html, /\[data-edit-animal\]/);
  assert.match(html, /openAnimalForm\(button\.dataset\.editAnimal\)/);
});

test("stability DOM observer cannot recursively observe its own patch mutations", () => {
  assert.match(hotfix, /const observer=new root\.MutationObserver/);
  assert.match(hotfix, /observer\.disconnect\(\)/);
  assert.match(hotfix, /try\{patchCurrentDom\(\)\}finally\{observer\.observe\(root\.document\.body,observerOptions\)\}/);
  assert.match(hotfix, /requestAnimationFrame/);
  assert.doesNotMatch(hotfix, /new root\.MutationObserver\(\(\)=>\{if\(queued\)return;queued=true;queueMicrotask/);
});

test("repaired stability runtime is cache-busted without re-enabling the v1.7.5 engine", () => {
  assert.match(build, /herdharbor-v1\.7\.1-stability-hotfix\.js\?v=2/);
  assert.doesNotMatch(build, /workflow-engine-v1\.7\.5\.js/);
  assert.match(worker, /herdharbor-v1\.7\.1-stability-hotfix\.js\?v=2/);
  assert.match(worker, /dom-observer-recovery-1/);
  assert.doesNotMatch(worker, /workflow-engine-v1\.7\.5\.js/);
});
