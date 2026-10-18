"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const cloud = read("herdharbor-cloud.js");
const worker = read("service-worker.js");

// Execute the real synchronous auth-boundary dispatch code with controlled
// session identities. A source-only regex does not establish draft safety.
function dispatchAuthEvent(event, previousId, incomingId) {
  const opening = "  client.auth.onAuthStateChange((event, activeSession) => {";
  const start = cloud.indexOf(opening);
  const end = cloud.indexOf('    if (event === "PASSWORD_RECOVERY") {', start);
  assert.ok(start >= 0 && end > start, "auth dispatch must remain before async hydration");

  const code = cloud.slice(start + opening.length, end);
  const review = { text: "Edited pedigree: " + "A".repeat(928), consent: true };
  const boundaries = [];
  const document = { dispatchEvent(evt) {
    if (evt.type !== "herdharbor:auth-boundary") return;
    boundaries.push(evt.detail);
    review.text = "";
    review.consent = false;
  }};
  class CustomEventStub {
    constructor(type, opts) { this.type = type; this.detail = opts.detail; }
  }
  const signal = new Function("event", "activeSession", "session", "document", "CustomEvent", code);
  const session = previousId ? { user: { id: previousId }} : null;
  const incoming = incomingId ? { user: { id: incomingId }} : null;
  signal(event, incoming, session, document, CustomEventStub);
  return { review, boundaries };
}

test("repeated SIGNED_IN for account A preserves edited AI pedigree review and explicit consent", () => {
  for (const event of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"]) {
    const result = dispatchAuthEvent(event, "account-a", "account-a");
    assert.equal(result.boundaries.length, 0, event);
    assert.ok(result.review.text.length > 928, event);
    assert.equal(result.review.consent, true, event);
  }
});

test("genuine A-to-B, A-to-signed-out and B-to-A events still revoke the review synchronously", () => {
  for (const [event, previous, incoming] of [
    ["SIGNED_IN", "account-a", "account-b"],
    ["SIGNED_IN", "account-b", "account-a"],
    ["SIGNED_OUT", "account-a", null],
    ["SIGNED_IN", null, "account-a"],
    ["TOKEN_REFRESHED", "account-a", "account-b"],
    ["PASSWORD_RECOVERY", "account-a", "account-a"]
  ]) {
    const result = dispatchAuthEvent(event, previous, incoming);
    assert.equal(result.boundaries.length, 1, event + " " + previous + " -> " + incoming);
    assert.equal(result.review.text, "");
    assert.equal(result.review.consent, false);
    assert.equal(result.boundaries[0].previousUserId, previous || "");
    assert.equal(result.boundaries[0].nextUserId, incoming || "");
  }
});

// Real worker install handler evaluated without using the network.
function installWithFailure(failAsset) {
  const events = {};
  const added = [];
  const self = {
    location: { href: "https://app.herdharbor.com/service-worker.js", origin: "https://app.herdharbor.com" },
    addEventListener(type, fn) { events[type] = fn; }
  };
  const caches = {
    async open() {
      return { async add(request) {
        added.push(request.url);
        if (failAsset && new URL(request.url).pathname.endsWith(failAsset)) {
          throw new Error("Simulated failed shell download");
        }
      }};
    }
  };
  class RequestStub {
    constructor(url) { this.url = String(url); }
  }
  vm.runInNewContext(worker, { self, caches, Request: RequestStub, URL, Promise, console });
  let pending;
  events.install({ waitUntil(promise) { pending = promise; } });
  return { pending, added };
}

test("a missing operational task, health, animal, cloud or canine module aborts offline installation", async () => {
  for (const asset of [
    "task-runtime-v1.8.3.js",
    "health-runtime-v1.8.3.js",
    "animal-profile-runtime-v1.8.3.js",
    "herdharbor-cloud.js",
    "canine-lineage-v2.0.1.js"
  ]) {
    const install = installWithFailure(asset);
    await assert.rejects(install.pending, (error) => {
      assert.match(error.message, /Required HerdHarbor shell assets failed to cache/);
      assert.ok(error.message.includes(asset), error.message);
      return true;
    }, asset);
    assert.ok(install.added.some((url) => url.includes(asset)), asset);
  }
});

test("optional lazy assets do not become startup requirements", async () => {
  const install = installWithFailure("settings-runtime-v1.8.3.js");
  await install.pending;
  assert.ok(!install.added.some((url) => url.includes("settings-runtime-v1.8.3.js")));
});

test("2.0.1 production acceptance keeps synthetic privacy and protected manual gate", () => {
  const acceptance = read("scripts/sentry-production-acceptance.mjs");
  const workflow = read(".github/workflows/v2.0.0-production-acceptance.yml");
  assert.match(acceptance, /release: "HerdHarbor@2\.0\.1"/);
  assert.match(acceptance, /build: "v2\.0\.1-production-acceptance"/);
  assert.match(acceptance, /herdharbor-release-acceptance\/2\.0\.1/);
  assert.match(acceptance, /privacy: "synthetic_only"/);
  assert.match(workflow, /^name: HerdHarbor 2\.0\.1 production acceptance$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /npm run test:v2\.0\.0-final/);
  assert.match(workflow, /npm run test:v2\.0\.1-review/);
  assert.ok(workflow.includes("if: " + "$" + "{{ inputs.run_sentry }}"));
  assert.doesNotMatch(workflow, /\npush:|\npull_request:|deploy-pages|supabase functions deploy/);
});
