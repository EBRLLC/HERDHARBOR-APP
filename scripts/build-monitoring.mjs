"use strict";

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "vendor", "herdharbor-monitoring-v1.5.1.min.js");
const sourceMap = process.env.HERDHARBOR_MONITORING_SOURCEMAP === "1";

await mkdir(path.dirname(output), { recursive: true });
await build({
  entryPoints: [path.join(root, "monitoring", "herdharbor-monitoring-browser.mjs")],
  outfile: output,
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none",
  sourcemap: sourceMap ? "external" : false,
  sourcesContent: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production")
  }
});

console.log(`Built ${path.relative(root, output)}${sourceMap ? " with external source map" : ""}.`);
