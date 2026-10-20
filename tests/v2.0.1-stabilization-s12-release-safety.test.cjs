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

test("essential startup identity agrees with the bounded offline shell, while document assets stay optional", () => {
  const index = read("index.html");
  const required = worker.slice(worker.indexOf("const REQUIRED_SHELL = ["), worker.indexOf("const RUNTIME_CACHE_PATHS = ["));
  const runtime = worker.slice(worker.indexOf("const RUNTIME_CACHE_PATHS = ["), worker.indexOf("];", worker.indexOf("const RUNTIME_CACHE_PATHS = [")));
  const requiredAssets = [...required.matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1]);
  assert.ok(requiredAssets.length <= 50, "do not grow the required PWA install beyond the bounded operational shell");
  for (const asset of [
    "herdharbor-cloud.js?v=40",
    "cloud-sync-rollout-runtime-v1.8.4.js?v=6",
    "herdharbor-app-runtime.js?v=5",
    "animal-profile-runtime-v1.8.3.js?v=2",
    "health-runtime-v1.8.3.js?v=1",
    "task-runtime-v1.8.3.js?v=1",
    "canine-lineage-v2.0.1.js?v=1"
  ]) {
    assert.ok(requiredAssets.includes(asset), "missing or stale core offline URL: " + asset);
    assert.ok(index.includes(asset), "browser must request the same core revision: " + asset);
  }
  for (const asset of [
    "document-export-v2.0.0.js?v=1",
    "birth-certificate-v2.0.0.js?v=1",
    "animal-documents-v2.0.0.js?v=1"
  ]) {
    assert.ok(!requiredAssets.includes(asset), "optional document module must not block startup: " + asset);
    assert.ok(runtime.includes(JSON.stringify("./" + asset)), "document module remains runtime-cacheable: " + asset);
  }
});

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

/**
 * Exercise the actual authentication callback, not merely the synchronous
 * review-cancellation prefix. A changed user in a refresh event must hydrate
 * the new account and lock the previous account's visible workspace.
 */
async function runAuthCallback(event, priorId, incomingId) {
  const opening = "  client.auth.onAuthStateChange((event, activeSession) => {";
  const start = cloud.indexOf(opening);
  const end = cloud.indexOf("\n  });\n\n  window.addEventListener(\"online\"", start);
  assert.ok(start >= 0 && end > start, "extract live cloud auth callback");
  const body = cloud.slice(start + opening.length, end);
  const calls = [];
  const current = priorId ? { user: { id: priorId } } : null;
  const incoming = incomingId ? { user: { id: incomingId } } : null;
  let locked = false;
  const document = {
    dispatchEvent(evt) { if (evt.type === "herdharbor:auth-boundary") calls.push("cancel"); },
    documentElement: { classList: { contains() { return locked; } } }
  };
  class CustomEventStub {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  const deps = {
    session: current,
    document,
    CustomEvent: CustomEventStub,
    recoveryMode: false,
    showAccountBoundaryRecovery() { locked = true; calls.push("lock"); },
    ensureAuthenticatedAccountBoundary: async (active) => {
      calls.push("boundary:" + active.user.id);
      return { ok: true };
    },
    hydrateUserData: async (active) => { calls.push("hydrate:" + active.user.id); },
    dispatchAuthSession() { calls.push("session"); },
    loadAccessProfile: () => Promise.resolve(),
    window: { HerdHarborBilling: { refresh() { calls.push("billing"); } } },
    lastHydratedUserId: priorId
  };
  const callback = new Function("event", "activeSession", "d",
    'let session=d.session; const document=d.document, CustomEvent=d.CustomEvent; ' +
    'const recoveryMode=d.recoveryMode, showAccountBoundaryRecovery=d.showAccountBoundaryRecovery; ' +
    'const ensureAuthenticatedAccountBoundary=d.ensureAuthenticatedAccountBoundary; ' +
    'const hydrateUserData=d.hydrateUserData, dispatchAuthSession=d.dispatchAuthSession; ' +
    'const loadAccessProfile=d.loadAccessProfile, window=d.window; ' +
    'const lastHydratedUserId=d.lastHydratedUserId; ' + body
  );
  callback(event, incoming, deps);
  await new Promise((resolve) => setImmediate(resolve));
  return { calls, locked };
}

test("unexpected identity drift on refresh or user update follows real account recovery", async () => {
  for (const event of ["TOKEN_REFRESHED", "USER_UPDATED"]) {
    const switched = await runAuthCallback(event, "account-a", "account-b");
    assert.deepEqual(switched.calls.slice(0, 3), ["cancel", "lock", "boundary:account-b"], event);
    assert.ok(switched.calls.includes("hydrate:account-b"), event);
    assert.ok(switched.locked, event);
    assert.ok(!switched.calls.includes("session"), "do not grant the new session access before recovery");
  }
});

test("same-user refresh still avoids account recovery and preserves the unlocked app", async () => {
  for (const event of ["TOKEN_REFRESHED", "USER_UPDATED"]) {
    const same = await runAuthCallback(event, "account-a", "account-a");
    assert.equal(same.locked, false, event);
    assert.ok(same.calls.includes("session"), event);
    assert.ok(!same.calls.some((call) => call.startsWith("boundary:") || call.startsWith("hydrate:")), event);
  }
});

test("complete Pages artifact validation is required in review CI and production verification", () => {
  const review = read(".github/workflows/v2.0.0-ci.yml");
  const pages = read(".github/workflows/v2.0.0-production-pages.yml");
  const verifier = read("scripts/verify-release-candidate-artifact.mjs");
  for (const workflow of [review, pages]) {
    assert.match(workflow, /node scripts\/generate-release-assets\.mjs _site/);
    assert.match(workflow, /node scripts\/verify-release-candidate-artifact\.mjs _site/);
  }
  assert.match(verifier, /manifest\.assets/);
  assert.match(verifier, /sha256/);
  assert.match(verifier, /REQUIRED_SHELL/);
  assert.match(verifier, /required JS\/CSS missing fingerprint/);
  assert.doesNotMatch(review, /actions\/deploy-pages@|supabase functions deploy/);
});
