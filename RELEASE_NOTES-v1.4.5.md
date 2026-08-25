# HerdHarbor Alpha v1.4.5

Rabbit Genetics Prediction, Pairing Fixes, Pedigree Genetics, Help Center & Website Update

## Rabbit Genetics

- Improved the Rabbit Genetics prediction engine so unresolved alleles widen predictions instead of automatically withholding coat-color results.
- Added breeder-readable possible offspring color probability ranges when parent genetics are incomplete.
- Added phenotype-constrained unresolved alleles so visible Self, Dilute, REW, BEW, Harlequin, Magpie, Broken, and other supported phenotypes narrow compatible genotypes.
- Added carrier-dependent color explanations for outcomes that require an unresolved recessive allele.
- Added pedigree-based carrier evidence with decreasing probability through unproven generations.
- Added sibling/family evidence as probabilistic information rather than direct proof.
- Added mate-aware offspring inference and multiple-litter recalculation.
- Added genetics evidence/confidence labels: Known / Direct, Proven by Phenotype, Proven by Offspring, Strongly Inferred, Possible, and Unknown.
- Added genetic contradiction warnings when phenotype, genotype, parentage, or offspring records cannot all be genetically compatible.
- Retained separate Vienna genotype and visible VM/VC/BEW status. Vv does not receive a fabricated visible-marking percentage.
- Retained En broken-pattern inheritance separately from base coat color.
- Retained underlying color genetics for BEW rabbits.

## Genetics on Pedigrees

- Added the current Rabbit Genetics lettering directly to on-screen and printed/exported pedigrees for the subject rabbit, parents, grandparents, and great-grandparents whenever a matching rabbit genetics record is available.
- Pedigree genetics uses the same `refineAnimalGenetics`, phenotype, pedigree, offspring, Vienna, Broken, evidence, and conflict model used by Pair Analysis. It does not maintain a separate pedigree-only genotype.
- Added all seven displayed loci to each genetics line: A, B, C, D, E, En, and V.
- Partial genotypes remain visible with underscores rather than being hidden simply because one or more alleles are unresolved.
- Added evidence-aware visual states for Proven, Inferred, Possible, and Unknown genetics.
- Added a compact Known Genetics summary where card space allows and an interactive genetics detail panel with locus evidence, pedigree/offspring reasoning, and conflicts.
- Added **Show Genetics on Pedigree** settings: Off, Known Only, and Full Inferred. Rabbit pedigrees default to Full Inferred.
- Added **Include Genetics on Printed Pedigree**, enabled by default for rabbits and respecting the selected pedigree genetics mode.
- Known Only preserves entered, phenotype-proven, offspring-proven, and other directly proven genetics while excluding unsupported pedigree-only/possible alleles.
- Full Inferred displays the best current engine-derived sequence, including strong pedigree inference and unresolved underscores.
- Long alleles such as `cchd` and `cchl` are kept as non-breaking locus tokens so wrapping occurs only between loci.
- Four-generation print sizing remains generation-aware, preserves the existing male/female color distinction, and leaves breeder, color, identification, registration, DOB, and other protected pedigree fields at their existing readable sizes.
- Pedigree photos and genetics are laid out without overlap; compact genetics sizing is used in later print generations instead of shrinking the entire pedigree.
- Pedigree genetics recalculates automatically when the underlying HerdHarbor animal/genetics state changes. Calculated genetics is display-only and does not overwrite breeder-entered genotype data.

## Pairing & Breeding

- Fixed Buck/Doe filtering so Female can never match the Buck selector simply because the word “Female” contains the letters “male.”
- Added a shared exact sex-normalization helper used by Rabbit Genetics and as a safety guard for sire/dam and buck/doe selectors.
- Pairing lists continue to exclude inappropriate archived, deceased, sold, and ancestor-only rabbit records.

## Help & Documentation

- Added a question-mark Help button beside the existing appearance control in the HerdHarbor top bar.
- The Help button opens the HerdHarbor How-To Center at https://herdharbor.com/how-to/.
- Added a Rabbit Genetics & Pair Analysis guide to the public How-To Center.

## Release & Website

- Updated the public HerdHarbor website to Alpha v1.4.5 and featured Rabbit Genetics Pair Analysis.
- Updated Web/PWA release and cache metadata so installed testers receive the new build.
- Updated Android versionName to 1.4.5 and versionCode to 7.

## Data Safety

Alpha v1.4.5 is additive. Existing animals, photos, pedigrees, breeding records, litters, offspring, health, production, finances, customers, sales, tasks, backups, custom colors, cloud data, and local device records remain in the existing data model. New genetics fields remain optional and backward-compatible. Pedigree inference is calculated separately for display and does not overwrite breeder-entered genotype data.

## Important Genetics Limitation

HerdHarbor genetics predictions are breeding-planning estimates based on the information recorded in HerdHarbor and deterministic inheritance rules. They are not DNA tests. Variable-expression traits and modifiers such as visible Vienna marking and rufus intensity are not assigned unsupported precision.
