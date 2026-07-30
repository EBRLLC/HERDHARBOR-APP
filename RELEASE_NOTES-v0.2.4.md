# HerdHarbor Pre-Alpha v0.2.4

## Cleaner pedigree redesign

This tester release replaces the heavy pedigree table with a cleaner, print-first family tree inspired by breeder feedback.

### Changes

- Added compact pedigree cards with restrained corner rounding and thin borders
- Added light connector lines between all four pedigree columns
- Added clear buck/doe or male/female indicators
- Added compact ID, date of birth, color, breed, registration, and breeder fields
- Added a cleaner in-app three-generation pedigree preview
- Reworked the printable sale pedigree to fit one landscape Letter page
- Preserved seller, buyer, transfer, notes, certification, and signature fields
- Updated build, backup export, and feedback-form version identifiers to v0.2.4

## Data compatibility

The browser storage key remains:

`herdharbor_pre_alpha_v1`

Existing tester data should remain available when this file replaces the current app on the same domain and origin. Testers should still export a JSON backup before updating.
