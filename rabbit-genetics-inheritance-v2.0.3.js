(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HerdHarborRabbitInheritance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "2.0.3";
  const SOURCE = "family-inferred";
  const UNKNOWN = "_";
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const id = value => String(value == null ? "" : value);
  const isRabbit = a => /^(rabbit|rabbits)$/i.test(String(a?.species || "").trim());
  const valid = p => Array.isArray(p) && p.length === 2 && p.every(a => a && a !== UNKNOWN);
  const key = p => Array.isArray(p) ? p.join("\u0000") : "";
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const alleleList = pair => pair.filter(a => a !== UNKNOWN);
  const auto = record => record?.source === SOURCE;
  const stripAuto = animal => {
    const genetics = animal?.genetics || {};
    const loci = { ...(genetics.loci || {}) };
    for (const locus of Object.keys(loci)) if (auto(loci[locus])) delete loci[locus];
    return { ...animal, genetics: { ...genetics, loci } };
  };
  const unique = pairs => [...new Map((pairs || []).map(p => [key(p), p])).values()];
  const has = (p, allele) => p.includes(allele);

  function reconcile(state, engine) {
    if (!state || !Array.isArray(state.animals) || !engine?.possiblePairsForLocus ||
        !engine?.crossLocus || !engine?.LOCI || !engine?.normalizeGenetics) {
      return { changed: 0, conflicts: 0, skipped: true };
    }
    const rabbits = state.animals.filter(isRabbit);
    const byId = new Map(rabbits.map(a => [id(a.id), a]));
    const base = new Map(rabbits.map(a => [id(a.id), stripAuto(a)]));
    const loci = engine.EDITABLE_LOCI || Object.keys(engine.LOCI);
    const optionsCache = new Map();
    const options = (animal, locus) => {
      if (!animal) return [];
      const cacheKey = id(animal.id) + "|" + locus;
      if (optionsCache.has(cacheKey)) return optionsCache.get(cacheKey);
      const clean = base.get(id(animal.id));
      let pairs = [];
      try {
        pairs = unique(engine.possiblePairsForLocus(clean, clean?.color || clean?.variety || "", locus))
          .filter(valid);
      } catch (_) {}
      optionsCache.set(cacheKey, pairs);
      return pairs;
    };
    let changed = 0, conflicts = 0;
    for (const animal of rabbits) {
      const parents = [byId.get(id(animal.sireId)), byId.get(id(animal.damId))]
        .filter(p => p && id(p.id) !== id(animal.id));
      const children = rabbits.filter(child =>
        id(child.id) !== id(animal.id) &&
        (id(child.sireId) === id(animal.id) || id(child.damId) === id(animal.id)));
      if (!parents.length && !children.length && !animal.genetics?.loci) continue;
      const updated = { ...(animal.genetics || {}) };
      const updatedLoci = { ...(updated.loci || {}) };
      const oldConflicts = Array.isArray(updated.conflicts) ? updated.conflicts : [];
      const keptConflicts = oldConflicts.filter(c => c?.source !== SOURCE);
      const oldEvidence = Array.isArray(updated.evidence) ? updated.evidence : [];
      const keptEvidence = oldEvidence.filter(e => e?.source !== SOURCE);
      const familyEvidence = [];
      const familyConflicts = [];
      for (const locus of loci) {
        if (engine.LOCI[locus]?.predictionModel !== "mendelian") continue;
        const original = updatedLoci[locus];
        const oldIsAuto = auto(original);
        const baseOptions = options(animal, locus);
        let candidates = baseOptions;
        let constrained = false;
        const notes = [];
        const sire = byId.get(id(animal.sireId));
        const dam = byId.get(id(animal.damId));
        const safeSire = sire && sire !== animal ? sire : null;
        const safeDam = dam && dam !== animal && dam !== sire ? dam : null;
        const sireOptions = options(safeSire, locus), damOptions = options(safeDam, locus);
        if (safeSire && safeDam && sireOptions.length === 1 && damOptions.length === 1) {
          const cross = engine.crossLocus(locus, sireOptions[0], damOptions[0]);
          if (cross?.exact && Array.isArray(cross.outcomes)) {
            const possible = new Set(cross.outcomes.filter(o => o.probability > 0).map(o => key(o.alleles)));
            candidates = candidates.filter(p => possible.has(key(p)));
            constrained = true;
            notes.push("parent genotypes");
          }
        } else {
          for (const [parent, choices] of [[safeSire, sireOptions], [safeDam, damOptions]]) {
            if (!parent || choices.length !== 1 || choices[0][0] !== choices[0][1]) continue;
            const inherited = choices[0][0];
            candidates = candidates.filter(p => has(p, inherited));
            constrained = true;
            notes.push("fixed allele from " + id(parent.id));
          }
        }
        for (const child of children) {
          const childOptions = options(child, locus);
          if (childOptions.length !== 1 || childOptions[0][0] !== childOptions[0][1]) continue;
          const inherited = childOptions[0][0];
          candidates = candidates.filter(p => has(p, inherited));
          constrained = true;
          notes.push("homozygous offspring " + id(child.id));
        }
        if (constrained && baseOptions.length && !candidates.length) {
          familyConflicts.push({
            source: SOURCE, locus, resolution: "review-required",
            animalId: id(animal.id), sireId: id(animal.sireId), damId: id(animal.damId),
            note: "Family records and the recorded genotype/phenotype are incompatible."
          });
          conflicts++;
        }
        const manual = original && !oldIsAuto &&
          (alleleList(engine.normalizeGenetics({ loci: { [locus]: original } }).loci[locus].alleles).length > 0 ||
           (original.status && original.status !== "unknown") || original.value);
        let next = null;
        if (constrained && candidates.length &&
            (candidates.length < baseOptions.length || baseOptions.length === 1) && !manual) {
          let alleles = null;
          if (candidates.length === 1) alleles = candidates[0];
          else {
            const common = [...new Set(candidates[0])]
              .filter(a => a !== UNKNOWN && candidates.every(p => p.includes(a)));
            if (common.length === 1) alleles = [common[0], UNKNOWN];
          }
          if (alleles) next = {
            alleles, status: "strongly-inferred", source: SOURCE,
            note: "Automatically inferred from " + [...new Set(notes)].join("; ") +
              ". Recomputed when family records change; not DNA-confirmed."
          };
        }
        if (next) familyEvidence.push({
          id: SOURCE + ":" + id(animal.id) + ":" + locus,
          source: SOURCE, status: next.status, locus, alleles: next.alleles.slice(),
          note: next.note, relatedAnimalIds: [...new Set([id(animal.sireId), id(animal.damId),
            ...children.map(child => id(child.id))])].filter(Boolean)
        });
        if (oldIsAuto) {
          if (next) {
            if (!same([original.alleles, original.status, original.source, original.note],
              [next.alleles, next.status, next.source, next.note])) {
              updatedLoci[locus] = next;
              changed++;
            }
          } else {
            delete updatedLoci[locus];
            changed++;
          }
        } else if (next && !original) {
          updatedLoci[locus] = next;
          changed++;
        } else if (next && original && !manual) {
          updatedLoci[locus] = next;
          changed++;
        }
      }
      const allConflicts = keptConflicts.concat(familyConflicts);
      const allEvidence = keptEvidence.concat(familyEvidence);
      const evidenceChanged = !same(allEvidence, oldEvidence);
      const conflictChanged = !same(allConflicts, oldConflicts);
      if (conflictChanged) { updated.conflicts = allConflicts; changed++; }
      if (evidenceChanged) { updated.evidence = allEvidence; changed++; }
      if (!same(updatedLoci, animal.genetics?.loci || {})) {
        updated.loci = updatedLoci;
        animal.genetics = updated;
      } else if (conflictChanged || evidenceChanged) {
        animal.genetics = updated;
      }
    }
    return { changed, conflicts, skipped: false, version: VERSION };
  }
  return Object.freeze({ VERSION, SOURCE, reconcile });
});
