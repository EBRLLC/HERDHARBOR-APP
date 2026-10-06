# Repository and Release Governance

## Main branch policy

Both HerdHarbor repositories use `main` as production source. Normal changes must enter `main` through a pull request.

Required behavior:
- no feature development directly on `main`;
- no red PR may be merged;
- multi-phase work uses stacked PR ancestry;
- a corrected earlier phase requires dependent phases to be rebased/rebuilt;
- emergency fixes still use a hotfix branch and PR;
- production claims must match the exact deployed commit and external store state.

## Required application checks

The application PR gate must include:
- repository security audit/current release contract;
- lifecycle state-integrity gate;
- complete regression suite in UTC;
- complete regression suite in America/New_York;
- Android review bundle;
- explicit duplicate-engine/canonical-authority audit.

## Canonical engine rule

A new feature must extend or compose the existing canonical owner for its responsibility. Creating a second lifecycle/persistence owner for convenience is a release blocker.

The permanent ownership-transfer audit is `tests/stack-e5-transfer-hardening-audit.test.cjs`. Future canonical-authority audits should be added to the governance test command rather than replacing this test.

## Branch protection requirement

GitHub branch protection/rules for `main` must require pull requests and required status checks. Repository code and CI cannot substitute for server-side branch protection; the GitHub repository rule is the enforcement boundary that prevents a direct write to `main`.
