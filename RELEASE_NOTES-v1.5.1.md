# HerdHarbor Alpha v1.5.1 — Stability, Memberships, Junior & Admin

Alpha v1.5.1 completes the stability and access-management foundation without replacing HerdHarbor's existing farm records, authentication, Cloud Sync, backups, exports, genetics, or billing-independent Member access.

## Added

- Privacy-safe browser crash and operational-error monitoring for web, installed PWA, Android TWA, and the JavaScript layer used by iOS Capacitor.
- Independent PWA update discovery with a clear **HerdHarbor Update Available** prompt, **Update Now**, and a four-hour **Later** deferral.
- Central account policy that separates the Owner/Admin/User account role from the Junior/Founder/Member/Business membership tier.
- Supabase-backed **Admin → Members** directory with real name, email, UUID, role, tier, status, creation-date, and last-login search/display for authorized Owner/Admin accounts.
- Secure role and membership changes through the exact installed Supabase RPC contracts, with the existing `admin_audit_log` history shown in member details.
- Permanent, expiring, and manually removable membership overrides plus **Return to Automatic**.
- HerdHarbor Junior with full current core access and a maximum of five active animals.
- Junior enforcement for new records, reactivation, offspring, transfers, spreadsheets, and demo-data creation.
- Per-account offline entitlement retention, so a last-verified Junior remains five-animal limited after an offline restart.
- Billing-provider adapter and centralized subscription-state resolver for later activation. Billing remains disabled and makes no charges in this review build.
- Alpha v1.5.1 version metadata for web/PWA and Android review build 9.

## Preserved behavior

- Normal new accounts continue to resolve to User + Member + Default + Active.
- Existing accounts are not converted to Junior.
- Founder remains unlimited and separate from account administration.
- Junior uses the existing animals, pedigrees, breeding, litters, shows, health, tasks, backups, exports, and Cloud Sync data.
- Sold, Deceased, Archived, and Ancestor Only records do not consume a Junior active-animal slot.
- A downgrade above five active animals deletes or hides nothing. The account can edit existing records and reduce usage but cannot increase the active count.
- Upgrade to Member changes entitlement only; no records are migrated.
- The Owner identity comes only from the authenticated Supabase UUID and protected `account_access` record. It is never inferred from or hard-coded to an email address.

## Privacy and security

- Normal users do not see Admin navigation and are also denied by Supabase RLS.
- Browser code never receives a service-role key and never directly updates `account_access`.
- Owner cannot be assigned or removed through the client UI.
- Admin member access does not expose animal records, health records, customers, finances, notes, backups, sync payloads, passwords, tokens, or provider secrets.
- Email, display name, and last-login time come only from the Owner/Admin-guarded allowlisted directory RPC. Cross-account active-animal usage remains unavailable and is never derived from private farm state.
- The offline access cache is scoped to the authenticated Supabase UUID and contains no identity, farm, financial, health, or session data.
- Monitoring strips secrets and record contents and remains fail-open when no Sentry DSN is configured.

## Billing state

The v1.5.1 build contains plan metadata and a provider-neutral entitlement adapter for Junior (free), Founder ($7.99/month grandfathered), Member ($14.99/month), and reserved Business. `billingEnabled` remains `false`: registration requires no payment, the app contacts no billing provider, and current Member access stays intact. Activating purchases or subscription synchronization requires a separately approved provider configuration and store release.

## Platform notes

- Web/PWA and Android TWA share the v1.5.1 application assets.
- iOS source remains on its separate build branch and must be reconciled and submitted through the iOS release process; this web branch does not silently alter the already-submitted iOS build.
- Native Swift/Objective-C crash reporting remains a future Sentry Cocoa task. JavaScript monitoring is ready for the Capacitor layer.

## Deployment status

Review branch only. Do not merge, deploy, enable billing, or publish store builds without explicit release approval. A real monitoring delivery test is not PASS until its controlled event appears in the configured Sentry project.

Before live Admin acceptance testing, manually run `supabase/v1.5.1-admin-member-directory.sql` in the existing Supabase project. This adds only the protected allowlisted directory function; it does not replace the installed account tables, signup trigger, mutation RPCs, RLS policies, or single-Owner protection.
