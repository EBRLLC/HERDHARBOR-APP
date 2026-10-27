"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../canine-reproductive-core-v2.0.1.js");
const Lineage = require("../canine-lineage-v2.0.1.js");
const Identity = require("../canine-identity-v2.0.1.js");
const Whelp = require("../canine-whelping-workspace-v2.0.1.js");
const LitterWorkspace = require("../breeding-litter-workspace-v1.8.2.js");

global.HerdHarborCanineReproductiveCore = Core;
global.HerdHarborCanineLineage = Lineage;
global.HerdHarborCanineIdentity = Identity;
global.HerdHarborCloud = { getSession: () => ({ user: { id: "acct-a" } }) };

function baseState({ multipleSires = false, external = false } = {}) {
  const animals = [
    { id: "dam", name: "Mabel", species: "Dog", sex: "Female", breed: "Labrador Retriever", userId: "acct-a" },
    { id: "sire", name: "Rex", species: "Dog", sex: "Male", breed: "Poodle", userId: "acct-a" },
    { id: "rabbit", name: "Bun", species: "Rabbit", sex: "Female", userId: "acct-a" }
  ];
  const externalStuds = external ? [{ id: "stud-ext", accountId: "acct-a", ownerScope: "external_reference", displayName: "Scout", registeredName: "North Scout", breed: "Poodle", registry: "UKC", registrationNumber: "UKC-42", titles: ["CH"] }] : [];
  const ref = external ? { type: "external_stud", id: "stud-ext" } : { type: "owned_dog", id: "sire" };
  const events = [{ id: "m1", date: "2026-05-01", sireRef: ref, method: "natural_service" }];
  if (multipleSires) events.push({ id: "m2", date: "2026-05-03", sireRef: { type: "owned_dog", id: "sire-2" }, method: "natural_service" });
  if (multipleSires) animals.push({ id: "sire-2", name: "Other sire", species: "Dog", sex: "Male", userId: "acct-a" });
  return {
    animals,
    canineExternalStuds: externalStuds,
    canineBreedingPlans: [{ id: "plan-1", damId: "dam", sireRef: ref, cycleId: "cycle-1", status: "in_progress", events, pregnancy: { status: "confirmed_pregnant", estimate: null } }],
    canineReproductiveCycles: [{ id: "cycle-1", femaleId: "dam", observedHeatStartDate: "2026-04-20", observedStage: "unknown", status: "closed", breedingAttemptIds: ["plan-1"] }],
    canineWhelpings: [], litters: [], tasks: [{ id: "task_canine_plan-1_whelping-window", sourceType: "canine_breeding_plan", sourceRecordId: "plan-1", completed: false }], health: []
  };
}

function record(state = baseState(), values = {}) {
  return Whelp.recordWhelping(state, "plan-1", {
    birthDate: "2026-07-05", time: "03:25", method: "assisted", bornAlive: 3, stillborn: 1, neonatalLosses: 1,
    litterName: "Summer litter", expectedWeanDate: "2026-09-01", followUpTitle: "Call the clinic", followUpDate: "2026-07-06", notes: "Recorded by breeder", ...values
  }, { ownerId: "acct-a", now: "2026-07-05T10:00:00.000Z" });
}

test("whelping validates species, account, counts, methods, dates, and requires a completed mating", () => {
  const state = baseState();
  assert.equal(record(state).valid, true);
  assert.equal(Whelp.validateWhelping(state, state.canineBreedingPlans[0], { birthDate: "2026-07-05", method: "cesarean", bornAlive: 2, stillborn: 1, neonatalLosses: 3 }, { ownerId: "acct-a" }).valid, false);
  assert.equal(Whelp.validateWhelping(state, state.canineBreedingPlans[0], { birthDate: "2026-02-30", method: "unknown", bornAlive: 0, stillborn: 0, neonatalLosses: 0 }, { ownerId: "acct-a" }).valid, false);
  const noEvents = structuredClone(state); noEvents.canineBreedingPlans[0].events = [];
  assert.equal(record(noEvents).valid, false);
  const wrongDam = structuredClone(state); wrongDam.animals[0].species = "Rabbit";
  assert.equal(record(wrongDam).valid, false);
  const wrongAccount = structuredClone(state); wrongAccount.animals[0].userId = "acct-b";
  assert.equal(record(wrongAccount).valid, false);
});

test("whelping creates a linked canonical litter, preserves plan/cycle links, and uses only owner-entered reminders", () => {
  const state = baseState();
  const result = record(state);
  assert.equal(result.valid, true);
  assert.equal(state.litters.length, 0, "transaction preparation does not mutate the live state");
  const next = result.state;
  assert.equal(next.litters.length, 1);
  assert.equal(next.litters[0].species, "Dog");
  assert.equal(next.litters[0].canineWhelpingId, result.whelping.id);
  assert.equal(next.litters[0].birthDate, "2026-07-05");
  assert.equal(next.litters[0].stillborn, "1");
  assert.equal(next.litters[0].lostBeforeWeaning, "1");
  assert.equal(next.litters[0].sireId, "sire");
  assert.equal(next.canineBreedingPlans[0].status, "whelped");
  assert.equal(next.canineBreedingPlans[0].pregnancy.status, "whelped");
  assert.equal(next.canineReproductiveCycles[0].breedingAttemptIds[0], "plan-1");
  assert.equal(next.tasks.find(row => row.sourceRecordId === "plan-1").completed, true);
  assert.equal(next.tasks.filter(row => row.sourceType === "canine_whelping").length, 2);
  assert.equal(next.tasks.some(row => /deworm|vaccin|treatment schedule/i.test(row.title)), false);
});

test("multiple sire events leave litter paternity unresolved and puppy generation never fabricates sireId", () => {
  const state = baseState({ multipleSires: true });
  const whelp = record(state);
  assert.equal(whelp.valid, true);
  assert.deepEqual(whelp.whelping.sireRef, { type: "unknown" });
  const generated = Whelp.generatePuppies(whelp.state, whelp.whelping.id, { ownerId: "acct-a", now: "2026-07-05T11:00:00.000Z" });
  assert.equal(generated.valid, true);
  assert.equal(generated.created.length, 3);
  for (const puppyId of generated.created) {
    const puppy = generated.state.animals.find(row => row.id === puppyId);
    assert.equal(puppy.sireId, "");
    assert.equal(puppy.damId, "dam");
    assert.equal(puppy.canineParentage.status, "pending_or_multiple_potential_sires");
    assert.equal(Lineage.validate(generated.state.animals, puppy, { ownerId: "acct-a" }).valid, true);
  }
});

test("stable puppy IDs and operation identity make repeat submissions idempotent and reconcile persisted partial records", () => {
  const whelp = record();
  const first = Whelp.generatePuppies(whelp.state, whelp.whelping.id, { ownerId: "acct-a", now: "2026-07-05T11:00:00.000Z" });
  const retry = Whelp.generatePuppies(first.state, whelp.whelping.id, { ownerId: "acct-a", now: "2026-07-05T11:01:00.000Z" });
  assert.equal(first.created.length, 3);
  assert.equal(retry.created.length, 0);
  assert.equal(retry.reconciled.length, 3);
  assert.equal(retry.operationId, `generate_${whelp.whelping.id}`);
  assert.equal(retry.state.animals.filter(row => row.sourceBirthId === whelp.whelping.id).length, 3);
  const partial = structuredClone(first.state);
  partial.animals = partial.animals.filter(row => row.id !== Whelp.puppyIdForOrder(whelp.whelping.id, 3));
  partial.litters[0].offspringIds = partial.litters[0].offspringIds.filter(id => id !== Whelp.puppyIdForOrder(whelp.whelping.id, 3));
  const reconciled = Whelp.generatePuppies(partial, whelp.whelping.id, { ownerId: "acct-a" });
  assert.equal(reconciled.created.length, 1);
  assert.equal(reconciled.state.animals.filter(row => row.sourceBirthId === whelp.whelping.id).length, 3);
});

test("correcting born-alive totals preserves existing puppies and blocks changing their birth date", () => {
  const whelp = record();
  const first = Whelp.generatePuppies(whelp.state, whelp.whelping.id, { ownerId: "acct-a" });
  const edited = record(first.state, { bornAlive: 1 });
  assert.equal(edited.valid, true);
  const next = Whelp.generatePuppies(edited.state, edited.whelping.id, { ownerId: "acct-a" });
  assert.equal(next.valid, true);
  assert.equal(next.created.length, 0);
  assert.equal(next.actualCount, 3);
  assert.equal(next.state.animals.filter(row => row.sourceBirthId === edited.whelping.id).length, 3);
  const wrongDate = record(edited.state, { birthDate: "2026-07-06" });
  assert.equal(wrongDate.valid, false);
});

test("external sire generation creates a clearly reference-only canonical ancestor and preserves entered registration data", () => {
  const whelp = record(baseState({ external: true }));
  const generated = Whelp.generatePuppies(whelp.state, whelp.whelping.id, { ownerId: "acct-a" });
  assert.equal(generated.valid, true);
  const referenceSire = generated.state.animals.find(row => row.id === generated.state.animals.find(p => p.sourceBirthId === whelp.whelping.id).sireId);
  assert.equal(referenceSire.ownershipScope, "external_reference");
  assert.equal(referenceSire.status, "Ancestor Only");
  assert.equal(referenceSire.canine.registrations[0].registry, "UKC");
  assert.equal(referenceSire.canine.registrations[0].number, "UKC-42");
  assert.equal(referenceSire.canine.titles[0].abbreviation, "CH");
  assert.equal(referenceSire.userId, "acct-a");
  assert.equal(Lineage.validate(generated.state.animals, generated.state.animals.find(p => p.sourceBirthId === whelp.whelping.id), { ownerId: "acct-a" }).valid, true);
});

test("individual parentage can be confirmed later with evidence and still passes canine lineage checks", () => {
  const whelp = record(baseState({ multipleSires: true }));
  const generated = Whelp.generatePuppies(whelp.state, whelp.whelping.id, { ownerId: "acct-a" });
  const puppyId = generated.created[0];
  const missingEvidence = Whelp.updatePuppyParentage(generated.state, puppyId, { type: "owned_dog", id: "sire" }, "", { ownerId: "acct-a" });
  assert.equal(missingEvidence.valid, false);
  const assigned = Whelp.updatePuppyParentage(generated.state, puppyId, { type: "owned_dog", id: "sire" }, "DNA result recorded by breeder", { ownerId: "acct-a" });
  assert.equal(assigned.valid, true);
  assert.equal(assigned.animal.sireId, "sire");
  assert.equal(assigned.animal.canineParentage.status, "breeder_confirmed");
  assert.equal(Lineage.validate(assigned.state.animals, assigned.animal, { ownerId: "acct-a" }).valid, true);
  assert.equal(Whelp.updatePuppyParentage(assigned.state, puppyId, { type: "owned_dog", id: "rabbit" }, "Bad reference", { ownerId: "acct-a" }).valid, false);
  assert.equal(Whelp.updatePuppyParentage(assigned.state, puppyId, { type: "foreign_record", id: "acct-b-sire" }, "Forged reference", { ownerId: "acct-a" }).valid, false);
});

test("clearing an owner-entered weaning date closes its stable reminder without changing unrelated tasks", () => {
  const first = record();
  const edited = record(first.state, { expectedWeanDate: "", followUpDate: "", followUpTitle: "" });
  assert.equal(edited.valid, true);
  assert.equal(edited.litter.expectedWeanDate, "");
  const weanTask = edited.state.tasks.find(row => row.id === `task_canine_whelping_${first.whelping.id}_weaning`);
  assert.equal(weanTask.completed, true);
  assert.equal(edited.state.tasks.find(row => row.id === "task_canine_plan-1_whelping-window").completed, true);
});

test("shared Births/Litters guards prevent canine identity edits and generic deletion from orphaning puppies", () => {
  const runtime = fs.readFileSync(path.join(__dirname, "../breeding-litter-runtime-v1.8.3.js"), "utf8");
  assert.match(runtime, /if \(litter\.canineWhelping\) return toast\("Canine whelping records cannot be deleted from the generic litter form/);
  assert.match(runtime, /Canine whelping identity and date are linked to the reproductive plan/);
  assert.match(runtime, /HerdHarborCanineWhelpingWorkspace\?\.openForAnimal\?\.\(litter\.damId\)/);
  assert.match(runtime, /litter\.canineWhelping \? "Manage puppies"/);
});

test("failed whelping commit retains existing canonical state and reports an error, not success", () => {
  class Element {
    constructor() { this.dataset = {}; this.listeners = {}; this.forms = []; this.buttons = []; this.removed = false; }
    setAttribute() {}
    addEventListener(type, fn) { this.listeners[type] = fn; }
    appendChild(node) { this.owner.overlay = node; }
    remove() { this.removed = true; }
    querySelectorAll(selector) { return selector === "form" ? this.forms : selector === "[data-close]" || selector === "[data-generate]" || selector === "[data-manage-litter]" || selector === 'select[name="planId"]' ? this.buttons : []; }
  }
  class FormDataMock {
    constructor(form) { this.form = form; }
    [Symbol.iterator]() { return Object.entries(this.form.values)[Symbol.iterator](); }
  }
  let form;
  const document = { body: new Element(), overlay: null, createElement: () => { const node = new Element(); node.forms = form ? [form] : []; return node; }, getElementById: id => id === "hh-canine-whelping-workspace" && !document.overlay?.removed ? document.overlay : null };
  document.body.owner = document;
  const state = baseState();
  const messages = [];
  global.document = document;
  global.FormData = FormDataMock;
  global.HerdHarborApp = { getState: () => state, commitState: () => false, toast: (message, type) => messages.push({ message, type }) };
  global.HerdHarborCloud = { getSession: () => ({ user: { id: "acct-a" } }) };
  const before = JSON.stringify(state);
  form = new Element();
  form.dataset = { form: "whelping", planId: "plan-1" };
  form.values = { birthDate: "2026-07-05", time: "", method: "assisted", bornAlive: "3", stillborn: "1", neonatalLosses: "1", litterName: "", expectedWeanDate: "", followUpDate: "", followUpTitle: "" };
  document.body.forms = [form];
  Whelp.openForAnimal("dam");
  form.listeners.submit({ preventDefault() {} });
  assert.equal(JSON.stringify(state), before);
  assert.equal(messages.some(row => row.type === "success"), false);
  assert.equal(messages.at(-1).type, "error");
  assert.match(messages.at(-1).message, /local save failed/);
});

test("the existing litter workspace keeps canine markings separate while rabbit identity behavior stays unchanged", () => {
  const state = baseState();
  state.litters = [{ id: "dog-litter", species: "Dog", damId: "dam", bornAlive: "1", offspringIds: ["pup"] }];
  state.animals.push({ id: "pup", species: "Dog", name: "Puppy 1", sex: "Unknown", sourceBirthId: "dog-litter", canine: { coatMarkings: "White chest" } });
  const dog = LitterWorkspace.applyIdentityUpdates(state, "dog-litter", [{ animalId: "pup", breed: "Golden Retriever", color: "Gold", coatMarkings: "White chest and toes" }]);
  const updatedDog = dog.state.animals.find(row => row.id === "pup");
  assert.equal(updatedDog.breed, "Golden Retriever");
  assert.equal(updatedDog.color, "Gold");
  assert.equal(updatedDog.canine.coatMarkings, "White chest and toes");
  state.litters.push({ id: "rabbit-litter", species: "Rabbit", damId: "rabbit", bornAlive: "1", offspringIds: ["kit"] });
  state.animals.push({ id: "kit", species: "Rabbit", name: "Kit", breed: "Holland Lop", color: "Chestnut" });
  const rabbit = LitterWorkspace.applyIdentityUpdates(state, "rabbit-litter", [{ animalId: "kit", breed: "Different breed", color: "Black", coatMarkings: "Must not be written" }]);
  assert.equal(rabbit.state.animals.find(row => row.id === "kit").breed, "Holland Lop");
  assert.equal(rabbit.state.animals.find(row => row.id === "kit").color, "Black");
  assert.equal(rabbit.state.animals.find(row => row.id === "kit").canine, undefined);
});

test("the shared Manage Litter workspace records dog weights and health without hard-coded care schedules", () => {
  const whelp = record();
  const generated = Whelp.generatePuppies(whelp.state, whelp.whelping.id, { ownerId: "acct-a" });
  const pupIds = generated.created;
  const weights = LitterWorkspace.addBulkWeights(generated.state, whelp.litter.id, pupIds.map((animalId,index)=>({animalId,weight:String(10+index)})), {date:"2026-07-06",weightUnit:"oz"});
  assert.equal(weights.created.length, 3);
  assert.ok(weights.created.every(row => row.type === "Weight" && row.weightUnit === "oz"));
  const health = LitterWorkspace.addBulkHealth(weights.state, whelp.litter.id, pupIds, {date:"2026-07-07",type:"Veterinary visit",details:"Exam entered by breeder",followUpDate:""});
  assert.equal(health.created.length, 3);
  assert.ok(health.created.every(row=>row.type==="Veterinary visit"&&row.followUpDate===""));
  assert.equal(health.state.tasks.some(row=>/deworm|vaccin|treatment schedule/i.test(row.title)), false);
});
