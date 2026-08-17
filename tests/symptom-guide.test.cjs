"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "symptom-guide.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "symptom-guide.js" });
const guide = context.window.HERDHARBOR_SYMPTOM_GUIDE;

assert.ok(guide, "the static symptom guide loads");
assert.match(guide.disclaimer, /not a veterinary provider/i);
assert.match(guide.disclaimer, /cannot diagnose, treat, or replace care/i);
assert.ok(guide.emergencyRedFlags.length >= 6, "emergency red flags remain prominent");
assert.ok(guide.entries.length >= 20, "the guide covers common and species-specific signs");

const builtInSpecies = ["Rabbit", "Chicken", "Duck", "Turkey", "Dog", "Horse", "Goat", "Sheep", "Cattle", "Pig", "Other"];
for (const species of builtInSpecies) {
  assert.ok(
    guide.entries.some((entry) => entry.species.includes("All") || entry.species.includes(species)),
    `${species} receives symptom guidance`
  );
}

const ids = new Set();
for (const entry of guide.entries) {
  assert.ok(entry.id && !ids.has(entry.id), `unique entry ID: ${entry.id}`);
  ids.add(entry.id);
  assert.ok(["Emergency now", "Contact a vet soon", "Monitor and call"].includes(entry.urgency));
  assert.ok(entry.signs.length > 0, `${entry.id} lists observable signs`);
  assert.ok(entry.concerns.length > 0, `${entry.id} lists possible concerns`);
  assert.match(entry.action, /veterinar|animal-health|animal poison/i, `${entry.id} directs users to qualified help`);
  assert.match(entry.source.url, /^https:\/\//);
  assert.ok(entry.source.label.length > 0);
}

assert.doesNotMatch(source, /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml)\s*\/\s*kg\b/i, "the guide contains no dosing instructions");
assert.doesNotMatch(source, /\bdiagnose[sd]? as\b/i, "the guide does not assign a diagnosis");
assert.doesNotMatch(source, /\bfetch\s*\(/, "symptom searches do not call a remote service");

assert.match(html, /data-route="symptoms"/);
assert.match(html, /id="view-symptoms"/);
assert.match(html, /symptoms: renderSymptoms/);
assert.match(html, /id="health-symptom-search"/);
assert.match(html, /id="symptom-animal"/);
assert.match(html, /id="symptom-species"/);
assert.match(html, /id="symptom-search"/);
assert.match(html, /id="symptom-urgency"/);
assert.match(html, /Possible concerns — not a diagnosis/);
assert.match(html, /HerdHarbor is not a veterinary provider/);
assert.match(html, /data-log-symptom/);
assert.match(html, /type: "Observation"/);
assert.match(html, /symptomView\.species = animal\?\.species/);
assert.match(html, /symptom-guide\.js\?v=1/);
assert.match(worker, /symptom-guide\.js\?v=1/);

console.log("Alpha v1.2.0 symptom guide safety and coverage tests passed");
