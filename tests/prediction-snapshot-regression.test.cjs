const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const Core = require("../rabbit-genetics-runtime-v1.4.5.js");

const root = path.join(__dirname, "..");
const currentUi = fs.readFileSync(path.join(root, "rabbit-genetics-ui-v1.4.5.js"), "utf8");
const v2Ui = fs.readFileSync(path.join(root, "rabbit-genetics-ui-v2.js"), "utf8");
const intelligence = fs.readFileSync(path.join(root, "breeding-intelligence.js"), "utf8");
const tools = fs.readFileSync(path.join(root, "breeding-intelligence-tools.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "breeding-intelligence.css"), "utf8");

for (const source of [currentUi, v2Ui, intelligence, tools]) {
  assert.doesNotThrow(() => new Function(source), "snapshot workflow browser script compiles");
}

assert.match(currentUi, /How HerdHarbor calculated this[\s\S]*Save Prediction Snapshot/, "save action follows the completed current prediction");
assert.match(currentUi, /if\(run&&buck&&doe\)/, "current save action requires a valid buck and doe prediction run");
assert.match(currentUi, /if\(a\?\.supported\)draft=makePredictionDraft/, "unsupported analyses do not get a save action");
assert.match(currentUi, /saveInFlight\|\|button\.disabled\|\|!lastPrediction/, "rapid duplicate saves are guarded");
assert.match(currentUi, /Prediction saved to history\./, "successful saves provide confirmation");
assert.match(v2Ui, /Save Prediction Snapshot/, "the direct Genetics v2 UI also exposes the restored action");
assert.match(styles, /\.hh-bi-modal\{[^}]*display:flex;flex-direction:column/, "the modal sizes its body from the actual header height");
assert.match(styles, /\.hh-bi-modal-body\{[^}]*flex:1 1 auto;min-height:0/, "the prediction body remains fully scrollable to its final action");
assert.doesNotMatch(styles, /\.hh-bi-modal-body\{max-height:calc\(/, "a guessed header height cannot clip the save action");

assert.match(intelligence, /fresh\[ROOT_KEY\]\.predictions\.push\(snapshot\)/, "snapshots continue to use breedingIntelligence.predictions");
assert.match(intelligence, /buckGenetics:deepClone\(buck\.genetics\|\|\{\}\)/, "buck genetics are copied into snapshot metadata");
assert.match(intelligence, /doeGenetics:deepClone\(doe\.genetics\|\|\{\}\)/, "doe genetics are copied into snapshot metadata");
assert.match(intelligence, /data-bi-open-snapshot/, "prediction history entries can be opened");
assert.match(intelligence, /This view uses only the saved snapshot\. It does not recalculate/, "saved view explains immutable rendering");
const savedView = intelligence.slice(intelligence.indexOf("function renderSavedSnapshot"), intelligence.indexOf("function renderHistory"));
assert.doesNotMatch(savedView, /analyzePairing/, "opening history never recalculates the prediction");
assert.match(tools, /possibleOffspringColors/, "Predicted vs Actual accepts Genetics v2 saved color ranges");

function rabbit(id, name, sex, color, loci) {
  return {
    id,
    name,
    sex,
    color,
    species: "Rabbit",
    genetics: Core.normalizeGenetics({
      loci: Object.fromEntries(Object.entries(loci).map(([locus, alleles]) => [locus, {
        alleles,
        status: "confirmed",
        source: "user"
      }]))
    })
  };
}

const buck = rabbit("buck-1", "Atlas", "Male", "Black", {
  A: ["a", "a"], B: ["B", "b"], C: ["C", "C"], D: ["D", "d"], E: ["E", "E"], En: ["en", "en"], V: ["V", "v"]
});
const doe = rabbit("doe-1", "Willow", "Female", "Blue", {
  A: ["a", "a"], B: ["B", "B"], C: ["C", "C"], D: ["d", "d"], E: ["E", "E"], En: ["en", "en"], V: ["V", "V"]
});
const analysis = Core.analyzePairing(buck, doe, { animals: [buck, doe], births: [] });
const metadata = {
  buckId: buck.id,
  buckName: buck.name,
  buckGenetics: structuredClone(buck.genetics),
  doeId: doe.id,
  doeName: doe.name,
  doeGenetics: structuredClone(doe.genetics),
  predictionType: analysis.exact ? "exact" : "conditional",
  predictionConfidence: analysis.exact ? "deterministic" : "probability-range",
  appVersion: "1.5.0",
  appBuild: "snapshot-regression-test"
};
const first = Core.createPredictionSnapshot(analysis, metadata);
const originalAnalysis = structuredClone(first.analysis);
const originalBuckGenetics = structuredClone(first.metadata.buckGenetics);

assert.match(first.id, /^genetics_prediction_/);
assert.ok(first.createdAt);
assert.equal(first.metadata.buckId, "buck-1");
assert.equal(first.metadata.doeId, "doe-1");
assert.equal(first.metadata.buckName, "Atlas");
assert.equal(first.metadata.doeName, "Willow");
assert.equal(first.appVersion, "1.5.0");
assert.equal(first.engineVersion, analysis.engineVersion, "snapshot records the engine that generated this analysis");
assert.ok(Array.isArray(first.analysis.possibleOffspringColors));
assert.ok(first.analysis.viennaRange);
assert.ok(Array.isArray(first.analysis.currentlyExcluded));
assert.ok(Array.isArray(first.analysis.incompleteLoci));
assert.ok(first.analysis.explanation);
assert.ok(first.analysis.disclaimer);

analysis.explanation = "Recalculated later";
buck.genetics.loci.D.alleles = ["d", "d"];
metadata.buckName = "Renamed Buck";
metadata.buckGenetics.loci.D.alleles = ["d", "d"];
assert.deepEqual(first.analysis, originalAnalysis, "later analysis changes do not rewrite history");
assert.deepEqual(first.metadata.buckGenetics, originalBuckGenetics, "later parent-genetics changes do not rewrite history");
assert.equal(first.metadata.buckName, "Atlas", "later parent-name changes do not rewrite history");

const secondAnalysis = Core.analyzePairing(buck, doe, { animals: [buck, doe], births: [] });
const second = Core.createPredictionSnapshot(secondAnalysis, { ...metadata, buckName: buck.name, buckGenetics: structuredClone(buck.genetics) });
assert.notEqual(second.id, first.id, "a later prediction is saved separately");
assert.deepEqual(first.analysis, originalAnalysis, "saving another prediction leaves the first snapshot unchanged");

test("the live Breeding Intelligence save path appends immutable snapshots to protected farm state", async () => {
  const start = intelligence.indexOf("  async function savePredictionSnapshot");
  const end = intelligence.indexOf("\n  function renderSavedSnapshot", start);
  assert.ok(start >= 0 && end > start, "live snapshot save function is present");
  const source = intelligence.slice(start, end);
  const liveBuck = structuredClone(buck);
  liveBuck.genetics = structuredClone(originalBuckGenetics);
  let farmState = {
    animals: [structuredClone(liveBuck), structuredClone(doe)],
    breedings: [{ id: "breeding-1", maleId: liveBuck.id, femaleId: doe.id, status: "Bred" }],
    births: [],
    breedingIntelligence: { version: 1, predictions: [], conflicts: [], updatedAt: null }
  };
  let renders = 0;
  const liveSave = new Function(
    "Core", "window", "document", "RELEASE_VERSION", "ROOT_KEY", "deepClone", "readState", "writeState", "renderCard",
    `${source}\nreturn savePredictionSnapshot;`
  )(
    Core,
    { HerdHarborPWA: { version: "1.5.0", build: "qa-build" } },
    { documentElement: { dataset: {} } },
    "1.4.0",
    "breedingIntelligence",
    (value) => structuredClone(value),
    () => structuredClone(farmState),
    async (next) => { farmState = structuredClone(next); },
    () => { renders += 1; }
  );

  const firstStored = await liveSave({ analysis: originalAnalysis, buck: liveBuck, doe, generatedAt: "2026-08-27T12:00:00.000Z" });
  assert.equal(farmState.breedingIntelligence.predictions.length, 1);
  assert.equal(farmState.breedingIntelligence.predictions[0].id, firstStored.id);
  assert.equal(farmState.breedingIntelligence.predictions[0].metadata.appVersion, "1.5.0");
  assert.deepEqual(farmState.breedings[0].geneticsPredictionSnapshot, farmState.breedingIntelligence.predictions[0], "existing Predicted vs Actual breeding link remains populated");

  farmState.animals[0].genetics.loci.D.alleles = ["d", "d"];
  const firstStoredCopy = structuredClone(farmState.breedingIntelligence.predictions[0]);
  const editedBuck = structuredClone(liveBuck);
  editedBuck.genetics.loci.D.alleles = ["d", "d"];
  const editedAnalysis = Core.analyzePairing(editedBuck, doe, { animals: [editedBuck, doe], births: [] });
  const secondStored = await liveSave({ analysis: editedAnalysis, buck: editedBuck, doe, generatedAt: "2026-08-27T12:05:00.000Z" });
  assert.equal(farmState.breedingIntelligence.predictions.length, 2);
  assert.notEqual(firstStored.id, secondStored.id);
  assert.deepEqual(farmState.breedingIntelligence.predictions[0], firstStoredCopy, "the first stored snapshot survives a parent edit and later save unchanged");
  assert.notDeepEqual(
    farmState.breedingIntelligence.predictions[0].metadata.buckGenetics.loci.D.alleles,
    farmState.breedingIntelligence.predictions[1].metadata.buckGenetics.loci.D.alleles,
    "the second snapshot preserves the newly edited parent genetics separately"
  );
  assert.equal(renders, 2, "history metrics refresh immediately after each save");
});

console.log("HerdHarbor prediction snapshot regression tests passed");
