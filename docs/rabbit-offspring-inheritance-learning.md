# Rabbit offspring genetics learning — 2.0.4 hotfix

## Using the feature
Record rabbit sire and dam IDs. Add kits through Births/Litters or link their sire/dam in the animal profile. Record actual coat color when observable. Then choose **Breeding → Breeding Intelligence → Learn from recorded offspring**.

The action uses the current normalized account's canonical state, updates both kits and parents, and commits changes through the canonical state saver. It never writes the old legacy snapshot. Open **Rabbit genetic profile** for a kit to see **Recorded family and offspring inheritance**, including supporting relatives and possible genotypes.

## Scientific results and labels
- A unique genotype supported by parental genotype and recorded phenotype is labeled **strongly inferred**, never DNA-confirmed.
- If one allele is obligatory but the second is unknown, the locus records the obligatory allele and an underscore for unknown.
- When multiple genotypes are possible, the candidates are stored in family-inferred evidence, rather than assigning a complete genotype to the kit.
- Conception-level Mendelian probabilities appear only when both parental genotype pairs are uniquely recorded. They do not constitute a DNA result or a post-observation posterior probability.
- Unknown or insufficient evidence stays unknown.

## Data-integrity protections
- Unverified/disputed sire, multiple potential sires, duplicate identities across species, mismatched accounts, sex conflicts and ancestry cycles prevent automatic inference.
- Manually confirmed or DNA-tested records are not overwritten. Contradictions are flagged for review.
- Corrections to parentage, owner, sex, phenotype or genotype trigger recomputation on subsequent canonical saves.
- Repeated button clicks without changes do not save again. Save failure leaves the original account state intact and displays an error.
- No unsupported genotype or phenotype probability is invented.

## Verification and limits
The regression tests include real Chromium button clicks, rollback on rejected canonical saves, genotype retraction, account boundaries, and normalized record serialization/reassembly. User testers remain the functional test population after deployment. Automated tests do not imply that a separate signed-in Supabase round-trip was performed.
