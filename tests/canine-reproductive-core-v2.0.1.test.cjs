"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../canine-reproductive-core-v2.0.1.js");

const dogs = [
  { id: "dam", species: "Dog", sex: "Female", userId: "acct-a" },
  { id: "sire", species: "Dog", sex: "Male", userId: "acct-a" },
  { id: "rabbit", species: "Rabbit", sex: "Female", userId: "acct-a" },
  { id: "foreign-dog", species: "Dog", sex: "Male", userId: "acct-b" }
];

test("cycle creation preserves each historical cycle and does not infer a stage", () => {
  const first = Core.createCycle("dam", { observedHeatStartDate: "2026-01-01" }, { idFactory: prefix => `${prefix}_one` });
  const second = Core.createCycle("dam", { observedHeatStartDate: "2026-08-20" }, { idFactory: prefix => `${prefix}_two` });
  assert.notEqual(first.id, second.id);
  assert.equal(first.observedStage, "unknown");
  assert.equal(second.observedStage, "unknown");
  assert.equal(first.observations.length, 0);
  assert.equal(Core.validateCycle(first, dogs, { ownerId: "acct-a" }).valid, true);
});

test("cycle validation distinguishes account, species, sex, and clinical test evidence", () => {
  const valid = Core.createCycle("dam", {
    id: "cycle-1", observedHeatStartDate: "2026-10-01", observedStage: "unknown",
    progesteroneTests: [{ id: "p1", date: "2026-10-04", time: "09:30", value: 4.2, units: "ng/mL", laboratory: "Example Lab" }]
  });
  const checked = Core.validateCycle(valid, dogs, { ownerId: "acct-a" });
  assert.equal(checked.valid, true);
  assert.equal(checked.value.progesteroneTests[0].interpretation, "uninterpreted_observation");
  assert.equal(Core.validateCycle({ ...valid, femaleId: "rabbit" }, dogs, { ownerId: "acct-a" }).valid, false);
  assert.equal(Core.validateCycle({ ...valid, femaleId: "foreign-dog" }, dogs, { ownerId: "acct-a" }).valid, false);
  assert.equal(Core.validateCycle({ ...valid, progesteroneTests: [{ id: "p1", date: "2026-10-04", value: 4.2 }] }, dogs).valid, false);
});

test("cycle date arithmetic is calendar-safe and independent of local DST offsets", () => {
  assert.equal(Core.addDays("2026-03-07", 2), "2026-03-09");
  assert.equal(Core.addDays("2026-10-31", 2), "2026-11-02");
  assert.equal(Core.isDateOnly("2026-02-29"), false);
  assert.equal(Core.isDateOnly("2024-02-29"), true);
  assert.equal(Core.addDays("2026-03-08", 63), "2026-05-10");
});

test("external studs are account-scoped, de-duplicated, and never become owned animals", () => {
  const stud = Core.normalizeExternalStud({ id: "stud-a", displayName: "Ranger", registry: "AKC", registrationNumber: "123" }, "acct-a");
  assert.equal(stud.ownerScope, "external_reference");
  assert.equal(stud.accountId, "acct-a");
  const existing = [stud];
  const duplicate = Core.validateExternalStudCollection(existing, { ...stud, id: "stud-b" }, "acct-a", dogs);
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.issues.join(" "), /already exists/);
  assert.equal(Core.validateExternalStud({ ...stud, id: "stud-c" }, "acct-b", dogs).value.accountId, "acct-b");
  const foreignLink = Core.validateExternalStud({ ...stud, id: "stud-d", linkedAnimalId: "foreign-dog" }, "acct-a", dogs);
  assert.equal(foreignLink.valid, false);
});

test("sire references distinguish same-account dogs, account-owned external references, and unknown paternity", () => {
  const stud = Core.normalizeExternalStud({ id: "stud-a", displayName: "Ranger", registeredName: "North Star Ranger", breed: "Labrador" }, "acct-a");
  assert.equal(Core.validateSireReference({ type: "owned_dog", id: "sire" }, { animals: dogs, accountId: "acct-a" }).valid, true);
  assert.equal(Core.validateSireReference({ type: "owned_dog", id: "foreign-dog" }, { animals: dogs, accountId: "acct-a" }).valid, false);
  assert.equal(Core.validateSireReference({ type: "external_stud", id: "stud-a" }, { externalStuds: [stud], accountId: "acct-a" }).valid, true);
  assert.equal(Core.validateSireReference({ type: "external_stud", id: "stud-a" }, { externalStuds: [stud], accountId: "acct-b" }).valid, false);
  assert.equal(Core.validateSireReference({ type: "unknown" }, { accountId: "acct-a" }).valid, true);
});

test("whelping estimates retain source method and distinguish broad mating from ovulation dates", () => {
  const mating = Core.estimateWhelpingWindow({ method: "breeding_range", breedingDates: ["2026-01-01", "2026-01-03"], now: "2026-01-04T00:00:00Z" });
  assert.deepEqual([mating.startDate, mating.endDate], ["2026-02-28", "2026-03-16"]);
  assert.equal(mating.sourceDate, "2026-01-01");
  assert.equal(mating.calculated, true);
  const ovulation = Core.estimateWhelpingWindow({ method: "vet_confirmed_ovulation", ovulationDate: "2026-01-01", now: "2026-01-04T00:00:00Z" });
  assert.deepEqual([ovulation.startDate, ovulation.endDate], ["2026-03-04", "2026-03-06"]);
  assert.equal(ovulation.method, "vet_confirmed_ovulation");
  const vet = Core.estimateWhelpingWindow({ method: "vet_expected", veterinarianExpected: { startDate: "2026-03-01", endDate: "2026-03-03", veterinarian: "Dr. Vet" } });
  assert.equal(vet.calculated, false);
  const manual = Core.estimateWhelpingWindow({ method: "manual", manual: { startDate: "2026-03-05", note: "Breeder estimate" } });
  assert.equal(manual.method, "manual");
  assert.equal(manual.userAdjusted, true);
  assert.equal(Core.estimateWhelpingWindow({ method: "breeding_range", breedingDates: ["not-a-date"] }), null);
});

test("a mating does not confirm pregnancy and confirmation requires veterinary evidence", () => {
  assert.equal(Core.mayConfirmPregnancy("awaiting_assessment").valid, true);
  assert.equal(Core.mayConfirmPregnancy("confirmed_pregnant", { completedMating: true }).valid, false);
  assert.equal(Core.mayConfirmPregnancy("confirmed_pregnant", { veterinarianConfirmed: true }).valid, true);
});
