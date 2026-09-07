const test = require("node:test");
const assert = require("node:assert/strict");
const Flow = require("../flow-phase1-v1.8.2.js");

test("Phase One Current Animals includes operational statuses and excludes historical records", () => {
  assert.equal(Flow.VERSION, "1.8.2");
  ["Active", "Breeding", "Growing", "Retired", "For Sale", "Reserved"].forEach((status) => {
    assert.equal(Flow.statusVisible(status, "current"), true, status);
  });
  ["Sold", "Deceased", "Archived", "Ancestor Only"].forEach((status) => {
    assert.equal(Flow.statusVisible(status, "current"), false, status);
  });
});

test("animal quick views isolate For Sale, Sold, and All", () => {
  assert.equal(Flow.statusVisible("For Sale", "for-sale"), true);
  assert.equal(Flow.statusVisible("Reserved", "for-sale"), false);
  assert.equal(Flow.statusVisible("Sold", "sold"), true);
  assert.equal(Flow.statusVisible("Archived", "all"), true);
});

test("Today health events deep-link back to the animal health tab", () => {
  const state = { health: [{ id: "h1", animalId: "a1", type: "Weight" }] };
  const health = {
    episodes: [{ id: "e1", animalId: "a2", concern: "Cough" }],
    careRecords: [{ id: "c1", animalId: "a3", type: "Vaccination", product: "Example" }]
  };
  assert.deepEqual(Flow.eventTarget("health:h1:followup", state, health), {
    kind: "animal", animalId: "a1", tab: "health", label: "Weight"
  });
  assert.deepEqual(Flow.eventTarget("episode:e1:recheck", state, health), {
    kind: "animal", animalId: "a2", tab: "health", label: "Cough"
  });
  assert.deepEqual(Flow.eventTarget("care:c1:booster", state, health), {
    kind: "animal", animalId: "a3", tab: "health", label: "Example"
  });
});

test("breeding workflow tasks deep-link to the animal breeding tab", () => {
  const state = {
    tasks: [{ id: "t1", animalId: "dam1", sourceType: "breeding", sourceRecordId: "b1", title: "Pregnancy check: Maple" }]
  };
  assert.deepEqual(Flow.eventTarget("task:t1", state, {}), {
    kind: "animal", animalId: "dam1", tab: "breeding", label: "Pregnancy check: Maple"
  });
});

test("ordinary tasks and shows retain record-level route targets", () => {
  const state = { tasks: [{ id: "t2", title: "Clean cages" }] };
  assert.deepEqual(Flow.eventTarget("task:t2", state, {}), {
    kind: "record", route: "tasks", id: "t2", label: "Clean cages"
  });
  assert.deepEqual(Flow.eventTarget("show:s1:start", state, {}), {
    kind: "record", route: "shows", id: "s1", label: "Show"
  });
});
