"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

for (const moduleName of [
  "rabbit-genetics-ui-advanced-v1.6.1.js",
  "rabbit-genetics-ui-compat-v1.6.1.js"
]) {
  test(`${moduleName} displays stable Rabbit Genetics branding without changing persisted data keys`, () => {
    const source = fs.readFileSync(path.join(__dirname, "..", moduleName), "utf8");
    assert.match(source, /HerdHarbor · Rabbit Genetics/);
    assert.doesNotMatch(source, /HerdHarbor Alpha/);
    // This key predates stable releases. Renaming it would orphan locally saved breeder data.
    assert.match(source, /const KEY="herdharbor_pre_alpha_v1"/);
    assert.match(source, /Rabbit Genetics/);
  });
}
