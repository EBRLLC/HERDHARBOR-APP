"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const Mobile = require("../mobile-capture-v1.8.3.js");
const mobile = read("mobile-capture-v1.8.3.js");
const photo = read("photo-assisted-entry-v1.8.3.js");
const cache = read("local-cache-v2-v1.8.2.js");
const cloudFlow = read("cloud-sync-v2-flow-v1.8.2.js");
const cloud = read("herdharbor-cloud.js");
const lifecycle = read("lifecycle-integrity-core-v1.8.2.js");
const html = read("index.html");
const worker = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));

test("mobile image sizing preserves aspect ratio and caps the long edge", () => {
  assert.deepEqual(Mobile.scaledDimensions(4032, 3024, 2048), { width: 2048, height: 1536, scale: 2048 / 4032 });
  assert.deepEqual(Mobile.scaledDimensions(1200, 900, 2048), { width: 1200, height: 900, scale: 1 });
});

test("mobile image preparation normalizes orientation and compresses without another persistence store", () => {
  assert.match(mobile, /createImageBitmap\(file, \{ imageOrientation: "from-image" \}\)/);
  assert.match(mobile, /canvasBlob\(canvas, "image\/jpeg"/);
  assert.match(mobile, /DEFAULT_MAX_EDGE = 2048/);
  assert.match(mobile, /DEFAULT_MAX_BYTES = 3_500_000/);
  assert.match(mobile, /That image is still too large after compression/);
  assert.doesNotMatch(mobile, /indexedDB|localStorage|sessionStorage|openDatabase|createObjectStore/);
  assert.doesNotMatch(mobile, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
});

test("offline capture queues only draft analysis in memory and resumes once", async () => {
  let online = false;
  let calls = 0;
  const statuses = [];
  const controller = Mobile.createRetryController({
    isOnline: () => online,
    onStatus: (status) => statuses.push(status.state),
    execute: async (payload) => {
      calls += 1;
      await Promise.resolve();
      return { draft: { id: payload.id } };
    }
  });

  const queued = await controller.run({ id: "capture-1" });
  assert.equal(queued.queued, true);
  assert.equal(calls, 0);
  assert.equal(controller.getState().pending, true);
  assert.ok(statuses.includes("offline"));

  online = true;
  const [one, two] = await Promise.all([controller.resume("online"), controller.resume("pageshow")]);
  assert.equal(calls, 1, "concurrent resume signals must share one in-flight request");
  assert.equal(one.draft.id, "capture-1");
  assert.equal(two.draft.id, "capture-1");
  assert.equal(controller.getState().pending, false);
});

test("retryable provider failure keeps the same draft request pending without canonical mutation", async () => {
  let calls = 0;
  const controller = Mobile.createRetryController({
    isOnline: () => true,
    execute: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("temporary");
        error.code = "provider_timeout";
        error.retryable = true;
        throw error;
      }
      return { draft: { ok: true } };
    }
  });

  await assert.rejects(controller.run({ dataUrl: "data:image/jpeg;base64,AA==" }), /temporary/);
  assert.equal(controller.getState().pending, true);
  const result = await controller.resume("online");
  assert.equal(calls, 2);
  assert.equal(result.draft.ok, true);
  assert.equal(controller.getState().pending, false);
});

test("photo entry is camera-first, uses prepared images, and resumes on mobile lifecycle signals", () => {
  assert.match(photo, /capture="environment"/);
  assert.match(photo, /mobileCapture\(\)/);
  assert.match(photo, /prepareImage\(selectedFile\)/);
  assert.match(photo, /createRetryController/);
  assert.match(photo, /photo_analysis_queued/);
  assert.match(photo, /addEventListener\?\.\("online"/);
  assert.match(photo, /addEventListener\?\.\("pageshow"/);
  assert.match(photo, /visibilityState === "visible"/);
  assert.match(photo, /invokeFunctionWithDiagnostics\("record-photo-extract"/);
  assert.match(photo, /Nothing has been saved/);
  assert.doesNotMatch(photo, /state\.(?:animals|health)\.(?:push|splice)|commitState|saveState/);
});

test("existing local cache is hardened for suspend/resume instead of creating another offline database", () => {
  assert.match(cache, /DB_NAME = "herdharbor_local_cache_v2"/);
  assert.match(cache, /addEventListener\?\.\("pagehide"/);
  assert.match(cache, /addEventListener\?\.\("freeze"/);
  assert.match(cache, /addEventListener\?\.\("pageshow"/);
  assert.match(cache, /"foreground-refresh"/);
  assert.match(cache, /"resume-refresh"/);
  assert.match(cache, /if \(pendingRaw\) void flush\(\)/);
  assert.equal((mobile.match(/indexedDB/g) || []).length, 0);
});

test("canonical cloud retry safeguards remain untouched", () => {
  assert.match(cloudFlow, /isRecoverablePending/);
  assert.match(cloudFlow, /state\.unsynced && !state\.conflict/);
  assert.match(cloudFlow, /navigator\.onLine === false/);
  assert.match(cloud, /hasUnsyncedChanges/);
  assert.match(lifecycle, /lifecycleTombstones/);
  assert.match(cloud, /recordRecoverySnapshot/);
  assert.match(cloud, /syncConflict/);
  assert.doesNotMatch(mobile, /dirtyKey|baseKey|lifecycleTombstones|syncConflict/);
});

test("mobile capture remains in the core shell while photo AI is live-tester lazy-loaded", () => {
  const mobileIndex = html.indexOf("mobile-capture-v1.8.3.js?v=1");
  const appIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  const optional = read("herdharbor-optional-tools.js");
  assert.ok(mobileIndex >= 0 && appIndex > mobileIndex);
  assert.doesNotMatch(html, /<script[^>]+photo-assisted-entry-v1\.8\.3\.js/);
  assert.match(optional, /photoAi:\s*"photo-assisted-entry-v1\.8\.3\.js\?v=2"/);
  assert.match(optional, /ensureAiLiveTools/);
  assert.match(worker, /\.\/mobile-capture-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/mobile-capture-v1\.8\.3\.js"/);
  assert.match(worker, /\.\/photo-assisted-entry-v1\.8\.3\.js\?v=2/);
  assert.match(pkg.scripts["test:v1.8.3"], /offline-mobile-capture-v1\.8\.3\.test\.cjs/);
});
