# HerdHarbor Species Context Design Contract

Contract ID: `HH-SPECIES-CONTEXT-001`

Status: **HARDLOCKED**

## Core rule

Operational species-aware HerdHarbor surfaces must derive visible species from the animals currently on that farm. HerdHarbor must not expose tabs, cards, selectors, guidance, genetics, breeding tools, or other species-specific operational UI merely because the application supports that species in code.

A feature may further narrow the current farm species set based on capability. For example, Genetics may show only current farm species that have a registered genetics adapter.

## Current-animal scope

The default species context includes animals still belonging to the farm, including normal current statuses such as Active, Breeding, Growing, Retired, For Sale, and Reserved.

The following historical/reference statuses do not create operational species UI:

- Sold
- Deceased
- Archived
- Ancestor Only

A sold rabbit cannot cause a Rabbit genetics tab to appear on a cattle-only farm. A pedigree-only goat ancestor cannot cause Goat tools to appear. The UI follows the user's current farm, not the complete historical database.

## Historical exceptions

Historical, reporting, pedigree, audit, import-review, and similar screens may intentionally use historical animals, but that must be an explicit opt-in with a stated reason. Historical inclusion is never the default species context for an operational surface.

## Implementation contract

`window.HerdHarborSpeciesContext` is the shared v1.7.1 policy surface. New species-aware operational features should consume this context instead of iterating a static species list, application settings list, or adapter registry to decide what the user sees.

The contract is test-guarded. A future change that removes the hardlock, changes the default away from the current farm, allows Sold/Deceased/Archived/Ancestor Only records to create operational species tabs, or makes Breeding genetics enumerate supported species instead of current farm species should fail regression review.

## Examples

- Farm has only cattle: show Cattle genetics only.
- Farm has cattle, goats, and rabbits: show Cattle, Goat, and Rabbit genetics tabs.
- Farm has active cattle plus sold rabbits: show Cattle genetics only.
- Farm has an active unsupported species: do not invent a supported feature tab; expose it only after that feature has an approved species capability.

This contract is part of the HerdHarbor product architecture and is not a per-user preference.
