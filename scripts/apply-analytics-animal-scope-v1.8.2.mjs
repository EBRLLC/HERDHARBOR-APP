import fs from "node:fs";

const analyticsPath = "analytics-v1.6.1.js";
let source = fs.readFileSync(analyticsPath, "utf8");

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing expected analytics source for ${label}`);
  source = source.replace(from, to);
}

replaceRequired(
  '    growthMode: "date", agePreset: "all", ageStart: "", ageEnd: "", animalIds: [],',
  '    growthMode: "date", agePreset: "all", ageStart: "", ageEnd: "", animalIds: [], growthAnimalScope: "active",',
  "growth scope state"
);

replaceRequired(
  '    const active = array("animals").filter((record) => !["Sold", "Deceased", "Archived", "Ancestor Only"].includes(record.status) && (!ui.species || record.species === ui.species));',
  '    const active = array("animals").filter((record) => isCurrentAnalyticsAnimal(record) && (!ui.species || record.species === ui.species));',
  "overview current-animal filter"
);

const oldSelected = `  function selectedAnimals() {\n    const available = array("animals").filter((record) => !ui.species || record.species === ui.species);\n    ui.animalIds = ui.animalIds.filter((id) => available.some((record) => record.id === id));\n    if (!ui.animalIds.length) ui.animalIds = available.slice(0, 3).map((record) => record.id);\n    return available.filter((record) => ui.animalIds.includes(record.id));\n  }`;

const newSelected = `  const NON_CURRENT_ANALYTICS_STATUSES = new Set(["sold", "deceased", "archived", "ancestor only"]);\n  const normalizedAnimalStatus = (record = {}) => String(record.status || "").trim().toLowerCase();\n\n  function isCurrentAnalyticsAnimal(record = {}) {\n    return !NON_CURRENT_ANALYTICS_STATUSES.has(normalizedAnimalStatus(record));\n  }\n\n  function hasRecordedGrowthData(source = currentState(), animalId = "") {\n    const id = String(animalId || "");\n    if (!id) return false;\n    const animal = sourceArray(source, "animals").find((record) => String(record?.id || "") === id);\n    if (animal && birthWeightRow(animal)) return true;\n    return sourceArray(source, "health").some((record) => {\n      if (String(record?.animalId || "") !== id || !isoDate(record?.date)) return false;\n      return normalizeWeight(record?.weight, record?.weightUnit || "lb", record?.weightOunces) !== null;\n    });\n  }\n\n  function growthAnimalOptions(source = currentState(), options = {}) {\n    const species = options.species ?? ui.species;\n    const includeAncestors = options.includeAncestors ?? ui.growthAnimalScope === "active+ancestors";\n    const speciesAnimals = sourceArray(source, "animals").filter((record) => !species || record.species === species);\n    const active = speciesAnimals.filter(isCurrentAnalyticsAnimal);\n    const ancestors = speciesAnimals.filter((record) => normalizedAnimalStatus(record) === "ancestor only" && hasRecordedGrowthData(source, record.id));\n    return { active, ancestors, available: includeAncestors ? [...active, ...ancestors] : active };\n  }\n\n  function selectedAnimals() {\n    const available = growthAnimalOptions().available;\n    ui.animalIds = ui.animalIds.filter((id) => available.some((record) => record.id === id));\n    if (!ui.animalIds.length) ui.animalIds = available.slice(0, 3).map((record) => record.id);\n    return available.filter((record) => ui.animalIds.includes(record.id));\n  }`;
replaceRequired(oldSelected, newSelected, "growth animal eligibility helpers");

replaceRequired(
  '    const animals = selectedAnimals(), unit = preferredWeightUnit(), allRows = weightRows(currentState(), { range: "all" });',
  '    const scope = growthAnimalOptions(), animals = selectedAnimals(), animalChoices = scope.available, ancestorChoiceCount = scope.ancestors.length, unit = preferredWeightUnit(), allRows = weightRows(currentState(), { range: "all" });',
  "growth view scope"
);

const oldControls = '<label class="analytics-custom ${ui.growthMode === "age" && ui.agePreset === "custom" ? "" : "hidden"}">End age (days)<input data-growth-age-end type="number" min="0" value="${esc(ui.ageEnd)}"></label><fieldset><legend>Compare animals and choose stable colors</legend>${array("animals").filter((record) => !ui.species || record.species === ui.species).map((record, index) => `<label><input type="checkbox" data-growth-animal value="${esc(record.id)}" ${ui.animalIds.includes(record.id) ? "checked" : ""}>${seriesColorControl(`animal:${record.id}`, record.name || "Unnamed animal", index)}</label>`).join("")}</fieldset>';
const newControls = '<label class="analytics-custom ${ui.growthMode === "age" && ui.agePreset === "custom" ? "" : "hidden"}">End age (days)<input data-growth-age-end type="number" min="0" value="${esc(ui.ageEnd)}"></label><label>Animal records<select data-growth-animal-scope><option value="active" ${ui.growthAnimalScope === "active" ? "selected" : ""}>Active / current animals</option>${ancestorChoiceCount ? `<option value="active+ancestors" ${ui.growthAnimalScope === "active+ancestors" ? "selected" : ""}>Active + ancestors with growth data (${ancestorChoiceCount})</option>` : ""}</select></label><fieldset><legend>Compare animals and choose stable colors</legend>${animalChoices.map((record, index) => `<label><input type="checkbox" data-growth-animal value="${esc(record.id)}" ${ui.animalIds.includes(record.id) ? "checked" : ""}>${seriesColorControl(`animal:${record.id}`, normalizedAnimalStatus(record) === "ancestor only" ? `${record.name || "Unnamed animal"} · Ancestor` : (record.name || "Unnamed animal"), index)}</label>`).join("")}</fieldset>';
replaceRequired(oldControls, newControls, "growth animal selector UI");

replaceRequired(
  '    container.querySelector("[data-analytics-species]")?.addEventListener("change", (event) => { ui.species = event.target.value; ui.animalIds = []; invalidateMarket(); render(host); if (ui.tab === "market") loadMarketAggregate(); });',
  '    container.querySelector("[data-analytics-species]")?.addEventListener("change", (event) => { ui.species = event.target.value; ui.animalIds = []; ui.growthAnimalScope = "active"; invalidateMarket(); render(host); if (ui.tab === "market") loadMarketAggregate(); });',
  "species-change scope reset"
);

replaceRequired(
  '    container.querySelector("[data-growth-age-end]")?.addEventListener("change", (event) => { ui.ageEnd = event.target.value; render(host); });\n    container.querySelectorAll("[data-growth-animal]").forEach((input) => input.addEventListener("change", () => { ui.animalIds = [...container.querySelectorAll("[data-growth-animal]:checked")].map((item) => item.value); render(host); }));',
  '    container.querySelector("[data-growth-age-end]")?.addEventListener("change", (event) => { ui.ageEnd = event.target.value; render(host); });\n    container.querySelector("[data-growth-animal-scope]")?.addEventListener("change", (event) => { ui.growthAnimalScope = event.target.value; render(host); });\n    container.querySelectorAll("[data-growth-animal]").forEach((input) => input.addEventListener("change", () => { ui.animalIds = [...container.querySelectorAll("[data-growth-animal]:checked")].map((item) => item.value); render(host); }));',
  "growth scope event"
);

replaceRequired(
  '  function openAnimal(animalId) {\n    ui.tab = "growth";\n    ui.animalIds = animalId ? [animalId] : [];\n    ui.species = animalFor(currentState(), animalId)?.species || "";\n  }',
  '  function openAnimal(animalId) {\n    const subject = animalFor(currentState(), animalId);\n    ui.tab = "growth";\n    ui.animalIds = animalId ? [animalId] : [];\n    ui.species = subject?.species || "";\n    ui.growthAnimalScope = normalizedAnimalStatus(subject) === "ancestor only" && hasRecordedGrowthData(currentState(), animalId) ? "active+ancestors" : "active";\n  }',
  "ancestor-aware analytics deep link"
);

replaceRequired(
  '    milkAnalytics, feedAnalytics, healthAnalytics, metricAvailable, groupBy, groupByMonth,\n    colorFor, lineChart, barChart, openAnimal, render',
  '    milkAnalytics, feedAnalytics, healthAnalytics, metricAvailable, groupBy, groupByMonth,\n    isCurrentAnalyticsAnimal, hasRecordedGrowthData, growthAnimalOptions,\n    colorFor, lineChart, barChart, openAnimal, render',
  "analytics test exports"
);

fs.writeFileSync(analyticsPath, source);

const testPath = "tests/analytics-animal-scope-v1.8.2.test.cjs";
const testSource = `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst fs = require("node:fs");\nconst path = require("node:path");\nconst analytics = require("../analytics-v1.6.1.js");\n\nconst source = {\n  animals: [\n    { id: "active", name: "Active", species: "Rabbit", status: "Active" },\n    { id: "forsale", name: "For Sale", species: "Rabbit", status: "For Sale" },\n    { id: "reserved", name: "Reserved", species: "Rabbit", status: "Reserved" },\n    { id: "ancestor-birth", name: "Ancestor Birth", species: "Rabbit", status: "Ancestor Only", dob: "2024-01-01", birthWeight: 3, birthWeightUnit: "lb" },\n    { id: "ancestor-health", name: "Ancestor Health", species: "Rabbit", status: "Ancestor Only" },\n    { id: "ancestor-empty", name: "Ancestor Empty", species: "Rabbit", status: "Ancestor Only" },\n    { id: "sold", name: "Sold", species: "Rabbit", status: "Sold" },\n    { id: "deceased", name: "Deceased", species: "Rabbit", status: "Deceased" },\n    { id: "archived", name: "Archived", species: "Rabbit", status: "Archived" },\n    { id: "goat", name: "Goat", species: "Goat", status: "Active" }\n  ],\n  health: [\n    { id: "h1", animalId: "ancestor-health", date: "2025-01-01", weight: 5, weightUnit: "lb" },\n    { id: "h2", animalId: "ancestor-empty", date: "2025-01-01", weight: "", weightUnit: "lb" }\n  ]\n};\n\ntest("growth analytics defaults to current animals and excludes pedigree-only/history records", () => {\n  const result = analytics.growthAnimalOptions(source, { species: "Rabbit", includeAncestors: false });\n  assert.deepEqual(result.available.map((animal) => animal.id), ["active", "forsale", "reserved"]);\n  assert.deepEqual(result.ancestors.map((animal) => animal.id), ["ancestor-birth", "ancestor-health"]);\n});\n\ntest("ancestor growth option only exposes ancestors with real plottable weight data", () => {\n  const result = analytics.growthAnimalOptions(source, { species: "Rabbit", includeAncestors: true });\n  assert.deepEqual(result.available.map((animal) => animal.id), ["active", "forsale", "reserved", "ancestor-birth", "ancestor-health"]);\n  assert.equal(analytics.hasRecordedGrowthData(source, "ancestor-birth"), true);\n  assert.equal(analytics.hasRecordedGrowthData(source, "ancestor-health"), true);\n  assert.equal(analytics.hasRecordedGrowthData(source, "ancestor-empty"), false);\n});\n\ntest("growth animal eligibility respects species and current-record semantics", () => {\n  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Active" }), true);\n  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Reserved" }), true);\n  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Ancestor Only" }), false);\n  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Sold" }), false);\n  assert.deepEqual(analytics.growthAnimalOptions(source, { species: "Goat", includeAncestors: true }).available.map((animal) => animal.id), ["goat"]);\n});\n\ntest("growth UI exposes an ancestor scope only through the data-aware control", () => {\n  const text = fs.readFileSync(path.join(__dirname, "..", "analytics-v1.6.1.js"), "utf8");\n  assert.match(text, /data-growth-animal-scope/);\n  assert.match(text, /Active \\/ current animals/);\n  assert.match(text, /Active \\+ ancestors with growth data/);\n  assert.doesNotMatch(text, /array\\("animals"\\)\\.filter\\(\\(record\\) => !ui\\.species \\|\\| record\\.species === ui\\.species\\)\\.map\\(\\(record, index\\)/);\n});\n`;
fs.writeFileSync(testPath, testSource);

const notesPath = "RELEASE_NOTES-v1.8.2.md";
let notes = fs.readFileSync(notesPath, "utf8");
const section = `\n## Analytics animal scope\n- Growth Analytics now defaults to current animals instead of every pedigree/profile record.\n- Sold, deceased, archived, and Ancestor Only records no longer flood the comparison selector.\n- A secondary \"Active + ancestors with growth data\" option appears only when Ancestor Only records have real plottable birth/Health weight data.\n- Ancestors shown through that option are labeled clearly and remain excluded by default.\n`;
if (!notes.includes("## Analytics animal scope")) notes += section;
fs.writeFileSync(notesPath, notes);

console.log("Analytics animal scope patch applied.");