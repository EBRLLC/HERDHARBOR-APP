(() => {
  "use strict";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const normalizeSex = (value) => {
    const normalized = String(value == null ? "" : value).trim().toLowerCase();
    if (normalized === "male" || normalized === "buck" || normalized === "m") return "Male";
    if (normalized === "female" || normalized === "doe" || normalized === "f") return "Female";
    return "Unknown";
  };
  const isSex = (animal, wanted) => normalizeSex(animal?.sex) === normalizeSex(wanted) && normalizeSex(wanted) !== "Unknown";
  const isEligibleRabbit = (animal) => {
    if (window.HerdHarborBreedingIntelligenceCore?.canonicalSpecies?.(animal?.species) !== "Rabbit") return false;
    const status = String(animal?.status || "Active").trim().toLowerCase();
    return status === "active" || status === "breeding";
  };
  const rabbitsForSex = (animals, wanted) => (animals || []).filter((animal) => isEligibleRabbit(animal) && isSex(animal, wanted));
  function readAnimals() {
    try { const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); return Array.isArray(state.animals) ? state.animals : []; }
    catch { return []; }
  }
  function sanitizeSelect(select, wanted) {
    if (!select) return;
    const byId = new Map(readAnimals().map((animal) => [String(animal.id), animal]));
    Array.from(select.options || []).forEach((option) => {
      if (!option.value) return;
      const animal = byId.get(String(option.value));
      if (animal && !isSex(animal, wanted)) option.remove();
    });
  }
  document.addEventListener("focusin", (event) => {
    const select = event.target?.closest?.("select");
    if (!select) return;
    if (["maleId", "sireId"].includes(select.name) || /buck|sire/i.test(select.id || "")) sanitizeSelect(select, "Male");
    if (["femaleId", "damId"].includes(select.name) || /doe|dam/i.test(select.id || "")) sanitizeSelect(select, "Female");
  }, true);
  window.HerdHarborRabbitRecords = Object.freeze({ normalizeSex, isSex, isEligibleRabbit, rabbitsForSex, sanitizeSelect });
})();
