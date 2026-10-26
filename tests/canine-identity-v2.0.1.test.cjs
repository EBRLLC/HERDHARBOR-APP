"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const breeds = require("../canine-breeds-v2.0.1.js");
const canine = require("../canine-identity-v2.0.1.js");

test("AKC catalog has 205 unique sourced breed IDs without umbrella/duplicate entries", () => {
  const rows = breeds.list();
  assert.equal(rows.length, 205);
  assert.equal(new Set(rows.map(r=>r.id)).size, 205);
  assert.equal(breeds.SOURCE.sourceUpdated, "2026-01-01");
  assert.ok(rows.every(r=>r.recognized && r.registry==="AKC"));
  assert.equal(rows.filter(r => r.name === "Bracco Italiano").length, 1);
  assert.equal(rows.filter(r => r.name === "Fox Terrier").length, 0);
  assert.deepEqual(breeds.resolve("Retriever (Golden)")?.name, "Golden Retriever");
  assert.equal(breeds.resolve("Toy Manchester Terrier")?.name, "Manchester Terrier");
});
test("catalog searches aliases while unlisted/mixed dogs remain user-defined", () => {
  assert.equal(breeds.search("labrador").length, 1);
  assert.equal(breeds.search("Labrador")[0].name, "Labrador Retriever");
  assert.equal(breeds.classify("Golden Retriever").status, "recognized");
  assert.equal(breeds.classify("Goldendoodle").status, "user-entered");
  assert.equal(breeds.classify("Mixed Breed").status, "user-entered");
});
test("structured registrations retain distinct registry/number pairs without any verification claim", () => {
  const input = {callName:"Rex", registeredName:"Meadow's Example", registrations:[
    {registry:"AKC",number:"AB123456",status:"Registered",verification:"verified"},
    {registry:"UKC",number:"0021",source:"Owner"}
  ],titles:[{organization:"AKC",abbreviation:"CH",placement:"prefix",displayOrder:1},
           {organization:"AKC",abbreviation:"CGC",placement:"suffix",displayOrder:0}]};
  const result=canine.validate(input);
  assert.equal(result.valid,true,result.errors.join("; "));
  assert.equal(result.value.registrations.length,2);
  assert.ok(result.value.registrations.every(r=>r.verification==="unverified"));
  assert.equal(canine.displayName({name:"Rex",species:"Dog",canine:result.value}),"CH Meadow's Example CGC");
  assert.equal(canine.preferredRegistration({canine:result.value}).registry,"AKC");
  assert.equal(result.value.callName,"Rex");
});
test("invalid/duplicate registries and unissued title entries cannot be accepted", () => {
  const result=canine.validate({registrations:[{registry:"AKC",number:"1"},{registry:" akc ",number:"1"},
    {registry:"",number:"2"}],titles:[{abbreviation:"CH",organization:""}]});
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(s=>s.includes("Duplicate")));
  assert.ok(result.errors.some(s=>s.includes("requires both")));
  assert.ok(result.errors.some(s=>s.includes("organization")));
});
test("Dog editor HTML escapes text and remains hidden for rabbits",()=>{
  assert.match(canine.editorHtml({species:"Rabbit",canine:{registeredName:'<img src=x>'}}),/ hidden/);
  assert.doesNotMatch(canine.editorHtml({species:"Rabbit"}),/data-canine-panel[^>]*>[^]*<script>/);
  assert.match(canine.editorHtml({species:"Dog",canine:{registeredName:'<img src=x>'}}),/&lt;img/);
  assert.equal(canine.isDog("Rabbit"),false);
});
test("existing animal form remains canonical dog metadata save authority",()=>{
  const root=path.join(__dirname,"..");
  const runtime=fs.readFileSync(path.join(root,"animal-profile-runtime-v1.8.3.js"),"utf8");
  const shell=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.match(runtime,/data\.canine = checked\.value/);
  assert.match(runtime,/canineIdentity\.readEditor\(form, animal\.canine\)/);
  assert.match(runtime,/deps\.saveState\("Animal updated\."\)/);
  assert.match(runtime,/deps\.saveState\("Animal added\."\)/);
  assert.match(shell,/canine-breeds-v2\.0\.1\.js/);
  assert.match(shell,/canine-identity-v2\.0\.1\.js/);
});

test("dog breed picker renders visible catalog selection with an editable custom-breed fallback", () => {
  const dog = breeds.pickerHtml("Dog", "Great Pyrenees");
  assert.match(dog, /data-hh-dog-breed-select/);
  assert.match(dog, /Browse dog breeds \(AKC recognized\)/);
  assert.match(dog, /<option value="Great Pyrenees" selected>/);
  assert.match(dog, /<option value="Golden Retriever">/);
  assert.match(dog, /Other \/ mixed breed \/ not listed/);
  assert.doesNotMatch(dog, /data-hh-dog-breed-picker[^>]*hidden/);
  assert.match(breeds.pickerHtml("Rabbit", "Holland Lop"), /data-hh-dog-breed-picker[^>]*hidden/);
  assert.match(breeds.pickerHtml("Dog", "Goldendoodle"), /__hh_custom_dog_breed__" selected/);
  assert.equal((dog.match(/<option value="/g) || []).length, 207);
});

test("dog breed picker updates canonical Breed input, preserves user-entered crosses and never changes rabbits", () => {
  const picker = { hidden: false, classList: { toggle(label, hidden) {
    assert.equal(label, "hidden"); this.hiddenClass = hidden;
  } } };
  const breedInput = { value: "Holland Lop", focus() { this.focused = true; }, listeners: {}, addEventListener(event, cb) { this.listeners[event] = cb; } };
  const selector = { value: "", disabled: false, listeners: {}, addEventListener(event, cb) { this.listeners[event] = cb; } };
  const species = { value: "Rabbit", listeners: {}, addEventListener(event, cb) { this.listeners[event] = cb; } };
  const elements = { '[data-hh-dog-breed-picker]': picker,
    '[data-hh-dog-breed-select]': selector, 'input[name="breed"]': breedInput };
  const form = { querySelector(query) { return elements[query] || null; } };
  assert.equal(breeds.bindPicker(form, species), true);
  assert.equal(picker.hidden, true);
  assert.equal(selector.disabled, true);
  assert.equal(breedInput.value, "Holland Lop");

  species.value = "Dog"; species.listeners.change();
  assert.equal(picker.hidden, false);
  assert.equal(selector.disabled, false);
  assert.equal(breedInput.value, "", "rabbit breed must not transfer to dog");
  selector.value = "Great Pyrenees"; selector.listeners.change();
  assert.equal(breedInput.value, "Great Pyrenees", "selection writes canonical animal.breed");
  selector.value = "__hh_custom_dog_breed__"; selector.listeners.change();
  assert.equal(breedInput.value, "", "explicitly selecting Other clears old recognized breed");
  breedInput.value = "Goldendoodle"; breedInput.listeners.input();
  assert.equal(selector.value, "__hh_custom_dog_breed__", "crossbred dogs remain editable");
  selector.listeners.change();
  assert.equal(breedInput.value, "Goldendoodle");
  assert.equal(breedInput.focused, true);
  species.value = "Rabbit"; species.listeners.change();
  assert.equal(picker.hidden, true);
  assert.equal(selector.disabled, true);
  assert.equal(breedInput.value, "", "dog breed must not transfer to rabbit");
});

test("shared canonical animal editor wires the native canine picker without replacing breed persistence", () => {
  const root = path.join(__dirname, "..");
  const profile = fs.readFileSync(path.join(root, "animal-profile-runtime-v1.8.3.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
  assert.match(profile, /HerdHarborCanineBreeds\?\.pickerHtml\?\./);
  assert.match(profile, /HerdHarborCanineBreeds\?\.bindPicker\?\./);
  assert.match(main, /HerdHarborCanineBreeds\?\.list\?\.\(\)/);
  assert.match(profile, /const data = Object\.fromEntries\(new FormData\(form\)\)/);
  assert.match(profile, /deps\.saveState\("Animal added\."\)/);
});


test("breed-specific AKC color choices never leak rabbit terminology or another dog's colors", () => {
  assert.deepEqual(breeds.coatColorChoices("Labrador Retriever"), ["Black", "Chocolate", "Yellow"]);
  assert.deepEqual(breeds.coatColorChoices("Golden Retriever"), ["Dark Golden", "Golden", "Light Golden"]);
  assert.deepEqual(breeds.coatColorChoices("Great Pyrenees"), ["White"]);
  assert.deepEqual(breeds.coatColorChoices("Australian Shepherd"), ["Black", "Blue Merle", "Red", "Red Merle"]);
  assert.deepEqual(breeds.coatColorChoices("Rottweiler"), ["Black & Rust", "Black & Mahogany", "Black & Tan"]);
  assert.deepEqual(breeds.coatColorChoices("Lab"), ["Black", "Chocolate", "Yellow"]);
  assert.deepEqual(breeds.coatColorChoices("Goldendoodle"), []);
  assert.deepEqual(breeds.coatColorChoices("Holland Lop"), []);
  assert.deepEqual(breeds.coatColorChoices("Danish-Swedish Farmdog"), [], "unreviewed AKC breed must not borrow generic colors");
  assert.ok(!breeds.coatColorChoices("Golden Retriever").includes("Chocolate"));
  assert.ok(!breeds.coatColorChoices("Great Pyrenees").includes("Blue Merle"));
});

test("canine color form renders species-specific choices; rabbits use the unchanged canonical field", () => {
  const lab = breeds.coatColorHtml("Dog", "Labrador Retriever", "Chocolate");
  assert.match(lab, /data-hh-canine-coat-panel/);
  assert.match(lab, /<option value="Chocolate" selected>/);
  assert.doesNotMatch(lab, /<option value="Golden">/);
  assert.doesNotMatch(lab, /<option value="Otter">/);
  assert.doesNotMatch(lab, /data-hh-canine-coat-panel[^>]*hidden/);
  assert.match(breeds.coatColorHtml("Rabbit", "Holland Lop", "Blue"), /data-hh-canine-coat-panel[^>]*hidden/);
  assert.match(breeds.coatColorHtml("Dog", "Goldendoodle", "Blue merle & tan"), /data-hh-canine-coat-custom[^>]*Blue merle &amp; tan/);
});

test("canine color input saves through existing Animal.color and clears stale colors on breed change", () => {
  const listeners = () => ({ listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } });
  const cl = () => ({ toggle() {} });
  const canonicalRow = { hidden: false, classList: cl() };
  const panel = { hidden: true, classList: cl() };
  const customRow = { hidden: true, classList: cl() };
  const canonical = { value: "Chocolate", closest() { return canonicalRow; } };
  const breed = { ...listeners(), value: "Labrador Retriever" };
  const species = { ...listeners(), value: "Dog" };
  const picker = { ...listeners() };
  const select = { ...listeners(), disabled: false, value: "", innerHTML: "" };
  const manual = { ...listeners(), value: "", focus() { this.focused = true; } };
  const note = { textContent: "" };
  const nodes = {
    '[data-hh-canine-coat-panel]': panel,
    '[data-hh-canine-coat-select]': select,
    '[data-hh-canine-coat-custom-row]': customRow,
    '[data-hh-canine-coat-custom]': manual,
    '[data-hh-canine-coat-note]': note,
    'input[name="color"]': canonical,
    'input[name="breed"]': breed,
    '[data-hh-dog-breed-select]': picker
  };
  assert.equal(breeds.bindCoatColor({ querySelector(query) { return nodes[query] || null; } }, species), true);
  assert.equal(canonical.value, "Chocolate", "edit must preserve saved dog color");
  assert.equal(select.value, "Chocolate");
  assert.equal(canonicalRow.hidden, true, "dog must not show rabbit / generic color field");
  assert.equal(panel.hidden, false);
  assert.equal(select.innerHTML.includes('value="Yellow"'), true);
  assert.equal(select.innerHTML.includes('value="Golden"'), false);

  breed.value = "Golden Retriever";
  picker.listeners.change();
  assert.equal(canonical.value, "", "breed change must not persist invalid Labrador color");
  assert.equal(select.value, "");
  assert.ok(select.innerHTML.includes('value="Light Golden"'));
  assert.ok(!select.innerHTML.includes('value="Chocolate"'));

  select.value = "Golden"; select.listeners.change();
  assert.equal(canonical.value, "Golden", "selected dog color saves to original Animal.color input");
  select.value = "__hh_other_canine_color__"; select.listeners.change();
  assert.equal(canonical.value, "", "custom choice must clear previous recognized color");
  assert.equal(customRow.hidden, false);
  manual.value = "Observed unusual coat"; manual.listeners.input();
  assert.equal(canonical.value, "Observed unusual coat");

  breed.value = "Goldendoodle"; breed.listeners.input();
  assert.equal(canonical.value, "", "changing to mixed breed must not retain purebred color");
  assert.equal(select.disabled, true);
  assert.equal(customRow.hidden, false);
  manual.value = "Blue merle & tan"; manual.listeners.input();
  assert.equal(canonical.value, "Blue merle & tan");

  species.value = "Rabbit"; species.listeners.change();
  assert.equal(canonicalRow.hidden, false);
  assert.equal(panel.hidden, true);
  assert.equal(select.disabled, true);
  assert.equal(canonical.value, "");
});

test("canine color selectors are unpersisted UI only and every persisted value stays canonical", () => {
  const source = fs.readFileSync(path.join(__dirname, "../animal-profile-runtime-v1.8.3.js"), "utf8");
  assert.match(source, /HerdHarborCanineBreeds\?\.coatColorHtml\?\./);
  assert.match(source, /HerdHarborCanineBreeds\?\.bindCoatColor\?\./);
  assert.match(source, /const data = Object\.fromEntries\(new FormData\(form\)\)/);
  const html = breeds.coatColorHtml("Dog", "Labrador Retriever");
  assert.doesNotMatch(html, /name="color"/, "UI widgets must not shadow canonical Animal.color");
  assert.ok(breeds.AKC_COAT_SOURCES["Golden Retriever"].startsWith("https://www.akc.org/dog-breeds/"));
});
