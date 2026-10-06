const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const Core = require("../direct-transfer-core-v1.8.2.js");

function state() {
  return {
    profile: { operationName: "Seller Rabbitry" },
    customers: [{ id: "buyer", name: "Buyer" }],
    sales: [{
      id: "sale", saleNumber: "HH-SALE", transferNumber: "TR-E1", saleDate: "2026-10-05",
      status: "Completed", customerId: "buyer", items: [{ animalId: "a" }]
    }],
    animals: [{
      id: "a", name: "Rabbit A", species: "Rabbit", breed: "Holland Lop",
      sireId: "s", damId: "", notes: "PRIVATE", medicalNotes: "PRIVATE",
      genetics: { loci: { A: { alleles: ["A","a"], note: "PRIVATE" } } },
      ownershipHistory: [{ type: "transfer", from: "Old Farm", to: "Seller Rabbitry", date: "2025-01-01" }]
    }, {
      id: "s", name: "Sire", species: "Rabbit", notes: "PRIVATE"
    }]
  };
}

test("E1 transfer categories are explicit and optional categories can be excluded", () => {
  const payload = Core.buildTransferPayload(state(), "sale", {
    transferCategories: { genetics: false, ownershipHistory: false }
  });
  assert.deepEqual(payload.categories, {
    identity: true,
    pedigree: true,
    genetics: false,
    ownershipHistory: false
  });
  assert.equal(payload.animals[0].genetics, null);
  assert.deepEqual(payload.animals[0].ownershipHistory, []);
  assert.doesNotMatch(JSON.stringify(payload), /medicalNotes|PRIVATE/);
});

test("E1 keeps mandatory identity and pedigree categories enabled", () => {
  const payload = Core.buildTransferPayload(state(), "sale", {
    transferCategories: { identity: false, pedigree: false }
  });
  assert.equal(payload.categories.identity, true);
  assert.equal(payload.categories.pedigree, true);
});

test("E1 server rebuilds transfer animals from authoritative account storage", () => {
  const fn = read("supabase/functions/animal-transfer/index.ts");
  const sql = read("supabase/stack-e1-ownership-transfer-contract.sql");
  assert.match(fn, /herdharbor_direct_transfer_owned_animals/);
  assert.match(fn, /authoritativeTransferAnimals/);
  assert.match(fn, /payload\.animals\s*=\s*await authoritativeTransferAnimals/);
  assert.match(sql, /cutover_stage/);
  assert.match(sql, /herdharbor_sync_records/);
  assert.match(sql, /herdharbor_user_data/);
  assert.match(sql, /revoke all on function public\.herdharbor_direct_transfer_owned_animals\(uuid\)[\s\S]*authenticated/i);
});

test("E1 extends the canonical transfer table and adds expiry without a second lifecycle table", () => {
  const sql = read("supabase/stack-e1-ownership-transfer-contract.sql");
  assert.match(sql, /alter table public\.herdharbor_direct_animal_transfers/);
  assert.match(sql, /transfer_categories jsonb/);
  assert.match(sql, /expires_at timestamptz/);
  assert.match(sql, /'expired'/);
  assert.doesNotMatch(sql, /create table\s+(?!if not exists\s+)?public\.(?!herdharbor_direct_animal_transfers)/i);
});
