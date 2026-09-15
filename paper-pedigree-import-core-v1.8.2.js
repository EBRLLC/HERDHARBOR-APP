(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPaperPedigreeImportCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.8.2";
  const CONTRACT = "paper-pedigree-import-v1";
  const MAX_GENERATIONS = 3;
  const DEFAULT_SPECIES = "Rabbit";
  const SUBJECT_STATUS = "Active";
  const ANCESTOR_STATUS = "Ancestor Only";

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const clean = (value, max = 240) => String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
  const norm = (value) => clean(value).toLowerCase().replace(/[’']/g, "'");
  const compact = (value) => norm(value).replace(/[^a-z0-9]+/g, "");
  const nowIso = () => new Date().toISOString();

  const ROLE_PATHS = Object.freeze([
    { role: "subject", path: [], generation: 0, sex: "" },
    { role: "sire", path: ["sire"], generation: 1, sex: "Male" },
    { role: "dam", path: ["dam"], generation: 1, sex: "Female" },
    { role: "sireSire", path: ["sire", "sire"], generation: 2, sex: "Male" },
    { role: "sireDam", path: ["sire", "dam"], generation: 2, sex: "Female" },
    { role: "damSire", path: ["dam", "sire"], generation: 2, sex: "Male" },
    { role: "damDam", path: ["dam", "dam"], generation: 2, sex: "Female" },
    { role: "sireSireSire", path: ["sire", "sire", "sire"], generation: 3, sex: "Male" },
    { role: "sireSireDam", path: ["sire", "sire", "dam"], generation: 3, sex: "Female" },
    { role: "sireDamSire", path: ["sire", "dam", "sire"], generation: 3, sex: "Male" },
    { role: "sireDamDam", path: ["sire", "dam", "dam"], generation: 3, sex: "Female" },
    { role: "damSireSire", path: ["dam", "sire", "sire"], generation: 3, sex: "Male" },
    { role: "damSireDam", path: ["dam", "sire", "dam"], generation: 3, sex: "Female" },
    { role: "damDamSire", path: ["dam", "dam", "sire"], generation: 3, sex: "Male" },
    { role: "damDamDam", path: ["dam", "dam", "dam"], generation: 3, sex: "Female" }
  ]);

  const FIELDS = Object.freeze([
    "name", "registrationNumber", "tattoo", "tag", "earTagNumber", "breeder",
    "species", "breed", "sex", "dob", "color", "variety"
  ]);

  function stableKey(value) {
    const source = clean(value, 300) || "pedigree";
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function roleMeta(role) {
    return ROLE_PATHS.find((row) => row.role === role) || null;
  }

  function valueAtPath(root, path) {
    let current = root;
    for (const part of path) current = current && typeof current === "object" ? current[part] : null;
    return current && typeof current === "object" ? current : null;
  }

  function normalizeSex(value, fallback = "") {
    const v = norm(value);
    if (["male", "m", "buck", "bull", "boar", "ram", "rooster"].includes(v)) return "Male";
    if (["female", "f", "doe", "cow", "sow", "ewe", "hen"].includes(v)) return "Female";
    return clean(fallback, 20) || "Unknown";
  }

  function normalizeConfidence(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
  }

  function normalizeNode(input = {}, meta = {}) {
    const confidence = input.confidence && typeof input.confidence === "object" && !Array.isArray(input.confidence)
      ? Object.fromEntries(Object.entries(input.confidence).map(([key, value]) => [key, normalizeConfidence(value)]))
      : {};
    const node = {
      role: meta.role || clean(input.role, 48),
      generation: Number.isFinite(meta.generation) ? meta.generation : Number(input.generation || 0),
      name: clean(input.name || input.registeredName || input.animalName, 160),
      registrationNumber: clean(input.registrationNumber || input.registration || input.regNumber || input.regNo, 160),
      tattoo: clean(input.tattoo, 120),
      tag: clean(input.tag, 120),
      earTagNumber: clean(input.earTagNumber || input.earTag, 120),
      breeder: clean(input.breeder || input.breederName, 160),
      species: clean(input.species, 100) || DEFAULT_SPECIES,
      breed: clean(input.breed, 160),
      sex: normalizeSex(input.sex || input.gender, meta.sex),
      dob: clean(input.dob || input.dateOfBirth || input.birthDate, 32),
      color: clean(input.color, 160),
      variety: clean(input.variety, 160),
      confidence,
      sourceText: clean(input.sourceText || input.rawText, 800),
      notes: clean(input.notes, 800)
    };
    node.present = Boolean(node.name || node.registrationNumber || node.tattoo || node.tag || node.earTagNumber);
    node.reviewRequired = false;
    node.warnings = [];
    if (node.present && !node.name) node.warnings.push("Name was not confidently read.");
    if (node.present && node.sex === "Unknown" && meta.sex) node.sex = meta.sex;
    for (const [field, score] of Object.entries(confidence)) {
      if (score != null && score < 0.72 && clean(node[field])) node.warnings.push(`${field} has low extraction confidence.`);
    }
    if (node.present && node.warnings.length) node.reviewRequired = true;
    return node;
  }

  function normalizeExtraction(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const tree = source.pedigree && typeof source.pedigree === "object" ? source.pedigree : source;
    const flat = Array.isArray(source.nodes)
      ? Object.fromEntries(source.nodes.filter((node) => node && typeof node === "object" && clean(node.role, 48)).map((node) => [clean(node.role, 48), node]))
      : source.nodes && typeof source.nodes === "object" ? source.nodes : {};
    const nodes = ROLE_PATHS.map((meta) => {
      let raw = flat[meta.role] || null;
      if (!raw) raw = meta.role === "subject" ? (tree.subject || tree.animal || tree) : valueAtPath(tree, meta.path);
      return normalizeNode(raw || {}, meta);
    });
    const present = nodes.filter((node) => node.present);
    const warnings = (Array.isArray(source.warnings) ? source.warnings : []).map((value) => clean(value, 300)).filter(Boolean);
    if (!present.find((node) => node.role === "subject")) warnings.push("The subject animal was not identified.");
    if (!present.length) warnings.push("No pedigree animals were identified.");
    return {
      contract: CONTRACT,
      version: VERSION,
      sourceType: clean(source.sourceType, 80) || "paper-pedigree-photo",
      sourceName: clean(source.sourceName || source.fileName, 240),
      extractionId: clean(source.extractionId, 160) || `pedigree_${stableKey(JSON.stringify(present.map((node) => [node.role, node.name, node.registrationNumber, node.tattoo])))}`,
      nodes,
      warnings: [...new Set(warnings)],
      reviewRequired: warnings.length > 0 || nodes.some((node) => node.present && node.reviewRequired)
    };
  }

  function identifierPairs(animal) {
    return [
      ["registrationNumber", compact(animal?.registrationNumber)],
      ["tattoo", compact(animal?.tattoo)],
      ["tag", compact(animal?.tag)],
      ["earTagNumber", compact(animal?.earTagNumber)]
    ].filter(([, value]) => value);
  }

  function findExistingAnimal(animals, incoming) {
    const records = Array.isArray(animals) ? animals : [];
    const incomingSpecies = norm(incoming?.species);
    for (const [field, value] of identifierPairs(incoming)) {
      let matches = records.filter((record) => compact(record?.[field]) === value);
      if (incomingSpecies) {
        const sameSpecies = matches.filter((record) => !norm(record?.species) || norm(record?.species) === incomingSpecies);
        if (sameSpecies.length) matches = sameSpecies;
      }
      if (matches.length === 1) return { animal: matches[0], reason: field, ambiguous: false };
      if (matches.length > 1) return { animal: null, reason: field, ambiguous: true, matches };
    }

    const name = norm(incoming?.name);
    if (!name) return { animal: null, reason: "", ambiguous: false };
    let matches = records.filter((record) => norm(record?.name) === name);
    if (incomingSpecies) matches = matches.filter((record) => !norm(record?.species) || norm(record?.species) === incomingSpecies);
    const breed = norm(incoming?.breed);
    if (breed) {
      const narrowed = matches.filter((record) => norm(record?.breed) === breed);
      if (narrowed.length) matches = narrowed;
    }
    const dob = clean(incoming?.dob, 32);
    if (dob) {
      const narrowed = matches.filter((record) => clean(record?.dob, 32) === dob);
      if (narrowed.length) matches = narrowed;
    }
    if (matches.length === 1) return { animal: matches[0], reason: "name-context", ambiguous: false };
    if (matches.length > 1) return { animal: null, reason: "name-context", ambiguous: true, matches };
    return { animal: null, reason: "", ambiguous: false };
  }

  function fieldConflicts(existing, incoming) {
    const conflicts = [];
    for (const field of FIELDS) {
      const before = clean(existing?.[field], 1000);
      const after = clean(incoming?.[field], 1000);
      if (!before || !after) continue;
      const comparableBefore = field === "sex" ? normalizeSex(before) : norm(before);
      const comparableAfter = field === "sex" ? normalizeSex(after) : norm(after);
      if (comparableBefore !== comparableAfter) conflicts.push({ field, existing: before, incoming: after });
    }
    return conflicts;
  }

  function relationRoles(role) {
    const meta = roleMeta(role);
    if (!meta || meta.generation >= MAX_GENERATIONS) return { sireRole: "", damRole: "" };
    const sirePath = [...meta.path, "sire"].join("");
    const damPath = [...meta.path, "dam"].join("");
    const byPath = (pathText) => ROLE_PATHS.find((row) => row.path.join("") === pathText)?.role || "";
    return { sireRole: byPath(sirePath), damRole: byPath(damPath) };
  }

  function buildImportPlan(inputState, extractionInput) {
    const state = inputState && typeof inputState === "object" ? inputState : {};
    const animals = Array.isArray(state.animals) ? state.animals : [];
    const extraction = normalizeExtraction(extractionInput);
    const actions = [];
    const conflicts = [];
    const warnings = [...(extraction.warnings || [])];
    const roleToTargetId = {};
    const plannedAnimals = [];
    const plannedIds = new Set();

    for (const node of extraction.nodes || []) {
      if (!node.present) continue;
      if (!clean(node.name, 160)) {
        conflicts.push({ type: "missing-required-field", role: node.role, field: "name", incoming: clone(node) });
        actions.push({ role: node.role, mode: "blocked", incoming: clone(node), reason: "missing-required-field" });
        continue;
      }

      const match = findExistingAnimal([...animals, ...plannedAnimals], node);
      if (match.ambiguous) {
        conflicts.push({ type: "ambiguous-match", role: node.role, incoming: clone(node), candidateIds: match.matches.map((row) => row.id) });
        actions.push({ role: node.role, mode: "blocked", incoming: clone(node), reason: "ambiguous-match" });
        continue;
      }
      if (match.animal) {
        const differences = fieldConflicts(match.animal, node);
        const planned = plannedIds.has(match.animal.id);
        if (differences.length) {
          conflicts.push({ type: planned ? "duplicate-pedigree-conflict" : "field-conflict", role: node.role, animalId: match.animal.id, fields: differences });
        }
        roleToTargetId[node.role] = match.animal.id;
        actions.push({
          role: node.role,
          mode: planned ? "link" : "merge",
          animalId: match.animal.id,
          matchReason: match.reason,
          incoming: clone(node),
          conflicts: differences
        });
      } else {
        const targetId = `animal_pedigree_${stableKey(`${extraction.extractionId}|${node.role}|${node.name}|${node.registrationNumber}|${node.tattoo}`)}`;
        roleToTargetId[node.role] = targetId;
        const planned = { ...clone(node), id: targetId };
        plannedAnimals.push(planned);
        plannedIds.add(targetId);
        actions.push({ role: node.role, mode: "create", animalId: targetId, incoming: clone(node), conflicts: [] });
      }
      if (node.reviewRequired) warnings.push(`${node.role} contains fields that should be reviewed before import.`);
    }

    for (const action of actions) {
      const links = relationRoles(action.role);
      action.sireId = links.sireRole ? (roleToTargetId[links.sireRole] || "") : "";
      action.damId = links.damRole ? (roleToTargetId[links.damRole] || "") : "";
    }

    const subject = actions.find((action) => action.role === "subject" && action.mode !== "blocked");
    if (!subject) warnings.push("No subject animal is ready to import.");
    return {
      contract: CONTRACT,
      version: VERSION,
      extraction,
      actions,
      conflicts,
      warnings: [...new Set(warnings)],
      requiresReview: conflicts.length > 0 || warnings.length > 0,
      canCommit: Boolean(subject) && !actions.some((action) => action.mode === "blocked") && conflicts.length === 0
    };
  }

  function mergeMissing(target, incoming) {
    for (const field of FIELDS) {
      if (!clean(target?.[field], 1000) && clean(incoming?.[field], 1000)) target[field] = incoming[field];
    }
  }

  function applyImportPlan(inputState, plan, options = {}) {
    if (!plan || plan.contract !== CONTRACT) throw new Error("Unsupported paper pedigree import plan.");
    if (plan.actions?.some((action) => action.mode === "blocked")) throw new Error("Resolve blocked pedigree entries before importing.");
    if ((plan.conflicts || []).length && options.allowConflicts !== true) throw new Error("Resolve pedigree field conflicts before importing.");
    const state = clone(inputState && typeof inputState === "object" ? inputState : {});
    state.animals = Array.isArray(state.animals) ? state.animals : [];
    const importedAt = nowIso();
    const touchedIds = [];

    for (const action of plan.actions || []) {
      if (!["create", "merge"].includes(action.mode)) continue;
      let animal = state.animals.find((row) => String(row?.id) === String(action.animalId));
      if (animal) {
        mergeMissing(animal, action.incoming);
        if (!animal.sireId && action.sireId) animal.sireId = action.sireId;
        if (!animal.damId && action.damId) animal.damId = action.damId;
        animal.updatedAt = importedAt;
      } else {
        const incoming = action.incoming || {};
        animal = {
          id: action.animalId,
          name: incoming.name,
          registrationNumber: incoming.registrationNumber,
          tattoo: incoming.tattoo,
          tag: incoming.tag,
          earTagNumber: incoming.earTagNumber,
          breeder: incoming.breeder,
          species: incoming.species || DEFAULT_SPECIES,
          breed: incoming.breed,
          sex: incoming.sex || "Unknown",
          dob: incoming.dob,
          color: incoming.color,
          variety: incoming.variety,
          sireId: action.sireId || "",
          damId: action.damId || "",
          status: action.role === "subject" ? SUBJECT_STATUS : ANCESTOR_STATUS,
          location: "",
          sourceBirthId: "",
          notes: action.role === "subject" ? "Imported from a reviewed paper pedigree." : "",
          pedigreeImport: {
            contract: CONTRACT,
            extractionId: plan.extraction?.extractionId || "",
            sourceName: plan.extraction?.sourceName || "",
            role: action.role,
            importedAt
          },
          createdAt: importedAt,
          updatedAt: importedAt
        };
        state.animals.push(animal);
      }
      touchedIds.push(animal.id);
    }

    return {
      state,
      subjectAnimalId: plan.actions.find((action) => action.role === "subject")?.animalId || "",
      touchedAnimalIds: [...new Set(touchedIds)]
    };
  }

  return Object.freeze({
    VERSION,
    CONTRACT,
    MAX_GENERATIONS,
    ROLE_PATHS,
    FIELDS,
    normalizeExtraction,
    normalizeNode,
    findExistingAnimal,
    fieldConflicts,
    buildImportPlan,
    applyImportPlan
  });
});
