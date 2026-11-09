"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../feline-cavy-breeding-core-v2.0.3.js");

const animal = (id, species, sex, extras = {}) => ({
  id, species, sex, status: "Active", ownerId: "farm-a", ...extras
});
const base = () => ({
  animals: [
    animal("queen", "Cat", "Female"),
    animal("tom", "Cat", "Male"),
    animal("sow", "Guinea Pig", "Female"),
    animal("boar", "Guinea Pig", "Male"),
    animal("doe", "Rabbit", "Female"),
    animal("buck", "Rabbit", "Male")
  ],
  breedings: [], litters: [], healthIntelligence: { episodes: [] }
});

test("cat and cavy are independent species; aliases do not borrow rabbit logic", () => {
  assert.equal(core.canonicalSpecies("feline"), "Cat");
  assert.equal(core.canonicalSpecies("Cavy"), "Guinea Pig");
  assert.equal(core.canonicalSpecies("cavies"), "Guinea Pig");
  assert.equal(core.canonicalSpecies("Rabbit"), "");
  assert.equal(core.isSupported("Dog"), false);
  assert.equal(core.profileFor("Cat").offspringLabel, "Kitten");
  assert.equal(core.profileFor("Cavy").offspringLabel, "Pup");
  assert.ok(core.BREEDS.Cat.includes("Maine Coon"));
  assert.ok(core.BREEDS["Guinea Pig"].includes("Abyssinian"));
});

test("dates are calendar-valid and deterministic across leap days", () => {
  assert.equal(core.isDateOnly("2026-02-29"), false);
  assert.equal(core.isDateOnly("2028-02-29"), true);
  assert.equal(core.addDays("2028-02-29", 1), "2028-03-01");
  assert.equal(core.addDays("2026-02-29", 1), "");
  assert.equal(core.estimateDates("Dog", "2026-10-01"), null);
});

test("cat estimate is a range and not a pregnancy confirmation", () => {
  const dates = core.estimateDates("Cat", "2026-11-01");
  assert.equal(dates.dueStartDate, "2027-01-03");
  assert.equal(dates.dueDate, "2027-01-05");
  assert.equal(dates.dueEndDate, "2027-01-07");
  assert.equal(dates.evidence, "estimated_from_breeding_date");
  assert.equal(dates.pregnancyReviewDate, "2026-11-25");
});

test("cavy has its own 59-72-day gestation planning window", () => {
  const dates = core.estimateDates("Cavy", "2026-11-01");
  assert.equal(dates.dueStartDate, "2026-12-30");
  assert.equal(dates.dueDate, "2027-01-08");
  assert.equal(dates.dueEndDate, "2027-01-12");
  assert.equal(core.weaningReviewDate("Guinea Pig", "2026-11-01"), "2026-11-22");
});

test("pairing requires same supported species, opposite recorded sex, unique parents", () => {
  const state = base();
  assert.equal(core.validatePair(state, "queen", "tom").valid, true);
  assert.equal(core.validatePair(state, "sow", "boar").valid, true);
  assert.equal(core.validatePair(state, "queen", "boar").valid, false);
  assert.equal(core.validatePair(state, "queen", "queen").valid, false);
  assert.equal(core.validatePair(state, "doe", "buck").valid, false);
  assert.equal(core.validatePair(state, "tom", "queen").valid, false);
  assert.equal(core.validatePair(state, "queen", "absent").valid, false);
  assert.equal(core.validatePair(state, "queen", "tom", { ownerId: "farm-b" }).valid, false);
});

test("no new breeding may use sold, archived, deceased or quarantined animal", () => {
  const state = base();
  state.animals[0].status = "Sold";
  assert.equal(core.validatePair(state, "queen", "tom").valid, false);
  state.animals[0].status = "Active";
  state.healthIntelligence.episodes.push({ animalId: "queen", quarantined: true, resolved: false });
  assert.equal(core.validatePair(state, "queen", "tom").valid, false);
  state.healthIntelligence.episodes[0].resolved = true;
  assert.equal(core.validatePair(state, "queen", "tom").valid, true);
});

test("new breeding dates cannot be invalid or precede mating", () => {
  const state = base();
  assert.equal(core.validateBreeding(state, { femaleId: "queen", maleId: "tom", breedingDate: "2026-11-01", dueDate: "2027-01-05" }).valid, true);
  assert.equal(core.validateBreeding(state, { femaleId: "queen", maleId: "tom", breedingDate: "2026-11-31" }).valid, false);
  assert.equal(core.validateBreeding(state, { femaleId: "queen", maleId: "tom", breedingDate: "2026-11-01", dueDate: "2026-10-01" }).valid, false);
});

test("actual births remain recordable for historical or quarantined parents", () => {
  const state = base();
  state.animals[0].status = "Archived";
  state.healthIntelligence.episodes.push({ animalId: "queen", quarantined: true });
  assert.equal(core.validateBirth(state, {
    damId: "queen", sireId: "tom", birthDate: "2026-11-01", bornAlive: 3, stillborn: 0
  }).valid, true);
});

test("births reject negative/noninteger totals, impossible counts and wrong linked parents", () => {
  const state = base();
  state.breedings.push({ id: "b1", femaleId: "queen", maleId: "tom" });
  const data = { damId: "queen", sireId: "tom", breedingId: "b1", birthDate: "2026-11-01", bornAlive: 3, weaned: 2 };
  assert.equal(core.validateBirth(state, data).valid, true);
  assert.equal(core.validateBirth(state, { ...data, bornAlive: -1 }).valid, false);
  assert.equal(core.validateBirth(state, { ...data, bornAlive: 1.5 }).valid, false);
  assert.equal(core.validateBirth(state, { ...data, weaned: 4 }).valid, false);
  assert.equal(core.validateBirth(state, { ...data, sireId: "boar" }).valid, false);
  state.litters.push({ id: "l1", breedingId: "b1" });
  assert.equal(core.validateBirth(state, data).valid, false);
  assert.equal(core.validateBirth(state, data, { currentLitterId: "l1" }).valid, true);
});

test("species-specific guidance is not borrowed from rabbits", () => {
  assert.match(core.guidance("Cat"), /induced ovulators/i);
  assert.match(core.guidance("Guinea Pig"), /postpartum estrus/i);
  assert.equal(core.guidance("Rabbit"), "");
});
