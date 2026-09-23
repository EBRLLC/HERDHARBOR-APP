# Breeding and Genetics Decision Support — v1.8.3

Phase 9D extends the existing Rabbit genetics owner in `rabbit-genetics-v1.6.1.js`. It does not create another pedigree store, genetics engine, or breeding-state owner.

## Pedigree method

Pair comparison uses canonical Animal `sireId` and `damId` links. The engine enumerates each recorded sire/dam path to a default depth of four generations, with a hard maximum of eight for callers. A canonical ancestor appears once in the result, while its distinct recorded paths and path count are retained. Path-local cycle detection stops malformed cyclic pedigrees without discarding other valid branches.

Coverage is reported as recorded pedigree positions divided by all positions possible at the selected depth. A missing parent link, a parent ID without a corresponding Animal record, a cycle, or an unrecorded generation remains incomplete. Unknown ancestors are never treated as evidence that a pair is unrelated.

Shared ancestors are descriptive. The result reports closest recorded depths and the number of recorded path combinations. HerdHarbor does **not** publish an inbreeding or relatedness coefficient in Phase 9D: the current data can be incomplete, pedigree depth is bounded, and unknown ancestors cannot safely be modeled as unrelated. This avoids false numeric precision.

## Genetics method

Existing deterministic locus rules remain authoritative. Known, inferred, possible, conflicting, partial, and unknown genotype evidence remain separate. Mendelian percentages are shown only when the relevant parental alleles are resolved. Complex, polygenic, variable-expression, and informational traits do not receive fabricated Mendelian percentages. A phenotype constraint is not relabeled as a known genotype.

## Historical context

Same-pair litter, survival/weaning, and growth context delegates to the Phase 9C Analytics APIs. Missing records and samples below the Analytics minimum stay unavailable. Directly linked Health, production, and show records are counted as recorded context only; their absence is not converted to zero performance, and their presence is not presented as causation or breeding suitability.

All decision-support calculations are read-only. They do not update Animals, pedigrees, genetics profiles, Health records, litters, production records, Tasks, or saved prediction history.
