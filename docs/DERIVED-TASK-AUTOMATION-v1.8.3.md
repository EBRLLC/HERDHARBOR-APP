# Derived Task Automation — v1.8.3

Phase 9F extends HerdHarbor's existing TaskRuntime with deterministic reminder reconciliation.

## Ownership

- `state.tasks` remains the only canonical task store.
- `task-runtime-v1.8.3.js` remains the only runtime that reconciles derived tasks into canonical state.
- `task-automation-v1.8.3.js` is definition-only. It does not persist data or mutate Health, Breeding, Litters, Animals, Sales, Production, or other domain state.
- Existing Breeding/Litter reminder producers remain authoritative for pregnancy checks, birth preparation, expected birth, and weaning.

## New derived sources

Phase 9F adds:

- optional breeding follow-up date -> Breeding task
- optional litter follow-up date -> Litter/Weaning task
- Health follow-up date -> Health task
- Medication follow-up date -> Medication follow-up task
- Vaccination follow-up date -> Vaccination follow-up task
- optional Health follow-up recurrence -> recurring-care task series using existing TaskRuntime recurrence rules

## Idempotency

Derived root task IDs are deterministic from source type, source record ID, and reminder type. Re-running synchronization updates the same root task instead of creating duplicates.

Completed recurring roots create their next occurrence through the existing TaskRuntime recurrence engine. Synchronization does not recreate or reopen the completed root while that source fingerprint is unchanged.

A completed non-recurring derived task may reopen only after the canonical source schedule actually changes.

If a source follow-up date is removed or an automation-managed source record disappears, the root task is closed rather than assigned an invented date.

## Safety boundary

Task due/completion state never changes the underlying Health, Breeding, Litter, or Animal record.

Missing dates produce no new reminder. No default due dates are invented.

No database/schema changes, Edge Functions, secrets, or provider changes are required.
