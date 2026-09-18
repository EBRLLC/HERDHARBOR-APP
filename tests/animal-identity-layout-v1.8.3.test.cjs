const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Phase2 = require("../flow-phase2-v1.8.2.js");
const Normalizer = require("../cloud-state-normalizer-v1.8.3.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "flow-phase2-v1.8.2.js"), "utf8");
const css = fs.readFileSync(path.join(root, "flow-phase2-v1.8.2.css"), "utf8");

function normalizedRows(mapped) {
  return mapped.records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload: JSON.parse(JSON.stringify(record.payload)),
    payload_checksum: record.payload_checksum,
    deleted_at: null
  }));
}

test("Identity customization preserves the existing eight-field layout by default", () => {
  assert.deepEqual(Phase2.DEFAULT_IDENTITY_LAYOUT, [
    "primaryId",
    "registration",
    "species",
    "breed",
    "sex",
    "born",
    "colorVariety",
    "breeder"
  ]);

  assert.deepEqual(Phase2.identityLayoutFor({ settings: {} }, "a1"), Phase2.DEFAULT_IDENTITY_LAYOUT);
  assert.equal(Phase2.MAX_IDENTITY_FIELDS, 10);
});

test("custom Identity layouts are per animal and preserve user order", () => {
  const state = {
    settings: {
      animalIdentityLayouts: {
        a1: ["currentWeight", "primaryId", "sire"],
        a2: ["status", "location"]
      }
    }
  };

  assert.deepEqual(Phase2.identityLayoutFor(state, "a1"), ["currentWeight", "primaryId", "sire"]);
  assert.deepEqual(Phase2.identityLayoutFor(state, "a2"), ["status", "location"]);
  assert.deepEqual(Phase2.identityLayoutFor(state, "a3"), Phase2.DEFAULT_IDENTITY_LAYOUT);
});

test("malformed Identity preferences fail safe without making the profile unusable", () => {
  assert.deepEqual(Phase2.normalizeIdentityLayout(null), Phase2.DEFAULT_IDENTITY_LAYOUT);
  assert.deepEqual(Phase2.normalizeIdentityLayout([]), Phase2.DEFAULT_IDENTITY_LAYOUT);
  assert.deepEqual(Phase2.normalizeIdentityLayout(["unknown"]), Phase2.DEFAULT_IDENTITY_LAYOUT);
  assert.deepEqual(
    Phase2.normalizeIdentityLayout(["status", "unknown", "status", "location"]),
    ["status", "location"]
  );

  const tooMany = Phase2.IDENTITY_FIELD_KEYS.slice(0, 11);
  assert.deepEqual(Phase2.normalizeIdentityLayout(tooMany), Phase2.DEFAULT_IDENTITY_LAYOUT);
});

test("Identity layout validation enforces one through ten visible fields", () => {
  assert.equal(Phase2.validateIdentityLayout([]).ok, false);
  assert.match(Phase2.validateIdentityLayout([]).message, /at least one/i);

  const ten = Phase2.IDENTITY_FIELD_KEYS.slice(0, 10);
  assert.equal(Phase2.validateIdentityLayout(ten).ok, true);

  const eleven = Phase2.IDENTITY_FIELD_KEYS.slice(0, 11);
  assert.equal(Phase2.validateIdentityLayout(eleven).ok, false);
  assert.match(Phase2.validateIdentityLayout(eleven).message, /no more than 10/i);
});

test("saving a custom layout changes settings only and reset removes only that animal preference", () => {
  const animal = { id: "a1", name: "Atlas", tag: "HH-1" };
  const base = {
    animals: [animal],
    settings: {
      theme: "system",
      animalIdentityLayouts: { a2: ["status"] }
    }
  };

  const result = Phase2.stateWithIdentityLayout(base, "a1", ["currentWeight", "primaryId"]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.animals, base.animals);
  assert.strictEqual(result.state.animals[0], animal);
  assert.deepEqual(result.state.settings.animalIdentityLayouts, {
    a2: ["status"],
    a1: ["currentWeight", "primaryId"]
  });
  assert.equal(base.settings.animalIdentityLayouts.a1, undefined);

  const reset = Phase2.stateWithoutIdentityLayout(result.state, "a1");
  assert.equal(reset.settings.animalIdentityLayouts.a1, undefined);
  assert.deepEqual(reset.settings.animalIdentityLayouts.a2, ["status"]);
  assert.deepEqual(Phase2.identityLayoutFor(reset, "a1"), Phase2.DEFAULT_IDENTITY_LAYOUT);
});

test("custom Identity layout survives JSON reload and normalized cloud round trip", () => {
  const state = {
    animals: [{ id: "a1", name: "Atlas" }],
    health: [],
    settings: {
      theme: "dark",
      animalIdentityLayouts: {
        a1: ["currentWeight", "primaryId", "sire", "dam"]
      }
    }
  };

  const reloaded = JSON.parse(JSON.stringify(state));
  assert.deepEqual(
    Phase2.identityLayoutFor(reloaded, "a1"),
    ["currentWeight", "primaryId", "sire", "dam"]
  );

  const mapped = Normalizer.mapLegacySnapshot(state);
  const reconstructed = Normalizer.reassembleLegacySnapshot(normalizedRows(mapped));
  assert.deepEqual(
    Phase2.identityLayoutFor(reconstructed, "a1"),
    ["currentWeight", "primaryId", "sire", "dam"]
  );
});

test("hidden fields leave canonical animal data intact and display order follows the saved layout", () => {
  const animal = {
    id: "a1",
    name: "Atlas",
    tag: "HH-1",
    registrationNumber: "REG-22",
    breed: "Holland Lop",
    sex: "Male",
    breeder: "Harbor Farm"
  };
  const before = JSON.parse(JSON.stringify(animal));
  const state = {
    animals: [animal],
    settings: {
      animalIdentityLayouts: {
        a1: ["sex", "primaryId", "breed"]
      }
    }
  };

  const rows = Phase2.identityRows(state, animal);
  assert.deepEqual(rows.map((row) => row.key), ["sex", "primaryId", "breed"]);
  assert.deepEqual(rows.map((row) => row.label), ["Sex", "Primary ID", "Breed"]);
  assert.equal(rows.some((row) => row.key === "registration"), false);
  assert.equal(animal.registrationNumber, "REG-22");
  assert.deepEqual(animal, before);
});

test("Current Weight recalculates from current state after another weight is recorded", () => {
  const state = {
    health: [
      { id: "w1", animalId: "a1", type: "Weight", date: "2026-09-10", weight: "4", weightUnit: "lb" }
    ],
    settings: { preferredWeightDisplay: "lb" }
  };
  const animal = { id: "a1" };

  const before = Phase2.identityField(state, animal, "currentWeight");
  assert.equal(before.value, "4 lb");

  state.health.push({
    id: "w2",
    animalId: "a1",
    type: "Weight",
    date: "2026-09-18",
    weight: "4.5",
    weightUnit: "lb"
  });

  const after = Phase2.identityField(state, animal, "currentWeight");
  assert.equal(after.value, "4.5 lb");
  assert.notEqual(after.value, before.value);
});

test("a stale customization entry for a deleted animal is harmless", () => {
  const state = {
    animals: [],
    settings: {
      animalIdentityLayouts: {
        deletedAnimal: ["currentWeight", "status"]
      }
    }
  };

  assert.deepEqual(Phase2.identityLayoutFor(state, "deletedAnimal"), ["currentWeight", "status"]);
  assert.equal(state.animals.length, 0);
  assert.deepEqual(Phase2.identityLayoutFor(state, "newAnimal"), Phase2.DEFAULT_IDENTITY_LAYOUT);
});

test("Current Weight uses the newest valid recorded Weight row, not a duplicated animal value", () => {
  const state = {
    health: [
      { id: "w1", animalId: "a1", type: "Weight", date: "2026-09-01", weight: "4", weightUnit: "lb", createdAt: "2026-09-01T10:00:00Z" },
      { id: "x1", animalId: "a1", type: "Observation", date: "2026-09-18", weight: "4", weightOunces: "12", weightUnit: "lb+oz" },
      { id: "bad", animalId: "a1", type: "Weight", date: "2026-09-18", weight: "not-a-number", weightUnit: "lb" },
      { id: "undated", animalId: "a1", type: "Weight", weight: "99", weightUnit: "lb", createdAt: "2026-09-18T14:00:00Z" },
      { id: "bad-date", animalId: "a1", type: "Weight", date: "not-a-date", weight: "88", weightUnit: "lb", createdAt: "2026-09-18T15:00:00Z" },
      { id: "w2", animalId: "a1", type: "Weight", date: "2026-09-17", weight: "4", weightOunces: "8", weightUnit: "lb+oz", createdAt: "2026-09-17T09:00:00Z" },
      { id: "w3", animalId: "a1", type: "Weight", date: "2026-09-17", weight: "4", weightOunces: "10", weightUnit: "lb+oz", createdAt: "2026-09-17T12:00:00Z" }
    ],
    settings: { preferredWeightDisplay: "lb+oz" }
  };

  assert.equal(Phase2.latestWeightRecord(state, "a1").id, "x1");

  const row = Phase2.identityField(state, { id: "a1" }, "currentWeight");
  assert.equal(row.value, "4 lb 12 oz");
  assert.match(row.detail, /^Recorded /);
});

test("Current Weight follows existing weight-history semantics and uses later insertion for same-day ties", () => {
  const state = {
    health: [
      { id: "first", animalId: "a1", type: "Weight", date: "2026-09-18", weight: "4", weightUnit: "lb" },
      { id: "second", animalId: "a1", type: "Veterinary visit", date: "2026-09-18", weight: "4.25", weightUnit: "lb" }
    ],
    settings: { preferredWeightDisplay: "lb" }
  };

  assert.equal(Phase2.latestWeightRecord(state, "a1").id, "second");
  assert.equal(Phase2.identityField(state, { id: "a1" }, "currentWeight").value, "4.25 lb");
});

test("Current Weight has a graceful empty state", () => {
  const row = Phase2.identityField(
    { health: [], settings: { preferredWeightDisplay: "lb" } },
    { id: "a1" },
    "currentWeight"
  );

  assert.equal(row.value, "No weight recorded");
  assert.equal(row.detail, "");
});

test("Sire and Dam resolve dynamically from existing animal relationships", () => {
  const state = {
    animals: [
      { id: "a1", name: "Kit", sireId: "s1", damId: "d1" },
      { id: "s1", name: "Atlas" },
      { id: "d1", name: "Willow" }
    ]
  };
  const animal = state.animals[0];

  assert.equal(Phase2.identityField(state, animal, "sire").value, "Atlas");
  assert.equal(Phase2.identityField(state, animal, "dam").value, "Willow");

  const missing = Phase2.identityField(state, { id: "a2", sireId: "missing" }, "sire");
  assert.equal(missing.value, "—");
});

test("cancel path does not persist the dialog draft and rerenders do not stack profile handlers", () => {
  const dialogStart = source.indexOf("function openIdentityLayoutDialog");
  const dialogEnd = source.indexOf("function normalizeTab", dialogStart);
  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart);
  const dialogSource = source.slice(dialogStart, dialogEnd);

  const saveIndex = dialogSource.indexOf("[data-hh-p2-identity-save]");
  const persistIndex = dialogSource.indexOf("persistIdentityLayout(");
  const closeIndex = dialogSource.indexOf("[data-hh-p2-identity-close]");
  assert.ok(saveIndex >= 0);
  assert.ok(persistIndex > saveIndex, "persistence occurs only in the explicit Save branch");
  assert.ok(closeIndex >= 0);
  assert.doesNotMatch(
    dialogSource.slice(closeIndex, saveIndex),
    /persistIdentityLayout\(/,
    "Cancel/close does not persist the local draft"
  );

  const ensureStart = source.indexOf("function ensureProfileView");
  const ensureEnd = source.indexOf("function clickAnimalsRoute", ensureStart);
  const ensureSource = source.slice(ensureStart, ensureEnd);
  assert.ok(ensureSource.indexOf("if(view)return view;") < ensureSource.indexOf('view.addEventListener("click"'));
  assert.match(dialogSource, /querySelector\("#hh-p2-identity-layout-modal"\)\?\.remove\(\)/);
});

test("Identity feature remains isolated from auth, billing, subscription, SQL, and cloud-sync authority", () => {
  assert.doesNotMatch(source, /HerdHarborCloud/);
  assert.doesNotMatch(source, /HerdHarborMembership/);
  assert.doesNotMatch(source, /HerdHarborBilling/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /stripe/i);
});

test("Identity UI uses the canonical centered HerdHarbor modal shell", () => {
  assert.match(source, /overlay\.className="modal-backdrop hh-p2-identity-layout-overlay"/);
  assert.match(source, /classList\.add\("modal-open"\)/);
  assert.match(source, /classList\.remove\("modal-open"\)/);
  assert.doesNotMatch(source, /modal-overlay active hh-p2-identity-layout-overlay/);
});

test("Identity UI exposes an accessible gear, explicit ordering controls, and responsive styling", () => {
  assert.match(source, /aria-label="Customize Identity"/);
  assert.match(source, /data-hh-p2-identity-move="up"/);
  assert.match(source, /data-hh-p2-identity-move="down"/);
  assert.match(source, /data-hh-p2-identity-reset/);
  assert.match(source, /data-hh-p2-identity-save/);
  assert.match(source, /data-hh-p2-identity-close/);
  assert.match(css, /\.hh-p2-identity-settings/);
  assert.match(css, /\.hh-p2-identity-layout-modal/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
});

test("Identity customization does not introduce a parallel storage key or animal-record persistence path", () => {
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.doesNotMatch(source, /sessionStorage\.setItem/);
  assert.match(source, /settings:\{\.\.\.\(state\.settings\|\|\{\}\),animalIdentityLayouts:layouts\}/);
  assert.doesNotMatch(source, /animal\.identityLayout\s*=/);
});
