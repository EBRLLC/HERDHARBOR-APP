# Alpha v1.6.7 — Mobile Settings Layout Hotfix

## Problem
On narrow iPhone/mobile viewports, Pedigree appearance checkbox rows in Settings could inherit the app's generic form-control sizing. The checkbox then consumed the row width and pushed its label text outside the settings card. The same shared row is used by the pedigree genetics print option.

## Fix
- Constrain the Pedigree appearance settings card and rows to the available card width.
- Give checkbox controls an explicit 22px mobile-safe footprint instead of inherited full-width form sizing.
- Use a two-column `24px / minmax(0, 1fr)` layout so checkbox text wraps inside the card.
- Constrain select controls and help text to the card width.
- Apply the same containment to the genetics settings injected into the Pedigree appearance card.
- Add a permanent mobile settings regression contract.

No animal, pedigree, genetics, cloud, membership, billing, Market, or analytics data behavior is changed.
