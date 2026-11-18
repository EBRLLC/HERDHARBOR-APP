# HerdHarbor Cavy Genetics — evidence matrix and release contract

## Product objective
Match the dependable Rabbit breeder workflow while using **Cavy-only** inheritance rules and records, integrated with canonical animal profiles, breeding records, birth-linked offspring, pedigree, and protected account-specific cloud state. This is a farm management platform, not a standalone coat-color guessing widget.

## Implemented, evidence-bounded loci

| Internal locus | Alleles | Basis | Guaranteed by model | Not claimed |
| --- | --- | --- | --- | --- |
| `roan` | `Rn`, `rn` | Conventional Roan/Dalmatian breeding genetics | Per-locus Mendelian offspring percentages from two known genotypes and lethal-white-associated warning for `Rn/Rn` | That absent visible roan means absence of the factor, or phenotype certainty |
| `asip-del4` | `N`, `del4` | Lai et al. (2019), ASIP `c.181_184delTTCA` | Transmission frequency of a specific published recessive-black-associated deletion | All agouti variants; entire-coat black, brown, or mixed-color percentages |

Primary reference: [OMIA ASIP cavy agouti / deletion](https://omia.org/OMIA000201/10141/). Additional cavy MC1R alleles are documented separately by [OMIA extension locus](https://omia.org/OMIA001199/10141/) but **not yet modeled** because the complete allelic series and interactions require further explicit validation.

## Inference contracts
1. Only deduce a genotype when the only offspring possibility has two known alleles. Multiple possible genotypes must remain an evidence-qualified list, not an asserted individual genotype.
2. The user selects and records the genetic evidence. Breeder reports must never silently be promoted to DNA-verified status.
3. Preserve direct/manual, test, and imported genetics, even when an inferred result disagrees. Such disagreements need separate review rather than overwrite.
4. Respect uncertain or missing paternity, duplicate animal IDs, parent sex, species isolation, and account ownership boundaries.
5. Recompute derived genotype possibilities following animal and genetic record changes, including new manually entered offspring with sire and dam. Clear obsolete derived results.
6. Keep probabilities explicitly per-locus; do not multiply them into a combined coat-color prediction unless independent inheritance and phenotype mapping are supported.
7. Warn about potentially lethal Roan/Dalmatian combinations. No result is a guarantee of reproductive safety.
8. Do not alter Rabbit, Dog, Cat genetics, or normalized-cloud authority.

## Remaining product milestones
- Audited cavy genetics completeness matrix (coat color, dilution, markings, eye color, coat length and coat textures) with variant-level references and a not-predictable fallback
- Comprehensive source-evidence collection, visual phenotype interpretation, pedigree conflict warnings, and test evidence upload
- Breeding-pair selector integrated into canonical breeding plans, plus owner-side outcome tracking compared against actual offspring
- Breed- and registry-dependent color/variety dictionaries kept separate from custom breeder terms
- Real browser signed-in flows, multi-device cloud round-trip, offline upgrade recovery, staging RLS and full UX acceptance

No production rollout or comprehensive phenotype calculator should be claimed on the basis of this incremental work.
