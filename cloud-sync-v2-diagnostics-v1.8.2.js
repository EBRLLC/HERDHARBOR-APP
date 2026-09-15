(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudSyncDiagnosticsV2 = api;
  if (root && root.document) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0";
  const RELEASE = "1.8.2";
  const STATE_KEY = "herdharbor_pre_alpha_v1";
  const ACTIVE_OWNER_KEY = "herdharbor_active_user_v1";
  const RECOVERABLE_ERROR_PATTERNS = [
    /cloud unavailable/i,
    /cloud save failed/i,
    /offline copy loaded/i,
    /^offline;/i,
    /cloud changed during save; local copy retained/i,
    /will retry/i
  ];
  const STATE_LABELS = Object.freeze({
    "saved-locally": "Saved locally",
    syncing: "Syncing",
    synced: "Synced",
    offline: "Offline",
    "needs-attention": "Needs attention"
  });

  let installed = false;
  let observer = null;
  let queued = false;
  let previousSetItem = null;
  let previousRemoveItem = null;

  const clean = (value) => String(value == null ? "" : value).trim();
  const baseKey = (userId) => `herdharbor_user_cloud_base_${userId}`;
  const dirtyKey = (userId) => `herdharbor_user_dirty_${userId}`;
  const versionKey = (userId) => `herdharbor_user_cloud_version_${userId}`;
  const revisionKey = (userId) => `herdharbor_sync_v2_local_revision_${userId}`;
  const revisionAtKey = (userId) => `herdharbor_sync_v2_local_revision_at_${userId}`;
  const operationKey = (userId) => `herdharbor_sync_v2_operation_${userId}`;

  function safeParse(rawValue) {
    if (!rawValue || typeof rawValue !== "string") return null;
    try {
      const value = JSON.parse(rawValue);
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    try {
      return JSON.stringify(stableValue(value));
    } catch {
      return "";
    }
  }

  function isRecoverableMessage(message) {
    const text = clean(message);
    return RECOVERABLE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
  }

  function classifySyncState(state = {}) {
    const message = clean(state.message);
    if (!state.signedIn) {
      return {
        id: "needs-attention",
        label: STATE_LABELS["needs-attention"],
        tone: "error",
        message: "Sign in to use cloud sync. Records on this device are unchanged."
      };
    }
    if (state.conflict) {
      return {
        id: "needs-attention",
        label: STATE_LABELS["needs-attention"],
        tone: "error",
        message: message || "Cloud and device records both changed. Review the conflict before continuing."
      };
    }
    if (state.online === false) {
      return {
        id: "offline",
        label: STATE_LABELS.offline,
        tone: "working",
        message: "Saved on this device. Cloud sync will resume automatically when the connection returns."
      };
    }
    if (state.syncing) {
      return {
        id: "syncing",
        label: STATE_LABELS.syncing,
        tone: "working",
        message: "Your device copy is safe while HerdHarbor finishes the cloud backup."
      };
    }
    if (state.unsynced) {
      return {
        id: "saved-locally",
        label: STATE_LABELS["saved-locally"],
        tone: "working",
        message: "Saved on this device. Cloud backup is pending and will retry automatically."
      };
    }
    if (state.type === "error" && !isRecoverableMessage(message)) {
      return {
        id: "needs-attention",
        label: STATE_LABELS["needs-attention"],
        tone: "error",
        message: message || "Cloud sync needs your attention. Your local copy has not been removed."
      };
    }
    return {
      id: "synced",
      label: STATE_LABELS.synced,
      tone: "success",
      message: "Cloud backup is current."
    };
  }

  function diffSummary(localRaw, cloudRaw) {
    const local = safeParse(localRaw);
    const cloud = safeParse(cloudRaw);
    if (!local || !cloud) {
      return {
        comparable: false,
        changedSections: [],
        changedSectionCount: 0,
        localRecordCount: null,
        cloudRecordCount: null
      };
    }
    const names = [...new Set([...Object.keys(local), ...Object.keys(cloud)])].sort();
    const changedSections = names.filter((name) =>
      stableStringify(local[name]) !== stableStringify(cloud[name])
    );
    const countRecords = (state) => Object.values(state).reduce((total, value) =>
      total + (Array.isArray(value) ? value.length : 0), 0);
    return {
      comparable: true,
      changedSections,
      changedSectionCount: changedSections.length,
      localRecordCount: countRecords(local),
      cloudRecordCount: countRecords(cloud)
    };
  }

  function storage() {
    try {
      return root.localStorage || null;
    } catch {
      return null;
    }
  }

  function activeUserId() {
    try {
      return storage()?.getItem?.(ACTIVE_OWNER_KEY) || root.HerdHarborCloud?.getSession?.()?.user?.id || "";
    } catch {
      return "";
    }
  }

  function cloudDetails() {
    try {
      return root.HerdHarborCloud?.getSyncDetails?.() || null;
    } catch {
      return null;
    }
  }

  function readOperation(userId = activeUserId()) {
    if (!userId) return null;
    try {
      return safeParse(storage()?.getItem?.(operationKey(userId))) || null;
    } catch {
      return null;
    }
  }

  function recordOperation(operation, status, message = "") {
    const userId = activeUserId();
    const store = storage();
    if (!userId || !store) return false;
    const record = {
      operation: clean(operation) || "cloud-sync",
      status: clean(status) || "unknown",
      message: clean(message),
      at: new Date().toISOString()
    };
    try {
      store.setItem(operationKey(userId), JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }

  function bumpLocalRevision(reason = "state-change") {
    const userId = activeUserId();
    const store = storage();
    if (!userId || !store) return false;
    try {
      const current = Math.max(0, Number(store.getItem(revisionKey(userId)) || 0));
      const writer = previousSetItem || root.Storage?.prototype?.setItem;
      if (typeof writer !== "function") return false;
      writer.call(store, revisionKey(userId), String(current + 1));
      writer.call(store, revisionAtKey(userId), new Date().toISOString());
      root.dispatchEvent?.(new root.CustomEvent("herdharbor:sync-v2-local-revision", {
        detail: { userId, revision: current + 1, reason }
      }));
      return true;
    } catch {
      return false;
    }
  }

  function ensureInitialRevision() {
    const userId = activeUserId();
    const store = storage();
    if (!userId || !store) return false;
    try {
      if (store.getItem(revisionKey(userId))) return false;
      if (!safeParse(store.getItem(STATE_KEY))) return false;
      const writer = previousSetItem || root.Storage?.prototype?.setItem;
      if (typeof writer !== "function") return false;
      writer.call(store, revisionKey(userId), "1");
      writer.call(store, revisionAtKey(userId), new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  function getDiagnostics(state = cloudDetails()) {
    const store = storage();
    const userId = activeUserId();
    const currentState = state || {
      signedIn: Boolean(userId),
      online: root.navigator?.onLine !== false,
      unsynced: false,
      syncing: false,
      conflict: false,
      type: "info",
      message: "Cloud status is loading."
    };
    const model = classifySyncState(currentState);
    const localRaw = store?.getItem?.(STATE_KEY) || "";
    const confirmedCloudRaw = userId ? store?.getItem?.(baseKey(userId)) || "" : "";
    const cloudRevision = userId
      ? store?.getItem?.(versionKey(userId)) || currentState.lastSyncedAt || ""
      : "";
    const comparison = diffSummary(localRaw, confirmedCloudRaw);
    const operation = readOperation(userId);
    const localSafe = Boolean(safeParse(localRaw));
    const pendingSections = currentState.unsynced && comparison.comparable
      ? comparison.changedSectionCount
      : currentState.unsynced ? null : 0;
    return {
      state: model.id,
      stateLabel: model.label,
      stateTone: model.tone,
      message: model.message,
      signedIn: Boolean(currentState.signedIn),
      online: currentState.online !== false,
      localSafe,
      retrySafe: Boolean(currentState.signedIn && localSafe && !currentState.conflict && currentState.online !== false),
      conflict: Boolean(currentState.conflict),
      userActionRequired: model.id === "needs-attention",
      lastSuccessfulSync: cloudRevision,
      localRevision: userId ? Number(store?.getItem?.(revisionKey(userId)) || 0) : 0,
      localRevisionAt: userId ? store?.getItem?.(revisionAtKey(userId)) || "" : "",
      cloudRevision,
      pendingChanges: pendingSections,
      changedSections: comparison.changedSections,
      failedOperation: operation?.status === "failure" ? operation.operation : "",
      lastOperation: operation,
      hasLastKnownGood: Boolean(safeParse(confirmedCloudRaw)),
      comparison
    };
  }

  function toneForState(id) {
    if (id === "synced") return "success";
    if (id === "needs-attention") return "error";
    return "working";
  }

  function applyStatePresentation(snapshot = getDiagnostics()) {
    const tone = toneForState(snapshot.state);
    const text = `${snapshot.stateLabel} — ${snapshot.message}`;
    const button = root.document?.querySelector?.(".hh-account-button");
    if (button) {
      button.dataset.state = tone;
      button.dataset.syncState = snapshot.state;
      button.title = `HerdHarbor account: ${text}`;
    }
    const status = root.document?.querySelector?.("#hh-account-sync-status");
    if (status) {
      status.textContent = text;
      status.dataset.type = tone;
      status.dataset.syncState = snapshot.state;
    }
    return snapshot;
  }

  function formatDate(value) {
    if (!value) return "Not yet confirmed";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? clean(value) : parsed.toLocaleString();
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function ensureStyle() {
    if (!root.document || root.document.getElementById("hh-sync-v2-diagnostics-style")) return;
    const style = root.document.createElement("style");
    style.id = "hh-sync-v2-diagnostics-style";
    style.textContent = `
      .hh-syncdiag-overlay{position:fixed;inset:0;z-index:100500;display:grid;place-items:center;padding:18px;background:rgba(10,24,38,.62)}
      .hh-syncdiag-card{width:min(760px,100%);max-height:min(88vh,820px);overflow:auto;background:var(--surface,#fff);color:var(--text,#18212a);border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.28);padding:20px}
      .hh-syncdiag-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}.hh-syncdiag-head h2{margin:0;font-size:1.35rem}.hh-syncdiag-head p{margin:5px 0 0;color:var(--muted,#60717f);font-size:.86rem}
      .hh-syncdiag-close{border:0;background:transparent;font-size:1.6rem;line-height:1;cursor:pointer;color:inherit}
      .hh-syncdiag-state{display:flex;align-items:center;gap:9px;padding:12px 14px;border:1px solid var(--border,#dbe3e8);border-radius:13px;margin-bottom:14px}.hh-syncdiag-state strong{font-size:.95rem}.hh-syncdiag-state span{color:var(--muted,#60717f);font-size:.82rem}
      .hh-syncdiag-state[data-state="synced"]{border-color:#8fc8a8}.hh-syncdiag-state[data-state="needs-attention"]{border-color:#d99b96}.hh-syncdiag-state[data-state="offline"],.hh-syncdiag-state[data-state="saved-locally"],.hh-syncdiag-state[data-state="syncing"]{border-color:#d7b66f}
      .hh-syncdiag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.hh-syncdiag-grid>div{padding:11px 12px;border:1px solid var(--border,#dbe3e8);border-radius:11px;background:var(--surface-subtle,#f7f9fa)}.hh-syncdiag-grid span{display:block;color:var(--muted,#60717f);font-size:.72rem;font-weight:700;margin-bottom:3px}.hh-syncdiag-grid strong{font-size:.84rem;overflow-wrap:anywhere}
      .hh-syncdiag-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.hh-syncdiag-actions button{min-height:40px}.hh-syncdiag-compare{margin-top:13px;padding:12px;border:1px solid var(--border,#dbe3e8);border-radius:11px;background:var(--surface-subtle,#f7f9fa);font-size:.82rem}.hh-syncdiag-compare[hidden]{display:none}
      #hh-sync-diagnostics-open{margin-top:8px}
      @media(max-width:620px){.hh-syncdiag-overlay{padding:0;place-items:end center}.hh-syncdiag-card{width:100%;max-height:92vh;border-radius:18px 18px 0 0}.hh-syncdiag-grid{grid-template-columns:1fr}.hh-syncdiag-actions{display:grid;grid-template-columns:1fr}.hh-syncdiag-actions button{width:100%}}
      [data-theme="dark"] .hh-syncdiag-card,[data-theme="dark"] .hh-syncdiag-grid>div,[data-theme="dark"] .hh-syncdiag-compare{background:#102536;color:#edf5f7}
    `;
    (root.document.head || root.document.documentElement)?.appendChild(style);
  }

  function diagnosticValue(value, fallback = "—") {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function modalMarkup(snapshot) {
    const pending = snapshot.pendingChanges === null
      ? "Pending local changes"
      : snapshot.pendingChanges === 0
        ? "None"
        : `${snapshot.pendingChanges} changed section${snapshot.pendingChanges === 1 ? "" : "s"}`;
    const failed = snapshot.failedOperation
      ? `${snapshot.failedOperation}${snapshot.lastOperation?.message ? ` — ${snapshot.lastOperation.message}` : ""}`
      : "None";
    return `
      <div class="hh-syncdiag-card" role="dialog" aria-modal="true" aria-labelledby="hh-syncdiag-title">
        <div class="hh-syncdiag-head"><div><h2 id="hh-syncdiag-title">Sync Diagnostics</h2><p>Cloud Sync V2 keeps the device copy protected first, then reconciles cloud backup.</p></div><button class="hh-syncdiag-close" type="button" aria-label="Close">×</button></div>
        <div class="hh-syncdiag-state" data-state="${esc(snapshot.state)}"><div><strong>${esc(snapshot.stateLabel)}</strong><span>${esc(snapshot.message)}</span></div></div>
        <div class="hh-syncdiag-grid">
          <div><span>Last successful sync</span><strong data-hh-syncdiag="last-sync">${esc(formatDate(snapshot.lastSuccessfulSync))}</strong></div>
          <div><span>Local revision</span><strong data-hh-syncdiag="local-revision">${esc(diagnosticValue(snapshot.localRevision, "0"))}</strong></div>
          <div><span>Cloud revision</span><strong data-hh-syncdiag="cloud-revision">${esc(diagnosticValue(snapshot.cloudRevision, "Not yet confirmed"))}</strong></div>
          <div><span>Pending changes</span><strong data-hh-syncdiag="pending">${esc(pending)}</strong></div>
          <div><span>Failed operation</span><strong data-hh-syncdiag="failed-operation">${esc(failed)}</strong></div>
          <div><span>Local copy safe</span><strong>${snapshot.localSafe ? "Yes" : "No — download/restore before editing"}</strong></div>
          <div><span>Retry safe now</span><strong>${snapshot.retrySafe ? "Yes" : "No"}</strong></div>
          <div><span>User action required</span><strong>${snapshot.userActionRequired ? "Yes" : "No"}</strong></div>
        </div>
        <div class="hh-syncdiag-actions">
          <button type="button" class="button button-primary" data-hh-syncdiag-action="retry" ${snapshot.retrySafe ? "" : "disabled"}>Retry Sync</button>
          <button type="button" class="button button-ghost" data-hh-syncdiag-action="backup" ${snapshot.localSafe ? "" : "disabled"}>Download Local Backup</button>
          <button type="button" class="button button-ghost" data-hh-syncdiag-action="compare" ${snapshot.hasLastKnownGood ? "" : "disabled"}>Compare Local / Cloud</button>
          <button type="button" class="button button-ghost" data-hh-syncdiag-action="restore" ${snapshot.hasLastKnownGood ? "" : "disabled"}>Restore Last-Known-Good</button>
        </div>
        <div class="hh-syncdiag-compare" data-hh-syncdiag-compare hidden></div>
      </div>`;
  }

  function closeModal() {
    root.document?.getElementById?.("hh-syncdiag-overlay")?.remove?.();
  }

  function openModal() {
    if (!root.document) return false;
    ensureStyle();
    closeModal();
    const overlay = root.document.createElement("div");
    overlay.id = "hh-syncdiag-overlay";
    overlay.className = "hh-syncdiag-overlay";
    overlay.innerHTML = modalMarkup(getDiagnostics());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest?.(".hh-syncdiag-close")) {
        closeModal();
        return;
      }
      const action = event.target.closest?.("[data-hh-syncdiag-action]")?.dataset?.hhSyncdiagAction;
      if (!action) return;
      if (action === "retry") void retrySync();
      if (action === "backup") downloadLocalBackup();
      if (action === "compare") renderComparison();
      if (action === "restore") void restoreLastKnownGood();
    });
    root.document.body?.appendChild(overlay);
    overlay.querySelector?.(".hh-syncdiag-close")?.focus?.();
    return true;
  }

  function refreshOpenModal() {
    const overlay = root.document?.getElementById?.("hh-syncdiag-overlay");
    if (!overlay) return false;
    const oldCompare = overlay.querySelector?.("[data-hh-syncdiag-compare]");
    const comparisonHtml = oldCompare && !oldCompare.hidden ? oldCompare.innerHTML : "";
    const compareVisible = Boolean(oldCompare && !oldCompare.hidden);
    overlay.innerHTML = modalMarkup(getDiagnostics());
    const nextCompare = overlay.querySelector?.("[data-hh-syncdiag-compare]");
    if (nextCompare && compareVisible) {
      nextCompare.hidden = false;
      nextCompare.innerHTML = comparisonHtml;
    }
    return true;
  }

  function downloadBlob(filename, text) {
    if (!root.document || typeof root.Blob !== "function" || !root.URL?.createObjectURL) return false;
    const url = root.URL.createObjectURL(new root.Blob([text], { type: "application/json" }));
    const link = root.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    root.document.body?.appendChild(link);
    link.click();
    link.remove();
    root.URL.revokeObjectURL(url);
    return true;
  }

  function downloadLocalBackup() {
    const store = storage();
    const raw = store?.getItem?.(STATE_KEY) || "";
    if (!safeParse(raw)) return false;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ok = downloadBlob(`herdharbor-local-backup-${stamp}.json`, raw);
    if (ok) recordOperation("download-local-backup", "success", "Protected device copy downloaded.");
    refreshOpenModal();
    return ok;
  }

  function renderComparison() {
    const snapshot = getDiagnostics();
    const target = root.document?.querySelector?.("[data-hh-syncdiag-compare]");
    if (!target) return snapshot.comparison;
    const comparison = snapshot.comparison;
    target.hidden = false;
    if (!comparison.comparable) {
      target.textContent = "A confirmed cloud baseline is not available to compare yet.";
      return comparison;
    }
    if (!comparison.changedSectionCount) {
      target.textContent = "Local records match the last confirmed cloud snapshot.";
      return comparison;
    }
    target.innerHTML = `<strong>${comparison.changedSectionCount} section${comparison.changedSectionCount === 1 ? "" : "s"} differ from the last confirmed cloud snapshot.</strong><br>${esc(comparison.changedSections.join(", "))}<br><small>Local array records: ${comparison.localRecordCount} · Confirmed cloud array records: ${comparison.cloudRecordCount}</small>`;
    return comparison;
  }

  async function retrySync() {
    const snapshot = getDiagnostics();
    if (!snapshot.retrySafe) return false;
    recordOperation("manual-retry", "working", "Retry requested from Sync Diagnostics.");
    refreshOpenModal();
    try {
      const flow = root.HerdHarborCloudSyncFlowV2;
      const result = typeof flow?.resumeImmediately === "function"
        ? await (flow.resumeImmediately() || Promise.resolve(false))
        : await root.HerdHarborCloud?.syncNow?.();
      const after = getDiagnostics();
      if (after.state === "synced") recordOperation("manual-retry", "success", "Cloud backup confirmed.");
      else if (after.state === "needs-attention") recordOperation("manual-retry", "failure", after.message);
      else recordOperation("manual-retry", "working", after.message);
      applyStatePresentation(getDiagnostics());
      refreshOpenModal();
      return result !== false;
    } catch (error) {
      recordOperation("manual-retry", "failure", error?.message || "Cloud retry failed.");
      applyStatePresentation(getDiagnostics());
      refreshOpenModal();
      return false;
    }
  }

  async function restoreLastKnownGood() {
    const store = storage();
    const userId = activeUserId();
    if (!store || !userId) return false;
    const baseline = store.getItem(baseKey(userId)) || "";
    if (!safeParse(baseline)) return false;
    const confirmed = typeof root.confirm === "function"
      ? root.confirm("Restore the last confirmed cloud copy on this device? HerdHarbor will download the current local copy first, then reload. Any unsynced local changes can be recovered from that backup.")
      : false;
    if (!confirmed) return false;
    downloadLocalBackup();
    recordOperation("restore-last-known-good", "working", "Restoring last confirmed cloud snapshot locally.");
    try {
      store.setItem(STATE_KEY, baseline);
      store.setItem(dirtyKey(userId), "1");
      recordOperation("restore-last-known-good", "success", "Last confirmed cloud snapshot restored locally; reconciliation remains pending.");
      root.setTimeout?.(() => root.location?.reload?.(), 50);
      return true;
    } catch (error) {
      recordOperation("restore-last-known-good", "failure", error?.message || "Restore failed.");
      refreshOpenModal();
      return false;
    }
  }

  function ensureOpenButton() {
    if (!root.document) return false;
    const status = root.document.querySelector?.("#hh-account-sync-status");
    if (!status || root.document.getElementById("hh-sync-diagnostics-open")) return false;
    const button = root.document.createElement("button");
    button.type = "button";
    button.id = "hh-sync-diagnostics-open";
    button.className = "button button-ghost";
    button.textContent = "Sync diagnostics";
    button.addEventListener("click", openModal);
    status.insertAdjacentElement?.("afterend", button);
    return true;
  }

  function refresh() {
    ensureInitialRevision();
    const snapshot = applyStatePresentation(getDiagnostics());
    ensureOpenButton();
    refreshOpenModal();
    return snapshot;
  }

  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      refresh();
    };
    if (typeof root.requestAnimationFrame === "function") root.requestAnimationFrame(run);
    else root.setTimeout?.(run, 0);
  }

  function onSyncStatus(event) {
    const state = event?.detail || cloudDetails();
    if (state?.conflict) {
      recordOperation("merge-conflict", "failure", state.message || "Cloud conflict requires review.");
    } else if (state?.type === "error" && !isRecoverableMessage(state.message)) {
      recordOperation("cloud-sync", "failure", state.message || "Cloud sync failed.");
    } else if (state?.syncing) {
      recordOperation("cloud-sync", "working", state.message || "Cloud sync is running.");
    } else if (state?.signedIn && !state?.unsynced && state?.online !== false && state?.type !== "error") {
      recordOperation("cloud-sync", "success", "Cloud backup confirmed.");
    }
    scheduleRefresh();
  }

  function installRevisionTracking() {
    const store = storage();
    const StorageCtor = root.Storage;
    if (!store || !StorageCtor?.prototype?.setItem || previousSetItem) return false;
    previousSetItem = StorageCtor.prototype.setItem;
    previousRemoveItem = StorageCtor.prototype.removeItem;
    StorageCtor.prototype.setItem = function herdHarborSyncV2DiagnosticsSetItem(key, value) {
      const result = previousSetItem.call(this, key, value);
      if (this === store && key === STATE_KEY) bumpLocalRevision("state-change");
      return result;
    };
    if (typeof previousRemoveItem === "function") {
      StorageCtor.prototype.removeItem = function herdHarborSyncV2DiagnosticsRemoveItem(key) {
        const result = previousRemoveItem.call(this, key);
        if (this === store && key === STATE_KEY) bumpLocalRevision("state-cleared");
        return result;
      };
    }
    ensureInitialRevision();
    return true;
  }

  function install() {
    if (installed || !root.document) return API;
    installed = true;
    ensureStyle();
    installRevisionTracking();
    root.document.addEventListener("herdharbor:sync-status", onSyncStatus);
    root.addEventListener?.("online", scheduleRefresh);
    root.addEventListener?.("offline", scheduleRefresh);
    root.addEventListener?.("herdharbor:cloud-baseline-restored", scheduleRefresh);
    root.addEventListener?.("herdharbor:sync-v2-local-revision", scheduleRefresh);
    observer = new root.MutationObserver(scheduleRefresh);
    if (root.document.body) observer.observe(root.document.body, { childList: true, subtree: true });
    scheduleRefresh();
    return API;
  }

  const API = Object.freeze({
    version: VERSION,
    release: RELEASE,
    states: Object.freeze(Object.keys(STATE_LABELS)),
    install,
    refresh,
    open: openModal,
    close: closeModal,
    retrySync,
    downloadLocalBackup,
    restoreLastKnownGood,
    getDiagnostics,
    classifySyncState,
    diffSummary,
    isRecoverableMessage,
    recordOperation
  });

  return API;
});
