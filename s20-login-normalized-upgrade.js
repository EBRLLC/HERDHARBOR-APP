(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) {
    root.HerdHarborS20Upgrade = api;
    api.attach(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Only explicitly approved users can enter the client-side cutover. These
  // approvals must be written after an independently verified off-device
  // backup and old-client shutdown. Client flags alone are not authorization.
  function preflight({ session, status, manifest, details, pending, conflict } = {}) {
    if (!session?.user?.id) return { ok: false, reason: "signed-out" };
    if (status?.stage === "normalized") return { ok: false, reason: "already-normalized" };
    if (status?.stage !== "dual_write" || status?.eligible !== true ||
        status?.schemaVerified !== true) return { ok: false, reason: "dual-write-not-ready" };
    const metadata = manifest?.metadata || {};
    if (manifest?.cutover_stage !== "dual_write" ||
        metadata.s20_client_cutover_approved !== true ||
        metadata.s20_offdevice_backup_verified !== true ||
        metadata.s20_legacy_clients_closed !== true) {
      return { ok: false, reason: "server-approval-missing" };
    }
    if (details?.online !== true || details?.syncing === true ||
        details?.unsynced === true || pending === true || conflict === true) {
      return { ok: false, reason: "local-work-or-offline" };
    }
    return { ok: true, reason: null };
  }

  function attach(root) {
    const document = root.document;
    if (!document?.addEventListener || root.__HH_S20_UPGRADE_ATTACHED__) return false;
    root.__HH_S20_UPGRADE_ATTACHED__ = true;
    let inFlight = null;
    let promptedId = "";
    let epoch = 0;

    const currentId = () => String(root.HerdHarborCloud?.getSession?.()?.user?.id || "");
    const safe = (userId, ticket) => userId === currentId() && epoch === ticket;
    const removeDialog = () => {
      document.getElementById?.("hh-s20-upgrade-dialog")?.remove?.();
    };

    async function offer(userId) {
      if (inFlight || !userId || promptedId === userId) return false;
      const cloud = root.HerdHarborCloud;
      const rollout = root.HerdHarborNormalizedSyncRollout;
      if (!cloud || !rollout || currentId() !== userId) return false;
      const ticket = epoch;
      const task = (async () => {
        const current = cloud.getSyncDetails();
        if (current?.online !== true || cloud.hasConflict?.()) return false;
        if (current?.unsynced === true) {
          const committed = await cloud.syncNow();
          if (!safe(userId, ticket) || committed !== true) return false;
        }
        const newerBuild = await root.HerdHarborPWA?.checkForUpdates?.();
        if (!safe(userId, ticket) || newerBuild === true) return false;
        const stage = await cloud.getNormalizedSyncCohortStatus({ force: true });
        if (!safe(userId, ticket) || stage?.stage !== "dual_write") return false;
        const store = cloud.createNormalizedRecordStore(userId);
        const manifest = await store.getManifest();
        if (!safe(userId, ticket)) return false;
        let eligibility = preflight({
          session: cloud.getSession(), status: stage, manifest,
          details: cloud.getSyncDetails(),
          pending: cloud.hasUnsyncedChanges(), conflict: cloud.hasConflict()
        });
        if (!eligibility.ok) return false;
        const validated = await rollout.validateNow();
        if (!safe(userId, ticket) || validated?.ok !== true ||
            validated?.stage !== "dual_write") return false;
        eligibility = preflight({
          session: cloud.getSession(), status: stage, manifest,
          details: cloud.getSyncDetails(),
          pending: cloud.hasUnsyncedChanges(), conflict: cloud.hasConflict()
        });
        if (!eligibility.ok) return false;
        promptedId = userId;
        if (document.getElementById?.("hh-s20-upgrade-dialog")) return true;
        const dialog = document.createElement("section");
        dialog.id = "hh-s20-upgrade-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", "Cloud saving upgrade");
        dialog.style.cssText = "position:fixed;inset:0;z-index:13000;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:16px";
        dialog.innerHTML = '<div style="max-width:490px;width:100%;border-radius:18px;padding:22px;background:#fff;color:#16263a;font:16px/1.5 system-ui"><h2>Upgrade cloud saving</h2><p>Your cloud records have passed a migration check. After the switch, HerdHarbor will save normalized records. Your older cloud copy remains available for recovery.</p><p>Before continuing, save work and close HerdHarbor on every other device.</p><label style="display:block;margin:10px 0"><input type="checkbox" data-hh-s20-closed> I have saved and closed older app windows on every device.</label><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-hh-s20-backup>Download safety backup</button><button type="button" data-hh-s20-switch disabled>Move to new saving</button><button type="button" data-hh-s20-later>Later</button></div><p data-hh-s20-message role="status" aria-live="polite"></p></div>';
        (document.body || document.documentElement).appendChild(dialog);
        let backupDownloaded = false;
        const startButton = dialog.querySelector("[data-hh-s20-switch]");
        const closed = dialog.querySelector("[data-hh-s20-closed]");
        const message = dialog.querySelector("[data-hh-s20-message]");
        const refreshButton = () => { startButton.disabled = !backupDownloaded || !closed.checked; };
        closed.addEventListener("change", refreshButton);
        dialog.querySelector("[data-hh-s20-later]").addEventListener("click", removeDialog);
        dialog.querySelector("[data-hh-s20-backup]").addEventListener("click", async () => {
          if (!safe(userId, ticket)) return;
          try {
            await cloud.downloadSafetyBackup();
            if (!safe(userId, ticket)) return;
            backupDownloaded = true;
            message.textContent = "Check that your backup actually downloaded before continuing.";
            refreshButton();
          } catch {
            message.textContent = "Could not prepare a backup. Migration is blocked.";
          }
        });
        startButton.addEventListener("click", async () => {
          if (!safe(userId, ticket) || !closed.checked || !backupDownloaded) return;
          startButton.disabled = true;
          message.textContent = "Checking records and switching save authority…";
          try {
            const latest = await store.getManifest();
            if (!safe(userId, ticket)) return;
            const eligible = preflight({
              session: cloud.getSession(), status: await cloud.getNormalizedSyncCohortStatus({force:true}),
              manifest: latest, details: cloud.getSyncDetails(),
              pending: cloud.hasUnsyncedChanges(), conflict: cloud.hasConflict()
            });
            if (!safe(userId, ticket)) return;
            if (!eligible.ok) throw new Error("Upgrade checks are no longer satisfied.");
            const outcome = await rollout.cutoverToNormalizedPrimary({
              ownerApproved: true,
              legacyClientsClosed: true,
              backupVerified: true
            });
            if (!safe(userId, ticket)) return;
            if (outcome?.ok !== true || rollout.isNormalizedAuthority?.() !== true) {
              throw new Error("Cloud authority did not complete verification.");
            }
            message.textContent = "Normalized saving is active. Legacy cloud records were retained for recovery.";
            const completed = dialog.querySelector("[data-hh-s20-switch]");
            if (completed) completed.textContent = "Upgrade complete";
            void root.HerdHarborPWA?.checkForUpdates?.();
          } catch {
            if (!safe(userId, ticket)) return;
            message.textContent = "The upgrade could not be safely verified. Your existing cloud data has not been deleted.";
            startButton.disabled = false;
          }
        });
        return true;
      })();
      inFlight = task;
      try { return await task; }
      catch { return false; }
      finally { if (inFlight === task) inFlight = null; }
    }

    document.addEventListener("herdharbor:auth-boundary", () => {
      epoch += 1;
      promptedId = "";
      removeDialog();
    });
    document.addEventListener("herdharbor:cloud-hydrated", (event) => {
      const userId = String(event?.detail?.userId || "");
      if (!userId || userId !== currentId()) return;
      void offer(userId);
    });
    return true;
  }

  return Object.freeze({ preflight, attach });
});
