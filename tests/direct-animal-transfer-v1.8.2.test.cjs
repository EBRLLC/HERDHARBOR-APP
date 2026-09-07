"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../direct-transfer-core-v1.8.2.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function pedigreeState() {
  const animals = [];
  const add = (id, sireId = "", damId = "", extra = {}) => animals.push({
    id,
    name: id.toUpperCase(),
    species: "Rabbit",
    breed: "Holland Lop",
    sex: id.includes("dam") ? "Female" : "Male",
    registrationNumber: `REG-${id}`,
    sireId,
    damId,
    status: "Active",
    notes: `PRIVATE-${id}`,
    healthNotes: `HEALTH-${id}`,
    ...extra
  });
  add("ggs1"); add("ggd1"); add("ggs2"); add("ggd2"); add("ggs3"); add("ggd3"); add("ggs4"); add("ggd4");
  add("gsire", "ggs1", "ggd1"); add("gdam", "ggs2", "ggd2");
  add("gsire2", "ggs3", "ggd3"); add("gdam2", "ggs4", "ggd4");
  add("sire", "gsire", "gdam"); add("dam", "gsire2", "gdam2");
  add("subject", "sire", "dam", {
    sex: "Female",
    color: "Black Magpie",
    genetics: {
      schemaVersion: 3,
      phenotype: { recorded: "Black Magpie", canonical: "Black Magpie" },
      loci: { V: { alleles: ["V", "v"], status: "confirmed", source: "breeder", note: "private evidence note" } },
      evidence: [{ note: "private evidence" }],
      tests: [{ document: "private test" }],
      history: [{ note: "private history" }]
    }
  });
  return {
    profile: { operationName: "Seller Rabbitry", ownerName: "Seller", email: "seller@example.com", phone: "555" },
    animals,
    customers: [{ id: "customer-1", name: "Buyer", email: "buyer@example.com", notes: "private customer note" }],
    sales: [{
      id: "sale-1",
      saleNumber: "HH-20260907-ABC",
      transferNumber: "TR-20260907-ABC",
      customerId: "customer-1",
      saleDate: "2026-09-07",
      status: "Completed",
      notes: "private sale note",
      items: [{ id: "item-1", animalId: "subject", unitPrice: "300.00" }]
    }],
    transfers: []
  };
}

test("direct transfer packages the sold animal plus three pedigree generations", () => {
  const state = pedigreeState();
  const payload = Core.buildTransferPayload(state, "sale-1", { memberCode: "HH-ABCDEFGHIJ" });
  assert.equal(payload.type, Core.PAYLOAD_TYPE);
  assert.equal(payload.transferId, "TR-20260907-ABC");
  assert.deepEqual(payload.subjectIds, ["subject"]);
  assert.equal(payload.animals.length, 15);
  assert.ok(payload.animals.some((animal) => animal.id === "ggs1"));
  assert.ok(payload.animals.some((animal) => animal.id === "ggd4"));
});

test("transfer payload excludes private sale, customer, animal, health, and genetics evidence notes", () => {
  const payload = Core.buildTransferPayload(pedigreeState(), "sale-1");
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private sale note/i);
  assert.doesNotMatch(serialized, /private customer note/i);
  assert.doesNotMatch(serialized, /PRIVATE-subject/i);
  assert.doesNotMatch(serialized, /HEALTH-subject/i);
  assert.doesNotMatch(serialized, /private evidence/i);
  assert.doesNotMatch(serialized, /private test/i);
  assert.doesNotMatch(serialized, /private history/i);
  const subject = payload.animals.find((animal) => animal.id === "subject");
  assert.deepEqual(subject.genetics.loci.V.alleles, ["V", "v"]);
  assert.equal(subject.genetics.loci.V.status, "confirmed");
});

test("buyer import remaps pedigree, makes purchased animal active, and keeps ancestors ancestor-only", () => {
  const payload = Core.buildTransferPayload(pedigreeState(), "sale-1");
  const applied = Core.applyIncomingTransfer({ animals: [], transfers: [] }, payload, {
    serverTransferId: "server-1",
    senderDisplayName: "Seller Rabbitry",
    recipientDisplayName: "Buyer Rabbitry"
  });
  const subject = applied.state.animals.find((animal) => animal.name === "SUBJECT");
  assert.equal(subject.status, "Active");
  const sire = applied.state.animals.find((animal) => animal.name === "SIRE");
  const dam = applied.state.animals.find((animal) => animal.name === "DAM");
  assert.equal(sire.status, "Ancestor Only");
  assert.equal(dam.status, "Ancestor Only");
  assert.equal(subject.sireId, sire.id);
  assert.equal(subject.damId, dam.id);
  assert.equal(subject.genetics.loci.V.alleles[1], "v");
  assert.equal(subject.ownershipHistory.at(-1).from, "Seller Rabbitry");
  assert.equal(applied.state.transfers[0].channel, "HerdHarbor Direct");
});

test("buyer import reuses an existing pedigree ancestor instead of creating a duplicate", () => {
  const payload = Core.buildTransferPayload(pedigreeState(), "sale-1");
  const buyer = {
    animals: [{ id: "buyer-existing-sire", name: "Existing sire", species: "Rabbit", registrationNumber: "REG-sire", status: "Ancestor Only" }],
    transfers: []
  };
  const applied = Core.applyIncomingTransfer(buyer, payload);
  const subject = applied.state.animals.find((animal) => animal.name === "SUBJECT");
  assert.equal(subject.sireId, "buyer-existing-sire");
  assert.equal(applied.state.animals.filter((animal) => animal.registrationNumber === "REG-sire").length, 1);
});

test("same direct transfer cannot be imported twice into the local farm state", () => {
  const payload = Core.buildTransferPayload(pedigreeState(), "sale-1");
  const first = Core.applyIncomingTransfer({ animals: [], transfers: [] }, payload);
  const second = Core.applyIncomingTransfer(first.state, payload);
  assert.equal(second.alreadyImported, true);
  assert.equal(second.state.animals.length, first.state.animals.length);
  assert.equal(second.state.transfers.length, 1);
});

test("only completed animal sales can be sent account-to-account", () => {
  const state = pedigreeState();
  state.sales[0].status = "Pending";
  assert.throws(() => Core.buildTransferPayload(state, "sale-1"), /Complete the sale/i);
});

test("direct transfer backend is authenticated, service mediated, and browser tables are locked", () => {
  const fn = read("supabase/functions/animal-transfer/index.ts");
  const sql = read("supabase/v1.8.2-direct-animal-transfers.sql");
  const config = read("supabase/config.toml");
  assert.match(config, /\[functions\.animal-transfer\][\s\S]*verify_jwt = true/);
  assert.match(fn, /admin\.auth\.getUser\(token\)/);
  assert.match(fn, /sanitizePayload\(body\.payload\)/);
  assert.match(fn, /recipient_id.*user\.id|eq\("recipient_id", user\.id\)/s);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.herdharbor_direct_animal_transfers from anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.herdharbor_direct_transfer_resolve\(text\) from public, anon, authenticated/i);
});

test("build loader exposes the direct-transfer core and UI without creating another browser Supabase client", () => {
  const build = read("herdharbor-build.js");
  const ui = read("direct-transfer-v1.8.2.js");
  assert.match(build, /direct-transfer-core-v1\.8\.2\.js/);
  assert.match(build, /direct-transfer-v1\.8\.2\.js/);
  assert.match(build, /direct-transfer-v1\.8\.2\.css/);
  assert.match(ui, /HerdHarborCloud\.invokeFunction|HerdHarborCloud\?\.invokeFunction/);
  assert.doesNotMatch(ui, /createClient\s*\(/);
});
