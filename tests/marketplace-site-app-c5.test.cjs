"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Adapter = require("../marketplace-pedigree-snapshot-v2.0.1.js");

function keysDeep(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    found.add(key);
    keysDeep(child, found);
  }
  return found;
}

test("C5A snapshot adapter delegates lineage to the canonical pedigree engine", () => {
  const source = read("marketplace-pedigree-snapshot-v2.0.1.js");
  assert.match(source, /require\("\.\/pedigree-engine-v2\.0\.0\.js"\)/);
  assert.match(source, /Engine\.buildGraph\(/);
  assert.doesNotMatch(source, /function\s+buildGraph|while\s*\(.*sire|while\s*\(.*dam/i);
});

test("C5A canonical snapshot strips private IDs and private animal fields", () => {
  const snapshot = Adapter.buildSnapshot({
    visibility: "3",
    subjectId: "subject-private-id",
    animals: [
      {
        id: "subject-private-id",
        name: "Subject",
        species: "Rabbit",
        breed: "Holland Lop",
        sex: "Female",
        dob: "2026-01-01",
        color: "Black",
        registrationNumber: "REG-1",
        breeder: "Bluegrass Rabbitry",
        notes: "PRIVATE NOTE",
        medical: { secret: true },
        photoData: "data:image/png;base64,PRIVATE",
        sireId: "sire-private-id",
        damId: "dam-private-id"
      },
      { id: "sire-private-id", name: "Sire", sex: "Male", sireId: "", damId: "", notes: "PRIVATE" },
      { id: "dam-private-id", name: "Dam", sex: "Female", sireId: "", damId: "", acquisition: "PRIVATE" }
    ]
  });

  assert.equal(snapshot.schema, "herdharbor-marketplace-pedigree-v1");
  assert.equal(snapshot.generations, 3);
  assert.equal(snapshot.nodes.length, 7);
  const keys = keysDeep(snapshot);
  for (const forbidden of [
    "id", "animalId", "referenceId", "identity", "path", "issues",
    "notes", "medical", "acquisition", "photoData", "email", "phone", "user_id"
  ]) assert.equal(keys.has(forbidden), false, forbidden);

  const text = JSON.stringify(snapshot);
  assert.doesNotMatch(text, /subject-private-id|sire-private-id|dam-private-id|PRIVATE NOTE|base64,PRIVATE/);
  assert.match(text, /Bluegrass Rabbitry/);
  assert.match(text, /REG-1/);
});

test("C5A visibility uses canonical generation depths and hidden returns no snapshot", () => {
  const animals = [{ id: "subject", name: "Subject", sireId: "", damId: "" }];
  assert.equal(Adapter.buildSnapshot({ visibility: "hidden", subjectId: "subject", animals }), null);
  assert.equal(Adapter.buildSnapshot({ visibility: "parents", subjectId: "subject", animals }).nodes.length, 3);
  assert.equal(Adapter.buildSnapshot({ visibility: "3", subjectId: "subject", animals }).nodes.length, 7);
  assert.equal(Adapter.buildSnapshot({ visibility: "4", subjectId: "subject", animals }).nodes.length, 15);
  assert.equal(Adapter.buildSnapshot({ visibility: "5", subjectId: "subject", animals }).nodes.length, 31);
});

test("C5A repeated ancestors preserve canonical slot semantics without exposing identity IDs", () => {
  const snapshot = Adapter.buildSnapshot({
    visibility: "3",
    subjectId: "subject",
    animals: [
      { id: "subject", name: "Subject", sireId: "sire", damId: "dam" },
      { id: "sire", name: "Sire", sireId: "shared", damId: "" },
      { id: "dam", name: "Dam", sireId: "shared", damId: "" },
      { id: "shared", name: "Shared", sireId: "", damId: "" }
    ]
  });
  const repeated = snapshot.nodes.find((node) => node.status === "repeat");
  assert.ok(repeated);
  assert.equal(repeated.repeatOf, "sireSire");
  assert.equal(Object.prototype.hasOwnProperty.call(repeated, "animalId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(repeated, "identity"), false);
});

test("C5A SQL is Owner-only, fail-closed on normalized authority, and allowlists snapshot fields", () => {
  const sql = read("supabase/stack-c5a-marketplace-pedigree.sql");
  assert.match(sql, /marketplace_owner_pedigree_source/);
  assert.match(sql, /marketplace_owner_set_pedigree_snapshot/);
  assert.match(sql, /marketplace_owner_listing_pedigree_preview/);
  assert.match(sql, /herdharbor_account_role\(\) <> 'owner'/);
  assert.match(sql, /authority_stage[\s\S]*?= 'normalized'/);
  assert.match(sql, /Marketplace pedigree source requires a normalized-authority bridge upgrade/);
  assert.match(sql, /key not in \('schema','engineVersion','visibility','generations','nodes'\)/);
  assert.match(sql, /key not in \('name','prefix','sex','dob','breed','color','registrationNumber'\)/);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
});

test("C5A snapshot reset prevents stale deeper pedigree after source or visibility change", () => {
  const sql = read("supabase/stack-c5a-marketplace-pedigree.sql");
  assert.match(sql, /old\.source_animal_id is distinct from new\.source_animal_id/);
  assert.match(sql, /old\.pedigree_visibility is distinct from new\.pedigree_visibility/);
  assert.match(sql, /new\.public_pedigree := null/);
  assert.match(sql, /new\.pedigree_depth := 0/);
});

test("C5/C7 Edge Function keeps the canonical engine while account ownership supplies authorization", () => {
  const source = read("supabase/functions/marketplace-pedigree-snapshot/index.ts");
  assert.match(source, /import "\.\.\/\.\.\/\.\.\/pedigree-engine-v2\.0\.0\.js"/);
  assert.match(source, /import "\.\.\/\.\.\/\.\.\/marketplace-pedigree-snapshot-v2\.0\.1\.js"/);
  assert.match(source, /marketplace_member_session/);
  assert.match(source, /marketplace_member_pedigree_source/);
  assert.match(source, /marketplace_member_set_pedigree_snapshot/);
  assert.doesNotMatch(source, /function\s+buildGraph|source\.animals.*sireId|source\.animals.*damId/s);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("C5A Edge Function compiles as TypeScript and has bounded origin/auth input", () => {
  const source = read("supabase/functions/marketplace-pedigree-snapshot/index.ts");
  const result = esbuild.transformSync(source, { loader: "ts", target: "es2022", format: "esm" });
  assert.match(result.code, /herdharbor\.com/);
  assert.match(source, /validUuid/);
  assert.match(source, /client\.auth\.getUser\(token\)/);
  assert.match(source, /origin_not_allowed/);
});

test("C5A pedigree adapter is not loaded during normal app startup or precached", () => {
  const index = read("index.html");
  const sw = read("service-worker.js");
  assert.doesNotMatch(index, /marketplace-pedigree-snapshot-v2\.0\.1\.js/);
  assert.doesNotMatch(sw, /marketplace-pedigree-snapshot-v2\.0\.1\.js/);
});
