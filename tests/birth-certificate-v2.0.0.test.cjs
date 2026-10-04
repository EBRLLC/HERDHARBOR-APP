"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Birth = require("../birth-certificate-v2.0.0.js");
const Exporter = require("../document-export-v2.0.0.js");

function animal() {
  return {
    id: "a1",
    name: "A Very Long Rabbit Name That Must Remain Readable",
    species: "Rabbit",
    sex: "Female",
    dob: "2026-08-01",
    breed: "Holland Lop",
    color: "Broken Black",
    tattoo: "A1",
    birthWeight: "2",
    birthWeightUnit: "oz",
    currentWeight: "3.5",
    currentWeightUnit: "lb",
    breeder: "Bluegrass Rabbitry",
    photoData: "data:image/png;base64,AAAA",
    sireId: "sire",
    damId: "dam"
  };
}

test("birth certificate exposes every A6 configurable field", () => {
  assert.deepEqual(Birth.FIELD_ORDER, [
    "photo", "dob", "sex", "breed", "color", "identity", "birthWeight",
    "currentWeight", "sire", "dam", "breeder", "newOwner", "goHomeDate",
    "breederNote", "signature"
  ]);
});

test("certificate renders selected animal, parent, owner, weight, branding, note and signature fields", () => {
  const html = Birth.certificateBodyHtml({
    animal: animal(),
    sire: { name: "Sire Rabbit" },
    dam: { name: "Dam Rabbit" },
    branding: {
      rabbitryName: "Bluegrass Rabbitry",
      rabbitryText: "Raised with care",
      logoData: "data:image/png;base64,LOGO",
      website: "https://example.test",
      social: "@bluegrass",
      contact: { email: "", phone: "", address: "" }
    },
    options: {
      newOwner: "Jane Buyer",
      goHomeDate: "2026-10-12",
      breederNote: "Welcome home.",
      signatureLabel: "Breeder signature"
    },
    formatDate: (value) => value
  });

  for (const value of [
    "A Very Long Rabbit Name That Must Remain Readable", "2026-08-01",
    "Female", "Holland Lop", "Broken Black", "A1", "2 oz", "3.5 lb",
    "Sire Rabbit", "Dam Rabbit", "Bluegrass Rabbitry", "Jane Buyer",
    "2026-10-12", "Welcome home.", "Breeder signature", "https://example.test", "@bluegrass"
  ]) assert.ok(html.includes(value), value);
  assert.match(html, /hh-birth-photo/);
});

test("missing optional data never breaks the certificate", () => {
  const html = Birth.certificateBodyHtml({
    animal: { id: "a", name: "Solo", sireId: "", damId: "" },
    options: {},
    branding: {}
  });
  assert.match(html, /Solo/);
  assert.match(html, /Sire/);
  assert.match(html, /Dam/);
  assert.match(html, /—/);
});

test("private contact is absent unless A4 branding explicitly supplies it", () => {
  const html = Birth.certificateBodyHtml({
    animal: animal(),
    branding: {
      rabbitryName: "Rabbitry",
      contact: { email: "", phone: "", address: "" }
    }
  });
  assert.doesNotMatch(html, /private@example\.com|555-0000|Private Address/);
});

test("public reference architecture is inert by default and renders only when explicitly enabled", () => {
  const off = Birth.certificateBodyHtml({
    animal: animal(),
    options: { publicReference: { enabled: false, url: "https://public.test/a1" } }
  });
  assert.doesNotMatch(off, /data-public-reference-url/);

  const on = Birth.certificateBodyHtml({
    animal: animal(),
    options: { publicReference: { enabled: true, url: "https://public.test/a1", label: "Verify record" } }
  });
  assert.match(on, /data-public-reference-url="https:\/\/public\.test\/a1"/);
  assert.match(on, /Verify record/);
});

test("birth certificate uses the shared A5 document exporter for preview print and PDF layout", () => {
  const html = Birth.buildCertificateHtml({
    animal: animal(),
    sire: { name: "Sire" },
    dam: { name: "Dam" },
    exporter: Exporter,
    generatedLabel: "Generated 2026-10-03"
  });
  assert.match(html, /@page \{ size: letter portrait; margin: \.4in; \}/);
  assert.match(html, /data-hh-birth-certificate/);
  assert.match(html, /Print \/ Save PDF/);
  assert.match(html, /Generated 2026-10-03/);
});

test("controls warn that account contact is not automatically inserted", () => {
  const html = Birth.controlsHtml({});
  assert.match(html, /Email, phone, and exact address are not added here/);
  assert.match(html, /name="newOwner"/);
  assert.match(html, /name="goHomeDate"/);
  assert.match(html, /name="breederNote"/);
});


test("A6 shell loads/caches Birth Certificate after shared exporter", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const exporterIndex = html.indexOf("document-export-v2.0.0.js?v=1");
  const birthIndex = html.indexOf("birth-certificate-v2.0.0.js?v=1");
  assert.ok(exporterIndex >= 0 && birthIndex > exporterIndex);
  assert.match(html, /birth-certificate-v2\.0\.0\.css\?v=1/);
  assert.match(worker, /\.\/birth-certificate-v2\.0\.0\.css\?v=1/);
  assert.match(worker, /\.\/birth-certificate-v2\.0\.0\.js\?v=1/);
  assert.match(worker, /"\/birth-certificate-v2\.0\.0\.js"/);
});

test("application workflow previews through an iframe and prints the same shared-export HTML", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const app = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
  assert.match(app, /function birthCertificateHtml\(animalId, options = \{\}\)/);
  assert.match(app, /birthCertificate\.buildCertificateHtml\(/);
  assert.match(app, /id="birth-certificate-preview"/);
  assert.match(app, /exporter\.loadFrame\(frame, html\)/);
  assert.match(app, /exporter\.printFrame\(frame\)/);
  assert.match(app, /openAnimalBirthCertificate/);
  assert.doesNotMatch(app, /Birth Certificate[\s\S]{0,1000}state\.profile\?\.email/);
});


test("current weight supports pounds plus ounces and app workflow sources latest health weight", () => {
  assert.equal(Birth.currentWeightText({
    currentWeight: "3",
    currentWeightUnit: "lb+oz",
    currentWeightOunces: "6"
  }), "3 lb 6 oz");

  const fs = require("node:fs");
  const path = require("node:path");
  const app = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
  assert.match(app, /const latestWeight = \(state\.health \|\| \[\]\)/);
  assert.match(app, /currentWeight: latestWeight\.weight/);
  assert.match(app, /currentWeightUnit: latestWeight\.weightUnit \|\| "lb"/);
});
