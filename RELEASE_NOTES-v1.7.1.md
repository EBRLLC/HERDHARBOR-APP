# HerdHarbor Alpha v1.7.1 — Multi-Species Genetics + Health Intelligence Foundation

Alpha v1.7.1 establishes the architecture HerdHarbor will use to expand genetics beyond rabbits without replacing the completed domestic rabbit genetics engine, and upgrades the older Health/Symptom workflow into a structured Health Intelligence foundation.

## Core genetics rule

**Do not rewrite the rabbit genetics engine.**

Rabbit genetics remains delegated to the completed v1.6.1 rabbit engine. Alpha v1.7.1 builds a shared species-adapter layer around that existing implementation so future species can plug into one contract without forcing rabbit genetics through a rewrite.

## Hardlocked species-context design rule

HerdHarbor operational species-aware UI is governed by `HH-SPECIES-CONTEXT-001`: visible species must come from animals currently on that farm, not from a static list of every species HerdHarbor supports. Sold, Deceased, Archived, and Ancestor Only records do not create operational species tabs or cards. Historical/reporting surfaces may intentionally include historical animals only through an explicit historical-scope reason.

This is an application architecture rule, not a user preference. New species-aware operational features should consume `window.HerdHarborSpeciesContext` and must not enumerate the global species registry merely to decide what the user sees.

## Multi-Species Genetics Foundation

- Shared, versioned genetics API and schema contract.
- Species-adapter registry with production, foundation, and experimental adapter states.
- Per-species trait and locus registries.
- Shared autosomal inheritance plumbing for dominant, recessive, co-dominant, and incomplete-dominance definitions.
- XY and ZW sex-linked inheritance support.
- Carrier-status handling for reviewed recessive definitions.
- Conservative unknown and partial-genotype handling that does not manufacture probabilities from missing data.
- Pedigree-evidence and offspring-evidence interfaces for future reviewed species definitions.
- Shared pairing-compatibility and offspring-prediction entry points.
- Species-specific capability and explanation metadata.
- Shared non-rabbit genetics UI foundation that clearly distinguishes architecture readiness from reviewed genetics content.
- Breeding derives genetics tabs from the farm's current active animals only.
- Each active species tab lists that farm's current animals and routes into the correct genetics experience, including the existing rabbit engine for rabbits.
- Shared `HerdHarborSpeciesContext` runtime contract and regression guard for future species-aware operational UI.

## Health Intelligence Foundation

The older symptom-guide workflow remains available, but Health is no longer designed as little more than “search a symptom, then go to a veterinarian.” v1.7.1 adds an additive Health Intelligence layer while preserving existing Health records.

### Four-level health model

- **Emergency** — genuine red-flag signs that warrant immediate professional care.
- **Urgent** — prompt or same-day professional review when warranted.
- **Monitor closely** — structured observations, a defined recheck point, practical husbandry/environment checks, and clear escalation criteria.
- **Routine / preventive** — vaccinations, parasite management, exams, testing, hoof/foot care, preventive schedules, and normal health management.

The legacy symptom-guide urgency labels are mapped into this newer model in the UI without removing the guide's existing safety protections.

### Illness episodes

Health episodes can now preserve structured observations instead of reducing a concern to one free-text line. Episode fields include:

- animal and species context;
- concern/symptom and start date;
- recheck date;
- appetite and water intake;
- manure/droppings;
- activity and breathing status;
- number of animals affected;
- recorded temperature, pulse/heart rate, and respiratory rate;
- body-condition score;
- mobility note/score;
- production change;
- health status and quarantine status;
- notes, resolution state, and resolution date.

HerdHarbor provides observation checklists and escalation guidance while explicitly avoiding diagnosis.

### Structured care records

Medication, Treatment, Vaccination, Preventive, Veterinary Visit, and Lab/Diagnostic records can carry structured fields including:

- product/medication;
- reason;
- amount as recorded;
- route and frequency/schedule;
- start/end dates;
- prescribed/directed by and administered by;
- lot number and expiration;
- booster/follow-up due date;
- outcome and adverse reaction notes;
- user-entered meat, milk, and egg withdrawal end dates.

HerdHarbor **does not calculate medication doses or withdrawal intervals**. Users record label- or veterinarian/animal-health-directed values and HerdHarbor tracks the dates.

### Herd/flock/group health

A group record can apply a preventive, vaccination, treatment, parasite-management, hoof/foot-care, biosecurity/quarantine, or observation record to every currently active animal of the selected species. Historical/sold/deceased/archived/ancestor-only animals are excluded from operational group targeting.

### Health intelligence

The Health dashboard can surface factual record patterns such as:

- multiple open records sharing the same concern within a species;
- currently quarantined animals;
- active user-entered food-animal withdrawal dates;
- meaningful changes between recent recorded weights;
- upcoming episode rechecks, boosters/follow-ups, and group preventive work.

These are record-derived observations, not diagnoses or causal claims.

### Health species hardlock

The Health/Symptom experience follows the same hardlocked current-farm species rule as Breeding. Users do not need to sift through species they do not currently have. General all-species emergency guidance remains available, while unrelated species-specific cards are hidden from the operational symptom UI.

## Species framework

- **Rabbit — Production**: continues to use the completed v1.6.1 rabbit genetics engine through delegation.
- **Cattle — Foundation**: architecture registered; reviewed cattle genetics content is deferred to v1.7.2.
- **Goat — Foundation**: architecture registered; reviewed goat genetics content is deferred to v1.7.3.
- **Sheep — Foundation**: architecture registered; reviewed sheep genetics content is deferred to v1.7.3.
- **Poultry — Foundation**: ZW inheritance capability is registered; reviewed poultry genetics content is deferred to v1.7.4.
- **Swine — Foundation**: architecture registered; reviewed swine genetics content is deferred to v1.7.5.

## Intentional genetics scope boundary

Alpha v1.7.1 ships **zero new production non-rabbit trait or locus claims**. Existing imported or stored genetics records for foundation species are preserved as unclassified evidence until a later reviewed species release defines how they should be interpreted.

## Compatibility

- No migration is required for existing core Health records.
- Existing Health records remain intact; Health Intelligence is additive.
- Existing rabbit genetics records remain compatible with the v1.6.1 engine.
- Existing ARBA Standards & Judging and youth-show layers from v1.7.0 remain preserved.
- Market Analytics, Shows, pedigrees, breeding records, memberships, monitoring, and existing cloud data remain preserved.
- Health Intelligence data uses a versioned local foundation store so the legacy core Health table is not destructively rewritten during this release.

## Safety boundaries

- HerdHarbor is an educational and recordkeeping tool, not a veterinary provider.
- It does not diagnose disease.
- It does not calculate medication doses.
- It does not calculate withdrawal intervals.
- Emergency red flags still direct users toward immediate appropriate professional care.
- Less-urgent records provide structured monitoring and escalation criteria instead of reflexively treating every observation as an emergency.

## PWA / Android / release integration

- Health Intelligence JavaScript and CSS are included in the v1.7.1 application shell and offline cache.
- Android Alpha remains v1.7.1 / version code 14.
- Release identity, monitoring identity, Google Play metadata, and inherited regressions remain protected.
- Dedicated Health Intelligence regression coverage is part of the v1.7.1 review contract.

## Deferred genetics releases

- Reviewed cattle gene and trait library: v1.7.2.
- Reviewed goat and sheep genetics libraries: v1.7.3.
- Reviewed poultry genetics library: v1.7.4.
- Reviewed swine genetics library: v1.7.5.
- Broader Breeding Intelligence 2.0 scoring remains a later release.
