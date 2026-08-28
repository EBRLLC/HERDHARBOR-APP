"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const config = read("herdharbor-monitoring-config.js");
const pagesWorkflow = read(".github/workflows/v1.5.1-pages-deploy.yml");
const reviewWorkflow = read(".github/workflows/v1.5.1-monitoring-review.yml");
const instrumentation = read("monitoring/herdharbor-monitoring-instrumentation.mjs");
const cloud = read("herdharbor-cloud.js");
const readme = read("README.md");

assert.match(readme, /deployed from the `main` branch through GitHub Pages/);
assert.match(config, /dsn: ""/);
assert.doesNotMatch(config, /https:\/\/[^"']+@[^"']*sentry/i);

assert.match(pagesWorkflow, /workflow_dispatch:/);
assert.doesNotMatch(pagesWorkflow, /push:\s*\n\s*branches:/, "v1.5.1 Pages deployment requires an explicit manual dispatch");
assert.match(pagesWorkflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(pagesWorkflow, /secrets\.HERDHARBOR_SENTRY_DSN/);
assert.match(pagesWorkflow, /HERDHARBOR_MONITORING_ENVIRONMENT: production/);
assert.match(pagesWorkflow, /npm run build:monitoring-config/);
assert.match(pagesWorkflow, /actions\/deploy-pages@v4/);

assert.match(reviewWorkflow, /android-twa-review-build:/);
assert.match(reviewWorkflow, /\.\/gradlew --no-daemon bundleRelease/);
assert.match(reviewWorkflow, /release-review-unsigned-aab/);
assert.doesNotMatch(reviewWorkflow, /play.*publish|upload.*play|serviceAccountCredentials/i, "review CI must not publish an Android release");

assert.match(cloud, /indexedDB/, "HerdHarbor uses IndexedDB for local recovery storage");
assert.match(instrumentation, /installIndexedDbFailureMonitoring/);
assert.match(instrumentation, /indexeddb_open/);
assert.match(instrumentation, /indexeddb_transaction_error/);
assert.doesNotMatch(instrumentation, /localStorage\.getItem|indexedDB\.get|objectStore\([^)]*\)\.get/, "monitoring adapters do not read stored record contents");

console.log("Alpha v1.5.1 deployment, Android review, and IndexedDB coverage guardrails passed");
