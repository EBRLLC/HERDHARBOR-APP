"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const Store = require("../herdharbor-state-store-v1.8.4.js");
const Core = require("../rabbit-genetics-v1.6.1.js");
const Inheritance = require("../rabbit-genetics-inheritance-v2.0.3.js");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const STATE = "herdharbor_pre_alpha_v1";
const turn = () => new Promise(resolve => setImmediate(resolve));
function emitter(value = {}) {
  const listeners = new Map();
  return Object.assign(value, {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); }
  });
}
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function environment(initial = {}) {
  const scripts = [], timers = new Map(), elements = new Map();
  let timerId = 0;
  const storage = memory(initial);
  const node = tag => emitter({ tagName: tag.toUpperCase(), dataset: {}, src: "", innerHTML: "", classList: { add() {}, remove() {} },
    setAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
    remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); if (this.id) elements.delete(this.id); } });
  const document = emitter({ baseURI: "https://app.herdharbor.com/", readyState: "loading", scripts,
    createElement: node, getElementById: id => elements.get(id) || null,
    querySelector: selector => elements.get(selector.replace(/^#/, "")) || null, querySelectorAll: () => [] });
  document.head = document.body = { appendChild(value) { if (value.tagName === "SCRIPT") scripts.push(value); if (value.id) elements.set(value.id, value); } };
  document.documentElement = { dataset: {} };
  const window = emitter({ location: { href: document.baseURI, hash: "", reload() {} }, localStorage: storage,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    matchMedia: () => ({ matches: false }), navigator: {}, dispatchEvent() {} });
  const context = vm.createContext({ window, document, localStorage: storage, location: window.location,
    navigator: window.navigator, URL, structuredClone, console: { error() {}, warn() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } });
  return { window, document, scripts, timers, storage, elements, context,
    expire(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } } };
}
function runtime(initial = {}) {
  const env = environment(initial);
  env.window.HerdHarborStateStore = Store.create({ storage: env.storage });
  let source = read("herdharbor-app-runtime.js");
  source = source.replace("  initialize();\n})();", `
    toast = () => {};
    window.testRuntime = { loadScriptOnce, renderLazyRoute, prepareRabbitInheritance, scheduleLoadedGenetics,
      setRoute: route => { currentRoute = route; }, setState: value => { state = value; },
      loadError: () => localStateLoadError, setSavedRaw: raw => { lastSavedRaw = raw; } };
  })();`);
  vm.runInContext(source, env.context);
  return { ...env, api: env.window.testRuntime, app: env.window.HerdHarborApp };
}

test("optional loader times out a silent request, releases listeners and permits explicit retry", async () => {
  const env = environment();
  vm.runInContext(read("herdharbor-optional-tools.js"), env.context);
  const first = env.window.HerdHarborOptionalTools.ensureQrTools();
  const old = env.scripts[0];
  env.expire(20_000);
  await assert.rejects(first, /too long/);
  assert.equal(env.scripts.length, 0);
  const retry = env.window.HerdHarborOptionalTools.ensureQrTools();
  old.emit("load");
  env.window.qrcode = () => {};
  env.scripts[0].emit("load");
  await retry;
  assert.equal(env.timers.size, 0);
});

for (const failure of ["error", "missing-api", "timeout"]) test(`runtime lazy loader recovers after ${failure} and deduplicates navigation`, async () => {
  const env = runtime();
  let ready = false;
  const first = env.api.loadScriptOnce("feature.js", () => ready);
  assert.equal(first, env.api.loadScriptOnce("feature.js", () => ready));
  if (failure === "timeout") env.expire(20_000);
  else env.scripts[0].emit(failure === "error" ? "error" : "load");
  await assert.rejects(first);
  assert.equal(env.scripts.length, 0);
  const next = env.api.loadScriptOnce("feature.js", () => ready);
  ready = true;
  env.scripts[0].emit("load");
  await next;
  await env.api.loadScriptOnce("feature.js", () => ready);
  assert.equal(env.scripts.length, 1);
  assert.equal(env.timers.size, 0);
});

test("late lazy route completions cannot render after A to B to A or repeated feature navigation", async () => {
  const env = runtime();
  let complete, renders = 0;
  env.api.setRoute("analytics");
  const pending = new Promise(resolve => { complete = resolve; });
  env.api.renderLazyRoute("analytics", "Analytics", () => pending, () => renders++);
  env.document.emit("herdharbor:auth-boundary");
  env.document.emit("herdharbor:auth-boundary");
  complete(); await turn();
  assert.equal(renders, 0);
  env.api.renderLazyRoute("analytics", "Analytics", () => Promise.resolve(), () => renders++);
  env.api.renderLazyRoute("analytics", "Analytics", () => Promise.resolve(), () => renders++);
  await turn();
  assert.equal(renders, 1);
});

test("AI optional tool acquisition rejects an A to B to A transition", async () => {
  const env = environment({ "herdharbor_ai_live_tester_v1:A": "1" });
  env.window.HerdHarborCloud = { getSession: () => ({ user: { id: "A" } }) };
  vm.runInContext(read("herdharbor-optional-tools.js"), env.context);
  const pending = env.window.HerdHarborOptionalTools.ensureAiLiveTools();
  env.document.emit("herdharbor:auth-boundary"); env.document.emit("herdharbor:auth-boundary");
  env.window.HerdHarborVoiceAssistedEntry = env.window.HerdHarborPhotoAssistedEntry = { create() {} };
  for (const script of env.scripts) script.emit("load");
  await assert.rejects(pending, /account changed/);
});

test("PWA chains wait for the existing script and retry only one completed network failure", () => {
  const env = environment();
  const source = read("pwa.js").replace("  installEarlyMonitoringBridge();\n  startMonitoringLoad();", "  window.testLoad = loadDynamicScript;");
  vm.runInContext(source, env.context);
  const results = [];
  env.window.testLoad("one", "one.js", ok => results.push(ok));
  env.window.testLoad("one", "one.js", ok => results.push(ok));
  assert.equal(results.length, 0);
  assert.equal(env.scripts.length, 1);
  env.scripts[0].emit("error");
  assert.equal(env.scripts.length, 1);
  env.scripts[0].emit("load");
  assert.deepEqual(results, [true, true]);
  assert.equal(env.timers.size, 0);
  env.window.testLoad("two", "two.js", ok => results.push(ok));
  env.expire(20_000);
  assert.equal(results.at(-1), false);
  assert.equal(env.scripts.length, 1, "timeout does not automatically register another copy");
  env.window.testLoad("three", "three.js", () => { throw new Error("module init failed"); });
  env.window.testLoad("three", "three.js", ok => results.push(ok));
  env.scripts[1].emit("load");
  assert.equal(results.at(-1), true, "one failed initializer must not prevent other subscribers from completing");
});

for (const bad of ["{broken", "[]", "null", '"text"']) test(`corrupt persisted state ${bad} blocks local writes without altering bytes`, () => {
  const storage = memory({ [STATE]: bad });
  const store = Store.create({ storage });
  assert.throws(() => store.load());
  assert.equal(store.commit({ animals: [] }).ok, false);
  assert.equal(storage.getItem(STATE), bad);
  assert.equal(storage.data.size, 1);
});

test("unavailable storage and corrupt outbox preserve pending edits and never become an empty account", () => {
  const storage = memory({ [STATE]: '{"animals":[{"id":"kept"}]}', herdharbor_state_outbox_v1_local: "unreadable" });
  const store = Store.create({ storage });
  assert.equal(store.commit({ animals: [] }).ok, false);
  assert.equal(storage.getItem("herdharbor_state_outbox_v1_local"), "unreadable");
  storage.getItem = () => { throw new Error("storage unavailable"); };
  assert.throws(() => store.load(), /unavailable/);
  assert.equal(store.commit({ animals: [] }).ok, false);
  const env = runtime({ [STATE]: "{broken" });
  assert.ok(env.api.loadError());
  assert.equal(env.app.commitState({ animals: [] }), false);
  assert.equal(env.storage.getItem(STATE), "{broken");
});

test("a failed save retains the previous workspace and its durable pending mutations", () => {
  const env = runtime({ [STATE]: JSON.stringify({ profile: { operationName: "Farm" }, animals: [{ id: "before" }] }) });
  const previous = env.app.getState();
  env.storage.setItem = () => { throw new Error("quota exceeded"); };
  assert.equal(env.app.commitState({ ...previous, animals: [{ id: "after" }] }), false);
  assert.equal(env.app.getState(), previous);
  assert.equal(JSON.parse(env.storage.getItem(STATE)).animals[0].id, "before");
});

function family() {
  const rabbit = (id, color, alleles, extra = {}) => ({ id, species: "Rabbit", color,
    genetics: { loci: alleles ? { D: { alleles, status: "confirmed", source: "dna" } } : {} }, ...extra });
  return { profile: { operationName: "Farm" }, animals: [rabbit("sire", "Black", ["D", "d"]),
    rabbit("dam", "Blue", ["d", "d"]), rabbit("kit", "Black", null, { sireId: "sire", damId: "dam" }),
    { id: "dog", species: "Dog", genetics: { marker: "keep" } }], tasks: [] };
}
test("genetics waits for readiness, reconciles hydrated records, and avoids full inference on unrelated saves", () => {
  const value = family();
  const env = runtime({ [STATE]: JSON.stringify(value) });
  let calls = 0;
  env.window.HerdHarborRabbitInheritance = { reconcile(...args) { calls++; return Inheritance.reconcile(...args); } };
  env.api.scheduleLoadedGenetics(); env.expire(0);
  assert.equal(calls, 0);
  env.window.HerdHarborBreedingIntelligenceCore = Core;
  env.window.emit("herdharbor:genetics-ready"); env.expire(0);
  assert.deepEqual(Array.from(env.app.getState().animals[2].genetics.loci.D.alleles), ["D", "d"]);
  const after = calls;
  assert.equal(env.app.commitState({ ...env.app.getState(), tasks: [{ id: "task" }] }), true);
  assert.equal(calls, after);
  assert.deepEqual(JSON.parse(JSON.stringify(env.app.getState().animals[3])), value.animals[3]);
  const changed = structuredClone(env.app.getState());
  changed.animals[0].color = "Blue";
  changed.animals[0].genetics.loci.D.alleles = ["d", "d"];
  assert.equal(env.app.commitState(changed), true);
  assert.ok(calls > after);
  assert.equal(env.app.getState().animals[2].genetics.loci.D, undefined);
  assert.ok(env.app.getState().animals[2].genetics.conflicts.length);
});

test("genetics hydration work is discarded after account boundary or a newer durable replacement", () => {
  const value = family(), env = runtime({ [STATE]: JSON.stringify(value) });
  env.window.HerdHarborRabbitInheritance = Inheritance; env.window.HerdHarborBreedingIntelligenceCore = Core;
  env.api.scheduleLoadedGenetics(); env.document.emit("herdharbor:auth-boundary"); env.expire(0);
  assert.equal(env.app.getState().animals[2].genetics.loci.D, undefined);
  env.api.scheduleLoadedGenetics(); env.storage.setItem(STATE, JSON.stringify({ animals: [] })); env.expire(0);
  assert.equal(env.app.getState().animals[2].genetics.loci.D, undefined);
});
