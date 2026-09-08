# Auth callback deadlock hotfix — v1.8.2 additive layer

Public release identity remains **v1.8.1**.

## Confirmed freeze path

The cloud client started `hydrateUserData()` synchronously from Supabase's `SIGNED_IN` auth-state callback. Hydration immediately performs additional Supabase account/cloud requests. Supabase auth callbacks must return without starting additional client work that can wait on the auth lock; otherwise `signInWithPassword()` can remain pending and the UI stays on **Signing in…**.

## Fix

- Wrap HerdHarbor-created Supabase clients before `herdharbor-cloud.js` initializes.
- Defer auth-state callbacks with a zero-delay task so Supabase can release its auth notification lock first.
- Preserve the existing auth event payload and subscription API.
- Keep authentication fail-closed; no auth lock is removed by this layer.
- Keep the existing 12-second critical-network guard and 15-second form watchdog.
- Ensure watchdog messages use the visible error class.
- Add regression coverage proving `SIGNED_IN` callbacks are not executed synchronously.
