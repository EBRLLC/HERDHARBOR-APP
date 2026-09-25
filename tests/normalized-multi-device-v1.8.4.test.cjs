"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const StateStore = require("../herdharbor-state-store-v1.8.4.js");
const Normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const Baseline = require("../cloud-record-baseline-v1.8.4.js");
const Worker = require("../cloud-record-outbox-worker-v1.8.4.js");

const OWNER_KEY = "herdharbor_active_user_v1";
const STATE_KEY = "herdharbor_pre_alpha_v1";
const USER_ID = "shared-test-user";

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class MemoryStorage {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function key(namespace, recordId) { return `${namespace}\u0000${recordId}`; }

function logicalIdentity(row) {
  const payload = row?.payload;
  if (payload?.kind === "array_item") return Normalizer.logicalIdentityValue(payload.value);
  if (payload?.kind === "array_manifest") return "$order";
  if (payload?.kind === "root_value") return "$section";
  return "";
}

class SharedRecordCloud {
  constructor(initialState) {
    const mapped = Normalizer.mapLegacySnapshot(initialState);
    this.rows = new Map(mapped.records.map((record) => [key(record.namespace, record.record_id), {
      ...clone(record),
      record_version: 1,
      deleted_at: null
    }]));
    this.manifest = { cutover_stage: "shadow", sync_generation: 1, metadata: {} };
    this.calls = [];
    this.beforeApply = null;
    this.failAfterCommit = new Set();
  }

  async getManifest() { return clone(this.manifest); }

  async list(namespace, options = {}) {
    return [...this.rows.values()]
      .filter((row) => row.namespace === namespace && (options.includeDeleted || !row.deleted_at))
      .map(clone)
      .sort((a, b) => a.record_id.localeCompare(b.record_id));
  }

  async get(namespace, recordId, options = {}) {
    const row = this.rows.get(key(namespace, recordId));
    if (!row || (!options.includeDeleted && row.deleted_at)) return null;
    return clone(row);
  }

  async applyRecordMutation(input) {
    this.calls.push(clone(input));
    if (this.beforeApply) {
      const hook = this.beforeApply;
      this.beforeApply = null;
      await hook(input);
    }
    const recordKey = key(input.namespace, input.recordId);
    const current = this.rows.get(recordKey) || null;
    const conflict = () => { throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" }); };
    let next;

    if (input.deleted) {
      if (!current || current.record_version !== input.expectedVersion) return conflict();
      next = { ...current, deleted_at: "2026-09-25T12:00:00.000Z", record_version: current.record_version + 1 };
    } else if (input.expectedVersion == null) {
      if (current) return conflict();
      next = {
        namespace: input.namespace,
        record_id: input.recordId,
        payload: clone(input.payload),
        payload_checksum: input.payloadChecksum,
        record_version: 1,
        deleted_at: null
      };
    } else {
      if (!current || current.record_version !== input.expectedVersion) return conflict();
      next = {
        ...current,
        payload: clone(input.payload),
        payload_checksum: input.payloadChecksum,
        record_version: current.record_version + 1,
        deleted_at: null
      };
    }

    this.rows.set(recordKey, next);
    this.manifest.sync_generation += 1;

    if (this.failAfterCommit.has(input.recordId)) {
      this.failAfterCommit.delete(input.recordId);
      throw Object.assign(new Error("network response lost"), { code: "network_error" });
    }

    return {
      ok: true,
      record_id: input.recordId,
      record_version: next.record_version,
      deleted: Boolean(next.deleted_at),
      generation: this.manifest.sync_generation
    };
  }

  row(domain, logicalId) {
    for (const row of this.rows.values()) {
      if (row.payload?.key !== domain) continue;
      if (logicalIdentity(row) === logicalId) return row;
    }
    return null;
  }

  snapshot() {
    return Normalizer.reassembleLegacySnapshot(
      [...this.rows.values()],
      { verifyChecksum: false }
    );
  }
}

function initialState() {
  return {
    animals: [
      { id: "a1", name: "Judy", weight: 3.1 },
      { id: "a2", name: "Jack", weight: 3.5 }
    ],
    litters: [{ id: "l1", name: "Litter 1", status: "Growing" }],
    offspring: [{ id: "o1", name: "Kit 1", weight: 0.8 }],
    tasks: [{ id: "t1", title: "Check nest", done: false }],
    settings: { theme: "system" }
  };
}

async function makeDevice(name, cloud, state = initialState(), persisted = null) {
  const storage = persisted?.storage || new MemoryStorage({
    [OWNER_KEY]: USER_ID,
    [STATE_KEY]: JSON.stringify(state)
  });
  const baselineRows = persisted?.baselineRows || new Map();
  const baselineMetas = persisted?.baselineMetas || new Map();
  const stateStore = StateStore.create({
    storage,
    indexedDB: null,
    now: () => "2026-09-25T12:00:00.000Z"
  });
  const baselineStore = Baseline.createMemoryStore({
    ownerId: USER_ID,
    rows: baselineRows,
    metas: baselineMetas
  });
  let online = persisted?.online ?? true;
  const worker = Worker.create({
    stateStore,
    recordStore: cloud,
    normalizer: Normalizer,
    baselineStore,
    online: () => online,
    now: () => "2026-09-25T12:00:00.000Z",
    baseBackoffMs: 100,
    maxBackoffMs: 1000
  });
  await worker.primeBaseline();

  return {
    name,
    storage,
    baselineRows,
    baselineMetas,
    stateStore,
    baselineStore,
    worker,
    get state() { return clone(stateStore.getState()); },
    setOnline(value) { online = Boolean(value); },
    save(next) {
      const result = stateStore.commit(clone(next), { source: "local", reason: `${name}-edit` });
      assert.equal(result.ok, true);
      return result;
    },
    async push() { return worker.drain({ ownerId: USER_ID }); },
    async pull() {
      const rows = await cloud.list(Normalizer.namespace, { includeDeleted: true });
      const snapshot = Normalizer.reassembleLegacySnapshot(rows, { verifyChecksum: false });
      const result = stateStore.replaceRaw(JSON.stringify(snapshot), {
        source: "cloud",
        reason: `${name}-normalized-pull`,
        notify: true
      });
      assert.equal(result.ok, true);
      await baselineStore.replace(Normalizer.namespace, rows, {
        primed: true,
        generation: cloud.manifest.sync_generation,
        stage: cloud.manifest.cutover_stage,
        updatedAt: "2026-09-25T12:00:00.000Z"
      });
      return snapshot;
    },
    persisted() {
      return { storage, baselineRows, baselineMetas, online };
    }
  };
}

test("Scenario A: phone creates an animal, web receives it, and both converge", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const phone = await makeDevice("phone", cloud);
  const web = await makeDevice("web", cloud);

  const next = phone.state;
  next.animals.push({ id: "a3", name: "Annie", weight: 2.9 });
  phone.save(next);
  const pushed = await phone.push();
  assert.equal(pushed.ok, true);

  await web.pull();
  await phone.pull();
  assert.deepEqual(phone.state, web.state);
  assert.equal(web.state.animals.some((animal) => animal.id === "a3"), true);
});

test("Scenario B: unrelated animal and litter edits survive near-simultaneous saves without global conflict", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const phone = await makeDevice("phone", cloud);
  const web = await makeDevice("web", cloud);

  const phoneState = phone.state;
  phoneState.animals[0].weight = 3.4;
  phone.save(phoneState);

  const webState = web.state;
  webState.litters[0].status = "Weaning";
  web.save(webState);

  const [phoneResult, webResult] = await Promise.all([phone.push(), web.push()]);
  assert.equal(phoneResult.conflicts, 0);
  assert.equal(webResult.conflicts, 0);

  await phone.pull();
  await web.pull();
  assert.equal(phone.state.animals[0].weight, 3.4);
  assert.equal(phone.state.litters[0].status, "Weaning");
  assert.deepEqual(phone.state, web.state);
});

test("Scenario C: different fields of the same animal reconcile safely", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const phone = await makeDevice("phone", cloud);
  const web = await makeDevice("web", cloud);

  const phoneState = phone.state;
  phoneState.animals[0].name = "Judy Phone";
  phone.save(phoneState);

  const webState = web.state;
  webState.animals[0].weight = 3.9;
  web.save(webState);

  assert.equal((await phone.push()).ok, true);
  const webResult = await web.push();
  assert.equal(webResult.ok, true);
  assert.equal(webResult.conflicts, 0);

  await phone.pull();
  await web.pull();
  assert.equal(phone.state.animals[0].name, "Judy Phone");
  assert.equal(phone.state.animals[0].weight, 3.9);
  assert.deepEqual(phone.state, web.state);
});

test("Scenario D: same-field conflict is scoped while unrelated task still syncs", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const phone = await makeDevice("phone", cloud);
  const web = await makeDevice("web", cloud);

  const phoneState = phone.state;
  phoneState.animals[0].name = "Phone Judy";
  phone.save(phoneState);

  const webState = web.state;
  webState.animals[0].name = "Web Judy";
  webState.tasks[0].done = true;
  web.save(webState);

  await phone.push();
  const result = await web.push();

  assert.equal(result.conflicts, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(cloud.row("tasks", "t1").payload.value.done, true);
  const pending = web.stateStore.getOutbox(USER_ID);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].domain, "animals");
  assert.equal(pending[0].recordId, "a1");
  assert.ok(pending[0].lastConflictFields.includes("$.value.name"));
});

test("Scenario E: offline edit survives complete device recreation and syncs after reconnect", async () => {
  const cloud = new SharedRecordCloud(initialState());
  let phone = await makeDevice("phone", cloud);
  phone.setOnline(false);

  const next = phone.state;
  next.animals[1].weight = 4.1;
  phone.save(next);
  const offline = await phone.push();
  assert.equal(offline.reason, "offline");
  assert.equal(phone.stateStore.getOutbox(USER_ID).length, 1);

  const persisted = phone.persisted();
  persisted.online = true;
  phone = await makeDevice("phone-reopened", cloud, initialState(), persisted);

  assert.equal(phone.state.animals[1].weight, 4.1);
  assert.equal(phone.stateStore.getOutbox(USER_ID).length, 1);
  const synced = await phone.push();
  assert.equal(synced.ok, true);
  assert.equal(phone.stateStore.getOutbox(USER_ID).length, 0);
  assert.equal(cloud.row("animals", "a2").payload.value.weight, 4.1);
});

test("Scenarios F/G: tombstone prevents stale resurrection while unrelated offspring edit survives", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const deviceA = await makeDevice("device-a", cloud);
  const deviceB = await makeDevice("device-b", cloud);

  const deleting = deviceA.state;
  deleting.litters = [];
  deviceA.save(deleting);
  assert.equal((await deviceA.push()).ok, true);
  assert.ok(cloud.row("litters", "l1").deleted_at);

  const stale = deviceB.state;
  stale.litters[0].status = "Stale edit";
  stale.offspring[0].weight = 1.1;
  deviceB.save(stale);
  const result = await deviceB.push();

  assert.equal(result.conflicts, 1);
  assert.equal(result.succeeded, 1);
  assert.ok(cloud.row("litters", "l1").deleted_at);
  assert.equal(cloud.row("offspring", "o1").payload.value.weight, 1.1);
});

test("Scenario H: delayed response never acknowledges a newer local edit", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const phone = await makeDevice("phone", cloud);

  const first = phone.state;
  first.animals[0].weight = 3.3;
  phone.save(first);

  cloud.beforeApply = async (input) => {
    if (input.payload?.kind !== "array_item" || input.payload.value.id !== "a1") return;
    const later = phone.state;
    later.animals[0].weight = 3.8;
    phone.save(later);
  };

  const firstResult = await phone.push();
  assert.equal(firstResult.ok, true);
  assert.equal(phone.stateStore.getOutbox(USER_ID).length, 1);
  assert.equal(phone.state.animals[0].weight, 3.8);
  assert.equal(cloud.row("animals", "a1").payload.value.weight, 3.3);

  const second = await phone.push();
  assert.equal(second.ok, true);
  assert.equal(phone.stateStore.getOutbox(USER_ID).length, 0);
  assert.equal(cloud.row("animals", "a1").payload.value.weight, 3.8);
});

test("Scenario I: lost commit response reconciles only that record and retries idempotently", async () => {
  const cloud = new SharedRecordCloud(initialState());
  let web = await makeDevice("web", cloud);

  const next = web.state;
  next.tasks[0].title = "Check nest twice";
  web.save(next);
  const taskId = cloud.row("tasks", "t1").record_id;
  cloud.failAfterCommit.add(taskId);

  const first = await web.push();
  assert.equal(first.failed, 1);
  assert.equal(cloud.row("tasks", "t1").record_version, 2);
  assert.equal(web.stateStore.getOutbox(USER_ID).length, 1);

  const persisted = web.persisted();
  web = await makeDevice("web-reopened", cloud, initialState(), persisted);
  const second = await web.push();
  assert.equal(second.ok, true);
  assert.equal(web.stateStore.getOutbox(USER_ID).length, 0);
  assert.equal(cloud.row("tasks", "t1").record_version, 2);
});

test("Scenario J: immediate close after save retains canonical state and durable outbox", async () => {
  const cloud = new SharedRecordCloud(initialState());
  let phone = await makeDevice("phone", cloud);
  const next = phone.state;
  next.offspring[0].weight = 1.2;
  phone.save(next);

  const persisted = phone.persisted();
  phone = await makeDevice("phone-reopened", cloud, initialState(), persisted);
  assert.equal(phone.state.offspring[0].weight, 1.2);
  assert.equal(phone.stateStore.getOutbox(USER_ID).length, 1);
});

test("two independently created animals keep both array members after reconciliation", async () => {
  const cloud = new SharedRecordCloud(initialState());
  const phone = await makeDevice("phone", cloud);
  const web = await makeDevice("web", cloud);

  const p = phone.state;
  p.animals.push({ id: "p-new", name: "Phone New", weight: 2.7 });
  phone.save(p);
  const w = web.state;
  w.animals.push({ id: "w-new", name: "Web New", weight: 2.8 });
  web.save(w);

  await phone.push();
  const webResult = await web.push();
  assert.equal(webResult.ok, true);

  const snapshot = cloud.snapshot();
  assert.equal(snapshot.animals.some((animal) => animal.id === "p-new"), true);
  assert.equal(snapshot.animals.some((animal) => animal.id === "w-new"), true);
});
