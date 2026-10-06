"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const sqlDir = path.join(root, "supabase");
const functionsDir = path.join(sqlDir, "functions");

test("E5 preserves one canonical ownership-transfer lifecycle table", () => {
  const creators = fs.readdirSync(sqlDir)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => /create\s+table\s+if\s+not\s+exists\s+public\.herdharbor_direct_animal_transfers/i.test(read(path.join("supabase", name))));
  assert.deepEqual(creators, ["v1.8.2-direct-animal-transfers.sql"]);

  for (const file of [
    "supabase/stack-e1-ownership-transfer-contract.sql",
    "supabase/stack-e2-ownership-transfer-marketplace-link.sql",
    "supabase/stack-e3-ownership-transfer-integrity.sql"
  ]) {
    assert.match(read(file), /alter table public\.herdharbor_direct_/i);
    assert.doesNotMatch(read(file), /create\s+table\s+[^;]*transfer/i);
  }
});

test("E5 keeps animal-transfer as the only transfer lifecycle Edge Function", () => {
  const transferFunctionDirs = fs.readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /transfer/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(transferFunctionDirs, ["animal-transfer"]);
  const edge = read("supabase/functions/animal-transfer/index.ts");
  assert.match(edge, /authoritativeTransferAnimals/);
  assert.match(edge, /resolveMarketplaceListing/);
  assert.match(edge, /complete_accept/);
  assert.match(edge, /expireTransferIfDue/);
});

test("E5 seller authorization and buyer acceptance remain server-side", () => {
  const edge = read("supabase/functions/animal-transfer/index.ts");
  const e1 = read("supabase/stack-e1-ownership-transfer-contract.sql");

  assert.match(edge, /herdharbor_direct_transfer_owned_animals/);
  assert.match(edge, /sender_id:\s*user\.id/);
  assert.match(edge, /recipient_id:\s*recipient\.recipient_id/);
  assert.match(edge, /\.eq\("recipient_id", user\.id\)/);
  assert.match(edge, /\.eq\("sender_id", user\.id\)/);
  assert.match(edge, /\.eq\("status", "pending"\)/);
  assert.match(e1, /service-role-only authoritative herd snapshot/i);
});

test("E5 Marketplace linkage reuses the canonical transfer row and excludes messages", () => {
  const edge = read("supabase/functions/animal-transfer/index.ts");
  const e2 = read("supabase/stack-e2-ownership-transfer-marketplace-link.sql");

  assert.match(e2, /alter table public\.herdharbor_direct_animal_transfers/);
  assert.match(e2, /marketplace_listing_id/);
  assert.match(e2, /status in \('pending','accepted'\)/);
  assert.match(edge, /marketplace_listing_id/);
  assert.doesNotMatch(edge, /from\(["']marketplace_messages["']\)|from\(["']marketplace_conversations["']\)/);
});

test("E5 transfer payload remains an explicit privacy allowlist", () => {
  const core = read("direct-transfer-core-v1.8.2.js");
  assert.match(core, /DEFAULT_TRANSFER_CATEGORIES/);
  assert.match(core, /identity:\s*true/);
  assert.match(core, /pedigree:\s*true/);
  assert.match(core, /genetics:/);
  assert.match(core, /ownershipHistory:/);

  const forbidden = [
    "medicalNotes",
    "healthNotes",
    "billing",
    "subscription",
    "marketplaceMessages",
    "customerNotes",
    "privateNotes"
  ];
  const transferableStart = core.indexOf("function transferableAnimal");
  const transferableEnd = core.indexOf("function transferAnimalsForSale", transferableStart);
  const transferable = core.slice(transferableStart, transferableEnd);
  for (const field of forbidden) assert.doesNotMatch(transferable, new RegExp(field, "i"));
});

test("E5 acceptance remains idempotent across server and client recovery paths", () => {
  const edge = read("supabase/functions/animal-transfer/index.ts");
  const ui = read("direct-transfer-v1.8.2.js");
  const core = read("direct-transfer-core-v1.8.2.js");

  assert.match(edge, /currentRow\.status === "accepted"/);
  assert.match(edge, /existing:\s*true/);
  assert.match(edge, /\.eq\("status", "pending"\)/);
  assert.match(ui, /Finish import/);
  assert.match(ui, /localHasTransferReceipt/);
  assert.match(core, /alreadyImported:\s*true/);
  assert.match(core, /stableKey\(transferId\)/);
});

test("E5 uses canonical pedigree and document engines for New Owner Package", () => {
  const packageSource = read("new-owner-package-v2.0.0.js");
  assert.match(packageSource, /pedigree-engine-v2\.0\.0\.js/);
  assert.match(packageSource, /pedigree-renderer-v2\.0\.0\.js/);
  assert.match(packageSource, /birth-certificate-v2\.0\.0\.js/);
  assert.match(packageSource, /document-export-v2\.0\.0\.js/);
  assert.match(packageSource, /Engine\.buildGraph/);
  assert.match(packageSource, /Renderer\.render/);
  assert.match(packageSource, /BirthCertificate\.certificateBodyHtml/);
  assert.match(packageSource, /Exporter\.buildDocumentHtml/);
  assert.doesNotMatch(packageSource, /jsPDF|pdfmake|PDFDocument|window\.print/);
});

test("E5 stack acceptance artifacts and tests are present", () => {
  for (const file of [
    "STACK-E-DUPLICATE-ENGINE-AUDIT.md",
    "tests/stack-e1-ownership-transfer-contract.test.cjs",
    "tests/stack-e2-seller-marketplace-handoff.test.cjs",
    "tests/stack-e3-buyer-acceptance-integrity.test.cjs",
    "tests/stack-e4-new-owner-package.test.cjs",
    "supabase/stack-e1-ownership-transfer-contract.sql",
    "supabase/stack-e2-ownership-transfer-marketplace-link.sql",
    "supabase/stack-e3-ownership-transfer-integrity.sql"
  ]) assert.ok(exists(file), "missing Stack E artifact: " + file);
});
