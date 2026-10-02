"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const pedigree = require("../herdharbor-pedigree-platform.js");

test("saved template helpers preserve reusable pedigree configuration", () => {
  const settings = pedigree.upsertSavedTemplate({}, {
    id:"sales",
    name:"Sales Pedigree",
    config:{ templateId:"buyer", generations:3 },
    branding:{ rabbitryName:"Hill Farm", website:"example.invalid" }
  });
  assert.equal(settings.pedigreeTemplates.length, 1);
  assert.equal(settings.pedigreeTemplates[0].config.generations, 3);
  assert.equal(settings.pedigreeTemplates[0].branding.rabbitryName, "Hill Farm");
  assert.equal(pedigree.removeSavedTemplate(settings, "sales").pedigreeTemplates.length, 0);
});

test("private branding contact data is opt-in", () => {
  const off = pedigree.sanitizeBranding({ email:"owner", phone:"number" }, "private");
  assert.equal(off.email, "");
  assert.equal(off.phone, "");
  const on = pedigree.sanitizeBranding({ email:"owner", phone:"number", includeEmail:true, includePhone:true }, "private");
  assert.equal(on.email, "owner");
  assert.equal(on.phone, "number");
});

test("public preview strips contact fields even when a private template enabled them", () => {
  const preview = pedigree.publicPreviewTemplate({
    id:"private-template",
    config:{ generations:4 },
    branding:{ rabbitryName:"Hill Farm", email:"owner", phone:"number", includeEmail:true, includePhone:true }
  });
  assert.equal(preview.mode, "publicMarketplace");
  assert.equal(preview.branding.email, "");
  assert.equal(preview.branding.phone, "");
  assert.equal(preview.branding.includeEmail, false);
  assert.equal(preview.branding.includePhone, false);
});

test("documented reusable template examples remain available", () => {
  assert.deepEqual(pedigree.SAVED_TEMPLATE_EXAMPLES, [
    "Sales Pedigree","Show Pedigree","Pet Buyer Pedigree","Full Breeding Pedigree"
  ]);
});
