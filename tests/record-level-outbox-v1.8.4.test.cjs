"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const StateStore = require("../herdharbor-state-store-v1.8.4.js");
const Normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const Baseline = require("../cloud-record-baseline-v1.8.4.js");
const Worker = require("../cloud-record-outbox-worker-v1.8.4.js");

const OWNER_KEY = "herdharbor_active_user_v1";
const STATE_KEY = "herdharbor_pre_alpha_v1";
const USER_ID = "11111111-1111-1111-1111-111111111111";

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloudKey(namespace, recordId) {
  return `${namespace}\u0000${recordId}`;
}

function normalizedRows(state, version = 1) {
  return Normalizer.mapLegacySnapshot(state).records.map((record) => ({
    ...clone(record),
    record_version: version,
    deleted_at: null
  }));
}

function conflictError() {
  return Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
}

class FakeRecordStore {
  constructor(state, clock) {
    this.clock = clock;
    this.rows = new Map(normalizedRows(state).map((row) => [cloudKey(row.namespace, row.record_id), row]));
    this.manifest = {
      schema_version: Normalizer.formatVersion,
      cutover_stage: "shadow",
      sync_generation: 0,
      metadata: {}
    };
    this.calls = [];
    this.beforeApply = null;
    this.failAfterCommit = new Set();
    this.failBeforeCommit = new Map();
  }

  async list(namespace, options = {}) {
    return [...this.rows.values()]
      .filter((row) => row.namespace === namespace && (options.includeDeleted || !row.deleted_at))
      .map(clone)
      .sort((a, b) => a.record_id.localeCompare(b.record_id));
  }

  async get(namespace, recordId, options = {}) {
    const row = this.rows.get(cloudKey(namespace, recordId));
    if (!row || (!options.includeDeleted && row.deleted_at)) return null;
    return clone(row);
  }

  async getManifest() {
    return clone(this.manifest);
  }

  async applyRecordMutation(input) {
    this.calls.push(clone(input));
    if (typeof this.beforeApply === "function") {
      const hook = this.beforeApply;
      this.beforeApply = null;
      await hook(input);
    }
    const failBefore = this.failBeforeCommit.get(input.recordId);
    if (failBefore) {
      this.failBeforeCommit.delete(input.recordId);
      throw failBefore;
    }

    const key = cloudKey(input.namespace, input.recordId);
    const current = this.rows.get(key) || null;
    let next;

    if (input.deleted) {
      if (!current || current.record_version !== input.expectedVersion) throw conflictError();
      next = {
        ...current,
        deleted_at: this.clock.iso(),
        record_version: current.record_version + 1
      };
    } else if (input.expectedVersion == null) {
      if (current) throw conflictError();
      next = {
        namespace: input.namespace,
        record_id: input.recordId,
        payload: clone(input.payload),
        payload_checksum: input.payloadChecksum,
        record_version: 1,
        deleted_at: null
      };
    } else {
      if (!current || current.record_version !== input.expectedVersion) throw conflictError();
      next = {
        ...current,
        payload: clone(input.payload),
        payload_checksum: input.payloadChecksum,
        deleted_at: null,
        record_version: current.record_version + 1
      };
    }

    this.rows.set(key, next);
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

  rowForLogical(domain, logicalId, includeDeleted = true) {
    for (const row of this.rows.values()) {
      if (!includeDeleted && row.deleted_at) continue;
      const payload = row.payload;
      if (payload?.key !== domain) continue;
      if (payload.kind === "root_value" && logicalId === "$section") return row;
      if (payload.kind === "array_manifest" && logicalId === "$order") return row;
      if (payload.kind === "array_item" && Normalizer.logicalIdentityValue(payload.value) === logicalId) return row;
    }
    return null;
  }

  remoteEdit(domain, logicalId, mutate) {
    const row = this.rowForLogical(domain, logicalId);
    assert.ok(row, `remote row for ${domain}/${logicalId}`);
    const payload = clone(row.payload);
    mutate(payload);
    row.payload = payload;
    row.payload_checksum = Normalizer.checksumValue(payload);
    row.deleted_at = null;
    row.record_version += 1;
    this.manifest.sync_generation += 1;
    return clone(row);
  }

  remoteDelete(domain, logicalId) {
    const row = this.rowForLogical(domain, logicalId);
    assert.ok(row, `remote row for ${domain}/${logicalId}`);
    row.deleted_at = this.clock.iso();
    row.record_version += 1;
    this.manifest.sync_generation += 1;
    return clone(row);
  }
}

function makeClock(start = Date.parse("2026-09-25T12:00:00.000Z")) {
  let value = start;
  return {
    iso: () => new Date(value).toISOString(),
    advance: (ms) => { value += ms; },
    value: () => value
  };
}

async function createHarness(initialState, options = {}) {
  const clock = options.clock || makeClock();
  const storage = options.storage || new MemoryStorage({
    [OWNER_KEY]: USER_ID,
    [STATE_KEY]: JSON.stringify(initialState)
  });
  const stateStore = StateStore.create({
    storage,
    indexedDB: null,
    now: clock.iso
  });
  const recordStore = options.recordStore || new FakeRecordStore(initialState, clock);
  const baselineRows = options.baselineRows || new Map();
  const baselineMetas = options.baselineMetas || new Map();
  const baselineStore = Baseline.createMemoryStore({
    ownerId: USER_ID,
    rows: baselineRows,
    metas: baselineMetas
  });
  let online = options.online !== false;
  const worker = Worker.create({
    stateStore,
    recordStore,
    normalizer: Normalizer,
    baselineStore,
    online: () => online,
    now: clock.iso,
    baseBackoffMs: 100,
    maxBackoffMs: 1000
  });
  if (options.prime !== false) {
    const primed = await worker.primeBaseline();
    assert.equal(primed.ok, true);
  }

  return {
    clock,
    storage,
    stateStore,
    recordStore,
    baselineStore,
    baselineRows,
    baselineMetas,
    worker,
    setOnline(value) { online = Boolean(value); },
    save(nextState) {
      const result = stateStore.commit(clone(nextState), { source: "local", reason: "test-edit" });
      assert.equal(result.ok, true);
      return result;
    },
    state() { return stateStore.getState(); },
    outbox() { return stateStore.getOutbox(USER_ID); }
  };
}

function animalState(overrides = {}) {
  return {
    animals: [
      { id: "a1", name: "Judy", weight: 3.1 },
      { id: "a2", name: "Jack", weight: 3.5 }
    ],
    litters: [{ id: "l1", name: "Litter 1", born: "2026-09-01" }],
    tasks: [{ id: "t1", title: "Check nest", done: false }],
    settings: { theme: "system" },
    ...overrides
  };
}

test("single-record update writes only that normalized item and acknowledges after cloud commit", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals[0].name = "Judy Updated";
  h.save(next);

  const result = await h.worker.drain();

  assert.equal(result.ok, true);
  assert.equal(result.succeeded, 1);
  assert.equal(h.outbox().length, 0);
  assert.equal(h.recordStore.calls.length, 1);
  assert.equal(h.recordStore.calls[0].recordId, h.recordStore.rowForLogical("animals", "a1").record_id);
  assert.equal(h.recordStore.calls[0].payload.value.name, "Judy Updated");
  assert.equal(h.recordStore.calls[0].expectedVersion, 1);
  assert.equal(h.recordStore.calls.some((call) => call.recordId === Normalizer.snapshotManifestId), false);
});

test("create writes the new item before the array manifest and leaves unrelated records untouched", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals.push({ id: "a3", name: "Annie", weight: 2.9 });
  h.save(next);

  await h.worker.drain();

  assert.equal(h.outbox().length, 0);
  assert.equal(h.recordStore.calls.length, 2);
  assert.equal(h.recordStore.calls[0].payload.kind, "array_item");
  assert.equal(h.recordStore.calls[0].payload.value.id, "a3");
  assert.equal(h.recordStore.calls[1].payload.kind, "array_manifest");
  assert.equal(h.recordStore.calls.some((call) => call.payload?.key === "litters"), false);
  assert.equal(h.recordStore.calls.some((call) => call.recordId === Normalizer.snapshotManifestId), false);
});

test("delete updates the array manifest before tombstoning the removed item", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals = next.animals.filter((animal) => animal.id !== "a2");
  h.save(next);

  await h.worker.drain();

  assert.equal(h.outbox().length, 0);
  assert.equal(h.recordStore.calls.length, 2);
  assert.equal(h.recordStore.calls[0].payload.kind, "array_manifest");
  assert.equal(h.recordStore.calls[1].deleted, true);
  const deleted = h.recordStore.rowForLogical("animals", "a2");
  assert.ok(deleted.deleted_at);
});

test("offline create and update survive restart and synchronize after reconnect", async () => {
  const initial = animalState();
  const h = await createHarness(initial, { online: false });
  const next = clone(initial);
  next.animals[0].weight = 3.3;
  next.tasks.push({ id: "t2", title: "Weigh litter", done: false });
  h.save(next);

  const offline = await h.worker.drain();
  assert.equal(offline.reason, "offline");
  assert.equal(h.outbox().length, 2);

  const restarted = await createHarness(initial, {
    clock: h.clock,
    storage: h.storage,
    recordStore: h.recordStore,
    baselineRows: h.baselineRows,
    baselineMetas: h.baselineMetas,
    online: true
  });

  assert.equal(restarted.outbox().length, 2);
  const synced = await restarted.worker.drain();
  assert.equal(synced.succeeded, 2);
  assert.equal(restarted.outbox().length, 0);
  assert.equal(restarted.recordStore.rowForLogical("animals", "a1").payload.value.weight, 3.3);
  assert.equal(restarted.recordStore.rowForLogical("tasks", "t2").payload.value.title, "Weigh litter");
});

test("lost response is idempotent across app restart and does not write the record twice", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals[0].name = "Judy Network";
  h.save(next);

  const recordId = h.recordStore.rowForLogical("animals", "a1").record_id;
  h.recordStore.failAfterCommit.add(recordId);
  const first = await h.worker.drain();

  assert.equal(first.failed, 1);
  assert.equal(h.outbox().length, 1);
  assert.equal(h.recordStore.rowForLogical("animals", "a1").record_version, 2);
  assert.equal(h.recordStore.rowForLogical("animals", "a1").payload.value.name, "Judy Network");

  h.clock.advance(1000);
  const restarted = await createHarness(initial, {
    clock: h.clock,
    storage: h.storage,
    recordStore: h.recordStore,
    baselineRows: h.baselineRows,
    baselineMetas: h.baselineMetas
  });
  const second = await restarted.worker.drain();

  assert.equal(second.ok, true);
  assert.equal(restarted.outbox().length, 0);
  assert.equal(restarted.recordStore.rowForLogical("animals", "a1").record_version, 2, "idempotent retry must not advance the already-committed row again");
  assert.equal(restarted.recordStore.calls.length, 2);
});

test("CAS conflict safely auto-merges different fields on the same record and updates local state", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const local = clone(initial);
  local.animals[0].name = "Local Judy";
  h.save(local);

  h.recordStore.remoteEdit("animals", "a1", (payload) => {
    payload.value.weight = 3.8;
  });

  const result = await h.worker.drain();

  assert.equal(result.ok, true);
  assert.equal(h.outbox().length, 0);
  const cloud = h.recordStore.rowForLogical("animals", "a1");
  assert.equal(cloud.record_version, 3);
  assert.equal(cloud.payload.value.name, "Local Judy");
  assert.equal(cloud.payload.value.weight, 3.8);
  assert.equal(h.state().animals[0].name, "Local Judy");
  assert.equal(h.state().animals[0].weight, 3.8);
});

test("incompatible same-field conflict is scoped while unrelated record still synchronizes", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const local = clone(initial);
  local.animals[0].name = "Local Judy";
  local.animals[1].weight = 4.0;
  h.save(local);

  h.recordStore.remoteEdit("animals", "a1", (payload) => {
    payload.value.name = "Remote Judy";
  });

  const result = await h.worker.drain();

  assert.equal(result.failed, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(h.recordStore.rowForLogical("animals", "a2").payload.value.weight, 4.0);

  const pending = h.outbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].recordId, "a1");
  assert.equal(pending[0].retryState, "conflict");
  assert.ok(pending[0].lastConflictFields.includes("$.value.name"));

  const callCount = h.recordStore.calls.length;
  const second = await h.worker.drain();
  assert.equal(second.processed, 0, "quarantined conflict must not be hammered on every drain");
  assert.equal(h.recordStore.calls.length, callCount);
});

test("edits in two domains synchronize independently", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals[0].weight = 3.6;
  next.litters[0].name = "Litter One Updated";
  h.save(next);

  const result = await h.worker.drain();

  assert.equal(result.succeeded, 2);
  assert.equal(h.outbox().length, 0);
  assert.equal(h.recordStore.rowForLogical("animals", "a1").payload.value.weight, 3.6);
  assert.equal(h.recordStore.rowForLogical("litters", "l1").payload.value.name, "Litter One Updated");
});

test("remote tombstone blocks a stale-device update from resurrecting a deleted record", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const local = clone(initial);
  local.animals[0].weight = 4.2;
  h.save(local);

  h.recordStore.remoteDelete("animals", "a1");
  const result = await h.worker.drain();

  assert.equal(result.conflicts, 1);
  const cloud = h.recordStore.rowForLogical("animals", "a1");
  assert.ok(cloud.deleted_at);
  assert.notEqual(cloud.payload.value.weight, 4.2);
  const pending = h.outbox();
  assert.equal(pending.length, 1);
  assert.ok(pending[0].lastConflictFields.includes("$record_deleted"));
});

test("newer local edit created while a response is in flight is never accidentally acknowledged", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const first = clone(initial);
  first.animals[0].weight = 3.2;
  h.save(first);

  h.recordStore.beforeApply = async (input) => {
    if (input.payload?.kind !== "array_item" || input.payload.value.id !== "a1") return;
    const later = clone(first);
    later.animals[0].weight = 3.9;
    h.save(later);
  };

  const result = await h.worker.drain();

  assert.equal(result.succeeded, 1);
  const pending = h.outbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].recordId, "a1");
  assert.equal(h.state().animals[0].weight, 3.9);
  assert.equal(h.recordStore.rowForLogical("animals", "a1").payload.value.weight, 3.2);

  const second = await h.worker.drain();
  assert.equal(second.ok, true);
  assert.equal(h.outbox().length, 0);
  assert.equal(h.recordStore.rowForLogical("animals", "a1").payload.value.weight, 3.9);
});

test("safe backoff delays repeated provider retries without blocking another logical record", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals[0].weight = 3.7;
  next.animals[1].weight = 3.9;
  h.save(next);

  const a1RecordId = h.recordStore.rowForLogical("animals", "a1").record_id;
  h.recordStore.failBeforeCommit.set(
    a1RecordId,
    Object.assign(new Error("Failed to fetch"), { code: "network_error" })
  );

  const first = await h.worker.drain();
  assert.equal(first.failed, 1);
  assert.equal(first.succeeded, 1);
  assert.equal(h.recordStore.rowForLogical("animals", "a2").payload.value.weight, 3.9);
  assert.equal(h.outbox().length, 1);

  const callsAfterFirst = h.recordStore.calls.length;
  const immediate = await h.worker.drain();
  assert.equal(immediate.processed, 0);
  assert.equal(h.recordStore.calls.length, callsAfterFirst);

  h.clock.advance(1000);
  const retried = await h.worker.drain();
  assert.equal(retried.succeeded, 1);
  assert.equal(h.outbox().length, 0);
});

test("forced baseline refresh is refused while local mutations are pending", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals[0].weight = 3.4;
  h.save(next);

  const result = await h.worker.primeBaseline({ force: true });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "pending-local-mutations");
  assert.equal(h.outbox().length, 1);
});

test("stable-ID array reorder emits a durable order mutation and synchronizes only the array manifest", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.animals = [next.animals[1], next.animals[0]];
  h.save(next);

  assert.equal(h.outbox().length, 1);
  assert.equal(h.outbox()[0].domain, "animals");
  assert.equal(h.outbox()[0].recordId, "$order");

  await h.worker.drain();

  assert.equal(h.outbox().length, 0);
  assert.equal(h.recordStore.calls.length, 1);
  assert.equal(h.recordStore.calls[0].payload.kind, "array_manifest");
});

test("draining an already-acknowledged mutation is a no-op", async () => {
  const initial = animalState();
  const h = await createHarness(initial);
  const next = clone(initial);
  next.tasks[0].done = true;
  h.save(next);

  await h.worker.drain();
  const calls = h.recordStore.calls.length;
  const second = await h.worker.drain();

  assert.equal(second.processed, 0);
  assert.equal(h.recordStore.calls.length, calls);
});


test("later local membership intent preserves a remote-only member learned through manifest reconciliation", async () => {
  const initial = animalState();
  const h = await createHarness(initial);

  // Device A creates a3 locally.
  const local = clone(initial);
  local.animals.push({ id: "a3", name: "Local A3", weight: 2.8 });
  h.save(local);

  // Device B creates a4 directly in normalized cloud and advances the array manifest.
  const remoteState = clone(initial);
  remoteState.animals.push({ id: "a4", name: "Remote A4", weight: 3.0 });
  const remoteMapped = Normalizer.mapLegacySnapshot(remoteState);
  const remoteA4 = remoteMapped.records.find((row) => row.payload?.kind === "array_item" && row.payload.value?.id === "a4");
  const remoteManifest = remoteMapped.records.find((row) => row.payload?.kind === "array_manifest" && row.payload.key === "animals");
  assert.ok(remoteA4);
  assert.ok(remoteManifest);

  h.recordStore.rows.set(cloudKey(remoteA4.namespace, remoteA4.record_id), {
    ...clone(remoteA4),
    record_version: 1,
    deleted_at: null
  });
  const currentManifest = h.recordStore.rowForLogical("animals", "$order");
  currentManifest.payload = clone(remoteManifest.payload);
  currentManifest.payload_checksum = remoteManifest.payload_checksum;
  currentManifest.record_version += 1;
  h.recordStore.manifest.sync_generation += 1;

  const first = await h.worker.drain();
  assert.equal(first.ok, true);
  assert.equal(h.outbox().length, 0);
  const mergedManifest = h.recordStore.rowForLogical("animals", "$order");
  const a4Id = remoteA4.record_id;
  assert.ok(mergedManifest.payload.item_record_ids.includes(a4Id));

  // Device A still does not have a4 in its legacy snapshot, then creates a5.
  const later = h.state();
  later.animals.push({ id: "a5", name: "Local A5", weight: 3.2 });
  h.save(later);
  const second = await h.worker.drain();
  assert.equal(second.ok, true);

  const finalManifest = h.recordStore.rowForLogical("animals", "$order");
  const finalState = Normalizer.mapLegacySnapshot({
    animals: [{ id: "a5", name: "Local A5", weight: 3.2 }]
  });
  const a5Id = finalState.records.find((row) => row.payload?.kind === "array_item" && row.payload.value?.id === "a5").record_id;
  assert.ok(finalManifest.payload.item_record_ids.includes(a4Id), "remote-only a4 must remain referenced");
  assert.ok(finalManifest.payload.item_record_ids.includes(a5Id), "new local a5 must be added");
});

test("reorder is quarantined when the confirmed manifest contains unseen remote members", async () => {
  const initial = animalState();
  const h = await createHarness(initial);

  const remoteState = clone(initial);
  remoteState.animals.push({ id: "a4", name: "Remote A4", weight: 3.0 });
  const remoteMapped = Normalizer.mapLegacySnapshot(remoteState);
  const remoteA4 = remoteMapped.records.find((row) => row.payload?.kind === "array_item" && row.payload.value?.id === "a4");
  const remoteManifest = remoteMapped.records.find((row) => row.payload?.kind === "array_manifest" && row.payload.key === "animals");
  h.recordStore.rows.set(cloudKey(remoteA4.namespace, remoteA4.record_id), {
    ...clone(remoteA4),
    record_version: 1,
    deleted_at: null
  });

  // Simulate the durable baseline having learned the remote manifest while the
  // legacy local snapshot has not yet materialized a4.
  const baselineManifest = await h.baselineStore.get(Normalizer.namespace, h.recordStore.rowForLogical("animals", "$order").record_id);
  await h.baselineStore.put({
    ...baselineManifest,
    payload: clone(remoteManifest.payload),
    payload_checksum: remoteManifest.payload_checksum,
    record_version: baselineManifest.record_version + 1
  });

  const reordered = h.state();
  reordered.animals = [reordered.animals[1], reordered.animals[0]];
  h.save(reordered);
  const result = await h.worker.drain();

  assert.equal(result.conflicts, 1);
  const pending = h.outbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].recordId, "$order");
  assert.ok(pending[0].lastConflictFields.includes("$order.remote_members"));
});
