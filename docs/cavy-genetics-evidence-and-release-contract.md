# HerdHarbor Cavy Genetics — evidence matrix and release contract

## Product objective
Match the dependable Rabbit breeder workflow while using **Cavy-only** inheritance rules and records, integrated with canonical animal profiles, breeding records, birth-linked offspring, pedigree, and protected account-specific cloud state. This is a farm management platform, not a standalone coat-color guessing widget.

## Implemented, evidence-bounded loci

| Internal locus | Alleles | Basis | Guaranteed by model | Not claimed |
| --- | --- | --- | --- | --- |
| `roan` | `Rn`, `rn` | **Historical breeding-model symbols**, not a validated cavy molecular marker; the British Cavy Council discusses distinct Roan/Dalmatian alleles and competing explanations | Conditional Mendelian scenario only, plus lethal-white pairing warning | DNA-confirmed `Rn`, a complete allelic series, reliably known genotype from coat appearance, or exact real-world litter outcomes |
| `asip-del4` | `N`, `del4` | **Molecularly characterized** ASIP `c.181_184delTTCA`, Lai et al. (2019), OMIA 1119 | Conditional transmission probability of the specific deletion from recorded parental calls | `N` excludes all other ASIP variants; complete black/brown/agouti phenotype, lab assay validation for every population |

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

## Scientific validation update — November 2026
- **OMIA ASIP**: [OMIA:000201-10141](https://omia.org/OMIA000201/10141/), cites Lai et al. (2019), DOI 10.1111/age.12766. Its entry cautions that inclusion in OMIA does not automatically validate a genetic test for every breed. The model only predicts transmission of the 4-bp deletion, not coat appearance.
- **Roan/Dalmatian**: [British Cavy Council genetics discussion, pp. 12–13](https://www.britishcavycouncil.org.uk/Resources/Cavy%20Genetics%20Article%20October%202008%20rev%20A.pdf) describes the Wh / wh^mi / wh model and alternative mechanisms. The software's Rn/rn shorthand is a **conditional two-allele teaching/breeding model**, not a sequence-confirmed marker. Warnings against Roan × Roan / Dalmatian × Dalmatian / cross-pairings are supported by [PNW 573 Cavy 4-H guide, p. 23](https://ucanr.edu/sites/default/files/2023-03/381917.pdf).
- **MC1R**: [OMIA:001199-10141](https://omia.org/OMIA001199/10141/) describes c.749T>C and a distinct 2,760-bp gene deletion. They are **not** implemented in the predictor. No extrapolation to all chocolate/red/white color combinations without validated gene interactions.
- **Evidence conflicts**: a recorded offspring genotype impossible under the entered parental calls is now identified by a non-destructive pedigree review function. The parentage/genotype is **not** silently corrected because the source record or the genetic model may be wrong.
- **Percentage interpretation**: displayed Mendelian 25/50/25 percentages are conditional model outcomes **per conception**, not guaranteed live-birth frequencies, especially with the Roan/Dalmatian lethal-white-associated category.
