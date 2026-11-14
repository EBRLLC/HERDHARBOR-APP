(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborBreedingIntegrity203 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clean = value => String(value == null ? "" : value).trim();
  const species = record => clean(record?.species).toLowerCase().replace(/s$/, "");
  const error = (code, collection, id, detail) => ({ code, collection, id, detail });
  const index = records => {
    const byId = new Map(), duplicateIds = new Set();
    for (const record of records || []) {
      const id = clean(record?.id);
      if (!id) continue;
      if (byId.has(id)) duplicateIds.add(id);
      else byId.set(id, record);
    }
    for (const id of duplicateIds) byId.delete(id);
    return { byId, duplicateIds };
  };
  const collections = ["animals", "breedings", "litters"];
  const identity = record => clean(record?.id);
  const changedIds = (before, after) => {
    const previous = new Map((before || []).filter(x => identity(x)).map(x => [identity(x), JSON.stringify(x)]));
    return new Set((after || []).filter(x => identity(x) && previous.get(identity(x)) !== JSON.stringify(x)).map(identity));
  };

  function validateMutation(before, after) {
    const errors = [];
    if (!after || !Array.isArray(after.animals)) return { ok: false, errors: [error("missing-animals", "animals", "", "Animal collection unavailable.")] };
    const animals = index(after.animals), breedings = index(after.breedings || []);
    const litters = index(after.litters || []);
    const changed = Object.fromEntries(collections.map(name => [name, changedIds(before?.[name], after[name])]));
    for (const name of collections) {
      const records = Array.isArray(after[name]) ? after[name] : [];
      const counts = new Map();
      for (const record of records) if (identity(record)) counts.set(identity(record), (counts.get(identity(record)) || 0) + 1);
      for (const [id, count] of counts) if (count > 1 && (
        changed[name].has(id) || !(before?.[name] || []).some(old => identity(old) === id)
      )) errors.push(error("duplicate-id", name, id, "Record IDs must be unique."));
    }
    const checkAnimalParent = (record, field) => {
      const parentId = clean(record[field]);
      if (!parentId) return;
      if (parentId === identity(record)) {
        errors.push(error("self-parent", "animals", identity(record), field + " cannot reference itself."));
        return;
      }
      if (animals.duplicateIds.has(parentId)) {
        errors.push(error("ambiguous-parent", "animals", identity(record), field + " matches multiple animal records."));
        return;
      }
      const parent = animals.byId.get(parentId);
      // Unknown imported/external pedigree ancestors remain explicit references.
      // Do not manufacture a local animal, or erase historical ancestry.
      if (parent && species(parent) !== species(record)) {
        errors.push(error("cross-species-parent", "animals", identity(record), field + " belongs to another species."));
      }
    };
    for (const record of after.animals) if (changed.animals.has(identity(record))) {
      checkAnimalParent(record, "sireId");
      checkAnimalParent(record, "damId");
      if (identity(record) && clean(record.sireId) && clean(record.sireId) === clean(record.damId)) {
        errors.push(error("same-parent", "animals", identity(record), "Sire and dam cannot reference the same animal."));
      }
    }
    for (const record of after.breedings || []) if (changed.breedings.has(identity(record))) {
      const maleId = clean(record.maleId), femaleId = clean(record.femaleId);
      if (maleId && femaleId && maleId === femaleId) errors.push(error("same-breeding-animal", "breedings", identity(record), "A breeding cannot pair an animal with itself."));
      const male = animals.byId.get(maleId), female = animals.byId.get(femaleId);
      if (male && female && species(male) !== species(female)) errors.push(error("cross-species-breeding", "breedings", identity(record), "Breeding pair species differ."));
      if (maleId && animals.duplicateIds.has(maleId) || femaleId && animals.duplicateIds.has(femaleId)) errors.push(error("ambiguous-breeding-animal", "breedings", identity(record), "Breeding references a duplicate animal ID."));
    }
    for (const record of after.litters || []) if (changed.litters.has(identity(record))) {
      const sire = animals.byId.get(clean(record.sireId)), dam = animals.byId.get(clean(record.damId));
      if (sire && dam && species(sire) !== species(dam)) errors.push(error("cross-species-litter", "litters", identity(record), "Litter parents belong to different species."));
      const breedingId = clean(record.breedingId);
      if (breedingId && breedings.duplicateIds.has(breedingId)) errors.push(error("ambiguous-breeding", "litters", identity(record), "Linked breeding ID is ambiguous."));
      const breeding = breedings.byId.get(breedingId);
      if (breeding && (
        (clean(record.damId) && clean(breeding.femaleId) && clean(record.damId) !== clean(breeding.femaleId)) ||
        (clean(record.sireId) && clean(breeding.maleId) && clean(record.sireId) !== clean(breeding.maleId))
      )) errors.push(error("litter-parentage-mismatch", "litters", identity(record), "Litter parentage differs from its linked breeding."));
    }
    return { ok: errors.length === 0, errors };
  }
  return Object.freeze({ VERSION: "2.0.3", validateMutation });
});
