const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

assert.ok(scripts.length > 0, "index.html includes at least one inline application script");
scripts.forEach((source, index) => {
  assert.doesNotThrow(
    () => new Function(source),
    `inline application script ${index + 1} compiles`
  );
});

console.log("inline application scripts compile");
