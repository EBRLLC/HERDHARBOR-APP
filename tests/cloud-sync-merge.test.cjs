const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cloud = fs.readFileSync(
  path.join(__dirname, "..", "herdharbor-cloud.js"),
  "utf8"
);
const start = cloud.indexOf("  const DEVICE_LOCAL_SETTINGS");
const end = cloud.indexOf("  function safeStorageSet", start);
assert.ok(start >= 0 && end > start, "cloud merge helpers are present");
assert.match(
  cloud,
  /const merged = confirmedBase\s+\? mergeRawStates\(confirmedBase, rawValue, remoteRaw\)/,
  "cloud sync attempts a three-way merge before pausing"
);
assert.match(
  cloud,
  /Device and cloud changes combined and saved/,
  "successful automatic merges return sync to a saved state"
);

const source = cloud.slice(start, end);
const buildHelpers = new Function(
  `${source}
  return { mergeRawStates, sameState, exactSameState, applyDevicePreferences };`
);
const {
  mergeRawStates,
  sameState,
  exactSameState,
  applyDevicePreferences
} = buildHelpers();

const raw = (value) => JSON.stringify(value);
const base = {
  profile: { operationName: "Test Farm" },
  animals: [
    {
      id: "animal-1",
      name: "Hazel",
      notes: "",
      status: "Active"
    }
  ],
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
  settings: {
    species: ["Rabbit"],
    breedsBySpecies: { Rabbit: ["Rex"] },
    theme: "system",
    sidebarCollapsed: false
  }
};

{
  const local = structuredClone(base);
  local.animals.push({ id: "animal-local", name: "Local", status: "Active" });
  local.activity.push({
    id: "activity-local",
    text: "Added local animal",
    date: "2026-07-31T02:00:00.000Z"
  });
  local.productionRecords.push({
    id: "production-local",
    date: "2026-08-04",
    product: "Eggs",
    quantity: "24",
    unit: "eggs"
  });
  local.breedings.push({
    id: "breeding-local",
    femaleId: "animal-1",
    maleId: "animal-2",
    breedingDate: "2026-08-05",
    status: "Bred"
  });
  local.customers.push({ id: "customer-local", name: "Local buyer" });
  local.sales.push({
    id: "sale-local", saleNumber: "HH-2026-LOCAL1", customerId: "customer-local", status: "Reserved",
    items: [{ id: "saleitem-local", animalId: "animal-1", unitPrice: "75.00" }]
  });
  local.settings.theme = "dark";

  const remote = structuredClone(base);
  remote.health.push({
    id: "health-remote",
    animalId: "animal-1",
    type: "Wellness Exam"
  });
  remote.litters.push({
    id: "birth-remote",
    damId: "animal-1",
    sireId: "animal-2",
    birthDate: "2026-08-05",
    bornAlive: "2"
  });
  remote.payments.push({ id: "payment-remote", saleId: "sale-local", amount: "25.00", date: "2026-08-05" });
  remote.transfers.push({ id: "transfer-remote", direction: "Received", sourceTransferId: "TR-REMOTE" });
  remote.activity.push({
    id: "activity-remote",
    text: "Added health record",
    date: "2026-07-31T02:01:00.000Z"
  });
  remote.settings.sidebarCollapsed = true;

  const result = mergeRawStates(raw(base), raw(local), raw(remote));
  assert.equal(result.ok, true, "non-overlapping device changes merge");
  assert.deepEqual(
    result.value.animals.map((item) => item.id),
    ["animal-1", "animal-local"]
  );
  assert.deepEqual(
    result.value.health.map((item) => item.id),
    ["health-remote"]
  );
  assert.deepEqual(
    result.value.productionRecords.map((item) => item.id),
    ["production-local"],
    "new production records merge without changing the cloud schema"
  );
  assert.deepEqual(result.value.breedings.map((item) => item.id), ["breeding-local"]);
  assert.deepEqual(result.value.litters.map((item) => item.id), ["birth-remote"]);
  assert.deepEqual(result.value.customers.map((item) => item.id), ["customer-local"]);
  assert.deepEqual(result.value.sales.map((item) => item.id), ["sale-local"]);
  assert.deepEqual(result.value.payments.map((item) => item.id), ["payment-remote"]);
  assert.deepEqual(result.value.transfers.map((item) => item.id), ["transfer-remote"]);
  assert.deepEqual(
    result.value.activity.map((item) => item.id),
    ["activity-remote", "activity-local"]
  );

  const transferBase = structuredClone(base);
  const transferLocal = structuredClone(base);
  const transferRemote = structuredClone(base);
  transferLocal.transfers.push({
    id: "transfer_received_same", direction: "Received", sourceTransferId: "TR-SAME",
    sourceSaleNumber: "HH-SAME", senderName: "Sending farm", senderContact: "owner@example.com",
    animalIds: ["animal-1"], createdAt: "2026-08-05T12:00:01.000Z"
  });
  transferRemote.transfers.push({
    id: "transfer_received_same", direction: "Received", sourceTransferId: "TR-SAME",
    sourceSaleNumber: "HH-SAME", senderName: "Sending farm", senderContact: "owner@example.com",
    animalIds: ["animal-1"], createdAt: "2026-08-05T12:00:02.000Z"
  });
  const transferMerge = mergeRawStates(JSON.stringify(transferBase), JSON.stringify(transferLocal), JSON.stringify(transferRemote));
  assert.equal(transferMerge.ok, true, "the same deterministic transfer import merges once across devices");
  assert.equal(transferMerge.value.transfers.length, 1);
  assert.equal(transferMerge.value.transfers[0].createdAt, "2026-08-05T12:00:01.000Z");
  assert.equal(result.value.settings.theme, "dark");
  assert.equal(
    result.value.settings.sidebarCollapsed,
    false,
    "device-only settings stay local"
  );
}

{
  const predictionBase = structuredClone(base);
  predictionBase.breedingIntelligence = { version: 1, predictions: [], conflicts: [], updatedAt: null };
  const local = structuredClone(predictionBase);
  const remote = structuredClone(predictionBase);
  local.breedingIntelligence.predictions.push({
    id: "genetics_prediction_local",
    createdAt: "2026-08-27T12:00:00.000Z",
    metadata: { buckId: "buck-1", doeId: "doe-1" },
    analysis: { exact: true, exactOutcomes: [{ name: "Black", probability: 1 }] }
  });
  remote.breedingIntelligence.predictions.push({
    id: "genetics_prediction_remote",
    createdAt: "2026-08-27T12:01:00.000Z",
    metadata: { buckId: "buck-1", doeId: "doe-1" },
    analysis: { exact: false, possibleOutcomes: [{ name: "Blue" }] }
  });
  const merged = mergeRawStates(raw(predictionBase), raw(local), raw(remote));
  assert.equal(merged.ok, true, "prediction history remains compatible with protected cloud merge");
  assert.deepEqual(
    merged.value.breedingIntelligence.predictions.map((snapshot) => snapshot.id),
    ["genetics_prediction_local", "genetics_prediction_remote"],
    "separately saved prediction snapshots survive a cross-device merge"
  );
}

{
  const offspringBase = structuredClone(base);
  offspringBase.animals.push(
    { id: "dam-1", name: "Willow", species: "Rabbit", sex: "Female" },
    { id: "sire-1", name: "Atlas", species: "Rabbit", sex: "Male" }
  );
  offspringBase.litters = [{
    id: "birth-1", damId: "dam-1", sireId: "sire-1", birthDate: "2026-08-05",
    bornAlive: "1", offspringIds: []
  }];
  const local = structuredClone(offspringBase);
  const remote = structuredClone(offspringBase);
  [
    [local, "2026-08-05T12:00:00.000Z"],
    [remote, "2026-08-05T12:00:04.000Z"]
  ].forEach(([copy, timestamp]) => {
    copy.animals.push({
      id: "animal_offspring_birth-1_001", name: "Willow offspring 1", tag: "L-1",
      species: "Rabbit", sex: "Unknown", dob: "2026-08-05", status: "Growing",
      sireId: "sire-1", damId: "dam-1", sourceBirthId: "birth-1",
      createdAt: timestamp, updatedAt: timestamp
    });
    copy.litters[0].offspringIds = ["animal_offspring_birth-1_001"];
    copy.litters[0].updatedAt = timestamp;
  });

  const result = mergeRawStates(raw(offspringBase), raw(local), raw(remote));
  assert.equal(result.ok, true, "the same offspring created on two devices merges automatically");
  assert.equal(result.value.animals.filter((animal) => animal.id === "animal_offspring_birth-1_001").length, 1);
  assert.deepEqual(result.value.litters[0].offspringIds, ["animal_offspring_birth-1_001"]);
}

{
  const recurringBase = structuredClone(base);
  recurringBase.tasks = [{
    id: "task-feed",
    title: "Feed broilers",
    dueDate: "2026-08-04",
    recurrence: "Daily",
    completed: false
  }];
  const local = structuredClone(recurringBase);
  const remote = structuredClone(recurringBase);
  [
    [local, "2026-08-04T12:00:00.000Z"],
    [remote, "2026-08-04T12:00:03.000Z"]
  ].forEach(([copy, timestamp]) => {
    Object.assign(copy.tasks[0], {
      completed: true,
      completedAt: timestamp,
      updatedAt: timestamp,
      seriesId: "task-feed",
      nextTaskId: "task_occurrence_task-feed_20260805"
    });
    copy.tasks.push({
      id: "task_occurrence_task-feed_20260805",
      title: "Feed broilers",
      dueDate: "2026-08-05",
      recurrence: "Daily",
      completed: false,
      seriesId: "task-feed",
      generatedFromTaskId: "task-feed",
      createdAt: timestamp,
      updatedAt: timestamp
    });
  });

  const result = mergeRawStates(raw(recurringBase), raw(local), raw(remote));
  assert.equal(result.ok, true, "the same recurring occurrence created on two devices merges safely");
  assert.equal(result.value.tasks.length, 2, "the deterministic occurrence ID prevents duplicates");
  assert.equal(result.value.tasks[0].completedAt, "2026-08-04T12:00:03.000Z", "the latest completion timestamp wins");
  assert.equal(result.value.tasks[1].createdAt, "2026-08-04T12:00:00.000Z", "the earliest creation timestamp wins");
}

{
  const local = structuredClone(base);
  local.animals[0].name = "Hazel Local";
  local.animals[0].updatedAt = "2026-07-31T02:02:00.000Z";
  const remote = structuredClone(base);
  remote.animals[0].notes = "Remote note";
  remote.animals[0].updatedAt = "2026-07-31T02:03:00.000Z";

  const result = mergeRawStates(raw(base), raw(local), raw(remote));
  assert.equal(result.ok, true, "different fields on one record merge");
  assert.equal(result.value.animals[0].name, "Hazel Local");
  assert.equal(result.value.animals[0].notes, "Remote note");
  assert.equal(result.value.animals[0].updatedAt, "2026-07-31T02:03:00.000Z");
}

{
  const local = structuredClone(base);
  local.animals[0].name = "Hazel Local";
  const remote = structuredClone(base);
  remote.animals[0].name = "Hazel Remote";

  const result = mergeRawStates(raw(base), raw(local), raw(remote));
  assert.equal(result.ok, false, "the same field is never overwritten silently");
  assert.deepEqual(result.conflicts, ["animals.animal-1.name"]);
}

{
  const local = structuredClone(base);
  local.animals = [];
  const remote = structuredClone(base);

  const result = mergeRawStates(raw(base), raw(local), raw(remote));
  assert.equal(result.ok, true, "a deletion merges with an unchanged record");
  assert.deepEqual(result.value.animals, []);
}

{
  const local = structuredClone(base);
  local.animals = [];
  const remote = structuredClone(base);
  remote.animals[0].notes = "Edited elsewhere";

  const result = mergeRawStates(raw(base), raw(local), raw(remote));
  assert.equal(result.ok, false, "delete-versus-edit remains protected");
  assert.deepEqual(result.conflicts, ["animals.animal-1"]);
}

{
  const local = structuredClone(base);
  local.settings.species.push("Goat");
  local.settings.breedsBySpecies.Rabbit.push("Mini Rex");
  const remote = structuredClone(base);
  remote.settings.species.push("Sheep");
  remote.settings.breedsBySpecies.Rabbit.push("Lionhead");

  const result = mergeRawStates(raw(base), raw(local), raw(remote));
  assert.equal(result.ok, true, "remembered species and breeds merge additively");
  assert.deepEqual(
    result.value.settings.species,
    ["Rabbit", "Goat", "Sheep"]
  );
  assert.deepEqual(
    result.value.settings.breedsBySpecies.Rabbit,
    ["Rex", "Mini Rex", "Lionhead"]
  );
}

{
  const localBeforeMerge = structuredClone(base);
  localBeforeMerge.animals.push({
    id: "animal-local",
    name: "Local",
    status: "Active"
  });
  const currentLocal = structuredClone(localBeforeMerge);
  currentLocal.health.push({
    id: "health-later",
    animalId: "animal-local",
    type: "Weight"
  });
  const savedMerge = structuredClone(localBeforeMerge);
  savedMerge.transactions.push({
    id: "transaction-remote",
    type: "Expense",
    amount: "12.00"
  });

  const result = mergeRawStates(
    raw(localBeforeMerge),
    raw(currentLocal),
    raw(savedMerge)
  );
  assert.equal(result.ok, true, "a rapid local save rebases onto the merged cloud copy");
  assert.equal(result.value.health.length, 1);
  assert.equal(result.value.transactions.length, 1);
}

{
  const left = structuredClone(base);
  const right = structuredClone(base);
  left.settings.theme = "dark";
  right.settings.theme = "light";
  left.settings.sidebarCollapsed = true;

  assert.equal(sameState(raw(left), raw(right)), true);
  assert.equal(exactSameState(raw(left), raw(right)), false);

  const applied = JSON.parse(applyDevicePreferences(raw(right), raw(left)));
  assert.equal(applied.settings.theme, "dark");
  assert.equal(applied.settings.sidebarCollapsed, true);
}

console.log("cloud sync merge tests passed");
