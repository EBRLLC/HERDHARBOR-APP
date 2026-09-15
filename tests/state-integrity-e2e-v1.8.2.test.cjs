"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Lifecycle = require("../flow-phase2-lifecycle-v1.8.2.js");
const Workspace = require("../breeding-litter-workspace-v1.8.2.js");
const Weaning = require("../weaning-safeguards-core-v1.8.2.js");
const Sale = require("../litter-sale-transfer-core-v1.8.2.js");
const Transfer = require("../direct-transfer-core-v1.8.2.js");
const Integrity = require("../lifecycle-integrity-core-v1.8.2.js");

const cloudSource = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const mergeStart = cloudSource.indexOf("  const DEVICE_LOCAL_SETTINGS");
const mergeEnd = cloudSource.indexOf("  function safeStorageSet", mergeStart);
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, "cloud merge helpers are available for lifecycle E2E coverage");
const mergeHelpers = new Function(`${cloudSource.slice(mergeStart, mergeEnd)}\nreturn { mergeRawStates };`)();
const { mergeRawStates } = mergeHelpers;

const raw = (value) => JSON.stringify(value);
const clone = (value) => structuredClone(value);

function emptyState() {
  return {
    profile: { operationName: "Waggin Tails Rabbitry", ownerName: "Breeder" },
    animals: [],
    breedings: [],
    litters: [],
    health: [],
    tasks: [],
    customers: [],
    sales: [],
    payments: [],
    transfers: [],
    transactions: [],
    productionRecords: [],
    activity: [],
    lifecycleTombstones: [],
    settings: { species: ["Rabbit"], breedsBySpecies: { Rabbit: ["Holland Lop"] } }
  };
}

function breedingState({ bornAlive = 3 } = {}) {
  const state = emptyState();
  state.animals.push(
    {
      id: "doe-judy",
      name: "Judy",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Female",
      status: "Active",
      registrationNumber: "REG-JUDY",
      breeder: "Waggin Tails Rabbitry"
    },
    {
      id: "buck-jack",
      name: "Jack",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Male",
      status: "Active",
      registrationNumber: "REG-JACK",
      breeder: "Waggin Tails Rabbitry"
    }
  );
  state.breedings.push({
    id: "breeding-1",
    femaleId: "doe-judy",
    maleId: "buck-jack",
    breedingDate: "2026-09-01",
    pregnancyCheckDate: "2026-09-15",
    pregnancyCheckStatus: "Not checked",
    dueDate: "2026-10-02",
    status: "Bred",
    notes: "",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z"
  });
  state.litters.push({
    id: "litter-1",
    breedingId: "breeding-1",
    damId: "doe-judy",
    sireId: "buck-jack",
    birthDate: "2026-10-02",
    bornAlive: String(bornAlive),
    stillborn: "0",
    fosteredIn: "0",
    fosteredOut: "0",
    lostBeforeWeaning: "0",
    weaned: "0",
    offspringIds: [],
    createdAt: "2026-10-02T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z"
  });
  return state;
}

function makeBornOffspring(state, now = "2026-10-02T12:05:00.000Z") {
  return Lifecycle.autoCreateBornOffspring(state, state.litters[0], now).state;
}

function markPregnancyConfirmed(state) {
  const next = clone(state);
  next.breedings[0] = {
    ...next.breedings[0],
    pregnancyCheckStatus: "Positive",
    status: "Confirmed Pregnant",
    updatedAt: "2026-09-15T12:00:00.000Z"
  };
  return next;
}

function completeWeaning(state, date = "2026-10-30") {
  const ids = state.litters[0].offspringIds.slice();
  const eligibility = Weaning.eligibleForDate(state, "litter-1", ids, date, date);
  assert.equal(eligibility.blocked.length, 0, "all live offspring must be eligible before the E2E suite marks them weaned");
  return Workspace.weanSelected(
    state,
    "litter-1",
    ids,
    { date, location: "Grow-out A" },
    `${date}T12:00:00.000Z`
  ).state;
}

test("Scenario A: breeding -> pregnancy -> birth -> offspring -> weights -> weaning -> retained preserves one canonical lifecycle", () => {
  let state = breedingState({ bornAlive: 3 });

  assert.equal(Lifecycle.breedingStage(state.breedings[0], null, "2026-09-01").id, "bred");
  state = markPregnancyConfirmed(state);
  assert.equal(Lifecycle.breedingStage(state.breedings[0], null, "2026-09-15").id, "confirmed");

  state = makeBornOffspring(state);
  assert.equal(state.animals.length, 5, "birth creates exactly three offspring plus the two parents");
  assert.equal(state.litters[0].offspringIds.length, 3);
  assert.equal(new Set(state.litters[0].offspringIds).size, 3, "offspring IDs remain unique");

  for (const id of state.litters[0].offspringIds) {
    const kit = state.animals.find((animal) => animal.id === id);
    assert.equal(kit.damId, "doe-judy");
    assert.equal(kit.sireId, "buck-jack");
    assert.equal(kit.sourceBirthId, "litter-1");
    assert.equal(kit.dob, "2026-10-02");
  }

  const weights = state.litters[0].offspringIds.map((animalId, index) => ({
    animalId,
    weight: String(13.5 + index)
  }));
  const weightResult = Workspace.addBulkWeights(
    state,
    "litter-1",
    weights,
    { date: "2026-10-16", weightUnit: "oz" },
    "2026-10-16T12:00:00.000Z"
  );
  state = weightResult.state;
  assert.equal(weightResult.created.length, 3);
  assert.equal(state.health.filter((row) => row.type === "Weight").length, 3);

  const firstKitId = state.litters[0].offspringIds[0];
  const day27 = Weaning.weanEligibility(state, "litter-1", firstKitId, "2026-10-29", "2026-10-29");
  assert.equal(day27.allowed, false, "rabbit weaning remains locked before 28 days");
  assert.equal(day27.unlockDate, "2026-10-30");
  const day28 = Weaning.weanEligibility(state, "litter-1", firstKitId, "2026-10-30", "2026-10-30");
  assert.equal(day28.allowed, true);

  state = completeWeaning(state);
  assert.equal(state.litters[0].weaned, "3");
  assert.equal(Lifecycle.breedingStage(state.breedings[0], state.litters[0], "2026-10-30").id, "weaning");

  const retained = Workspace.setDisposition(
    state,
    "litter-1",
    state.litters[0].offspringIds,
    "retain",
    "2026-10-30T12:30:00.000Z"
  );
  state = retained.state;
  assert.equal(retained.updated.length, 0, "retaining already-Active offspring is idempotent and should not rewrite unchanged records");
  assert.ok(state.litters[0].offspringIds.every((id) => state.animals.find((animal) => animal.id === id)?.status === "Active"));
  assert.ok(state.litters[0].offspringIds.every((id) => Lifecycle.offspringDisposition(state, state.animals.find((animal) => animal.id === id)) === "Retained"));
  assert.equal(state.animals.filter((animal) => animal.sourceBirthId === "litter-1").length, 3);
});

test("Scenario B: litter evaluation -> completed sale -> direct member transfer preserves identity, pedigree, and provenance", () => {
  let seller = makeBornOffspring(breedingState({ bornAlive: 2 }));
  seller = completeWeaning(seller);
  const subjectId = seller.litters[0].offspringIds[0];

  seller = Workspace.setDisposition(
    seller,
    "litter-1",
    [subjectId],
    "for-sale",
    "2026-10-31T09:00:00.000Z"
  ).state;
  assert.equal(seller.animals.find((animal) => animal.id === subjectId).status, "For Sale");

  const saleResult = Sale.createSaleFromLitter(
    seller,
    "litter-1",
    {
      animalIds: [subjectId],
      customerName: "Buyer Rabbitry",
      email: "buyer@example.com",
      prices: { [subjectId]: "150.00" },
      saleDate: "2026-11-01",
      status: "Reserved"
    },
    "2026-11-01T10:00:00.000Z"
  );
  assert.equal(saleResult.error, "");
  seller = saleResult.state;
  assert.equal(seller.animals.find((animal) => animal.id === subjectId).status, "Reserved");
  assert.equal(saleResult.sale.sourceLitterId, "litter-1");
  assert.equal(saleResult.sale.sourceBreedingId, "breeding-1");

  const completed = Sale.updateSaleStatus(
    seller,
    saleResult.sale.id,
    "Completed",
    "2026-11-01T11:00:00.000Z"
  );
  assert.equal(completed.error, "");
  seller = completed.state;
  assert.equal(seller.animals.find((animal) => animal.id === subjectId).status, "Sold");

  const payload = Transfer.buildTransferPayload(seller, saleResult.sale.id, {
    operationName: "Waggin Tails Rabbitry",
    ownerName: "Breeder",
    memberCode: "HH-SELLER"
  });
  assert.deepEqual(payload.subjectIds, [subjectId]);
  assert.ok(payload.animals.some((animal) => animal.id === subjectId));
  assert.ok(payload.animals.some((animal) => animal.id === "doe-judy"));
  assert.ok(payload.animals.some((animal) => animal.id === "buck-jack"));

  const imported = Transfer.applyIncomingTransfer(
    { profile: { operationName: "Buyer Rabbitry" }, animals: [], transfers: [] },
    payload,
    { recipientDisplayName: "Buyer Rabbitry", senderDisplayName: "Waggin Tails Rabbitry" }
  );
  assert.equal(imported.alreadyImported, false, "the first accepted transfer is a new import");
  assert.equal(imported.subjectAnimalIds.length, 1);
  const received = imported.state.animals.find((animal) => imported.subjectAnimalIds.includes(animal.id));
  assert.ok(received);
  assert.equal(received.status, "Active");
  const receivedSire = imported.state.animals.find((animal) => animal.id === received.sireId);
  const receivedDam = imported.state.animals.find((animal) => animal.id === received.damId);
  assert.equal(receivedSire.status, "Ancestor Only");
  assert.equal(receivedDam.status, "Ancestor Only");
  assert.equal(received.ownershipHistory.at(-1).from, "Waggin Tails Rabbitry");
  assert.equal(imported.state.transfers.length, 1);
  assert.equal(imported.state.transfers[0].channel, "HerdHarbor Direct");

  const repeated = Transfer.applyIncomingTransfer(imported.state, payload);
  assert.equal(repeated.alreadyImported, true, "replaying the accepted transfer must not duplicate the animal or pedigree");
  assert.equal(repeated.state.animals.length, imported.state.animals.length);
});

test("Scenario C: phone create -> PC update -> phone edit again combines non-overlapping breeding changes across devices", () => {
  const base = emptyState();
  base.animals.push(
    { id: "doe-judy", name: "Judy", species: "Rabbit", sex: "Female", status: "Active" },
    { id: "buck-jack", name: "Jack", species: "Rabbit", sex: "Male", status: "Active" }
  );

  const phoneCreated = clone(base);
  phoneCreated.breedings.push({
    id: "breeding-phone-1",
    femaleId: "doe-judy",
    maleId: "buck-jack",
    breedingDate: "2026-09-01",
    pregnancyCheckDate: "2026-09-15",
    pregnancyCheckStatus: "Not checked",
    dueDate: "2026-10-02",
    status: "Bred",
    notes: "",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z"
  });

  const firstUpload = mergeRawStates(raw(base), raw(phoneCreated), raw(base));
  assert.equal(firstUpload.ok, true);
  assert.equal(firstUpload.value.breedings.length, 1);

  const phoneConfirmedBase = clone(firstUpload.value);
  const pc = clone(firstUpload.value);
  pc.breedings[0].pregnancyCheckStatus = "Positive";
  pc.breedings[0].status = "Confirmed Pregnant";
  pc.breedings[0].updatedAt = "2026-09-15T12:00:00.000Z";

  const phoneEditedAgain = clone(phoneConfirmedBase);
  phoneEditedAgain.breedings[0].notes = "Doe looked good at evening check.";
  phoneEditedAgain.breedings[0].updatedAt = "2026-09-15T12:05:00.000Z";

  const merged = mergeRawStates(raw(phoneConfirmedBase), raw(phoneEditedAgain), raw(pc));
  assert.equal(merged.ok, true, "different fields on the same breeding record should merge across devices");
  assert.equal(merged.value.breedings.length, 1);
  assert.equal(merged.value.breedings[0].pregnancyCheckStatus, "Positive");
  assert.equal(merged.value.breedings[0].status, "Confirmed Pregnant");
  assert.equal(merged.value.breedings[0].notes, "Doe looked good at evening check.");
  assert.equal(merged.value.breedings[0].updatedAt, "2026-09-15T12:05:00.000Z");
});

test("Scenario C safety: same-field phone/PC edits stop as a conflict instead of silently overwriting breeding data", () => {
  const base = breedingState({ bornAlive: 0 });
  base.litters = [];
  const phone = clone(base);
  const pc = clone(base);
  phone.breedings[0].notes = "Phone note";
  pc.breedings[0].notes = "PC note";
  const result = mergeRawStates(raw(base), raw(phone), raw(pc));
  assert.equal(result.ok, false);
  assert.ok(result.conflicts.some((path) => path.includes("breedings.breeding-1.notes")));
});

test("Scenario D: delete litter -> sync -> stale second device returns; tombstone prevents resurrection and preserves offspring profiles", () => {
  const base = makeBornOffspring(breedingState({ bornAlive: 2 }), "2026-10-02T12:05:00.000Z");
  const offspringIds = base.litters[0].offspringIds.slice();

  const deviceADeleted = clone(base);
  deviceADeleted.litters = [];
  const tombstoned = Integrity.recordDeletionTombstones(
    base,
    deviceADeleted,
    "2026-10-10T12:00:00.000Z"
  );
  assert.equal(tombstoned.changed, true);
  assert.ok(tombstoned.state.lifecycleTombstones.some((row) => row.id === "litter:litter-1"));

  const staleDeviceB = clone(base);
  staleDeviceB.animals.find((animal) => animal.id === offspringIds[0]).notes = "Updated on stale phone after litter deletion synced elsewhere.";
  staleDeviceB.animals.find((animal) => animal.id === offspringIds[0]).updatedAt = "2026-10-10T12:05:00.000Z";

  const merged = mergeRawStates(raw(base), raw(staleDeviceB), raw(tombstoned.state));
  assert.equal(merged.ok, true, "unrelated stale-device offspring edits can merge with a remote litter deletion");
  assert.equal(merged.value.litters.length, 0, "deleted litter must stay deleted after the stale device returns");
  assert.ok(merged.value.lifecycleTombstones.some((row) => row.id === "litter:litter-1"));

  const repaired = Integrity.reconcile(
    merged.value,
    "2026-10-10T12:06:00.000Z",
    "2026-10-10"
  );
  assert.equal(repaired.state.litters.length, 0);
  assert.equal(repaired.state.animals.filter((animal) => offspringIds.includes(animal.id)).length, 2, "deleting the birth/litter must not delete legitimate animal profiles");
  assert.ok(repaired.state.animals.filter((animal) => offspringIds.includes(animal.id)).every((animal) => animal.sourceBirthId === ""), "deleted litter links are removed from preserved offspring");
  assert.match(repaired.state.animals.find((animal) => animal.id === offspringIds[0]).notes, /stale phone/);
});

test("Scenario D safety: if a stale device edits the deleted litter itself, cloud merge refuses silent resurrection", () => {
  const base = makeBornOffspring(breedingState({ bornAlive: 2 }));
  const deleted = clone(base);
  deleted.litters = [];
  const protectedDeleted = Integrity.recordDeletionTombstones(base, deleted, "2026-10-10T12:00:00.000Z").state;

  const stale = clone(base);
  stale.litters[0].notes = "Stale-device litter edit";
  stale.litters[0].updatedAt = "2026-10-10T12:02:00.000Z";

  const merge = mergeRawStates(raw(base), raw(stale), raw(protectedDeleted));
  assert.equal(merge.ok, false, "delete-versus-edit must require conflict handling rather than resurrecting the litter");
  assert.ok(merge.conflicts.some((path) => path.includes("litters.litter-1")));

  const accidentallyRecombined = {
    ...stale,
    lifecycleTombstones: protectedDeleted.lifecycleTombstones
  };
  const repaired = Integrity.reconcile(accidentallyRecombined, "2026-10-10T12:03:00.000Z", "2026-10-10");
  assert.equal(repaired.state.litters.length, 0, "tombstone reconciliation is a final defense against stale resurrection");
});
