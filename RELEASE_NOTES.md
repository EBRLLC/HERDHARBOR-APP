# HerdHarbor Release Notes

## Alpha v1.7.1 — Multi-Species Genetics Foundation

Alpha v1.7.1 establishes the shared genetics architecture for future cattle, goat, sheep, poultry, and swine genetics while preserving the completed rabbit genetics engine.

- Rabbit remains the production adapter and delegates to the existing v1.6.1 rabbit engine; it is not rewritten.
- Adds a shared genetics API, species-adapter registry, trait/locus registries, Mendelian and sex-linked inheritance plumbing, carrier handling, conservative unknown/partial genotype handling, pedigree and offspring evidence interfaces, pairing compatibility, offspring-prediction entry points, and shared non-rabbit genetics UI.
- Cattle, Goat, Sheep, Poultry, and Swine are architecture-only foundation adapters in this release, with zero new production non-rabbit trait/locus claims.
- Poultry registers ZW/sex-linked capability without bundling a poultry gene library.
- Advances the web/PWA/Android release identity to 1.7.1, Android version code 14, and adds dedicated v1.7.1 review coverage.
- Preserves the optional ARBA Standards & Judging and youth-show layers from v1.7.0.

Reviewed species genetics content remains intentionally deferred to bounded follow-up releases: cattle v1.7.2; goat/sheep v1.7.3; poultry v1.7.4; swine v1.7.5.

See `RELEASE_NOTES-v1.7.1.md` for the complete scope and compatibility contract.

---

# Previous release history

