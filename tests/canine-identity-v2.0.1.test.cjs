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
