"use strict";

// Isolated 2.0.1 cloud-compatibility characterization: no production credentials,
// Supabase writes or network services. These tests expose current guarantees and
// explicitly document remaining cross-device/older-client release blockers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const dualWrite = require("../cloud-dual-write-coordinator-v1.8.3.js");
const whelping = require("../canine-whelping-workspace-v2.0.1.js");
const copy = value => JSON.parse(JSON.stringify(value));

function dogState() {
  return {
    animals: [
      { id: "dam-a", userId: "acct-a", name: "Mabel", species: "Dog", sex: "Female", breed: "Labrador Retriever" },
      { id: "sire-a", userId: "acct-a", name: "Rex", species: "Dog", sex: "Male", breed: "Poodle" },
      { id: "rabbit-a", userId: "acct-a", name: "Bunny", species: "Rabbit", sex: "Female" }
    ],
    canineReproductiveCycles: [{ id: "cycle-a", femaleId: "dam-a", observedHeatStartDate: "2026-03-01", status: "open" }],
    canineExternalStuds: [{ id: "stud-a", accountId: "acct-a", ownerScope: "external_reference", displayName: "External" }],
    canineBreedingPlans: [{ id: "plan-a", damId: "dam-a", sireRef: { type: "owned_dog", id: "sire-a" },
      status: "mated", events: [{ id: "event-a", date: "2026-04-01", sireRef: { type: "owned_dog", id: "sire-a" } }],
      pregnancy: { status: "confirmed_pregnant" } }],
    canineWhelpings: [{ id: "canine_whelping_plan-a", planId: "plan-a", damId: "dam-a", litterId: "canine_whelping_plan-a", birthDate: "2026-06-01" }],
    litters: [
      { id: "canine_whelping_plan-a", canineWhelping: true, canineWhelpingId: "canine_whelping_plan-a",
        species: "Dog", damId: "dam-a", birthDate: "2026-06-01", bornAlive: "1", offspringIds: [] },
      { id: "rabbit-litter", species: "Rabbit", damId: "rabbit-a", offspringIds: ["kit-a"] }
    ],
    tasks: [{ id: "canine-reminder", animalId: "dam-a", category: "Canine breeding", dueDate: "2026-06-01" },
      { id: "rabbit-reminder", animalId: "rabbit-a", category: "Nest box", dueDate: "2026-05-01" }]
  };
}

function coordinator(writeLegacySnapshot) {
  return dualWrite.createDualWriteCoordinator({
    enabled: false,
    writeLegacySnapshot,
    shadowController: { async sync() { throw new Error("normalized migration out of scope"); },
      async verifyAndRecord() { throw new Error("normalized migration out of scope"); } }
  });
}

test("new canine and rabbit arrays survive the real snapshot mapper/reassembler round trip", () => {
  const state = dogState();
  const mapped = normalizer.mapLegacySnapshot(state);
  const restored = normalizer.reassembleLegacySnapshot(mapped.records);
  assert.deepEqual(restored, state);
  assert.equal(restored.canineBreedingPlans[0].events[0].sireRef.id, "sire-a");
  assert.deepEqual(restored.litters[1], state.litters[1]);
});

test("offline legacy write rejects; explicit retry after reconnect retains canine and rabbit records", async () => {
  const initial = dogState();
  let online = false;
  let remote = copy(initial);
  let writes = 0;
  const sync = coordinator(async snapshot => {
    writes += 1;
    if (!online) throw Object.assign(new Error("network unavailable"), { code: "OFFLINE" });
    remote = copy(snapshot);
    return { ok: true };
  });
  const locallyDurable = copy(initial);
  locallyDurable.canineReproductiveCycles[0].notes = "Observed offline";
  locallyDurable.tasks.push({ id: "offline-canine-reminder", animalId: "dam-a", category: "Canine reproduction" });
  await assert.rejects(sync.save(locallyDurable), error => error.code === "OFFLINE");
  assert.equal(remote.canineReproductiveCycles[0].notes, undefined);
  assert.equal(locallyDurable.canineReproductiveCycles[0].notes, "Observed offline");
  online = true;
  const result = await sync.save(locallyDurable);
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, false);
  assert.equal(writes, 2);
  assert.deepEqual(remote, locallyDurable);
  assert.equal(remote.litters[1].species, "Rabbit");
  // This proves explicit retry, NOT automatic reconnect or real cloud outbox handling.
});

test("RELEASE BLOCKER: an older whole-state writer can drop every new optional canine collection", () => {
  const current = dogState();
  const oldClient = {
    animals: copy(current.animals),
    litters: copy(current.litters),
    tasks: copy(current.tasks)
  };
  oldClient.tasks.push({ id: "old-client-task", title: "Legacy client edit" });
  const before = normalizer.mapLegacySnapshot(current);
  const after = normalizer.mapLegacySnapshot(oldClient);
  const delta = normalizer.diffNormalizedRecords(before.records, after.records);
  const rewritten = normalizer.reassembleLegacySnapshot(after.records);
  for (const name of ["canineReproductiveCycles", "canineExternalStuds", "canineBreedingPlans", "canineWhelpings"]) {
    assert.equal(Object.hasOwn(rewritten, name), false, name + " is lost by a stale full-snapshot write");
  }
  assert.ok(delta.tombstones.length > 0, "an old client can cause normalized rows to be deleted as well");
  assert.equal(rewritten.tasks.at(-1).id, "old-client-task");
  // Characterization only: this passes when data-loss risk IS PRESENT. Do not mark
  // old-client write compatibility ACCEPTED until a server-side prevention test passes.
});

test("RELEASE BLOCKER: two independent legacy clients can silently overwrite a newer canine edit", async () => {
  const initial = dogState();
  let remote = copy(initial);
  const write = coordinator(async snapshot => { remote = copy(snapshot); return { ok: true }; });
  const deviceA = copy(initial), deviceB = copy(initial);
  deviceA.canineBreedingPlans[0].notes = "Clinic-confirmed date from device A";
  deviceA.canineReproductiveCycles.push({ id: "new-a", femaleId: "dam-a", observedHeatStartDate: "2026-07-01" });
  assert.equal((await write.save(deviceA)).legacySaved, true);
  assert.equal(remote.canineReproductiveCycles.length, 2);
  deviceB.tasks.push({ id: "device-b-task", title: "Added while stale" });
  assert.equal((await write.save(deviceB)).legacySaved, true);
  assert.equal(remote.canineReproductiveCycles.length, 1, "older snapshot erased new record");
  assert.equal(remote.canineBreedingPlans[0].notes, undefined, "newer canine notes were lost");
  assert.equal(remote.tasks.at(-1).id, "device-b-task");
  // No CAS/version precondition was provided to this legacy write adapter.
  // Must NOT be interpreted as passing multi-device conflict safety.
});

test("an account-B puppy-generation attempt refuses account-A Dog and preserves original state", () => {
  const state = dogState();
  const before = copy(state);
  const denied = whelping.generatePuppies(state, "canine_whelping_plan-a", { ownerId: "acct-b" });
  assert.equal(denied.valid, false);
  assert.match(denied.issues.join(" "), /same-account female Dog/i);
  assert.deepEqual(state, before);
  const refused = whelping.recordWhelping(state, "plan-a", {
    birthDate: "2026-06-01", method: "unassisted", bornAlive: 1, stillborn: 0, neonatalLosses: 0
  }, { ownerId: "acct-b" });
  assert.equal(refused.valid, false);
  assert.deepEqual(state, before);
});

test("PWA update includes the canine scripts and retains explicit unsaved-work update guards", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
  assert.match(html, /canine-reproductive-workspace-v2\.0\.1\.js/);
  assert.match(html, /canine-whelping-workspace-v2\.0\.1\.js/);
  assert.match(worker, /canine-reproductive-workspace-v2\.0\.1\.js/);
  assert.match(worker, /canine-whelping-workspace-v2\.0\.1\.js/);
  assert.match(pwa, /(?:unsaved|dirty|pending|update)/i);
  // Static asset check only: real iPhone/Android and an already-running old
  // PWA client cannot be validated in Node without a browser/device.
});
