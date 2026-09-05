# HerdHarbor Alpha v1.7.5 — Workflow & Capability Engine

## Purpose

This release foundation connects HerdHarbor's existing animal, Health, Breeding, Genetics, Pedigree, Shows, Production, Tasks, and farm-state capabilities through one shared operational engine.

The engine is intentionally additive. It does not replace canonical records or duplicate module data. It derives profile actions, lifecycle state, activity timelines, Today events, reminders, search results, smart defaults, and location context from the records HerdHarbor already stores.

## Hardlocked contract

`HH-WORKFLOW-ENGINE-001`

1. **Animal-first operational context.** Animal profiles may consume one shared model for relevant tabs, actions, health state, breeding state, and timeline data.
2. **Active-species context.** Operational surfaces inherit the existing active-farm species rule. Sold, deceased, archived, and ancestor-only animals do not create current operational capability.
3. **Canonical records remain the source of truth.** The engine reads Health, Breeding, Tasks, Shows, Production, Animals, Customers, Transactions, and other farm-state collections rather than maintaining competing copies.
4. **Events are derived, not duplicated.** Today can combine existing tasks with Health rechecks, quarantine, boosters, withdrawal periods, breeding milestones, weaning, show dates, and project deadlines.
5. **Smart defaults never become silent assumptions.** Known context can prefill animal/species/parents/previous units. Unknown data stays unknown.
6. **Reminder creation stays user-controlled.** The engine proposes reminders; suggestions are explicitly marked `requiresConfirmation: true` and `silent: false`. Accepted reminders become normal canonical Tasks.
7. **Deterministic derived identifiers.** Birth defaults, offspring defaults, workflow events, and accepted reminder tasks use deterministic IDs where the source record provides stable identity.

## Engine surfaces

### Animal Profile Hub model

`animalProfileModel(animalId, state)` returns:

- current animal context,
- active/quarantine/breeding state,
- relevant profile tabs,
- contextual actions,
- chronological activity timeline.

The capability layer can drive future Profile UI without each module rebuilding its own eligibility rules.

### Breeding lifecycle

Canonical lifecycle stages:

`planned → bred → pregnancy-check → pregnant → due → birth → weaning → complete`

Alternative exits are supported for `not-pregnant` and `cancelled`.

Legacy HerdHarbor statuses remain compatible. The engine maps between the new lifecycle and the current status labels instead of requiring a destructive migration.

### Breeding-to-birth carry-forward

`birthDefaultsFromBreeding()` carries forward:

- breeding ID,
- dam/female ID,
- sire/male ID,
- species,
- breeding date,
- expected birth date,
- applicable expected weaning date,
- prediction/genetics/pairing snapshots when already present.

`offspringDefaultsFromBirth()` carries parentage and source lineage into offspring creation.

### Reviewed timing rules only

The engine reuses timing rules already validated in HerdHarbor for:

- Rabbit: 31-day gestation, 14-day check, nest-box preparation 3 days before expected birth, 42-day weaning rule.
- Cattle: 283-day gestation, 30-day check, preparation 14 days before expected birth, 205-day weaning rule.

Other species may use the same lifecycle immediately, but v1.7.5 does **not** manufacture dates for species without a reviewed timing rule. Explicit user-entered dates remain usable.

### Today event engine

`deriveEvents()` and `todayQueue()` can surface:

- open canonical Tasks,
- overdue work,
- Health episode rechecks,
- active quarantine,
- vaccination/booster follow-ups,
- entered meat/milk/egg withdrawal periods,
- group Health follow-ups,
- breeding checks,
- birth preparation,
- expected birth dates,
- weaning reviews,
- show entry deadlines and start dates,
- show/project target dates.

When a canonical Task already tracks the same breeding or birth reminder, the derived event is suppressed so Today does not show duplicate work.

### Event-driven reminder suggestions

`reminderSuggestions()` creates one-click candidates from records. `acceptReminder()` converts a confirmed candidate into a canonical `state.tasks` record and is idempotent.

The engine does not silently write suggested reminders.

### Contextual Quick Add

`quickAdd()` supports context models for:

- animal,
- litter/birth,
- Health,
- location.

The animal context respects quarantine and active-status rules.

### Smart defaults

`smartDefaults()` can safely carry known data, including:

- current animal ID,
- species,
- breeding sex role,
- most recently used weight unit for that animal,
- breeding → birth parentage/species,
- birth → offspring parentage/source linkage.

### Universal search

`universalSearch()` provides one engine-level search contract across animals, customers, breedings, litters/births, Health episodes/care, shows, transactions/invoices, and locations.

### Animal activity timeline

`animalTimeline()` derives one chronological history from birth, weight/Health records, Health Intelligence, breeding, birth/litter, Shows, Production, disposition, and workflow location activity.

### Location foundation

The additive `state.locations` contract supports hierarchical locations such as:

`Farm → Barn → Pen / Pasture / Cage / Coop`

`animalsAtLocation()` supports direct or descendant lookup. `moveAnimals()` performs a group location move for active animals and records the movement in `state.workflowEngine.activityLog`.

## Integration strategy

`workflow-engine-v1.7.5.js` exposes `window.HerdHarborWorkflowEngine` in the browser and CommonJS exports for tests. It uses `HerdHarborApp.getState()` / `commitState()` when available and falls back to the existing canonical local farm-state key.

This PR adds the engine underneath the existing UI. It deliberately avoids a large Profile/Today UI rewrite in the same change so the shared behavior can be reviewed and stabilized first.

## Release identity

This development PR is scoped as the **v1.7.5 workflow-engine foundation**. It does not promote the currently published v1.7.1 application release identity, Android version code, manifest version, or production release metadata. Those should be promoted only as part of a dedicated release-closeout change after the engine and consuming UI are accepted.
