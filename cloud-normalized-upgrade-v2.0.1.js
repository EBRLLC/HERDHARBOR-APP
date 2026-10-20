(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborNormalizedUpgradeS20 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "2.0.1-s20-guarded-upgrade";
  const KEY_PREFIX = "hh_s20_normalized_upgrade_";
  function create(options = {}) {
    const {
      getUserId, getStatus, isClean, getRevision, sync, prepare, validate,
      readLegacy, saveRecovery, cutover, offer, updateAvailable,
      afterPromotion, sessionStorage
    } = options;
    for (const name of ["getUserId", "getStatus", "isClean", "getRevision", "sync",
      "prepare", "validate", "readLegacy", "saveRecovery", "cutover", "offer", "updateAvailable", "afterPromotion"]) {
      if (typeof options[name] !== "function") throw new TypeError("S20 " + name + " is required");
    }
    let identityEpoch = 0;
    let offerInFlight = null;
    let activationInFlight = null;
    let offeredUser = "";
    const dismissed = new Set();
    const key = (id) => KEY_PREFIX + id;
    function current(id, epoch) {
      return Boolean(id) && String(getUserId() || "") === id && identityEpoch === epoch;
    }
    function assertCurrent(id, epoch) {
      if (!current(id, epoch)) throw Object.assign(new Error("S20 account changed during upgrade"), {
        code: "HH_S20_ACCOUNT_CHANGED"
      });
    }
    function guardClean(id, epoch) {
      assertCurrent(id, epoch);
      if (isClean(id) !== true) throw Object.assign(new Error("S20: save, close editors and reconnect before upgrading"), {
        code: "HH_S20_LOCAL_WORK_PENDING"
      });
    }
    function discardMarker(id) {
      try {
        sessionStorage?.removeItem?.(key(id));
        // This proof is single-use; a future consent must wait for its own
        // controller activation instead of inheriting an earlier upgrade.
        sessionStorage?.removeItem?.("hh_s20_update_activated_at");
      } catch {}
    }
    function readMarker(id) {
      try {
        const marker = JSON.parse(sessionStorage?.getItem?.(key(id)) || "null");
        return marker && marker.userId === id && marker.confirmed === true &&
          Number.isFinite(Number(marker.issuedAt)) &&
          Date.now() >= Number(marker.issuedAt) &&
          Date.now() - Number(marker.issuedAt) < (15 * 60 * 1000)
          ? marker : null;
      } catch { return null; }
    }
    function hasInstalledUpdate(marker) {
      if (marker?.updateRequired !== true) return true;
      // A focus, reload or re-login is NOT proof that the waiting worker
      // activated. The PWA coordinator records only controllerchange.
      try {
        const appliedAt = Number(sessionStorage?.getItem?.("hh_s20_update_activated_at") || 0);
        return Number.isSafeInteger(appliedAt) && appliedAt >= Number(marker.issuedAt) &&
          appliedAt <= Date.now() && Date.now() - appliedAt < (15 * 60 * 1000);
      } catch { return false; }
    }
    function writeMarker(id, value) {
      try {
        sessionStorage?.setItem?.(key(id), JSON.stringify(value));
        return readMarker(id) !== null;
      } catch { return false; }
    }
    function fenceAccountBoundary() {
      identityEpoch += 1;
      offeredUser = "";
      offerInFlight = null;
      activationInFlight = null;
    }
    async function ensureDualWrite(id, epoch) {
      guardClean(id, epoch);
      let status = await getStatus();
      assertCurrent(id, epoch);
      if (status?.stage === "normalized") return { stage: "normalized" };
      if (status?.eligible !== true || status?.schemaVerified !== true) {
        return { stage: status?.stage || "legacy", reason: "not-eligible" };
      }
      if (status?.stage === "legacy" || status?.stage === "shadow") {
        const advanced = await prepare({ legacyDirty: false });
        assertCurrent(id, epoch);
        if (advanced?.ok === false) return { stage: advanced.stage, reason: advanced.reason || "bootstrap-pending" };
        status = await getStatus();
        assertCurrent(id, epoch);
      }
      return { stage: status?.stage || "legacy" };
    }
    async function activate(id, epoch, marker) {
      guardClean(id, epoch);
      if (marker?.confirmed !== true || marker.userId !== id || marker.legacyClientsClosed !== true) {
        throw Object.assign(new Error("S20 migration consent missing"), { code: "HH_S20_APPROVAL_REQUIRED" });
      }
      const saved = await sync();
      guardClean(id, epoch);
      if (saved !== true) return { ok: false, reason: "legacy-save-unconfirmed" };
      const stage = await ensureDualWrite(id, epoch);
      guardClean(id, epoch);
      if (stage.stage === "normalized") {
        discardMarker(id);
        return { ok: true, stage: "normalized", skipped: true };
      }
      if (stage.stage !== "dual_write") return { ok: false, reason: stage.reason || "dual-write-not-ready", stage: stage.stage };
      const legacy = await readLegacy(id);
      guardClean(id, epoch);
      if (!legacy?.snapshot || !legacy?.updatedAt) return { ok: false, reason: "legacy-cloud-snapshot-unverified" };
      const backedUp = await saveRecovery(id, legacy);
      guardClean(id, epoch);
      if (backedUp !== true) return { ok: false, reason: "verified-recovery-backup-required" };
      const currentRevision = getRevision(id);
      const result = await cutover({
        ownerApproved: true,
        legacyClientsClosed: true,
        backupVerified: true
      });
      assertCurrent(id, epoch);
      if (isClean(id) !== true || getRevision(id) !== currentRevision) {
        // No manual rollback here: the server may already have promoted.
        return { ok: false, reason: "post-cutover-local-state-changed", stage: result?.stage || null };
      }
      if (result?.ok !== true || result?.stage !== "normalized") {
        return { ok: false, reason: result?.reason || "cutover-verification-failed", stage: result?.stage || null };
      }
      discardMarker(id);
      await afterPromotion(id);
      assertCurrent(id, epoch);
      return { ok: true, stage: "normalized" };
    }
    async function resume() {
      const id = String(getUserId() || "");
      const marker = readMarker(id);
      if (!id || !marker) return { ok: true, skipped: true, reason: "no-pending-upgrade" };
      if (!hasInstalledUpdate(marker)) return { ok: true, skipped: true, reason: "waiting-for-pwa-activation" };
      if (activationInFlight) return activationInFlight;
      const epoch = identityEpoch;
      const task = activate(id, epoch, marker);
      activationInFlight = task;
      try {
        return await task;
      } finally { if (activationInFlight === task) activationInFlight = null; }
    }
    async function accept({ legacyClientsClosed = false } = {}) {
      const id = String(getUserId() || "");
      const epoch = identityEpoch;
      guardClean(id, epoch);
      if (legacyClientsClosed !== true) return { ok: false, reason: "close-old-clients-first" };
      const stage = await ensureDualWrite(id, epoch);
      guardClean(id, epoch);
      if (stage.stage === "normalized") return { ok: true, stage: "normalized", skipped: true };
      if (stage.stage !== "dual_write") return { ok: false, reason: stage.reason || "dual-write-not-ready" };
      const verification = await validate();
      guardClean(id, epoch);
      if (verification?.ok !== true || verification?.stage !== "dual_write") {
        return { ok: false, reason: verification?.reason || "cloud-reconciliation-required" };
      }
      const marker = { userId: id, confirmed: true, legacyClientsClosed: true, issuedAt: Date.now() };
      if (!writeMarker(id, marker)) return { ok: false, reason: "migration-intent-storage-unavailable" };
      try {
        // If a waiting update exists, S20 must not activate normalized
        // authority until the PWA controller really changes.
        const update = await updateAvailable();
        assertCurrent(id, epoch);
        if (update === true) {
          if (!writeMarker(id, { ...marker, updateRequired: true })) {
            return { ok: false, reason: "migration-intent-storage-unavailable" };
          }
          return { ok: true, stage: "update-offered" };
        }
        return await resume();
      } catch (error) {
        if (error?.code === "HH_S20_ACCOUNT_CHANGED") return { ok: false, reason: "account-changed" };
        return { ok: false, reason: error?.code || "migration-failed" };
      }
    }
    async function afterLogin() {
      const id = String(getUserId() || "");
      if (!id || dismissed.has(id)) return { ok: true, skipped: true, reason: "dismissed-or-signed-out" };
      if (offerInFlight) return offerInFlight;
      const epoch = identityEpoch;
      const task = (async () => {
        try {
          if (readMarker(id)) return resume();
          if (isClean(id) !== true) return { ok: false, reason: "local-work-pending" };
          const stage = await ensureDualWrite(id, epoch);
          assertCurrent(id, epoch);
          if (stage.stage === "normalized") return { ok: true, skipped: true, stage: "normalized" };
          if (stage.stage !== "dual_write") return { ok: false, reason: stage.reason || "not-ready" };
          // Never display a cutover offer until the cloud and normalized
          // checkpoint have actually reconciled against the latest legacy save.
          const verified = await validate();
          guardClean(id, epoch);
          if (verified?.ok !== true || verified?.stage !== "dual_write") {
            return { ok: false, reason: verified?.reason || "cloud-reconciliation-required" };
          }
          if (offeredUser !== id && isClean(id) === true) {
            offeredUser = id;
            offer({ userId: id, accept, dismiss: () => dismissed.add(id) });
          }
          return { ok: true, stage: "dual_write", offered: true };
        } catch (error) {
          return { ok: false, reason: error?.code || "upgrade-check-failed" };
        }
      })();
      offerInFlight = task;
      try { return await task; }
      finally { if (offerInFlight === task) offerInFlight = null; }
    }
    return Object.freeze({ version: VERSION, afterLogin, accept, resume, fenceAccountBoundary });
  }
  return Object.freeze({ version: VERSION, create });
});
