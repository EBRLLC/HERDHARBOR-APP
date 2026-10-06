# HerdHarbor Release Status

Updated: 2026-10-05

- Stable production version: 2.0.0
- Stable production channel: web / installable PWA
- Active development version: 2.0.1
- Next planned release: 2.0.1 — AI-Assisted Workflow Public Release
- Google Play: not yet production-published
- Apple App Store: not yet production-published
- AI-assisted paper pedigree, photo entry, and voice entry: deployed behind controlled access; not yet generally public

## Production authority

Production code must originate from a reviewed pull request with green required CI. Direct commits to `main` are not an approved release path.

Emergency production changes must:
1. use a dedicated hotfix branch;
2. open a pull request to `main`;
3. pass the same required CI as normal changes;
4. document the incident and rollback path in the PR.

The exact production commit must remain traceable to its pull request and release checks.

## Canonical architecture guardrail

The duplicate-engine audit is a permanent release gate. New work must reuse the established canonical transfer, pedigree, document, sync, billing, Marketplace, and AI persistence authorities instead of introducing parallel lifecycle or persistence engines.
