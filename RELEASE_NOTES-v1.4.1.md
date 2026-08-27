# HerdHarbor Alpha v1.4.1 — Rabbit Pair Analysis Hotfix

This hotfix corrects the live Alpha v1.4.0 Rabbit Pair Analysis behavior without changing existing farm records.

## Fixed
- Buck and Doe selectors now use exact rabbit sex values. `Female` can no longer be misread as `Male`.
- Pair Analysis only offers current Rabbit records with Active/Breeding status; Ancestor Only, Sold, Deceased and other inactive records are excluded.
- Possible offspring colors now use the two selected rabbits' recorded Color/Variety values as calculation inputs.
- Ancestor colors and pedigree-derived genetics are reference-only and do not change the possible-color list.
- Black/Blue/Chocolate/Lilac Magpie, Harlequin and other commonly listed rabbit colors now constrain the prediction instead of falling back to an unconstrained generic list.
- Rabbit Color/Variety entry now exposes a selectable list of supported colors while retaining existing recorded/custom values.
- Unmapped custom colors no longer generate a misleading generic all-colors result; HerdHarbor asks the breeder to choose a mapped color or enter direct genetics.

## Safety
- Existing breeding, animal, pedigree, health, sales, production and cloud-sync data remain unchanged.
- This is a web/PWA hotfix and does not require a new Android package to receive the corrected Pair Analysis logic.
