# Authentication freeze hotfix — v1.8.2 additive layer

Public release identity remains **v1.8.1**.

## Failure mode

The sign-in form disables its controls while Supabase authentication is pending. The initial post-login hydration also keeps the app behind `hh-auth-locked` while loading access metadata and the user's cloud record. Those waits previously had no upper bound, so a stalled auth or cloud request could make sign-in appear permanently frozen.

## Guardrails

- Only critical first-login Supabase requests receive the bounded timeout.
- Authentication is never bypassed and `hh-auth-locked` is never removed by the resilience layer.
- If the sign-in request itself stalls, the form becomes usable again with an actionable error message.
- If the first cloud hydration stalls, the existing cloud loader receives an error and can use its established safe offline-copy fallback.
- Storage, file uploads, Edge Functions, and unrelated network requests are not timed out by this layer.
