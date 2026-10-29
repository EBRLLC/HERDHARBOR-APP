# HerdHarbor 2.0.1 — Release Candidate Notes

**Status: release-isolated draft [PR #505](https://github.com/EBRLLC/HERDHARBOR-APP/pull/505), NOT MERGE-READY and not deployed.** Stable production remains **2.0.0** until explicitly accepted, merged and deployed. Updated 2026-10-26.

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

**Separate release contract:** the normalized-primary cloud cutover, server migration tooling, automatic account conversion and new-account normalized-only signup are excluded from 2.0.1 and staged independently in [2.0.2 PR #506](https://github.com/EBRLLC/HERDHARBOR-APP/pull/506). Existing cloud sync and controlled dual-write remain intact. Historical combined PR #497 is closed unmerged.

## Deliberate exclusions
No AKC document issuance or official AKC branding/verification, registry API scraping, canine breeding/whelping, new native push infrastructure, Marketplace changes, subscription pricing changes, Business account release, Android/iOS store publication, new persistence authority, RLS migration or sync cohort expansion.

## Evidence and approvals
The #505 release-candidate CI suite tests the full inherited 2.0.0 regression in UTC and America/New_York, Android unsigned release review, 2.0.1 model/UI static contracts and canonical serialization. These checks are required but **not proof of human device/print acceptance**.

Before merging #505, the owner must approve a controlled save/close/reopen upgrade from older 2.0.0 PWAs (see the unresolved S17-B-LEGACY-TIMER), verify GitHub Pages Source = GitHub Actions and complete the device and cross-account acceptance checklist in `docs/2.0.1-owner-acceptance.md`, approve the access matrix and any operational feature flags, and verify the exact release commit after merge. Until then, 2.0.1 must not be described as live.
