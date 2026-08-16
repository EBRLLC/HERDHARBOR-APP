"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
for (const file of ["pedigree-visual.js", "pedigree-visual.css", "pwa.js", "service-worker.js"]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}

console.log("pedigree visual smoke test passed");
