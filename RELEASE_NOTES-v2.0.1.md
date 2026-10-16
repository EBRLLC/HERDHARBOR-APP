# HerdHarbor 2.0.1 — Release Candidate Notes

**Status: code in stacked pull requests, not released.** Stable production remains **2.0.0** until explicitly reviewed, merged and deployed. Date: 2026-10-16.

## Canine breeder-managed foundation
- Dog registration profile includes call name, registered name, breed lookup, repeatable registry/number entries and separate prefix/suffix title records.
- Breed catalog is versioned to AKC's official January 1, 2026 recognition list (205 recognized breeds); free-form non-AKC, cross-breed or mixed entries remain permitted.
- The existing animal-first home continues to mix rabbits, dogs and other current animals. Dog records use the ordinary animal profile and canonical cloud state, not a second datastore.
- Parent references require Dog records in the same farm with appropriate sex, known IDs and no circular ancestry; historical `Ancestor Only` dogs stay historical.
- Dog pedigree preview/print offers 3-/4-generation, landscape Letter/A4 and selected registry, preserving registered names/title order and full ancestor text. Output includes an explicit **unofficial breeder-maintained** disclaimer. It is not a certified AKC pedigree or a registry verification.
- Rabbit breeding, pedigrees, printed documents, birth certificates and other livestock workflow paths retain their existing engines; no new canine reproduction/puppy/COI/genetic-calculator system is claimed.
- Generic manual tasks and health follow-up reminders use the existing shared Today/Tasks queue; unsupported canine pregnancy/whelping notifications are not generated.

## Optional AI access and limits
- Paper photo and record-photo extraction now check authenticated account + server-side AI policy in addition to existing provider quotas, with independent emergency-disable controls.
- All broad AI public switches stay **OFF** pending owner approval of an explicit Member/Founder/Junior eligibility matrix. Pilot access requires a server-only approved tester allowlist.
- Existing paper-pedigree photo AI is rabbit-oriented. Canine AI scans remain unavailable pending an authorized reference image corpus and measured field accuracy. Manual canine pedigree entry works independently of AI.
- Photo review no longer defaults an unknown species to Rabbit; voice drafts require a resolved animal/date. Both retain canonical form handoffs and explicit review/cancel steps.
- Voice is browser-local speech parsing, not a cloud voice model; no AI setup is required for core app use.

## Deliberate exclusions
No AKC document issuance or official AKC branding/verification, registry API scraping, canine breeding/whelping, new native push infrastructure, Marketplace changes, subscription pricing changes, Business account release, Android/iOS store publication, new persistence authority, RLS migration or sync cohort expansion.

## Evidence and approvals
The stacked PR CI suite tests the full inherited 2.0.0 regression in UTC and America/New_York, Android unsigned release review, 2.0.1 model/UI static contracts and canonical serialization. These checks are required but **not proof of human device/print acceptance**.

Before a public rollout, the owner must review the final PR stack, complete the device and cross-account acceptance checklist in `docs/2.0.1-owner-acceptance.md`, approve the access matrix and any operational feature flags, and verify the exact release commit after merge. Until then, 2.0.1 must not be described as live.
