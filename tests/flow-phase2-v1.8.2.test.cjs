const test = require("node:test");
const assert = require("node:assert/strict");
const Phase2 = require("../flow-phase2-v1.8.2.js");

test("Phase Two exposes a stable animal profile route contract", () => {
  assert.equal(Phase2.VERSION, "1.8.2");
  assert.deepEqual(Phase2.parseProfileHash("#animal/judy-1/health"), {
    animalId: "judy-1",
    tab: "health"
  });
  assert.equal(Phase2.profileHash("animal with spaces", "breeding"), "#animal/animal%20with%20spaces/breeding");
});

test("invalid or unsupported profile tabs fall back to overview", () => {
  assert.equal(Phase2.normalizeTab("not-a-tab"), "overview");
  assert.deepEqual(Phase2.parseProfileHash("#animal/a1/not-a-tab"), {
    animalId: "a1",
    tab: "overview"
  });
  assert.equal(Phase2.parseProfileHash("#animals"), null);
});

test("Phase Two lifecycle summary reuses existing breeding, sale, and transfer state", () => {
  const state = {
    breedings: [
      { id: "b1", femaleId: "a1", maleId: "a2", breedingDate: "2026-08-01", dueDate: "2026-09-01", status: "Bred" },
      { id: "b2", femaleId: "a1", maleId: "a3", breedingDate: "2026-09-05", dueDate: "2026-10-05", status: "Pregnancy check" }
    ],
    sales: [
      { id: "s1", saleNumber: "HH-100", saleDate: "2026-09-06", status: "Completed", items: [{ animalId: "a1" }] }
    ],
    transfers: [
      { id: "t1", animalIds: ["a1"], transferId: "TR-100", status: "pending", createdAt: "2026-09-07T12:00:00Z" }
    ]
  };
  const model = { animal: { id: "a1", status: "Sold" }, current: false, quarantined: false };
  const summary = Phase2.lifecycleSummary(state, model);

  assert.equal(summary.status, "Sold");
  assert.equal(summary.current, false);
  assert.equal(summary.latestBreeding.status, "Pregnancy check");
  assert.equal(summary.latestBreeding.mateId, "a3");
  assert.equal(summary.latestSale.number, "HH-100");
  assert.equal(summary.latestTransfer.transferId, "TR-100");
});

test("quarantine state is surfaced without inventing a second health record", () => {
  const summary = Phase2.lifecycleSummary({}, {
    animal: { id: "a1", status: "Active" },
    current: true,
    quarantined: true
  });
  assert.equal(summary.quarantined, true);
  assert.equal(summary.latestBreeding, null);
  assert.equal(summary.latestSale, null);
  assert.equal(summary.latestTransfer, null);
});
