# Stack E Duplicate-Engine Audit

Stack E extends the existing HerdHarbor ownership-transfer architecture. It does not replace or fork the canonical engines.

## Canonical responsibilities

| Responsibility | Canonical implementation |
| --- | --- |
| Transfer payload/import | `direct-transfer-core-v1.8.2.js` |
| Transfer UI/orchestration | `direct-transfer-v1.8.2.js` |
| Server lifecycle/auth | `supabase/functions/animal-transfer/index.ts` |
| Transfer database | `herdharbor_direct_animal_transfers` |
| Transfer audit | `herdharbor_direct_transfer_events` |
| Sale-to-transfer | `litter-sale-transfer-core-v1.8.2.js` |
| Pedigree graph | `pedigree-engine-v2.0.0.js` |
| Pedigree rendering | `pedigree-renderer-v2.0.0.js` |
| Marketplace pedigree | `marketplace-pedigree-snapshot-v2.0.1.js` |
| Document export | `document-export-v2.0.0.js` |
| Birth Certificate | `birth-certificate-v2.0.0.js` |
| New Owner Package | `new-owner-package-v2.0.0.js` orchestration only |
| Herd persistence | Existing normalized authority / CAS / cloud sync path |

## Stack E database changes

- E1 alters the existing direct-transfer table, adds explicit category/expiry contract, and adds a service-role-only authoritative herd reader.
- E2 alters the existing direct-transfer table with an optional verified Marketplace listing link.
- E3 extends the existing transfer-event vocabulary with expiry.
- E4 adds no transfer database.
- E5 adds no transfer database.

No second transfer lifecycle table exists.

## Stack E server changes

All server lifecycle changes are in the existing `animal-transfer` Edge Function. There is no second ownership-transfer Edge Function.

The server now:
- reconstructs animal/pedigree payload data from the seller's authoritative herd instead of trusting browser animal fields;
- verifies the intended recipient;
- verifies optional Marketplace listing ownership, sold state, listing kind, and source animal;
- uses the existing pending/accepted uniqueness contract;
- uses compare-and-set acceptance;
- expires overdue pending transfers;
- retains the canonical transfer audit history.

## Stack E client changes

The existing direct-transfer client remains authoritative. Seller category selection, buyer review, server-first acceptance, interrupted-import recovery, and transfer status rendering all remain in that client.

No independent local ownership-transfer store was added. Accepted animals continue through the existing HerdHarbor state persistence/cloud sync boundary.

## Documents

The New Owner Package does not implement PDF generation or pedigree traversal. It composes:
- canonical pedigree graph;
- canonical pedigree renderer;
- canonical Birth Certificate body;
- canonical shared document exporter.

## Privacy

The transfer payload contract excludes seller notes, health notes, Marketplace messages, customer records, billing/subscription information, and unrelated herd records. Optional structured genetics and sanitized ownership provenance are seller-selectable.

The New Owner Package uses explicitly selected safe fields and does not read Marketplace messages or account billing data.

## Acceptance result

Stack E is accepted only when:
1. Stack E1-E5 tests pass.
2. Full HerdHarbor regression passes in both CI time zones.
3. Android review bundle passes.
4. E1-E5 remain one ancestry chain.
5. Sequential retarget/merge diffs contain only each phase's intended incremental change.
6. Final main CI passes after E5 merge.
