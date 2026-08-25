# HerdHarbor Alpha v1.4.0 — Breeding Intelligence

Alpha v1.4.0 establishes breeding intelligence as a permanent HerdHarbor product pillar alongside farm management.

## Rabbit Genetics v1

- Added a reusable species-aware Breeding Intelligence engine instead of a one-off color calculator.
- Added optional rabbit genetic profiles with A, B, C, D, and E-series allele records.
- Added evidence states: **Confirmed**, **Inferred**, **Possible**, and **Unknown**.
- Unknown alleles remain unknown; HerdHarbor does not invent hidden carrier genes to make a prediction look more precise.
- Added Pair Analysis for a selected buck and doe.
- Pair Analysis combines recorded genotype information, rabbit color constraints, pedigree evidence, shared ancestors, previous offspring, and breeding performance.
- Exact percentages are displayed only when both parents have complete supported core-locus genotypes.
- Incomplete profiles display genetically possible core color families instead of fake percentages.
- Added breeder-friendly explanations for why each analysis is exact or conditional.
- Added immutable prediction snapshots so later evidence does not rewrite what HerdHarbor predicted at the time of a breeding.
- Added offspring-based inheritance evidence. Recorded recessive offspring can improve a parent's carrier evidence.
- Confirmed genetic data is protected from silent lower-confidence overwrites; conflicts are retained for breeder review.
- Added pedigree-based evidence through parents, grandparents, and great-grandparents.
- Added shared-ancestor visibility for planned pairs without introducing an unvalidated COI calculation.
- Added sire/dam breeding performance summaries using existing breeding and birth records.
- Added **Predicted vs Actual** review so a saved pairing prediction can be compared with individually recorded offspring colors without rewriting the historical prediction.

## Genetic test records

Rabbit genetic profiles can now keep supporting laboratory/test records with:

- Test name.
- Laboratory.
- Test date.
- Gene/locus.
- Result.
- Source document or report reference.
- Notes.

A saved laboratory record is retained as high-quality evidence, but HerdHarbor does not automatically translate arbitrary free-text laboratory results into alleles. The breeder reviews the report and records confirmed alleles in the genetic profile, preventing unsafe or vendor-specific result parsing.

## Genetics spreadsheet round-trip

v1.4.0 adds a dedicated Excel genetics workbook alongside HerdHarbor's existing farm import/export tools.

The workbook includes:

- **Genetics** — Animal ID, animal name, species, color/variety, locus, both alleles, confidence status, source, and evidence/note.
- **Genetic Tests** — Animal ID, test ID, test name, laboratory, test date, locus, result, reference, and notes.

Imports match animals by stable Animal ID. Lower-confidence imported genetics do not silently replace better existing information. A conflicting confirmed genotype is retained as a reviewable conflict instead of being overwritten.

## Breeding workflow integration

The new engine builds on HerdHarbor's existing breeding system, including:

- Species-aware breeding schedules.
- Pregnancy-check and preparation reminders.
- Expected birth/kindle/hatch dates.
- Birth and litter records.
- One-step offspring creation.
- Automatic sire/dam and pedigree links.
- Weaning records and reminders.
- Existing conception, delivery, survival, and dam-performance reports.

The v1.4.0 module is additive. Existing animals do not require a genetic profile and existing farm records continue using the same protected record and cloud-sync workflow.

## Data and sync safety

- Genetic profiles are stored on the existing animal records as additive data.
- Breeding Intelligence history is stored inside the existing protected farm state.
- A storage-preservation bridge prevents the legacy v1.3.0 in-memory editor from accidentally dropping new genetics fields during normal saves.
- Normal HerdHarbor cloud conflict protection and recovery remain active.
- The PWA service worker caches the genetics core, integration layer, advanced tools, and styles for installed/offline use.
- Prediction snapshots are immutable copies of what was known at the time of analysis.

## Genetics scope and limitations

Rabbit coat color is more complex than five loci. Alpha v1.4.0 intentionally focuses on the core A/B/C/D/E model and labels modifier-dependent outcomes as families rather than claiming unsupported certainty.

Oregon State University Extension documents A, B, C, D, and E as major rabbit coat-color genes and also identifies additional genes such as spotting and silvering. Its E-series documentation includes **Ed > Es > E > ej > e** and notes that visible phenotype depends on interactions among loci. HerdHarbor therefore treats the engine as breeding decision support, not a guarantee of litter color.

References used for validation and product scope:

- Oregon State University Extension — *Rabbit coat color genetics — summary table*: https://extension.oregonstate.edu/catalog/em-9708-rabbit-coat-color-genetics-summary-table
- Oregon State University Extension — *Understanding the genetics behind rabbit coat colors: Part 2 — coat color genes*: https://extension.oregonstate.edu/catalog/understanding-genetics-behind-rabbit-coat-colors-part-2-coat-color-genes
- Utah State University Extension — *Rabbit Breeding and Management: A Guide for Producers*: https://extension.usu.edu/small-acreage-livestock/research/rabbit-breeding-and-management-a-guide-for-producers
- Utah State University Extension — *Basic Rabbit Selection and Breeding Considerations*: https://extension.usu.edu/small-acreage-livestock/research/basic-rabbit-selection-and-breeding-consideration

## Testing

Automated v1.4.0 coverage includes:

- Known genotype crosses and exact percentages.
- Chocolate/dilute inheritance.
- E-series **Ed** behavior.
- Unknown allele handling.
- Conditional outcome behavior.
- REW inheritance.
- Pedigree evidence confidence.
- Offspring-based inference.
- Confirmed-data conflict protection.
- Shared ancestor detection.
- Immutable prediction snapshots.
- Sire/dam performance calculations.
- Genetic test record/tool presence.
- Predicted-vs-actual workflow presence.
- Genetics Excel workbook import/export wiring.
- PWA/offline asset inclusion.
- Existing v1.3.0 Member/cattle workflow regression.
- Google Play/TWA/Android v1.4.0 release metadata.

## Roadmap clarification

HerdHarbor Business and employee/team management are **not** part of v1.4.0. That work is planned for **Alpha v1.5.0**, allowing v1.4.0 to stay focused on building the breeding specialty correctly.

## Tester focus

Initial v1.4.0 genetics validation should prioritize rabbit breeders with known pedigrees and documented litter colors. Feedback should focus on terminology, missing varieties, pedigree evidence quality, prediction clarity, modifier-gene cases, spreadsheet round-trip behavior, and whether actual litter results are easy to compare with saved predictions.
