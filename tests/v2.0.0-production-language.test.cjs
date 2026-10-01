"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("production member surfaces do not expose Alpha/tester development language", () => {
  const index = read("index.html");
  const settings = read("settings-runtime-v1.8.3.js");
  const admin = read("herdharbor-admin-v1.6.1.js");
  const howTo = read("how-to/index.html");
  const genetics = read("multispecies-genetics-ui-v1.7.1.js");

  assert.doesNotMatch(index, /HerdHarbor Alpha|Alpha v\d/i);
  assert.doesNotMatch(howTo, /HerdHarbor Alpha|Current for Alpha|Alpha v\d/i);

  for (const source of [settings, admin]) {
    assert.doesNotMatch(source, /Tester feedback|tester workspace|tester build|Tester name|tester-feedback inbox|Private tester feedback|Founding tester/i);
  }

  assert.doesNotMatch(settings, /Alpha limitations|\|\| "Alpha"/);
  assert.doesNotMatch(genetics, /Alpha v\d|Architecture first|Shared engine capabilities|This is intentional for v\d/i);
});

test("production replacements retain the same underlying features", () => {
  const settings = read("settings-runtime-v1.8.3.js");
  const genetics = read("multispecies-genetics-ui-v1.7.1.js");
  assert.match(settings, /<h3>Feedback<\/h3>/);
  assert.match(settings, /Data & availability notes/);
  assert.match(genetics, /Genetics capabilities/);
  assert.match(genetics, /HerdHarbor preserves existing/);
});
