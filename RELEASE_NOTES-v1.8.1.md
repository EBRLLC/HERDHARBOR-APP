# HerdHarbor Alpha v1.8.1 — October Subscription Launch

Alpha v1.8.1 establishes the subscription rollout calendar without replacing the standalone v1.8.0 Subscription Engine.

## Launch policy

- Launch-trial window begins September 6, 2026.
- Every ordinary HerdHarbor account receives full Member-level access during the launch trial, including accounts that already existed before September 6 and accounts created between September 6 and September 30.
- The launch trial remains active through September 30, 2026.
- Subscription hard launch is October 1, 2026 at 12:00 AM Eastern Time.
- Founder access remains Founder access and is not converted to a temporary trial.
- Owner/admin access and active manual overrides remain unchanged.

## October 1 behavior

Beginning October 1, an active paid subscription receives the subscribed paid tier. Accounts without an active paid subscription fall back to the existing Junior tier rather than losing access to their HerdHarbor records. Junior retains the existing 5-active-animal limit for new active-animal transitions; existing records are not deleted.

This makes October 1 the hard subscription launch while protecting user data and avoiding destructive account lockout behavior.

## Architecture

- New `subscription-launch-v1.8.1.js` policy layer wraps the existing Membership API instead of rewriting the v1.8.0 Subscription Engine.
- Existing v1.8.0 subscription provider, referral, diagnostics, and account UI architecture remain intact.
- The launch policy is loaded before the standalone Subscription Engine so the engine sees the effective trial entitlement.
- The PWA shell is rotated to a v1.8.1 cache and the launch-policy asset is network-first to prevent stale rollout dates.
- Production Pages publishing verifies the v1.8.1 launch contract before deployment.

## Hardlocked dates

- Trial start: `2026-09-06T00:00:00-04:00`
- Subscription hard launch: `2026-10-01T00:00:00-04:00`

These dates are release policy and must not be silently changed by unrelated future work.
