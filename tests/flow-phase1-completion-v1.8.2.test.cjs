const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Flow = require("../flow-phase1-completion-v1.8.2.js");

test("completion layer keeps exact task/show targeting and profile return semantics", () => {
  assert.equal(Flow.VERSION, "1.8.2");
  assert.equal(Flow.taskTargetStatus({ completed: false }), "All open");
  assert.equal(Flow.taskTargetStatus({ completed: true }), "Completed");
  assert.equal(Flow.originForAction("weight", "a1").tab, "health");
  assert.equal(Flow.originForAction("breeding", "a1").tab, "breeding");
  assert.equal(Flow.originForAction("show-entry", "a1").tab, "shows");
  assert.equal(Flow.originForAction("pedigree", "a1").tab, "pedigree");
  assert.equal(Flow.originForAction("genetics", "a1"), null);
});

test("direct-transfer lifecycle disables duplicate pending/accepted sends and permits retry after decline/cancel", () => {
  assert.deepEqual(Flow.transferStatusMeta("pending"), { label: "Transfer pending", tone: "warning", canSend: false });
  assert.deepEqual(Flow.transferStatusMeta("accepted"), { label: "Transfer accepted", tone: "green", canSend: false });
  assert.equal(Flow.transferStatusMeta("declined").canSend, true);
  assert.equal(Flow.transferStatusMeta("cancelled").canSend, true);
});

test("completion layer retains record-level event identity", () => {
  const state = { tasks: [{ id: "t1", title: "Clean cages" }, { id: "t2", animalId: "dam1", sourceType: "breeding", title: "Pregnancy check" }] };
  assert.deepEqual(Flow.eventTarget("task:t1", state, {}), { kind: "task", id: "t1" });
  assert.deepEqual(Flow.eventTarget("task:t2", state, {}), { kind: "animal", animalId: "dam1", tab: "breeding", label: "Pregnancy check" });
  assert.deepEqual(Flow.eventTarget("show:s1:start", state, {}), { kind: "show", id: "s1" });
});

test("production shell loads and caches the Phase One completion layer", () => {
  const repo = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(repo, "flow-phase1-completion-v1.8.2.js"), "utf8");
  const build = fs.readFileSync(path.join(repo, "herdharbor-build.js"), "utf8");
  const sw = fs.readFileSync(path.join(repo, "service-worker.js"), "utf8");
  assert.match(source, /herdharbor_flow_return_origin_v1/);
  assert.match(source, /\[data-view-show=/);
  assert.match(source, /task-status-filter/);
  assert.match(source, /task-today-panel/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(build, /flow-phase1-completion-v1\.8\.2\.js\?v=1/);
  assert.match(sw, /flow-phase1-completion-v1\.8\.2\.js\?v=1/);
  assert.match(sw, /\/flow-phase1-completion-v1\.8\.2\.js/);
});
