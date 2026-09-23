(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborSettingsRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";

  function create(deps = {}) {
    const required = [
      "getState", "getDefaultSettings", "getCurrentRoute", "getAppVersion", "$", "$$", "esc",
      "headerHtml", "detailField", "activeAnimals", "currentSyncDetails", "formatSyncTimestamp",
      "refreshSyncStatus", "openModal", "closeModal", "field", "selectField", "textareaField",
      "toast", "applyTheme", "saveState", "showApp", "prepareProfileImage", "recordActivity",
      "loadDemoData", "exportData", "importData", "handleSpreadsheetImport", "clearData",
      "ensureSpreadsheetToolsReady", "navigate", "refreshDeviceStorageSummary"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Settings runtime requires ${name}().`);
    }

    const {
      $, $$, esc, headerHtml, detailField, activeAnimals, currentSyncDetails, formatSyncTimestamp,
      refreshSyncStatus, openModal, closeModal, field, selectField, textareaField, toast,
      applyTheme, saveState, showApp, prepareProfileImage, recordActivity, loadDemoData,
      exportData, importData, handleSpreadsheetImport, clearData, ensureSpreadsheetToolsReady,
      navigate, refreshDeviceStorageSummary
    } = deps;
    const stateNow = () => deps.getState() || {};
    const defaultSettings = () => deps.getDefaultSettings() || {};
    const currentRoute = () => deps.getCurrentRoute() || "dashboard";
    const appVersion = () => deps.getAppVersion() || "1.8.2";
    const confirm = typeof root?.confirm === "function" ? root.confirm.bind(root) : () => false;

    function renderSettings() {
      const state = stateNow();
      const sync = currentSyncDetails();
      const marketConsent = root.HerdHarborMarket?.getConsent?.(state) || defaultSettings().marketAnalyticsConsent || {};
      const membership = root.HerdHarborMembership?.getAccount?.() || {
        effectiveMembershipTier: "member",
        accountRole: "user",
        membershipSource: "default",
        accountStatus: "active",
        subscriptionStatus: "not_configured"
      };
      $("#view-settings").innerHTML = `
        ${headerHtml("Settings", "Manage your secure tester workspace, installed app, and safety backups.")}
        <div class="settings-grid">
          <article class="settings-card">
            <h3>Operation profile</h3>
            <p>Update the name and contact information used in this workspace.</p>
            <div class="detail-grid">
              ${detailField("Operation", state.profile.operationName)}
              ${detailField("Owner", state.profile.ownerName)}
              ${detailField("Email", state.profile.email)}
              ${detailField("Phone", state.profile.phone)}
              ${detailField("Mailing address", state.profile.address)}
              ${detailField("Storage", "Protected cloud sync with durable offline recovery")}
            </div>
            <div class="action-row"><button class="button button-primary" id="edit-profile">Edit profile</button></div>
          </article>

          <article class="settings-card">
            <h3>Membership</h3>
            <p>Your account role controls administration. Your membership tier controls product access and animal limits.</p>
            <div class="detail-grid">
              ${detailField("Plan", String(membership.effectiveMembershipTier || "member").replace(/^./, (letter) => letter.toUpperCase()))}
              ${detailField("Account role", String(membership.accountRole || "user").replace(/^./, (letter) => letter.toUpperCase()))}
              ${detailField("Membership source", String(membership.membershipSource || "default").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()))}
              ${detailField("Account status", String(membership.accountStatus || "active").replace(/^./, (letter) => letter.toUpperCase()))}
              ${detailField("Subscription", String(membership.subscriptionStatus || "not_configured").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()))}
              ${detailField("Active-animal allowance", membership.maxActiveAnimals === 5 ? `${activeAnimals().length} / 5` : "Unlimited")}
            </div>
            ${membership.overrideExpired ? `<p class="brand-file-note">The prior manual override expired. Current automatic access resolves to Member until billing launches.</p>` : ""}
          </article>

          <article class="settings-card">
            <h3>Cloud sync</h3>
            <p>See when this device last reached the cloud and manually confirm the newest farm records.</p>
            <div class="sync-summary" id="settings-sync-summary" data-state="${esc(sync.type || "info")}">
              <span id="settings-sync-message">${esc(sync.message || "Checking cloud sync…")}</span>
            </div>
            <div class="detail-grid" style="margin-top:14px">
              <div class="detail-field"><small>Status</small><strong id="settings-sync-status">Checking</strong></div>
              <div class="detail-field"><small>Last synced</small><strong id="settings-last-synced">${esc(formatSyncTimestamp(sync.lastSyncedAt))}</strong></div>
              <div class="detail-field"><small>Connection</small><strong id="settings-sync-connection">${sync.online ? "Online" : "Offline"}</strong></div>
              <div class="detail-field"><small>Unsynced changes</small><strong id="settings-sync-pending">${sync.unsynced ? "Yes" : "No"}</strong></div>
            </div>
            <div class="action-row">
              <button class="button button-primary" type="button" id="settings-sync-now">Sync now</button>
              <button class="button button-ghost" type="button" id="settings-safety-backup">Download safety backup</button>
            </div>
          </article>

          <article class="settings-card">
            <h3>Device storage</h3>
            <p>Review the space used by this installed app. Pedigree source files and recovery points use expanded device storage instead of crowding the active farm record.</p>
            <div class="detail-grid">
              <div class="detail-field"><small>Active farm record</small><strong id="settings-state-size">Calculating…</strong></div>
              <div class="detail-field"><small>Total app storage</small><strong id="settings-storage-used">Calculating…</strong></div>
              <div class="detail-field"><small>Estimated available</small><strong id="settings-storage-available">Calculating…</strong></div>
              <div class="detail-field"><small>Offline protection</small><strong id="settings-storage-persistence">Checking…</strong></div>
            </div>
            <div class="action-row"><button class="button button-ghost" type="button" id="refresh-device-storage">Refresh storage</button></div>
          </article>

          <article class="settings-card">
            <h3>Rabbitry branding</h3>
            <p>Upload a custom rabbitry or farm logo. It appears in the app header and on printed sale pedigrees.</p>
            <div class="branding-preview" id="rabbitry-logo-preview">
              ${state.profile?.logoData
                ? `<img src="${state.profile.logoData}" alt="${esc(state.profile.operationName || "Rabbitry")} logo">`
                : `<div class="empty-state" style="width:100%"><strong>No custom logo</strong><p>Printed pedigrees currently use the HerdHarbor logo.</p></div>`}
            </div>
            <div class="action-row">
              <label class="button button-primary" for="rabbitry-logo-file">${state.profile?.logoData ? "Replace logo" : "Upload logo"}</label>
              <input class="hidden" id="rabbitry-logo-file" type="file" accept="image/jpeg,image/png,image/webp">
              <button class="button button-ghost" id="remove-rabbitry-logo" ${state.profile?.logoData ? "" : "disabled"}>Use HerdHarbor logo</button>
            </div>
            <p class="brand-file-note">JPG, PNG, or WebP. The image is compressed for browser storage. Transparent PNG/WebP logos work best.</p>
          </article>

          <article class="settings-card">
            <h3>Appearance</h3>
            <p>Choose a light or dark interface, or follow this device's system setting.</p>
            <div class="action-row">
              <button class="button button-ghost" data-theme-choice="light">Light</button>
              <button class="button button-ghost" data-theme-choice="dark">Dark</button>
              <button class="button button-ghost" data-theme-choice="system">Use system</button>
            </div>
            <label style="display:block;margin-top:16px">Preferred Weight Display
              <select id="preferred-weight-display">
                ${["lb", "lb+oz", "oz", "kg", "g"].map((unit) => `<option value="${unit}" ${unit === state.settings.preferredWeightDisplay ? "selected" : ""}>${unit}</option>`).join("")}
              </select>
            </label>
            <p class="brand-file-note">This changes Analytics display only. Original recorded values and units remain unchanged.</p>
          </article>

          <article class="settings-card">
            <h3>Market Analytics <span class="badge ${marketConsent.enabled ? "green" : "gray"}">${marketConsent.enabled ? "Opted in" : "Off"}</span></h3>
            <p>Optionally contribute de-identified facts from qualifying completed sales so HerdHarbor can return privacy-safe market aggregates. Cloud Sync, normal account storage, membership, billing, backups, and crash monitoring are separate.</p>
            <form id="market-analytics-consent-form">
              <label class="checkbox-row">
                <input type="checkbox" name="enabled" ${marketConsent.enabled ? "checked" : ""}>
                <span>Contribute future completed sales and view aggregate Market Analytics.</span>
              </label>
              <label class="checkbox-row">
                <input type="checkbox" name="includeHistorical" ${marketConsent.includeHistorical ? "checked" : ""}>
                <span>Also include existing completed sales. Historical listing prices remain unknown where they were not captured.</span>
              </label>
              <div class="form-grid two" style="margin-top:12px">
                <label>Country code<input name="regionCountry" maxlength="2" value="${esc(marketConsent.regionCountry || "US")}" placeholder="US"></label>
                <label>State / large region (optional)<input name="regionCode" maxlength="32" value="${esc(marketConsent.regionCode || "")}" placeholder="KY"></label>
                <label>Broad region (optional)<input name="broadRegion" maxlength="64" value="${esc(marketConsent.broadRegion || "")}" placeholder="Southeast"></label>
              </div>
              <p class="brand-file-note">Only allowlisted market facts are produced server-side after verifying your account, consent, ownership, and Completed status. Customer and animal names, contact details, exact addresses, notes, photos, documents, payment references, and raw sale records are prohibited. Groups below 5 observations are suppressed.</p>
              <p class="brand-file-note"><strong>Opt-out behavior:</strong> disabling stops new contributions immediately and clears this device's pending contribution queue. Already processed facts remain de-identified in the market dataset; verified account deletion removes consent, processing links, and associated facts.</p>
              <div class="action-row"><button class="button button-primary" type="submit">Save Market Analytics choice</button></div>
            </form>
          </article>

          <article class="settings-card">
            <h3>Install HerdHarbor</h3>
            <p id="pwa-install-note">Install HerdHarbor on this phone, tablet, or computer for app-style launching and protected offline access.</p>
            <div class="action-row"><button class="button button-primary" type="button" data-pwa-install>Install HerdHarbor</button></div>
          </article>

          <article class="settings-card">
            <h3>Demo data</h3>
            <p>Load realistic sample records to test the workflow. Existing records will be kept.</p>
            <div class="action-row"><button class="button button-secondary" id="load-demo">Load demo data</button></div>
          </article>

          <article class="settings-card">
            <h3>Tester feedback</h3>
            <p>Report a bug, confusing workflow, or feature request directly to the HerdHarbor development inbox.</p>
            <div class="action-row"><button class="button button-primary" id="settings-feedback">Send feedback</button></div>
          </article>

          <article class="settings-card">
            <h3>HerdHarbor resources</h3>
            <p>Get help using HerdHarbor, review account and privacy information, or contact support without leaving your records workflow.</p>
            <div class="action-row">
              <a class="button button-primary" href="/how-to/">How To Center</a>
            <a class="button button-ghost" href="https://herdharbor.com/support/" target="_blank" rel="noopener">Support</a>
              <a class="button button-ghost" href="https://herdharbor.com/privacy/" target="_blank" rel="noopener">Privacy</a>
              <a class="button button-ghost" href="https://herdharbor.com/terms/" target="_blank" rel="noopener">Terms</a>
              <a class="button button-ghost" href="https://herdharbor.com/delete-account/" target="_blank" rel="noopener">Account deletion</a>
            </div>
            <p class="brand-file-note">Version 1.8.2 adds Cloud Sync V2, lifecycle state-integrity safeguards, direct member transfers, guided breeding workflows, paper pedigree photo import, and release hardening while preserving the completed rabbit genetics engine, ARBA references, youth-show tools, pedigrees, Shows, production, health, and privacy-safe Market Analytics.</p>
          </article>

          <article class="settings-card">
            <h3>Export and import</h3>
            <p>Download a full safety backup, export readable farm, customer, sale, payment, and production records to Excel, or restore a prior HerdHarbor backup.</p>
            <div class="action-row">
              <button class="button button-primary" id="export-data">Export backup</button>
              <button class="button button-ghost" id="export-excel">Export records to Excel</button>
              <label class="button button-ghost" for="import-file">Import backup</label>
              <input class="hidden" id="import-file" type="file" accept="application/json">
            </div>
          </article>

          <article class="settings-card">
            <h3>Excel spreadsheet import</h3>
            <p>Add existing Animals, Customers, Sales, Payments, Production, actual Budgeting transactions, annual planned budgets, and Medical records from an Excel workbook. HerdHarbor previews valid rows and flags duplicates or errors before anything is saved.</p>
            <div class="action-row">
              <button class="button button-primary" type="button" id="download-spreadsheet-template">Download Excel template</button>
              <label class="button button-ghost" for="spreadsheet-import-file">Upload Excel file</label>
              <input class="hidden" id="spreadsheet-import-file" type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12">
            </div>
            <p class="brand-file-note">Imports add records without replacing current farm data. The workbook is processed on this device and is not uploaded to HerdHarbor servers.</p>
          </article>

          <article class="settings-card">
            <h3>Budget calculations</h3>
            <p>Operating expenses are included in cost per head. Product sale income and received animal-sale payments link to Budget automatically. Capital purchases remain visible in net results but are excluded from cost-per-head estimates.</p>
            <div class="action-row"><button class="button button-primary" id="open-budget-settings">Open budget</button></div>
          </article>

          <article class="settings-card">
            <h3>Danger zone</h3>
            <p><strong>Clear local data</strong> removes this device's working copy but does not delete your cloud account. <strong>Request account deletion</strong> starts permanent deletion of your HerdHarbor account and associated cloud data.</p>
            <div class="action-row">
              <button class="button button-ghost" id="clear-data">Clear local data</button>
              <button class="button button-danger" id="request-account-deletion">Request account deletion</button>
            </div>
            <p class="brand-file-note"><a href="https://herdharbor.com/delete-account/" target="_blank" rel="noopener">Account deletion details</a> · <a href="https://herdharbor.com/privacy/" target="_blank" rel="noopener">Privacy</a> · <a href="https://herdharbor.com/terms/" target="_blank" rel="noopener">Terms</a> · <a href="https://herdharbor.com/support/" target="_blank" rel="noopener">Support</a></p>
          </article>

          <article class="settings-card">
            <h3>Alpha limitations</h3>
            <p>This tester build has protected user accounts and cloud sync, plus a durable offline recovery copy for unsynced changes. Online card processing, shared employee access, and OCR are not yet available. Keep periodic exports for important records. Budget results are management estimates and are not tax advice.</p>
          </article>

          <details class="settings-about">
            <summary>About HerdHarbor</summary>
            <div class="detail-grid">
              ${detailField("Version", `${root.HerdHarborBuild?.channel || "Alpha"} v${appVersion()}`)}
              ${detailField("Build", root.HerdHarborBuild?.buildId || "Development")}
              ${detailField("Genetics engine", "Complete Domestic Rabbit Genetics v1.6.1")}
            </div>
          </details>
        </div>`;

      $("#edit-profile").addEventListener("click", openProfileForm);
      $("#rabbitry-logo-file").addEventListener("change", handleRabbitryLogoUpload);
      $("#remove-rabbitry-logo").addEventListener("click", removeRabbitryLogo);
      $$('[data-theme-choice]', $("#view-settings")).forEach((button) => button.addEventListener("click", () => {
        applyTheme(button.dataset.themeChoice);
        renderSettings();
      }));
      $("#preferred-weight-display").addEventListener("change", (event) => {
        state.settings.preferredWeightDisplay = event.currentTarget.value;
        saveState("Preferred weight display saved.");
      });
      $("#market-analytics-consent-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new root.FormData(form));
        const enabled = $("[name=enabled]", form).checked;
        const includeHistorical = $("[name=includeHistorical]", form).checked;
        const previousSettings = root.structuredClone(state.settings);
        try {
          await root.HerdHarborMarket?.setConsent?.(state, {
            enabled,
            includeHistorical,
            regionCountry: String(data.regionCountry || "US").toUpperCase(),
            regionCode: String(data.regionCode || "").trim(),
            broadRegion: String(data.broadRegion || "").trim()
          });
          if (!saveState(enabled ? "Market Analytics participation enabled." : "Market Analytics participation disabled.")) {
            state.settings = previousSettings;
            return;
          }
          renderSettings();
        } catch (error) {
          state.settings = previousSettings;
          toast(error.message || "The Market Analytics choice could not be saved.", "error");
        }
      });
      $("#settings-feedback").addEventListener("click", openFeedbackForm);
      $("#load-demo").addEventListener("click", loadDemoData);
      $("#export-data").addEventListener("click", exportData);
      $("#export-excel").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Preparing Excel…";
        try {
          const spreadsheet = await ensureSpreadsheetToolsReady();
          await spreadsheet.downloadExport(state, {
            operationName: state.profile?.operationName || "HerdHarbor"
          });
          toast("Excel records downloaded.", "success");
        } catch (error) {
          toast(error.message || "The Excel export could not be created.", "error");
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
      $("#import-file").addEventListener("change", importData);
      $("#settings-sync-now").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Syncing…";
        try {
          const saved = await root.HerdHarborCloud?.syncNow?.();
          refreshSyncStatus();
          toast(
            saved ? "Cloud sync confirmed." : "Sync was not confirmed. Your records remain protected on this device.",
            saved ? "success" : "error"
          );
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
      $("#settings-safety-backup").addEventListener("click", () => root.HerdHarborCloud?.downloadSafetyBackup?.());
      $("#refresh-device-storage").addEventListener("click", refreshDeviceStorageSummary);
      $("#download-spreadsheet-template").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Preparing Excel…";
        try {
          const spreadsheet = await ensureSpreadsheetToolsReady();
          await spreadsheet.downloadTemplate();
          toast("Excel template downloaded.", "success");
        } catch (error) {
          toast(error.message || "The Excel template could not be created.", "error");
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
      $("#spreadsheet-import-file").addEventListener("change", handleSpreadsheetImport);
      $("#open-budget-settings").addEventListener("click", () => navigate("budget"));
      $("#clear-data").addEventListener("click", clearData);
      $("#request-account-deletion").addEventListener("click", openAccountDeletionForm);
      root.HerdHarborPWA?.refreshInstallUI();
      refreshSyncStatus(sync);
      refreshDeviceStorageSummary();
    }

    function openAccountDeletionForm() {
      const account = root.HerdHarborCloud?.getSyncDetails?.() || {};
      openModal("Request account deletion", `
        <form id="account-deletion-form">
          <p>This permanently deletes your HerdHarbor account, associated cloud farm data, Market Analytics consent/linkage records, and linked de-identified market facts after verification. It is not the same as clearing this device.</p>
          <div class="pedigree-warning"><strong>Before continuing</strong><p>Export a backup if you want to keep your records. Downloaded backups and local copies on other devices are not deleted automatically.</p></div>
          <div class="detail-field" style="margin-top:16px"><small>Signed-in account</small><strong>${esc(account.email || "Current HerdHarbor account")}</strong></div>
          <label style="margin-top:16px">Reason (optional)<textarea id="account-deletion-reason" maxlength="1000" placeholder="You may leave this blank."></textarea></label>
          <label>Type DELETE to confirm<input id="account-deletion-confirmation" autocomplete="off" pattern="DELETE" required></label>
          <label class="checkbox-row"><input id="account-deletion-understand" type="checkbox" required><span>I understand this requests permanent deletion of my account, associated cloud data, and linked Market Analytics data.</span></label>
          <p class="feedback-privacy">The request sends your account email, internal account ID, reason, and request time to HerdHarbor. It does not send livestock records. Verified requests are normally completed within 30 days.</p>
          <div class="modal-actions">
            <button type="button" class="button button-ghost" id="account-deletion-backup">Export backup</button>
            <button type="button" class="button button-ghost" id="cancel-account-deletion">Cancel</button>
            <button type="submit" class="button button-danger" id="submit-account-deletion">Submit deletion request</button>
          </div>
          <p class="feedback-status" id="account-deletion-status" role="status" aria-live="polite"></p>
        </form>
      `, "Permanent account action");

      $("#account-deletion-backup").addEventListener("click", exportData);
      $("#cancel-account-deletion").addEventListener("click", closeModal);
      $("#account-deletion-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const button = $("#submit-account-deletion");
        const status = $("#account-deletion-status");
        button.disabled = true;
        status.className = "feedback-status";
        status.textContent = "Submitting your deletion request…";
        try {
          const result = await root.HerdHarborCloud?.requestAccountDeletion?.({
            reason: $("#account-deletion-reason").value.trim(),
            confirmation: $("#account-deletion-confirmation").value
          });
          if (!result?.ok) throw new Error("The deletion request service is unavailable.");
          status.className = "feedback-status success";
          status.textContent = `Request submitted. Watch ${result.email} for verification or follow-up. Access may continue until deletion is processed.`;
          button.remove();
          $("#account-deletion-backup").textContent = "Export final backup";
        } catch (error) {
          status.className = "feedback-status error";
          status.textContent = `${error.message || "The request could not be submitted."} You can also use herdharbor.com/delete-account.`;
          button.disabled = false;
        }
      });
    }

    async function handleRabbitryLogoUpload(event) {
      const state = stateNow();
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        toast("Preparing rabbitry logo…");
        const prepared = await prepareProfileImage(file, {
          maxDimension: 420,
          targetBytes: 45000,
          outputType: "image/webp",
          background: null
        });
        const previous = {
          logoData: state.profile.logoData || "",
          logoFileName: state.profile.logoFileName || "",
          logoUpdatedAt: state.profile.logoUpdatedAt || ""
        };
        state.profile.logoData = prepared.dataUrl;
        state.profile.logoFileName = prepared.fileName;
        state.profile.logoUpdatedAt = new Date().toISOString();
        recordActivity("Updated the rabbitry logo.", "settings");
        if (!saveState("Rabbitry logo saved.")) {
          state.profile.logoData = previous.logoData;
          state.profile.logoFileName = previous.logoFileName;
          state.profile.logoUpdatedAt = previous.logoUpdatedAt;
          state.activity.shift();
          return;
        }
        showApp();
      } catch (error) {
        event.target.value = "";
        toast(error.message || "The rabbitry logo could not be uploaded.", "error");
      }
    }

    function removeRabbitryLogo() {
      const state = stateNow();
      if (!state.profile?.logoData) return;
      if (!confirm("Remove the custom rabbitry logo and use the HerdHarbor logo on pedigrees?")) return;
      const previous = {
        logoData: state.profile.logoData,
        logoFileName: state.profile.logoFileName,
        logoUpdatedAt: state.profile.logoUpdatedAt
      };
      delete state.profile.logoData;
      delete state.profile.logoFileName;
      delete state.profile.logoUpdatedAt;
      recordActivity("Removed the custom rabbitry logo.", "settings");
      if (!saveState("Custom rabbitry logo removed.")) {
        Object.assign(state.profile, previous);
        state.activity.shift();
        return;
      }
      showApp();
    }

    function openProfileForm() {
      const state = stateNow();
      openModal("Edit operation profile", `
        <form id="profile-form">
          <div class="form-grid">
            ${field("Operation name", "operationName", state.profile.operationName, true)}
            ${field("Owner name", "ownerName", state.profile.ownerName, true)}
            ${field("Email", "email", state.profile.email, true, "email")}
            ${field("Phone", "phone", state.profile.phone, false, "tel")}
            ${field("Mailing address", "address", state.profile.address)}
          </div>
          <div class="modal-actions">
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">Save profile</button>
          </div>
        </form>`, "Workspace settings");
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#profile-form").addEventListener("submit", (event) => {
        event.preventDefault();
        Object.assign(state.profile, Object.fromEntries(new root.FormData(event.currentTarget)));
        saveState("Profile updated.");
        closeModal();
        showApp();
      });
    }

    function openFeedbackForm() {
      const state = stateNow();
      const routeOptions = [
        ["dashboard", "Dashboard"], ["animals", "Animals"], ["breeding", "Breeding"],
        ["litters", "Litters"], ["pedigrees", "Pedigrees"], ["health", "Health and weights"],
        ["tasks", "Tasks and reminders"], ["budget", "Budget and cost per head"],
        ["sales", "Sales, customers, and transfers"], ["settings", "Settings"], ["general", "General / whole app"]
      ];
      const feedbackSync = currentSyncDetails();
      const navigatorRef = root.navigator || {};
      const deviceSummary = [
        navigatorRef.userAgent || "User agent unavailable",
        `${root.innerWidth || 0} × ${root.innerHeight || 0} viewport`,
        navigatorRef.platform || "Platform unavailable",
        `Connection: ${feedbackSync.online ? "online" : "offline"}`,
        `Sync: ${feedbackSync.message || "status unavailable"}`,
        `Last synced: ${feedbackSync.lastSyncedAt || "not confirmed"}`
      ].join(" | ");

      openModal("Send tester feedback", `
        <form id="feedback-form" action="https://formspree.io/f/xpqvpwwb" method="POST">
          <input type="hidden" name="_subject" value="New HerdHarbor tester feedback">
          <input type="hidden" name="app_version" value="HerdHarbor Alpha v${appVersion()}">
          <input type="hidden" name="current_url" value="${esc(root.location?.href || "")}">
          <input type="hidden" name="device_details" value="${esc(deviceSummary)}">
          <input type="hidden" name="has_unsynced_changes" value="${feedbackSync.unsynced ? "Yes" : "No"}">
          <input type="hidden" name="has_sync_conflict" value="${feedbackSync.conflict ? "Yes" : "No"}">
          <input type="text" name="_gotcha" class="hidden" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="form-grid two">
            ${field("Tester name", "tester_name", state.profile?.ownerName || "", true)}
            ${field("Email", "email", state.profile?.email || "", true, "email")}
            ${selectField("Feedback type", "feedback_type", ["Bug", "Confusing workflow", "Feature request", "Missing field", "Mobile display issue", "Other"], "Bug", true)}
            <label>App section
              <select name="app_section" required>
                ${routeOptions.map(([value, label]) => `<option value="${value}" ${value === currentRoute() ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
          </div>
          ${field("Short title", "title", "", true)}
          ${textareaField("What happened, or what would you like changed?", "details", "", true)}
          ${textareaField("Steps to reproduce the problem", "steps_to_reproduce", "")}
          ${textareaField("Screenshot, error message, or additional description", "screenshot_description", "")}
          <label>Device type<select name="device_type" required><option value="">Choose one</option><option>Phone</option><option>Tablet</option><option>Desktop or laptop</option><option>Other</option></select></label>
          <label style="display:flex;grid-template-columns:auto 1fr;align-items:flex-start;gap:10px"><input type="checkbox" name="permission_to_contact" value="Yes" style="width:18px;height:18px;margin-top:2px"><span>You may contact me about this feedback.</span></label>
          <p class="feedback-privacy">This form sends the information above, the current app page, and basic browser/device details to the HerdHarbor tester-feedback inbox. It does not send your livestock records.</p>
          <div class="modal-actions"><button type="button" class="button button-ghost" id="cancel-feedback">Cancel</button><button type="submit" class="button button-primary" id="submit-feedback">Send feedback</button></div>
          <p class="feedback-status" id="feedback-status" role="status" aria-live="polite"></p>
        </form>
      `, "Private tester feedback");

      $("#cancel-feedback").addEventListener("click", closeModal);
      $("#feedback-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const button = $("#submit-feedback");
        const status = $("#feedback-status");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Sending…";
        status.className = "feedback-status";
        status.textContent = "Sending your feedback…";
        try {
          const response = await root.fetch(form.action, {
            method: "POST",
            body: new root.FormData(form),
            headers: { "Accept": "application/json" }
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const message = payload?.errors?.map((item) => item.message).join(", ") || "The feedback could not be submitted.";
            throw new Error(message);
          }
          status.className = "feedback-status success";
          status.textContent = "Thank you—your feedback was submitted.";
          recordActivity("Submitted tester feedback.", "feedback");
          saveState();
          root.setTimeout(() => {
            closeModal();
            toast("Feedback sent. Thank you.", "success");
          }, 900);
        } catch (error) {
          status.className = "feedback-status error";
          status.textContent = `${error.message || "Submission failed."} You can also email hello@herdharbor.com.`;
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      });
    }

    return Object.freeze({ renderSettings, openFeedbackForm });
  }

  return Object.freeze({ VERSION, create });
});
