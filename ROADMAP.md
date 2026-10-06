# HerdHarbor Product Roadmap — Post 2.0.0

Updated: 2026-10-05

## Baseline

This roadmap starts from the current production `main` branch after HerdHarbor 2.0.0, Stack E ownership-transfer hardening, and owner-only admin-promotion enforcement.

The 2.0.0 baseline already includes the core farm-management application, rabbit-specialized breeding/litter/pedigree/genetics workflows, protected cloud sync, subscriptions/referrals, document export, ownership transfer, installable PWA support, Android packaging, and production monitoring.

This roadmap replaces older planning that treated 1.8.x as the active product line.

## Delivery rules

1. Phase 1 of a release starts from the reviewed current `main`.
2. Each later phase branches from the final reviewed head of the immediately previous phase.
3. A red phase is never a valid base.
4. If an earlier phase changes, all dependent phases must be rebuilt/rebased before merge.
5. Existing canonical engines must be reused. No duplicate pedigree, transfer, sync, billing, document, marketplace, or AI persistence engines.
6. Every release requires repository regression, security, account-boundary, state-integrity, PWA/update, and production acceptance gates appropriate to the touched systems.
7. User data must never be deleted or downgraded merely because a subscription, rollout stage, device, or release changes.
8. Hidden/controlled features are not advertised as public until their release gate explicitly opens them.

---

## Phase 0 — Repository and Release Governance

**Goal:** make the delivery process enforce the same safety rules the codebase expects.

### Work
- Protect `main` in both the application and public-site repositories.
- Require pull requests for code changes to `main`.
- Require the current CI/release checks before merge.
- Prevent direct production commits except an explicitly documented emergency path.
- Keep the stacked-PR ancestry rule for multi-phase work.
- Add a small release-status document that identifies current stable version, active development version, and next planned version.
- Keep duplicate-engine acceptance checks as a permanent release gate.

### Done when
- normal feature work cannot bypass PR review/checks;
- the exact commit promoted to production has green required checks;
- production release identity is unambiguous.

---

# Release 2.0.1 — AI-Assisted Workflow Public Release

**Priority:** highest product feature release.

**Goal:** move the already deployed controlled-access AI workflows into a deliberate public release without allowing AI to become a second persistence path.

### Stack 2.0.1-A — AI access and entitlement contract
- Define Member/Founder/Junior availability for each AI action.
- Keep provider credentials server-side.
- Keep per-user/global usage quotas and abuse controls.
- Add explicit feature flags and emergency disable controls.
- Preserve aggregate-only telemetry and privacy boundaries.

### Stack 2.0.1-B — Paper Pedigree Reader
- Publicly expose paper-pedigree photo reading to eligible accounts.
- Require structured extraction validation.
- Keep uncertain values visibly uncertain.
- Require human review before committing.
- Reuse the canonical pedigree graph/save path.
- Add duplicate/conflict checks before save.
- Add production acceptance tests using representative pedigree layouts.

### Stack 2.0.1-C — Photo-Assisted Entry
- Publicly expose supported photo-assisted Animal/Health entry.
- AI prepares a draft only.
- Canonical Animal/Health forms remain final save owners.
- Unsupported or incomplete extraction fails closed.
- Add explicit review, correction, and cancel paths.

### Stack 2.0.1-D — Voice-Assisted Entry
- Publicly expose voice-assisted entry for supported workflows.
- Voice creates review drafts only.
- Canonical Health/Breeding/Animal forms remain final persistence owners.
- Require confirmation for ambiguous dates, animals, dosages, breeding events, and other material fields.

### Stack 2.0.1-E — Multi-input provenance and conflict UX
- Define deterministic field provenance for AI-assisted drafts.
- Show source/conflict state when multiple inputs disagree.
- Do not auto-resolve conflicting pedigree lineage.
- Multi-photo pedigree merging may ship only after this contract is proven.

### Stack 2.0.1-F — Public release and acceptance
- Add user-facing help/how-to content.
- Change website AI messaging from Coming Soon only after production acceptance.
- Verify quotas, fail-closed behavior, canonical save ownership, privacy, and rollback.
- Keep a one-switch ability to disable AI availability without affecting canonical records.

### 2.0.1 exit criteria
- no AI path can directly bypass canonical save owners;
- no provider secret reaches browser code;
- uncertain/conflicting values cannot silently become canonical data;
- AI can be disabled without data migration;
- full regression and production acceptance are green.

---

# Release 2.0.2 — Distribution and Install Quality

**Goal:** finish platform distribution without mixing store work into feature development.

### Stack 2.0.2-A — Android production release
- Final Play Console production package review.
- Validate signing, package/version identity, deep links, install/update behavior, notification/permission behavior, and PWA/TWA fallback.
- Publish only after store-side production confirmation.

### Stack 2.0.2-B — iOS distribution path
- Define the iOS packaging strategy.
- Add the required iOS project/package and store metadata.
- Verify sign-in, camera/photo access, file export, offline/update behavior, and account switching on iOS.
- Do not claim App Store availability before store confirmation.

### Stack 2.0.2-C — Install/update reliability
- Harden PWA update prompts and stale-cache retirement.
- Verify recovery does not require clearing browser/site data.
- Add production install/update smoke tests for desktop, Android, and iOS-supported web install paths.

### 2.0.2 exit criteria
- store availability claims match actual store status;
- app updates preserve user data/session boundaries;
- PWA and packaged-app release identities remain traceable to reviewed commits.

---

# Release 2.1.0 — Marketplace Production Completion

**Goal:** turn the Marketplace from a feature set into a complete production transaction workflow while keeping it a web Marketplace connected to HerdHarbor accounts.

### Stack 2.1-A — Listing and discovery hardening
- Finalize public browse, filters, listing detail, pedigree preview, seller profile, listing states, and responsive UX.
- Verify no public phone/email leakage.
- Keep public photo paths free of authentication UUID exposure.

### Stack 2.1-B — Messaging reliability
- Make buyer-to-seller conversations reliable across reconnect, refresh, and account switching.
- Enforce one canonical conversation for the same buyer/listing pair.
- Enforce exactly-once unread counting semantics.
- Add message delivery/recovery acceptance tests.

### Stack 2.1-C — Moderation and owner controls
- Preserve separate seller suspension and Marketplace suspension.
- Verify owner/admin moderation boundaries.
- Add auditable moderation actions.
- Keep ordinary members isolated from other members' listings-management/messages data.

### Stack 2.1-D — Sale-to-transfer continuity
- Reuse the existing Marketplace listing linkage and canonical ownership-transfer engine.
- Make sold-listing → transfer → buyer acceptance → new-owner package one coherent workflow.
- Do not create another transfer table or transfer lifecycle.

### Stack 2.1-E — Marketplace operations
- Notification preferences and useful transaction notifications.
- Abuse/report handling.
- Operational metrics that do not expose private message content.
- Final end-to-end Marketplace production acceptance.

### 2.1.0 exit criteria
- listing, messaging, moderation, sold-state, transfer, and buyer acceptance work as one tested lifecycle;
- account isolation is preserved;
- no duplicate transfer or messaging persistence path exists.

---

# Release 2.1.1 — Business Membership

**Goal:** release Business only when it has a real product boundary instead of exposing an unfinished tier.

### Work
- Define Business entitlements separately from Member.
- Define business account ownership and staff roles.
- Keep only the owner able to promote another member to admin unless a later explicit security model supersedes that rule.
- Define seat/member limits, billing behavior, role removal, ownership transfer, and audit history.
- Protect herd/account data when staff access changes.
- Add Business signup, billing, downgrade, and cancellation behavior without deleting farm records.

### Exit criteria
- role escalation cannot occur client-side;
- billing/role changes cannot orphan or expose herd data;
- Business has enough differentiated workflow value to justify public release.

---

# Release 2.2.0 — Farm Operations and Decision Support

**Goal:** improve daily utility after the platform, AI, Marketplace, and Business foundations are stable.

### Work
- Consolidated today/this-week farm dashboard.
- Breeding/litter next-action improvements.
- Health follow-up and recurring care workflow improvements.
- Production and profitability reporting refinements.
- Better customer/reservation/sale status visibility.
- Export/report bundles using the shared document engine.
- Performance work on large herds and long record histories.

### Guardrails
- reuse existing analytics, breeding, health, task, sales, and document engines;
- no parallel dashboard-specific stores;
- derived insights must remain traceable to canonical records.

---

# Release 2.3.0 — Sync Authority and Scale

**Goal:** finish normalized-sync rollout only after production evidence supports it.

### Work
- Continue account-by-account/cohort rollout using existing readiness contracts.
- Measure reconciliation, conflict, rollback, and recovery behavior.
- Expand normalized read/write authority only when production evidence is clean.
- Retire legacy recovery/full-state paths only after an explicit reviewed deprecation plan proves they are no longer needed.
- Add scale/performance limits and recovery drills.

### Exit criteria
- no account requires manual local-storage clearing as normal recovery;
- cross-device conflicts remain safe;
- rollback remains available until the retained path is formally retired;
- migration does not create a second long-term sync authority.

---

## Explicitly deferred

These are not allowed to silently enter an earlier release:

- public multi-photo pedigree merge before deterministic provenance/conflict handling is complete;
- public Business tier before roles, billing, data ownership, and audit behavior are complete;
- retirement of legacy sync recovery solely because normalized sync appears stable for a small cohort;
- a second Marketplace, transfer, pedigree, billing, document, sync, or AI persistence engine;
- public claims of Google Play or Apple App Store availability before the stores confirm production publication.

## Priority order

1. Phase 0 — repository/release governance
2. 2.0.1 — AI-assisted workflow public release
3. 2.0.2 — distribution/install quality
4. 2.1.0 — Marketplace production completion
5. 2.1.1 — Business membership
6. 2.2.0 — farm operations/decision support
7. 2.3.0 — sync authority and scale

This order intentionally keeps high-risk infrastructure, AI, Marketplace, billing/roles, and sync changes in separate releases so failures can be isolated and rolled back without unwinding unrelated product work.
