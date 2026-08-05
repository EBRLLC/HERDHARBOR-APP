const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("  function normalizeBreedingStatus");
const end = html.indexOf("  function renderBreedings()", start);
assert.ok(start >= 0 && end > start, "breeding workflow helpers are present");

const rules = {
  Rabbit: { gestationDays: 31, checkDays: 14, prepareDaysBefore: 3, weanDays: 42, birthLabel: "kindling", prepareLabel: "Place nest box" },
  Cattle: { gestationDays: 283, checkDays: 30, prepareDaysBefore: 14, weanDays: 205, birthLabel: "calving", prepareLabel: "Prepare calving area" }
};
const statuses = ["Planned", "Bred", "Pregnancy check due", "Confirmed pregnant", "Not pregnant", "Due soon", "Delivered", "Cancelled"];
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
};

function buildHelpers(state) {
  const animalName = (id) => state.animals.find((animal) => animal.id === id)?.name || "Unknown animal";
  const source = html.slice(start, end);
  return new Function(
    "state", "BREEDING_STATUS_OPTIONS", "GESTATION_RULES", "addDays", "animalName", "formatDate",
    `${source}\nreturn { normalizeBreedingStatus, breedingSchedule, workflowTaskId, offspringAnimalId, birthRecordIdForBreeding, birthLiveRemaining, syncBreedingReminders, syncBirthReminder, completeWorkflowTasks, breedingReportSnapshot };`
  )(
    state,
    statuses,
    rules,
    addDays,
    animalName,
    (value) => value || "—"
  );
}

{
  const state = {
    animals: [
      { id: "doe", name: "Willow", species: "Rabbit", sex: "Female" },
      { id: "buck", name: "Atlas", species: "Rabbit", sex: "Male" },
      { id: "cow", name: "Bessie", species: "Cattle", sex: "Female" }
    ],
    tasks: []
  };
  const helpers = buildHelpers(state);
  assert.equal(helpers.normalizeBreedingStatus("Confirmed"), "Confirmed pregnant");
  assert.equal(helpers.normalizeBreedingStatus("Completed"), "Delivered");
  assert.equal(helpers.offspringAnimalId("birth-1", 2), "animal_offspring_birth-1_002");
  assert.equal(helpers.offspringAnimalId("birth-1", 2), helpers.offspringAnimalId("birth-1", 2), "two devices derive the same offspring ID");
  assert.equal(helpers.birthRecordIdForBreeding("breeding-1"), "litter_breeding_breeding-1");
  assert.equal(helpers.birthRecordIdForBreeding("breeding-1"), helpers.birthRecordIdForBreeding("breeding-1"), "two devices derive the same linked-birth ID");
  assert.equal(helpers.birthLiveRemaining({ bornAlive: "6", fosteredIn: "1", fosteredOut: "1", lostBeforeWeaning: "2" }), 4);
  assert.deepEqual(helpers.breedingSchedule("doe", "2026-08-05"), {
    species: "Rabbit",
    rule: rules.Rabbit,
    pregnancyCheckDate: "2026-08-19",
    preparationDate: "2026-09-02",
    dueDate: "2026-09-05"
  });
  assert.equal(helpers.breedingSchedule("cow", "2026-08-05").dueDate, "2027-05-15");

  const breeding = {
    id: "breeding-1",
    femaleId: "doe",
    maleId: "buck",
    breedingDate: "2026-08-05",
    pregnancyCheckDate: "2026-08-19",
    nestBoxDate: "2026-09-02",
    dueDate: "2026-09-05",
    pregnancyCheckStatus: "Not checked",
    status: "Bred"
  };
  assert.equal(helpers.syncBreedingReminders(breeding, { now: "2026-08-05T12:00:00.000Z" }), true);
  assert.equal(state.tasks.length, 3, "pregnancy check, preparation, and expected-birth reminders are created");
  assert.equal(new Set(state.tasks.map((task) => task.id)).size, 3, "automatic reminder IDs are deterministic and unique");
  assert.equal(helpers.syncBreedingReminders(breeding, { now: "2026-08-05T12:01:00.000Z" }), false, "saving again does not duplicate reminders");

  breeding.pregnancyCheckStatus = "Positive";
  breeding.status = "Confirmed pregnant";
  helpers.syncBreedingReminders(breeding, { now: "2026-08-19T12:00:00.000Z" });
  assert.equal(state.tasks.find((task) => task.reminderType === "pregnancy-check").completed, true);
  assert.equal(state.tasks.find((task) => task.reminderType === "expected-birth").completed, false);

  breeding.status = "Delivered";
  helpers.syncBreedingReminders(breeding, { now: "2026-09-05T12:00:00.000Z" });
  assert.equal(state.tasks.every((task) => task.completed), true, "delivery closes all breeding reminders");

  const litter = {
    id: "birth-1",
    damId: "doe",
    sireId: "buck",
    expectedWeanDate: "2026-10-17",
    bornAlive: "6",
    fosteredIn: "1",
    fosteredOut: "1",
    lostBeforeWeaning: "1",
    weaned: "0"
  };
  assert.equal(helpers.syncBirthReminder(litter, { now: "2026-09-05T12:00:00.000Z" }), true);
  assert.equal(state.tasks.filter((task) => task.sourceType === "birth").length, 1);
  litter.weaned = "5";
  helpers.syncBirthReminder(litter, { now: "2026-10-17T12:00:00.000Z" });
  assert.equal(state.tasks.find((task) => task.sourceType === "birth").completed, true);

  const noSurvivors = {
    id: "birth-2", damId: "doe", sireId: "buck", expectedWeanDate: "2026-10-17",
    bornAlive: "0", fosteredIn: "0", fosteredOut: "0", lostBeforeWeaning: "0", weaned: "0"
  };
  assert.equal(helpers.syncBirthReminder(noSurvivors, { now: "2026-09-05T12:00:00.000Z" }), false);
  assert.equal(state.tasks.some((task) => task.sourceRecordId === "birth-2"), false, "a birth with no live young does not create a weaning task");
}

{
  const state = {
    animals: [
      { id: "doe", name: "Willow", species: "Rabbit" },
      { id: "buck", name: "Atlas", species: "Rabbit" }
    ],
    tasks: []
  };
  const report = buildHelpers(state).breedingReportSnapshot(
    [
      { id: "one", femaleId: "doe", status: "Delivered", pregnancyCheckStatus: "Positive" },
      { id: "two", femaleId: "doe", status: "Not pregnant", pregnancyCheckStatus: "Negative" }
    ],
    [{ damId: "doe", bornAlive: "6", stillborn: "1", lostBeforeWeaning: "1", weaned: "5" }],
    state.animals
  );
  assert.equal(report.attempts, 2);
  assert.equal(report.conceptionRate, 0.5);
  assert.equal(report.deliveryRate, 0.5);
  assert.equal(report.survivalRate, 5 / 6);
  assert.deepEqual(report.performance.map((row) => [row.name, row.attempts, row.births, row.weaned]), [["Willow", 2, 1, 5]]);
}

assert.match(html, /data-record-birth=/);
assert.match(html, /function openOffspringCreator\(/);
assert.match(html, /sourceBirthId: litter\.id/);
assert.match(html, /sireId: litter\.sireId/);
assert.match(html, /damId: litter\.damId/);
assert.match(html, /offspringIds/);
assert.match(html, /animal\.sourceBirthId = ""/);
assert.match(html, /id="breeding-year-filter"/);
assert.match(html, /id="download-breeding-report"/);

console.log("breeding, birth, reminder, offspring, and performance tests passed");
