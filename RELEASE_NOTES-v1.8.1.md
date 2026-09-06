# HerdHarbor Alpha v1.8.1 — October Subscription Launch Trial

Alpha v1.8.1 establishes the transition from HerdHarbor Alpha access to the October 1, 2026 subscription launch without charging anyone during September.

## Launch trial

- Every existing HerdHarbor account is included in the launch trial.
- Every account created before **October 1, 2026 at 12:00 AM Eastern** is included in the same launch trial.
- The launch trial is free through **September 30, 2026** and ends at the October 1 hard-launch boundary.
- The launch trial does not create an automatic charge. A customer must actively choose a paid plan before Stripe can create a paid subscription.
- Existing Founder and manual administrative overrides remain protected and are not silently replaced by automatic subscription policy.

## October 1 hard launch

At the hard-launch boundary, paid checkout becomes available automatically. Accounts without an active paid subscription fall back non-destructively to HerdHarbor Junior, preserving their records while applying the existing Junior limit of up to five active animals. Paid subscription confirmation restores the purchased tier through the existing subscription webhook/access bridge.

Accounts created on or after the hard-launch boundary begin on Junior until a paid subscription is confirmed.

## Server authority

The v1.8.1 Supabase migration:

- backfills launch-trial rows for accounts created before the hard launch;
- records `trialing` status and the exact shared trial end time;
- extends the existing `auth.users` signup trigger so pre-launch signups receive the trial atomically;
- defaults post-launch signups to Junior;
- does not overwrite an already configured provider-backed paid subscription; and
- exposes a non-sensitive launch-policy RPC for authenticated clients.

The `subscription-billing` Edge Function independently blocks checkout before October 1, so changing browser clocks or bypassing the UI cannot start an early paid checkout. Subscription snapshots also expire the launch trial at the server boundary.

## Client integration

`subscription-launch-v1.8.1.js` is a standalone adapter around the existing v1.8.0 Subscription Engine. It connects the engine to the secured Supabase billing function, displays the launch-trial status, disables plan checkout during the trial window, and reconciles post-launch access without rewriting the existing membership engine.

The v1.8.0 mobile viewport fix, v1.7.1 animal-first workflow, Health Intelligence, genetics architecture, v1.7.0 standards/youth guides, and existing sign-in/cloud systems are preserved.