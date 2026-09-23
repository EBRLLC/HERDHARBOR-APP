# Production Cloud-Sync Telemetry Validation Runbook

## Scope

This runbook covers the production **legacy full-state** cloud-sync path only. It does not authorize normalized-sync cutover, schema mutation, or a HerdHarbor whole-application release bump.

## Expected Sentry contract

A handled legacy cloud provider failure should identify:

- operation: for example `cloud-preflight`, `cloud-save`, or `cloud-race-reload`
- provider: `supabase`
- provider error code and provider/HTTP status when present
- deterministic classification only when supported by provider/runtime evidence
- sanitized provider message, details, and hint
- sync engine and stage
- HerdHarbor application release and cloud component build
- browser online/offline state
- serialized state byte count only, never the state itself
- retry attempt count and terminal retry result
- session-refresh attempted/result when a 401 path actually used refresh

When the provider/runtime supplied an actual JavaScript `Error`, Sentry should capture that originating exception so its stack remains provider/runtime-derived. If the provider supplied only a structured non-`Error` object, monitoring records a handled message plus safe metadata; it must not manufacture a stack in the monitoring adapter.

## Classification evidence

Treat a classification as evidence-backed only when the captured status/code/message/runtime state supports it. Examples include:

- offline: browser explicitly reported offline
- auth: provider status 401
- permission: 403, PostgreSQL/RLS permission code, or explicit permission-denied provider text
- conflict: 409 or documented conflict/concurrency code
- payload: 413
- rate limit: 429
- server: 5xx
- timeout/network/validation: only when the provider/runtime error explicitly matches those conditions
- unknown: insufficient evidence

Do not promote `unknown` into a root-cause diagnosis without additional provider evidence.

## Retry interpretation

Transient categories are bounded to the existing retry policy. `retry_attempts` reports how many delayed retries were actually scheduled.

Terminal values:

- `not_retryable`: the observed failure was not in the transient retry set
- `exhausted`: the transient retry budget was consumed
- `recovered`: at least one delayed retry occurred and a later request succeeded
- `not_needed`: no delayed retry was needed
- `retrying`: an intermediate internal state; a final failure event should normally resolve to another terminal value

A 401 may attempt **one** supported session refresh. Check `session_refresh_attempted` and `session_refresh_result`; do not infer that authentication was repaired merely because refresh was attempted.

## Root-cause threshold

Before assigning a production root cause, retain all of the following when available:

1. operation and timestamp/reference
2. provider code/status
3. sanitized provider message/details/hint
4. classification and online state
5. retry/session-refresh outcome
6. component build and application release
7. whether the captured exception has a provider/runtime-origin stack

If those fields do not establish the cause, report the failure as undetermined and collect another occurrence rather than guessing.

## Privacy boundary

Never send access/refresh tokens, authorization headers, passwords, cookies, secrets, full farm state, record payloads, animal records, notes, or uncontrolled provider responses. State diagnostics are byte counts only. Provider text is sanitized and length-bounded before it reaches monitoring.

## Production validation checklist

For the next naturally occurring production cloud failure, verify that:

- the stack is not rooted in `herdharbor-monitoring-instrumentation.mjs` merely because monitoring handled the event
- safe provider fields are populated where the provider supplied them
- raw state and credentials are absent
- retry/session-refresh metadata matches the observed path
- application release remains `1.8.2` unless a separate formal release changes it

Do not trigger destructive writes or deliberately corrupt production data to create a validation event.
