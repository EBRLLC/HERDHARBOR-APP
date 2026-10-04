(function (root, factory) {
  const engine = typeof module === "object" && module.exports
    ? require("./pedigree-engine-v2.0.0.js")
    : root?.HerdHarborPedigreeEngine;
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborMarketplacePedigreeSnapshot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";

  if (!Engine?.buildGraph) {
    throw new Error("Canonical HerdHarbor pedigree engine is required.");
  }

  const SCHEMA = "herdharbor-marketplace-pedigree-v1";
  const VISIBILITY_GENERATIONS = Object.freeze({
    hidden: 0,
    parents: 2,
    "3": 3,
    "4": 4,
    "5": 5
  });
  const NODE_STATUSES = new Set([
    "known",
    "repeat",
    "unknown",
    "missing-reference",
    "malformed-reference",
    "cycle"
  ]);

  function clean(value, max = 160) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
  }

  function normalizeVisibility(value) {
    const key = clean(value, 16).toLowerCase() || "hidden";
    return Object.prototype.hasOwnProperty.call(VISIBILITY_GENERATIONS, key) ? key : "hidden";
  }

  function publicAnimal(animal) {
    if (!animal || typeof animal !== "object") return null;
    const value = {
      name: clean(animal.name || animal.registeredName || animal.animalName, 160),
      prefix: clean(animal.prefix || animal.rabbitry || animal.rabbitryName || animal.breeder, 160),
      sex: clean(animal.sex || animal.gender, 32),
      dob: clean(animal.dob || animal.dateOfBirth || animal.birthDate, 32),
      breed: clean(animal.breed, 160),
      color: clean(animal.variety || animal.color, 160),
      registrationNumber: clean(
        animal.registrationNumber || animal.registration || animal.regNumber || animal.regNo,
        160
      )
    };
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field));
  }

  function publicNode(node) {
    const status = NODE_STATUSES.has(node?.status) ? node.status : "unknown";
    return {
      key: clean(node?.key, 80),
      generation: Math.max(0, Math.min(4, Number(node?.generation) || 0)),
      relation: clean(node?.relation, 120),
      status,
      repeatOf: status === "repeat" ? clean(node?.repeatOf, 80) : "",
      animal: status === "known" || status === "repeat" ? publicAnimal(node?.animal) : null
    };
  }

  function buildSnapshot(options = {}) {
    const visibility = normalizeVisibility(options.visibility);
    const generations = VISIBILITY_GENERATIONS[visibility];
    if (!generations) return null;

    const animals = Array.isArray(options.animals) ? options.animals : [];
    const subjectId = clean(options.subjectId, 240);
    if (!subjectId) return null;

    const graph = Engine.buildGraph({
      animals,
      subjectId,
      generations
    });

    return {
      schema: SCHEMA,
      engineVersion: clean(Engine.VERSION, 80),
      visibility,
      generations,
      nodes: graph.nodes.map(publicNode)
    };
  }

  return Object.freeze({
    SCHEMA,
    VISIBILITY_GENERATIONS,
    normalizeVisibility,
    buildSnapshot
  });
});
