# HerdHarbor Release Status

Updated: 2026-10-26

- Stable production version: 2.0.0
- Stable production channel: web / installable PWA
- Active development version: 2.0.1
- Next planned release: 2.0.1 — canine pedigrees, optional AI and S1–S17 stabilization (draft [PR #505](https://github.com/EBRLLC/HERDHARBOR-APP/pull/505))
- Deferred release: 2.0.2 — normalized-primary cloud storage, signup migration, recovery and account cutover (draft [PR #506](https://github.com/EBRLLC/HERDHARBOR-APP/pull/506)); distributions previously planned for 2.0.2 move to 2.0.3
- Release gate: PR review only; no merges, no deployments or public feature enablement before owner acceptance
- 2.0.1 review stack: #505 only. Old combined #497 is superseded and closed unmerged. Exact-head CI, controlled 2.0.0-PWA upgrade, real-device, account isolation, Pages-source and owner acceptance are all required; green CI does not authorize publication
- Google Play: not yet production-published
- Apple App Store: not yet production-published
- AI-assisted paper pedigree, photo entry, and voice entry: deployed behind controlled access; not yet generally public

## Production authority

The S18–S22 normalized-primary migration and its Auth trigger must not enter 2.0.1 or execute against production as part of a canine/AI release. 2.0.1 preserves existing cloud and dual-write authority; #506 is the independent 2.0.2 migration gate. The S17 legacy 2.0.0 update-timer caveat remains unresolved and requires a controlled save/close/reopen rollout on each device.


Production code must originate from a reviewed pull request with green required CI. Direct commits to `main` are not an approved release path.

Emergency production changes must:
1. use a dedicated hotfix branch;
2. open a pull request to `main`;
3. pass the same required CI as normal changes;
4. document the incident and rollback path in the PR.

The exact production commit must remain traceable to its pull request and release checks.

## Canonical architecture guardrail

The duplicate-engine audit is a permanent release gate. New work must reuse the established canonical transfer, pedigree, document, sync, billing, Marketplace, and AI persistence authorities instead of introducing parallel lifecycle or persistence engines.
