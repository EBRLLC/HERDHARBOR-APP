# HerdHarbor Alpha v1.8.2

## Cloud Sync V2.0 — baseline recovery

This phase hardens HerdHarbor cloud synchronization without changing the existing Supabase sign-in, session restoration, password recovery, sign-out, membership, or access-control behavior.

### Fixed

- Prevents a clean signed-in browser from falling into the false `missing sync history` conflict path after its confirmed cloud merge baseline is missing.
- Reconstructs the baseline only when HerdHarbor has a known cloud version, a readable active state, and no dirty/unsynced local flag.
- Captures the last clean local state immediately before the first edit when a baseline is missing but a known cloud revision exists.
- Never invents or overwrites merge history while local changes are marked unsynced.
- Preserves the existing three-way merge engine, recovery snapshots, manual conflict resolution, offline behavior, and account safeguards.

### Authentication freeze

Authentication behavior remains intentionally unchanged. Cloud Sync V2 is installed before `herdharbor-cloud.js` so it can repair safe merge history without modifying the stable auth runtime.

### Regression coverage

Added tests for startup baseline recovery, dirty-state protection, first-edit baseline capture, v1.8.2 runtime identity, and preservation of the existing sign-in resilience contract.

All subsequent v1.8.2 phases should continue under the same Alpha v1.8.2 version line unless a release-breaking reason requires a new version.
