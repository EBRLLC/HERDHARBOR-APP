# Education Library Content Audit

Date: 2026-10-07

## Scope

- Proofread all 20 new education articles for spelling, grammar, consistency, and clarity.
- Checked technical claims against current/reviewed university Extension, Merck Veterinary Manual, USDA APHIS, FDA, and UC Davis resources as applicable.
- Preserved the existing two rabbit education articles.
- Added metadata for animal tabs and topic filters instead of duplicating cross-species articles.

## Material factual corrections made

1. **Rabbit gestation:** changed the draft from a broad “28–33 days” statement to approximately **31–33 days** for gestation, while keeping **days 28–29** as nest-box timing.
2. **Neonatal thermoregulation:** specified that neonatal rabbits are unable to thermoregulate effectively until about **7 days of age**.
3. **Maternal nursing behavior:** clarified that does normally nurse only **once or twice daily**, with brief nursing bouts, so constant nest attendance is not expected.
4. **Food-animal withdrawal intervals:** clarified the distinction between labeled withdrawal times and veterinarian-established intervals for lawful extra-label use.
5. **Breeding-program “culling” wording:** changed the text so it does not imply that the industry term always means only removal from breeding; the article now explicitly describes removal from the breeding program and keeps disposition separate.

## Primary fact-check references

- Merck Veterinary Manual — Management of Rabbits
- Oregon State University Extension — Rabbit Coat Color Genetics series
- University of Missouri Extension — Inbreeding: Its Meaning, Uses and Effects on Farm Animals
- University of Missouri Extension — Heritability and Its Use in Animal Breeding
- Utah State University Extension — Rabbit Breeding and Management: A Guide for Producers
- University of Maine Cooperative Extension — Farmer Skill and Knowledge Checklist for Rabbits
- USDA APHIS — livestock biosecurity guidance
- FDA Center for Veterinary Medicine — withdrawal/extra-label-use guidance
- UC Davis Veterinary Genetics Laboratory — pedigree COI/genetic-diversity context

## Implementation notes

- Primary animal tabs: All, Rabbits, Cattle, Goats, Sheep, Poultry, Swine.
- Secondary topics: All Topics, Breeding, Genetics, Pedigrees & Records, Reproduction, Newborn & Young, Health & Biosecurity, Selection & Performance.
- One canonical article can carry multiple species and topic tags.
- Filter state is reflected in the URL query string for shareable/bookmarkable views.
- The article index is data-driven from `resources/articles.json`.
