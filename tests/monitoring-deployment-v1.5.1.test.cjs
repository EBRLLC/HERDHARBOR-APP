"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const config = read("herdharbor-monitoring-config.js");
const pagesWorkflow = read(".github/workflows/v1.8.1-production-pages.yml");
const reviewWorkflowPath = ".github/workflows/v1.8.1-ci.yml";
const productionWorkflowPath = ".github/workflows/v1.8.1-production-acceptance.yml";
const instrumentation = read("monitoring/herdharbor-monitoring-instrumentation.mjs");
const cloud = read("herdharbor-cloud.js");
const readme = read("README.md");
const sentryAcceptance = read("scripts/sentry-production-acceptance.mjs");

assert.match(readme, /published from the exact reviewed `main` commit through GitHub Pages/);
assert.match(config, /dsn: ""/);
assert.match(config, /HerdHarbor@1\.8\.1/);
assert.match(config, /october-subscription-launch-referrals-credits-4/);
assert.doesNotMatch(config, /https:\/\/[^"']+@[^"']*sentry/i);

assert.match(pagesWorkflow, /workflow_dispatch:/);
assert.match(pagesWorkflow, /push:\s*\n\s*branches: \[main\]/, "Pages deployment is restricted to main");
assert.match(pagesWorkflow, /ref: \$\{\{ github\.sha \}\}/);
assert.match(pagesWorkflow, /secrets\.HERDHARBOR_SENTRY_DSN/);
assert.match(pagesWorkflow, /HERDHARBOR_MONITORING_ENVIRONMENT: production/);
assert.match(pagesWorkflow, /npm run test:release/);
assert.match(pagesWorkflow, /npm run test:v1\.8\.1/);
assert.match(pagesWorkflow, /npm run build:monitoring-config/);
assert.match(pagesWorkflow, /actions\/deploy-pages@v4/);

assert.ok(fs.existsSync(path.join(root, reviewWorkflowPath)), "v1.8.1 CI workflow must exist");
const reviewWorkflow = read(reviewWorkflowPath);
assert.match(reviewWorkflow, /name: Alpha v1\.8\.1 CI/);
assert.match(reviewWorkflow, /android-review:/);
assert.match(reviewWorkflow, /\.\/gradlew --no-daemon bundleRelease/);
assert.match(reviewWorkflow, /herdharbor-v1\.8\.1-unsigned-aab/);
assert.match(reviewWorkflow, /npm run test:release/);
assert.doesNotMatch(reviewWorkflow, /play.*publish|upload.*play|serviceAccountCredentials/i, "review CI must not publish an Android release");

assert.ok(fs.existsSync(path.join(root, productionWorkflowPath)), "protected v1.8.1 production acceptance workflow must exist");
const productionWorkflow = read(productionWorkflowPath);
assert.match(productionWorkflow, /workflow_dispatch:/);
assert.doesNotMatch(productionWorkflow, /\npush:/);
assert.doesNotMatch(productionWorkflow, /\npull_request:/);
assert.match(productionWorkflow, /environment: production/);
assert.match(productionWorkflow, /run_membership/);
assert.match(productionWorkflow, /run_sentry/);
assert.doesNotMatch(productionWorkflow, /deploy_market|psql|supabase functions deploy/);

assert.match(cloud, /indexedDB/, "HerdHarbor uses IndexedDB for local recovery storage");
assert.match(instrumentation, /installIndexedDbFailureMonitoring/);
assert.match(instrumentation, /indexeddb_open/);
assert.match(instrumentation, /indexeddb_transaction_error/);
assert.doesNotMatch(instrumentation, /localStorage\.getItem|indexedDB\.get|objectStore\([^)]*\)\.get/, "monitoring adapters do not read stored record contents");
assert.match(sentryAcceptance, /synthetic-only/);
assert.match(sentryAcceptance, /no user, farm, animal, customer, request, notes, credentials, or cloud-state data/);

console.log("Alpha v1.8.1 deployment, Android review, protected production acceptance, and IndexedDB guardrails passed");
