# HerdHarbor Alpha v1.7.1 — Multi-Species Genetics Foundation

Alpha v1.7.1 establishes the architecture HerdHarbor will use to expand genetics beyond rabbits without replacing the completed domestic rabbit genetics engine.

## Core rule

**Do not rewrite the rabbit genetics engine.**

Rabbit genetics remains delegated to the completed v1.6.1 rabbit engine. Alpha v1.7.1 builds a shared species-adapter layer around that existing implementation so future species can plug into one contract without forcing rabbit genetics through a rewrite.

## Hardlocked species-context design rule

HerdHarbor operational species-aware UI is now governed by `HH-SPECIES-CONTEXT-001`: visible species must come from animals currently on that farm, not from a static list of every species HerdHarbor supports. Sold, Deceased, Archived, and Ancestor Only records do not create operational species tabs or cards. Historical/reporting surfaces may intentionally include historical animals only through an explicit historical-scope reason.

This is an application architecture rule, not a user preference. New species-aware operational features should consume `window.HerdHarborSpeciesContext` and must not enumerate the global species registry merely to decide what the user sees.

## Added in v1.7.1

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
- A shared non-rabbit genetics UI foundation that clearly distinguishes architecture readiness from reviewed genetics content.
- Breeding now derives genetics tabs from the farm's current active animals, so only species actually present on the farm appear; historical Sold, Deceased, Archived, and Ancestor Only records do not create unrelated genetics tabs.
- Each active species tab lists that farm's current animals and routes directly into the correct genetics experience, including the existing rabbit engine for rabbits.
- Shared `HerdHarborSpeciesContext` runtime contract and regression guard for future species-aware operational UI.
- PWA/offline integration for the new genetics platform and UI.
- Android Alpha version advancement to v1.7.1 / version code 14.
- Release identity, monitoring identity, Google Play metadata, and regression coverage for the new foundation.

## Species framework

- **Rabbit — Production**: continues to use the completed v1.6.1 rabbit genetics engine through delegation.
- **Cattle — Foundation**: architecture registered; reviewed cattle genetics content is deferred to v1.7.2.
- **Goat — Foundation**: architecture registered; reviewed goat genetics content is deferred to v1.7.3.
- **Sheep — Foundation**: architecture registered; reviewed sheep genetics content is deferred to v1.7.3.
- **Poultry — Foundation**: ZW inheritance capability is registered; reviewed poultry genetics content is deferred to v1.7.4.
- **Swine — Foundation**: architecture registered; reviewed swine genetics content is deferred to v1.7.5.

## Intentional scope boundary

Alpha v1.7.1 ships **zero new production non-rabbit trait or locus claims**. Existing imported or stored genetics records for foundation species are preserved as unclassified evidence until a later reviewed species release defines how they should be interpreted.

That means v1.7.1 does **not** attempt to cram complete cattle, goat, sheep, poultry, or swine gene libraries into one release. It establishes the API, adapter, registry, inheritance, evidence, compatibility, prediction, and UI contracts those releases will use.

## Compatibility

- No farm-data migration is required for the new foundation.
- Existing rabbit genetics records remain compatible with the v1.6.1 engine.
- Existing ARBA Standards & Judging and youth-show layers from v1.7.0 remain preserved.
- Market Analytics, Shows, pedigrees, breeding records, health records, memberships, monitoring, and existing cloud data remain outside the genetics-architecture rewrite and are preserved.

## Release review

The v1.7.1 branch includes a dedicated release-review gate covering the shared genetics contract, rabbit-engine delegation, architecture-only non-rabbit adapters, inherited application regressions, production monitoring build, release identity, PWA/offline assets, and an unsigned Android review bundle.

The final review gate set passed for the dedicated v1.7.1 release review, inherited v1.6.7 release review, inherited v1.6.5 release review, preserved v1.7.0 ARBA standards review, and repository Android Alpha bundle.

## Deferred

- Reviewed cattle gene and trait library: v1.7.2.
- Reviewed goat and sheep genetics libraries: v1.7.3.
- Reviewed poultry genetics library: v1.7.4.
- Reviewed swine genetics library: v1.7.5.
- Broader Breeding Intelligence 2.0 scoring remains a later release.
