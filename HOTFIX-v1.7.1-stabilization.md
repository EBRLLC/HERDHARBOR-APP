# HerdHarbor Alpha v1.7.1 Stabilization Hotfix

This hotfix hardens the v1.7.1 Multi-Species Genetics and Health Intelligence release before v1.7.2 cattle genetics begins.

## Fixed

- Prevents an animal from being assigned as its own sire or dam.
- Prevents cross-species sire/dam pedigree assignments.
- Keeps inactive Sold, Deceased, Archived, and Ancestor Only animals out of new breeding selections.
- Prevents quarantined animals from being newly selected for breeding and surfaces a Breeding review warning when a current breeding includes a quarantined animal.
- Prevents deletion of an animal while lineage, birth/litter, or Health Intelligence records still depend on it.
- Preserves historical editing of existing breeding records instead of breaking records solely because an animal later became inactive or quarantined.
- Restores Symptom Guide urgency filtering while keeping the clearer Emergency / Urgent / Monitor closely display labels.
- Removes inactive historical animals from the operational Symptom Guide animal selector.
- Repairs Species Context API drift by providing the Health layer with the same current-farm contract used by Genetics and by correctly honoring explicit historical scope in grouped species queries.
- Freezes the exact animal IDs included in a group health record at the time the record is saved.
- Includes Health Intelligence episodes, structured care records, and snapshotted group records in animal Health record totals.
- Adds a full Health Intelligence history view with edit and delete controls.
- Displays lb + oz Health weights with the ounces component and corrects Health Intelligence weight-change alerts that previously ignored ounces.
- Adds Health Episodes, Structured Care, and Group Health worksheets to Excel record exports.
- Preserves the real Pending sale status when a HerdHarbor Excel workbook is imported instead of collapsing it to Draft.
- Removes the temporary legacy Health Intelligence sidecar key when Clear Local Data is used.
- Adds the stabilization script to the PWA application shell and network-first cache.

## Production publishing

The monitored Pages publisher is changed from a hard-coded release SHA/manual rerun workflow to a current-main authoritative publisher. On a main push it waits for any branch-source Pages run for the same commit to finish, verifies the exact current SHA, runs the v1.7.1 stabilization and completion tests, builds monitoring with the production DSN, and then deploys the monitored artifact last.

## Scope

No new genetics trait or locus claims are introduced. Rabbit genetics remains delegated to the completed v1.6.1 rabbit engine. The release remains Alpha v1.7.1; this is a stabilization hotfix, not v1.7.2.
