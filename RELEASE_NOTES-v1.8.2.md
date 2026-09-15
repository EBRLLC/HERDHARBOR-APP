# HerdHarbor Alpha v1.8.2

## Cloud Sync V2.0 — protected local-first synchronization

This phase hardens HerdHarbor cloud synchronization without changing the existing Supabase sign-in, session restoration, password recovery, sign-out, membership, or access-control behavior.

### Fixed

- Prevents a clean signed-in browser from falling into the false `missing sync history` conflict path after its confirmed cloud merge baseline is missing.
- Reconstructs the baseline only when HerdHarbor has a known cloud version, a readable active state, and no dirty/unsynced local flag.
- Captures the last clean local state immediately before the first edit when a baseline is missing but a known cloud revision exists.
- Never invents or overwrites merge history while local changes are marked unsynced.
- Preserves the existing three-way merge engine, recovery snapshots, manual conflict resolution, offline behavior, and account safeguards.
- Ordinary recoverable cloud failures remain non-blocking and retry automatically instead of presenting as a permanent red failure.

### Five-state sync model

Cloud Sync V2 presents synchronization through five explicit user-facing states:

1. **Saved locally** — the device copy is safe and cloud backup is pending.
2. **Syncing** — cloud backup is actively running.
3. **Synced** — the last cloud backup is confirmed.
4. **Offline** — the device copy remains protected and synchronization will resume when connectivity returns.
5. **Needs attention** — a true conflict or non-recoverable condition requires user action.

Recoverable pending/offline states intentionally do not use the destructive red error presentation.

### Sync Diagnostics

The account sync area now exposes a Sync Diagnostics panel showing:

- last successful cloud sync;
- local revision counter and revision timestamp;
- last confirmed cloud revision;
- pending changed sections relative to the last confirmed cloud snapshot;
- the most recent failed sync operation;
- whether the local copy is readable/safe;
- whether retry is currently safe;
- whether user action is actually required.

Recovery controls include:

- **Retry Sync**;
- **Download Local Backup**;
- **Compare Local / Cloud** using the last confirmed cloud baseline;
- **Restore Last-Known-Good**, which automatically downloads the current local copy first and intentionally leaves reconciliation pending so newer remote work is not silently overwritten.

### Local working cache

Cloud Sync V2 maintains a separate IndexedDB working cache for high-use sections and a protected full snapshot. This cache is additive and does not replace the canonical HerdHarbor record state or cloud merge engine.

### Authentication freeze

Authentication behavior remains intentionally unchanged. Cloud Sync V2 is installed before `herdharbor-cloud.js` so it can repair safe merge history without modifying the stable auth runtime.

### Regression coverage

Coverage now includes startup baseline recovery, dirty-state protection, first-edit baseline capture, automatic retry behavior, offline/foreground recovery, five-state classification, diagnostics safety flags, local/cloud comparisons, backup-first restore behavior, v1.8.2 runtime identity, and preservation of the existing sign-in resilience contract.

All subsequent v1.8.2 phases should continue under the same Alpha v1.8.2 version line unless a release-breaking reason requires a new version.
