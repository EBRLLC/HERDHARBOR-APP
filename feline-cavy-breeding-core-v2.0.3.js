(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborFelineCavyCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.3-foundation-1";
  // Planning intervals are estimates, never pregnancy diagnoses.
  // References: Merck Veterinary Manual, Breeding Management of Queens (2025),
  // and Physiological Data for Guinea Pigs (accessed 2026-11-09).
  const PROFILES = Object.freeze({
    Cat: Object.freeze({
      species: "Cat", femaleLabel: "Queen", maleLabel: "Tom", offspringLabel: "Kitten",
      birthLabel: "queening", preparationLabel: "Prepare kittening space",
      gestationMinDays: 63, gestationTypicalDays: 65, gestationMaxDays: 67,
      pregnancyReviewDays: 24, preparationDaysBefore: 7, weaningReviewDays: 56
    }),
    "Guinea Pig": Object.freeze({
      species: "Guinea Pig", femaleLabel: "Sow", maleLabel: "Boar", offspringLabel: "Pup",
      birthLabel: "birth", preparationLabel: "Prepare cavy birthing space",
      gestationMinDays: 59, gestationTypicalDays: 68, gestationMaxDays: 72,
      pregnancyReviewDays: 28, preparationDaysBefore: 10, weaningReviewDays: 21
    })
  });

  const BREEDS = Object.freeze({
    Cat: Object.freeze([
      "Abyssinian", "American Shorthair", "Bengal", "Birman", "British Shorthair",
      "Domestic Longhair", "Domestic Shorthair", "Maine Coon", "Norwegian Forest Cat",
      "Persian", "Ragdoll", "Russian Blue", "Siamese", "Siberian", "Sphynx"
    ]),
    "Guinea Pig": Object.freeze([
      "Abyssinian", "American", "Baldwin", "Coronet", "Peruvian", "Satin",
      "Silkie", "Skinny Pig", "Teddy", "Texel", "White Crested"
    ])
  });
  const HISTORICAL = new Set(["sold", "deceased", "archived", "ancestor only", "ancestor-only", "ancestor_only"]);
  const clean = value => String(value == null ? "" : value).trim();
  const lower = value => clean(value).toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  const list = value => Array.isArray(value) ? value : [];

  function canonicalSpecies(value) {
    const input = typeof value === "object" && value !== null ? value.species : value;
    const key = lower(input).replace(/[-_]/g, " ");
    if (key === "cat" || key === "feline") return "Cat";
    if (["guinea pig", "guinea pigs", "cavy", "cavies"].includes(key)) return "Guinea Pig";
    return "";
  }
  function profileFor(value) { return PROFILES[canonicalSpecies(value)] || null; }
  function isSupported(value) { return Boolean(profileFor(value)); }
  function isDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function addDays(value, number) {
    if (!isDateOnly(value) || !Number.isInteger(number)) return "";
    const date = new Date(value + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + number);
    return date.toISOString().slice(0, 10);
  }
  function estimateDates(species, breedingDate) {
    const rule = profileFor(species);
    if (!rule || !isDateOnly(breedingDate)) return null;
    const dueStartDate = addDays(breedingDate, rule.gestationMinDays);
    const dueEndDate = addDays(breedingDate, rule.gestationMaxDays);
    return Object.freeze({
      species: rule.species, sourceDate: breedingDate,
      pregnancyReviewDate: addDays(breedingDate, rule.pregnancyReviewDays),
      dueDate: addDays(breedingDate, rule.gestationTypicalDays),
      dueStartDate, dueEndDate,
      preparationDate: addDays(dueStartDate, -rule.preparationDaysBefore),
      evidence: "estimated_from_breeding_date",
      disclaimer: "Planning estimates only. Pregnancy and delivery timing require veterinary assessment."
    });
  }
  function weaningReviewDate(species, birthDate) {
    const rule = profileFor(species);
    return rule && isDateOnly(birthDate) ? addDays(birthDate, rule.weaningReviewDays) : "";
  }
  function isCurrent(animal) { return Boolean(animal) && !HISTORICAL.has(lower(animal.status)); }
  function ownerId(animal) { return clean(animal?.userId || animal?.ownerId || animal?.accountId); }
  function isQuarantined(state, animalId) {
    const id = clean(animalId);
    const animal = list(state?.animals).find(row => clean(row?.id) === id);
    if (animal?.quarantined === true) return true;
    const episodes = [
      ...list(state?.healthIntelligence?.episodes),
      ...list(state?.healthEpisodes)
    ];
    return episodes.some(row => clean(row?.animalId) === id && row?.quarantined === true && row?.resolved !== true);
  }
  function validatePair(state, femaleId, maleId, options = {}) {
    const idA = clean(femaleId), idB = clean(maleId);
    const animals = list(state?.animals);
    const female = animals.find(row => clean(row?.id) === idA);
    const male = animals.find(row => clean(row?.id) === idB);
    const issues = [];
    if (!idA || !idB || !female || !male) issues.push("Both parents must exist in this account.");
    if (idA && idB && idA === idB) issues.push("Sire and dam must be different animals.");
    const species = canonicalSpecies(female);
    if (female && !species) issues.push("This workflow supports cats and cavies only.");
    if (female && male && (!species || canonicalSpecies(male) !== species))
      issues.push("Both parents must be the same supported species.");
    if (female && lower(female.sex) !== "female") issues.push("The dam must have a recorded female sex.");
    if (male && lower(male.sex) !== "male") issues.push("The sire must have a recorded male sex.");
    if (female && male) {
      const a = ownerId(female), b = ownerId(male), requested = clean(options.ownerId);
      if (a && b && a !== b) issues.push("Parents belong to different accounts.");
      if (requested && ((a && a !== requested) || (b && b !== requested)))
        issues.push("A parent belongs to another account.");
    }
    if (options.allowHistorical !== true && (female && !isCurrent(female) || male && !isCurrent(male)))
      issues.push("Historical animals cannot start a new breeding.");
    const quarantined = id => {
      // Phase 2 health views may hold quarantine in a derived read model.
      if (isQuarantined(state, id)) return true;
      if (typeof options.isAnimalQuarantined !== "function") return false;
      try { return options.isAnimalQuarantined(id) === true; }
      catch { return true; } // Fail closed if the health state cannot be read.
    };
    if (options.allowQuarantine !== true && (quarantined(idA) || quarantined(idB)))
      issues.push("Quarantined animals cannot start a new breeding.");
    return { valid: issues.length === 0, issues: [...new Set(issues)], species, female, male };
  }
  function validateBreeding(state, data, options = {}) {
    const pair = validatePair(state, data?.femaleId, data?.maleId, options);
    const issues = [...pair.issues];
    if (!isDateOnly(data?.breedingDate)) issues.push("Breeding date must be a real calendar date.");
    if (isDateOnly(data?.dueDate) && isDateOnly(data?.breedingDate) && data.dueDate < data.breedingDate)
      issues.push("Due date cannot precede breeding.");
    if (data?.dueDate && !isDateOnly(data.dueDate)) issues.push("Due date must be a real calendar date.");
    return { valid: issues.length === 0, issues: [...new Set(issues)], species: pair.species };
  }
  function validateBirth(state, data, options = {}) {
    // Historical parents and quarantine do not prevent recording an actual birth.
    const pair = validatePair(state, data?.damId, data?.sireId, {
      ...options, allowHistorical: true, allowQuarantine: true
    });
    const issues = [...pair.issues];
    if (!isDateOnly(data?.birthDate)) issues.push("Birth date must be a real calendar date.");
    for (const key of ["bornAlive", "stillborn", "fosteredIn", "fosteredOut", "lostBeforeWeaning", "weaned"]) {
      const value = data?.[key] == null || data[key] === "" ? 0 : Number(data[key]);
      if (!Number.isSafeInteger(value) || value < 0) issues.push(key + " must be a nonnegative whole number.");
    }
    const number = key => Number(data?.[key] || 0);
    if (["bornAlive", "stillborn", "fosteredIn", "fosteredOut", "lostBeforeWeaning", "weaned"]
      .every(key => Number.isSafeInteger(number(key)) && number(key) >= 0)) {
      const available = number("bornAlive") + number("fosteredIn") - number("fosteredOut") - number("lostBeforeWeaning");
      if (available < 0 || number("weaned") > available)
        issues.push("Losses, foster-outs and weaned counts exceed available live offspring.");
    }
    const breedingId = clean(data?.breedingId);
    if (breedingId) {
      const breeding = list(state?.breedings).find(row => clean(row?.id) === breedingId);
      if (!breeding || clean(breeding.femaleId) !== clean(data.damId) || clean(breeding.maleId) !== clean(data.sireId))
        issues.push("Linked breeding must belong to these same two parents.");
      if (list(state?.litters).some(row => clean(row?.breedingId) === breedingId && clean(row?.id) !== clean(options.currentLitterId)))
        issues.push("This breeding already has a recorded birth.");
    }
    return { valid: issues.length === 0, issues: [...new Set(issues)], species: pair.species };
  }
  const ASSESSMENT_SOURCES = Object.freeze(["not_assessed", "breeder_observation", "veterinarian_documented"]);
  const OBSERVATION_TYPES = Object.freeze({
    Cat: Object.freeze(["estrus_signs", "observed_mating", "behavior", "veterinary_visit", "other"]),
    "Guinea Pig": Object.freeze(["estrus_signs", "observed_mating", "boar_separation", "housing", "veterinary_visit", "other"])
  });

  function prepareReproductiveDetails(species, input = {}, previous = {}, options = {}) {
    const profile = profileFor(species);
    const issues = [];
    if (!profile) return { valid: false, issues: ["This species does not have a feline/cavy reproductive workflow."] };
    const breedingDate = clean(input.breedingDate);
    if (!isDateOnly(breedingDate)) issues.push("Enter a valid primary breeding date.");
    const extraRaw = clean(input.additionalMatingDates);
    const extras = extraRaw ? extraRaw.split(/[\n,;]+/).map(clean).filter(Boolean) : [];
    if (extras.length > 64) issues.push("At most 64 additional mating dates may be recorded.");
    for (const date of extras) {
      if (!isDateOnly(date)) issues.push("Each additional mating date must be YYYY-MM-DD.");
      else if (isDateOnly(breedingDate) && date < breedingDate)
        issues.push("Additional mating dates cannot precede the primary breeding date.");
    }
    const matingDates = [...new Set([breedingDate, ...extras].filter(isDateOnly))].sort();
    const estrusDate = clean(input.estrusObservedDate);
    const boarSeparatedDate = clean(input.boarSeparatedDate);
    if (estrusDate && !isDateOnly(estrusDate)) issues.push("Estrus observation date is invalid.");
    if (boarSeparatedDate && !isDateOnly(boarSeparatedDate)) issues.push("Boar separation date is invalid.");
    if (profile.species === "Cat" && boarSeparatedDate)
      issues.push("Boar-separation data cannot be saved on a Cat record.");
    if (profile.species === "Guinea Pig" && estrusDate)
      issues.push("Cat estrus dates cannot be saved on a Cavy record.");

    const assessmentSource = clean(input.assessmentSource) || "not_assessed";
    const assessmentDate = clean(input.assessmentDate);
    const veterinarian = clean(input.assessmentVeterinarian).slice(0, 200);
    const evidenceReference = clean(input.assessmentEvidenceReference).slice(0, 200);
    const assessmentNotes = clean(input.assessmentNotes).slice(0, 2000);
    if (!ASSESSMENT_SOURCES.includes(assessmentSource)) issues.push("Unknown pregnancy assessment source.");
    if (assessmentDate && !isDateOnly(assessmentDate)) issues.push("Pregnancy assessment date is invalid.");
    if (assessmentSource === "veterinarian_documented" && (!isDateOnly(assessmentDate) || !veterinarian || !evidenceReference))
      issues.push("Veterinary pregnancy assessment requires a date, veterinarian, and evidence reference.");
    const status = clean(input.status);
    if (status === "Confirmed pregnant" && (assessmentSource !== "veterinarian_documented" || clean(input.pregnancyCheckStatus) !== "Positive"))
      issues.push("Confirmed pregnant requires a recorded positive veterinary assessment.");
    if (status === "Not pregnant" && assessmentSource !== "veterinarian_documented")
      issues.push("Not pregnant requires a recorded veterinary assessment for cats and cavies.");

    const observationDate = clean(input.observationDate);
    const observationType = clean(input.observationType);
    const observationNotes = clean(input.observationNotes).slice(0, 2000);
    const hasObservation = Boolean(observationDate || observationNotes);
    if (hasObservation && (!isDateOnly(observationDate) || !observationNotes))
      issues.push("A reproductive observation needs a valid date and notes.");
    if (hasObservation && !OBSERVATION_TYPES[profile.species].includes(observationType))
      issues.push("Observation type is not available for this species.");
    const previousObservations = list(previous.reproductiveObservations).filter(item => item && typeof item === "object");
    const observations = previousObservations.slice(0, 200);
    if (previousObservations.length > 200) issues.push("Observation history exceeds the supported record limit.");
    if (hasObservation && !issues.length) {
      const makeId = typeof options.idFactory === "function" ? options.idFactory : () => "observation_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      observations.push({
        id: clean(makeId()), date: observationDate, type: observationType,
        notes: observationNotes, recordedAt: clean(options.now)
      });
    }
    const window = matingDates.length ? {
      dueStartDate: addDays(matingDates[0], profile.gestationMinDays),
      dueEndDate: addDays(matingDates[matingDates.length - 1], profile.gestationMaxDays),
      source: "observed_mating_dates",
      certainty: "planning_estimate_only"
    } : null;
    return {
      valid: issues.length === 0, issues: [...new Set(issues)],
      fields: {
        matingDates,
        ...(profile.species === "Cat" ? { estrusObservedDate: estrusDate } : { boarSeparatedDate }),
        pregnancyAssessment: {
          source: assessmentSource, date: assessmentDate, veterinarian,
          evidenceReference, notes: assessmentNotes,
          independentlyVerified: false
        },
        reproductiveObservations: observations,
        estimatedBirthWindow: window
      }
    };
  }

  function guidance(species) {
    switch (canonicalSpecies(species)) {
      case "Cat": return "Record each observed mating and heat cycle in the notes. Cats are induced ovulators; a mating or calculated due date does not confirm pregnancy.";
      case "Guinea Pig": return "Record boar separation and post-birth housing. Cavies may enter postpartum estrus; review pup sex and separation before sexual maturity with an exotics veterinarian.";
      default: return "";
    }
  }

  return Object.freeze({
    VERSION, PROFILES, BREEDS, canonicalSpecies, profileFor, isSupported,
    isDateOnly, addDays, estimateDates, weaningReviewDate, isCurrent,
    isQuarantined, validatePair, validateBreeding, validateBirth,
    prepareReproductiveDetails, ASSESSMENT_SOURCES, OBSERVATION_TYPES, guidance
  });
});
