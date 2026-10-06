"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../direct-transfer-core-v1.8.2.js");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function payload() {
  return {
    app: "HerdHarbor",
    type: Core.PAYLOAD_TYPE,
    payloadVersion: Core.PAYLOAD_VERSION,
    transferId: "TR-E3",
    sender: { operationName: "Seller" },
    recipient: { name: "Buyer" },
    sale: { saleNumber: "HH-E3", saleDate: "2026-10-05" },
    categories: { identity: true, pedigree: true, genetics: false, ownershipHistory: true },
    subjectIds: ["subject"],
    animals: [
      { id: "subject", name: "Rabbit", species: "Rabbit", sireId: "sire", damId: "", ownershipHistory: [] },
      { id: "sire", name: "Sire", species: "Rabbit", sireId: "", damId: "", ownershipHistory: [] }
    ]
  };
}

test("E3 imports use deterministic IDs and remain idempotent", () => {
  const first = Core.applyIncomingTransfer({ animals: [], transfers: [] }, payload(), {
    serverTransferId: "server-e3", senderDisplayName: "Seller", recipientDisplayName: "Buyer"
  });
  const secondFreshDevice = Core.applyIncomingTransfer({ animals: [], transfers: [] }, payload(), {
    serverTransferId: "server-e3", senderDisplayName: "Seller", recipientDisplayName: "Buyer"
  });
  assert.deepEqual(first.subjectAnimalIds, secondFreshDevice.subjectAnimalIds);
  assert.deepEqual(first.addedIds, secondFreshDevice.addedIds);

  const repeated = Core.applyIncomingTransfer(first.state, payload(), {
    serverTransferId: "server-e3", senderDisplayName: "Seller", recipientDisplayName: "Buyer"
  });
  assert.equal(repeated.alreadyImported, true);
  assert.equal(repeated.state.animals.length, first.state.animals.length);
});

test("E3 client accepts on the server before mutating local ownership state", () => {
  const ui = read("direct-transfer-v1.8.2.js");
  const start = ui.indexOf("async function acceptIncoming");
  const end = ui.indexOf("async function declineIncoming", start);
  const fn = ui.slice(start, end);
  assert.ok(fn.indexOf('api("complete_accept"') > -1);
  assert.ok(fn.indexOf("Core.applyIncomingTransfer") > -1);
  assert.ok(fn.indexOf('api("complete_accept"') < fn.indexOf("Core.applyIncomingTransfer"));
  assert.ok(fn.indexOf("Core.applyIncomingTransfer") < fn.indexOf("persistState"));
});

test("E3 accepted transfers can finish a previously interrupted local import", () => {
  const ui = read("direct-transfer-v1.8.2.js");
  assert.match(ui, /data-hh-finish-transfer/);
  assert.match(ui, /Finish import/);
  assert.match(ui, /localHasTransferReceipt/);
  assert.match(ui, /accepted securely, but this device has not finished importing/i);
});

test("E3 server enforces expiry before preview, prepare or acceptance", () => {
  const edge = read("supabase/functions/animal-transfer/index.ts");
  assert.match(edge, /expireTransferIfDue/);
  assert.match(edge, /status:\s*"expired"/);
  assert.match(edge, /eventType[^\n]*expired|audit\([^\n]*"expired"/);
  assert.match(edge, /currentRow\.status === "accepted"/);
  assert.match(edge, /\.eq\("status", "pending"\)/);
});

test("E3 canonical audit accepts expiry without creating another receipt table", () => {
  const sql = read("supabase/stack-e3-ownership-transfer-integrity.sql");
  assert.match(sql, /herdharbor_direct_transfer_events/);
  assert.match(sql, /'expired'/);
  assert.doesNotMatch(sql, /create table/i);
});
