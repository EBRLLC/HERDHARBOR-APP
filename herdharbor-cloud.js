(() => {
  "use strict";

  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const TABLE_NAME = "herdharbor_user_data";
  const SYNC_DELAY_MS = 700;
  const SIGNED_OUT_CONFIRM_MS = 2500;
  const ACTIVE_USER_KEY = "herdharbor_active_user_id";
  const RECOVERY_DB_NAME = "herdharbor_recovery_v1";
  const RECOVERY_STORE_NAME = "states";

  if (!window.supabase?.createClient) {
    console.error("HerdHarbor Cloud: Supabase JavaScript library did not load.");
    return;
  }

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  let session = null;
  let syncTimer = null;
  let syncInFlight = null;
  let syncingRaw = null;
  let pendingSyncRaw = null;
  let signedOutTimer = null;
  let explicitSignOut = false;
  let hydratedUserId = null;
  let hydrationPromise = null;
  let hydrationUserId = null;
  let internalStorageWrite = false;
  let accountButton = null;
  let accountDialog = null;
  let syncState = "Checking account…";
  let syncStateType = "info";

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const cacheKey = (userId) => `herdharbor_user_cache_${userId}`;
  const dirtyKey = (userId) => `herdharbor_user_dirty_${userId}`;

  function safeParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function openRecoveryDatabase() {
    if (!("indexedDB" in window)) return Promise.resolve(null);

    return new Promise((resolve) => {
      const request = indexedDB.open(RECOVERY_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(RECOVERY_STORE_NAME)) {
          request.result.createObjectStore(RECOVERY_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error("HerdHarbor recovery storage could not be opened:", request.error);
        resolve(null);
      };
    });
  }

  const recoveryDatabasePromise = openRecoveryDatabase();

  async function writeRecoveryRecord(record) {
    const database = await recoveryDatabasePromise;
    if (!database) return false;

    return new Promise((resolve) => {
      const transaction = database.transaction(RECOVERY_STORE_NAME, "readwrite");
      transaction.objectStore(RECOVERY_STORE_NAME).put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        console.error("HerdHarbor recovery storage write failed:", transaction.error);
        resolve(false);
      };
      transaction.onabort = () => resolve(false);
    });
  }

  async function readRecoveryRecord(id) {
    const database = await recoveryDatabasePromise;
    if (!database) return null;

    return new Promise((resolve) => {
      const transaction = database.transaction(RECOVERY_STORE_NAME, "readonly");
      const request = transaction.objectStore(RECOVERY_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  function writeDurableState(userId, rawValue, dirty, reason) {
    if (!userId || !safeParse(rawValue)) return Promise.resolve(false);
    return writeRecoveryRecord({
      id: `current:${userId}`,
      userId,
      rawValue,
      dirty: Boolean(dirty),
      reason,
      savedAt: new Date().toISOString()
    });
  }

  function stashRecoveryState(userId, rawValue, reason) {
    if (!userId || !safeParse(rawValue)) return Promise.resolve(false);
    return writeRecoveryRecord({
      id: `recovery:${userId}`,
      userId,
      rawValue,
      dirty: true,
      reason,
      savedAt: new Date().toISOString()
    });
  }

  function readDurableState(userId) {
    return readRecoveryRecord(`current:${userId}`);
  }

  function currentUserRaw(userId) {
    if (!userId) return null;
    const activeOwner = originalGetItem.call(localStorage, ACTIVE_USER_KEY);
    const activeRaw = activeOwner === userId
      ? originalGetItem.call(localStorage, STORAGE_KEY)
      : null;
    return activeRaw || originalGetItem.call(localStorage, cacheKey(userId));
  }

  function setInternalStorage(key, value) {
    internalStorageWrite = true;
    try {
      originalSetItem.call(localStorage, key, value);
    } finally {
      internalStorageWrite = false;
    }
  }

  function removeInternalStorage(key) {
    internalStorageWrite = true;
    try {
      originalRemoveItem.call(localStorage, key);
    } finally {
      internalStorageWrite = false;
    }
  }

  function setSyncState(message, type = "info") {
    syncState = message;
    syncStateType = type;
    if (accountButton) {
      accountButton.dataset.state = type;
      accountButton.title = `HerdHarbor account: ${message}`;
    }
    const status = document.querySelector("#hh-account-sync-status");
    if (status) {
      status.textContent = message;
      status.dataset.type = type;
    }
  }

  function installStorageBridge() {
    if (window.__HERDHARBOR_STORAGE_BRIDGE__) return;
    window.__HERDHARBOR_STORAGE_BRIDGE__ = true;

    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const result = originalSetItem.call(this, key, value);

      if (this === localStorage && key === STORAGE_KEY && !internalStorageWrite) {
        const userId = session?.user?.id
          || originalGetItem.call(localStorage, ACTIVE_USER_KEY);

        if (userId) {
          originalSetItem.call(localStorage, ACTIVE_USER_KEY, userId);
          originalSetItem.call(localStorage, cacheKey(userId), value);
          originalSetItem.call(localStorage, dirtyKey(userId), String(Date.now()));
          writeDurableState(userId, value, true, "local-save");
          scheduleCloudSync(value);
        }
      }

      return result;
    };

    Storage.prototype.removeItem = function patchedRemoveItem(key) {
      const result = originalRemoveItem.call(this, key);

      if (this === localStorage && key === STORAGE_KEY && !internalStorageWrite) {
        const userId = session?.user?.id
          || originalGetItem.call(localStorage, ACTIVE_USER_KEY);

        if (userId) {
          originalRemoveItem.call(localStorage, cacheKey(userId));
          originalSetItem.call(localStorage, dirtyKey(userId), String(Date.now()));
          writeDurableState(userId, "{}", true, "local-clear");
          scheduleCloudSync("{}");
        }
      }

      return result;
    };
  }

  async function syncValueToCloud(rawValue) {
    if (!session?.user?.id) return false;

    const appState = safeParse(rawValue);
    if (!appState) {
      setSyncState("Local data could not be read.", "error");
      return false;
    }

    const userId = session.user.id;
    setSyncState("Saving to cloud…", "working");

    const { error } = await client
      .from(TABLE_NAME)
      .upsert(
        {
          user_id: userId,
          app_state: appState
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("HerdHarbor cloud save failed:", error);
      await writeDurableState(userId, rawValue, true, "cloud-save-failed");
      setSyncState("Cloud save failed; local copy retained.", "error");
      return false;
    }

    const latestRaw = currentUserRaw(userId);
    if (latestRaw === rawValue) {
      originalRemoveItem.call(localStorage, dirtyKey(userId));
      originalSetItem.call(localStorage, cacheKey(userId), rawValue);
      await writeDurableState(userId, rawValue, false, "cloud-save-complete");
      setSyncState("Saved to cloud", "success");
    } else {
      if (latestRaw) pendingSyncRaw = latestRaw;
      setSyncState("Saving newer changes…", "working");
    }

    return true;
  }

  function flushSyncQueue() {
    if (syncInFlight) return syncInFlight;

    syncInFlight = (async () => {
      let allSucceeded = true;

      while (pendingSyncRaw && session?.user?.id) {
        const candidate = pendingSyncRaw;
        pendingSyncRaw = null;
        syncingRaw = candidate;

        const saved = await syncValueToCloud(candidate);
        syncingRaw = null;

        if (!saved) {
          if (!pendingSyncRaw) pendingSyncRaw = candidate;
          allSucceeded = false;
          break;
        }

        const latestRaw = currentUserRaw(session.user.id);
        if (latestRaw && latestRaw !== candidate) pendingSyncRaw = latestRaw;
      }

      return allSucceeded && !pendingSyncRaw;
    })().finally(() => {
      syncingRaw = null;
      syncInFlight = null;
    });

    return syncInFlight;
  }

  function scheduleCloudSync(rawValue) {
    if (!rawValue || rawValue === syncingRaw) return;
    pendingSyncRaw = rawValue;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      flushSyncQueue();
    }, SYNC_DELAY_MS);
  }

  function syncRawNow(rawValue) {
    if (!rawValue || !safeParse(rawValue)) {
      setSyncState("No readable HerdHarbor data is available to sync.", "error");
      return Promise.resolve(false);
    }

    if (rawValue !== syncingRaw) pendingSyncRaw = rawValue;
    clearTimeout(syncTimer);
    return flushSyncQueue();
  }

  async function syncNow() {
    if (!session?.user?.id) {
      setSyncState("Sign in before saving to the cloud.", "error");
      return false;
    }

    const raw = currentUserRaw(session.user.id);
    if (!raw) {
      setSyncState("No HerdHarbor data is available to sync.", "error");
      return false;
    }

    return syncRawNow(raw);
  }

  function ensureStyles() {
    if (document.querySelector("#hh-cloud-styles")) return;

    const style = document.createElement("style");
    style.id = "hh-cloud-styles";
    style.textContent = `
      html.hh-auth-locked body > *:not(#hh-auth-root) {
        visibility: hidden !important;
      }

      #hh-auth-root {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: grid;
        place-items: center;
        overflow: auto;
        padding: 24px;
        color: #18212A;
        background:
          radial-gradient(circle at top left, rgba(46,125,123,.18), transparent 34%),
          linear-gradient(160deg, #F7F2E8, #EDF3F4);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #hh-auth-root[hidden],
      #hh-auth-loading[hidden],
      #hh-auth-card[hidden] { display: none !important; }

      .hh-auth-shell { width: min(520px, 100%); }
      .hh-auth-brand { margin-bottom: 14px; text-align: center; }
      .hh-auth-brand h1 {
        margin: 0;
        color: #0D2540;
        font-size: clamp(2.2rem, 8vw, 3.5rem);
        letter-spacing: -.045em;
      }
      .hh-auth-brand p { margin: 7px 0 0; color: #65727E; }
      .hh-auth-card {
        padding: clamp(22px, 5vw, 36px);
        background: rgba(255,255,255,.96);
        border: 1px solid rgba(13,37,64,.12);
        border-radius: 24px;
        box-shadow: 0 24px 70px rgba(13,37,64,.16);
      }
      .hh-auth-card h2 { margin: 0 0 8px; color: #0D2540; }
      .hh-auth-intro { margin: 0 0 20px; color: #65727E; line-height: 1.5; }
      .hh-auth-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 20px;
        padding: 5px;
        background: #EDF2F3;
        border-radius: 14px;
      }
      .hh-auth-tab,
      .hh-auth-button,
      .hh-account-button,
      .hh-account-dialog button {
        min-height: 44px;
        padding: 10px 14px;
        border: 0;
        border-radius: 11px;
        font: inherit;
        font-weight: 850;
        cursor: pointer;
      }
      .hh-auth-tab { color: #0D2540; background: transparent; }
      .hh-auth-tab.active { color: white; background: #0D2540; }
      .hh-auth-form { display: grid; gap: 14px; }
      .hh-auth-form[hidden] { display: none !important; }
      .hh-auth-form label {
        display: grid;
        gap: 7px;
        color: #0D2540;
        font-weight: 750;
      }
      .hh-auth-form input {
        width: 100%;
        min-height: 48px;
        padding: 11px 13px;
        color: #18212A;
        background: white;
        border: 1px solid #D8E0E5;
        border-radius: 12px;
        font: inherit;
      }
      .hh-auth-form input:focus {
        outline: 3px solid rgba(46,125,123,.18);
        border-color: #2E7D7B;
      }
      .hh-auth-primary { color: white; background: #2E7D7B; }
      .hh-auth-link {
        min-height: auto;
        padding: 4px;
        color: #2E7D7B;
        background: transparent;
        text-decoration: underline;
      }
      .hh-auth-message {
        display: none;
        margin: 0 0 17px;
        padding: 12px 14px;
        border-radius: 12px;
        line-height: 1.45;
      }
      .hh-auth-message.show { display: block; }
      .hh-auth-message.info { color: #0D2540; background: #E9F0F5; }
      .hh-auth-message.success { color: #2E6A45; background: #E8F4EC; }
      .hh-auth-message.error { color: #7C2020; background: #F9E8E8; }

      .hh-account-button {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 9000;
        min-height: 42px;
        color: white;
        background: #0D2540;
        box-shadow: 0 12px 30px rgba(13,37,64,.25);
      }
      .hh-account-button::before {
        content: "";
        display: inline-block;
        width: 9px;
        height: 9px;
        margin-right: 8px;
        border-radius: 50%;
        background: #E9C46A;
      }
      .hh-account-button[data-state="success"]::before { background: #67C587; }
      .hh-account-button[data-state="error"]::before { background: #E57373; }
      .hh-account-button[data-state="working"]::before { background: #E9C46A; }

      .hh-account-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(13,37,64,.58);
      }
      .hh-account-backdrop[hidden] { display: none !important; }
      .hh-account-dialog {
        width: min(470px, 100%);
        padding: 26px;
        color: #18212A;
        background: white;
        border-radius: 22px;
        box-shadow: 0 24px 70px rgba(0,0,0,.28);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .hh-account-dialog h2 { margin: 0 0 8px; color: #0D2540; }
      .hh-account-email {
        margin: 0 0 18px;
        overflow-wrap: anywhere;
        color: #65727E;
      }
      #hh-account-sync-status {
        margin: 0 0 18px;
        padding: 12px 14px;
        color: #0D2540;
        background: #F0F4F5;
        border-radius: 12px;
        font-weight: 700;
      }
      #hh-account-sync-status[data-type="success"] { color: #2E6A45; background: #E8F4EC; }
      #hh-account-sync-status[data-type="error"] { color: #7C2020; background: #F9E8E8; }
      .hh-account-actions { display: grid; gap: 10px; }
      .hh-account-sync { color: white; background: #2E7D7B; }
      .hh-account-close { color: #0D2540; background: #EDF2F3; }
      .hh-account-signout { color: white; background: #AA3E3E; }

      @media (max-width: 620px) {
        #hh-auth-root { padding: 14px; }
        .hh-account-button { right: 12px; bottom: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildAuthRoot() {
    let root = document.querySelector("#hh-auth-root");
    if (root) return root;

    root = document.createElement("div");
    root.id = "hh-auth-root";
    root.innerHTML = `
      <main class="hh-auth-shell">
        <header class="hh-auth-brand">
          <h1>HerdHarbor</h1>
          <p>Secure livestock records, available wherever you sign in</p>
        </header>

        <section id="hh-auth-loading" class="hh-auth-card">
          <h2>Opening your account</h2>
          <p class="hh-auth-intro">Checking your secure session and protecting any unsynced records…</p>
        </section>

        <section id="hh-auth-card" class="hh-auth-card" hidden>
          <div id="hh-auth-message" class="hh-auth-message" role="status" aria-live="polite"></div>

          <div id="hh-standard-auth">
            <h2 id="hh-auth-title">Sign in</h2>
            <p class="hh-auth-intro">Sign in to load your protected HerdHarbor records.</p>

            <div class="hh-auth-tabs">
              <button id="hh-signin-tab" class="hh-auth-tab active" type="button">Sign in</button>
              <button id="hh-signup-tab" class="hh-auth-tab" type="button">Create account</button>
            </div>

            <form id="hh-signin-form" class="hh-auth-form">
              <label>
                Email
                <input id="hh-signin-email" type="email" autocomplete="email" required>
              </label>
              <label>
                Password
                <input id="hh-signin-password" type="password" autocomplete="current-password" minlength="8" required>
              </label>
              <button class="hh-auth-button hh-auth-primary" type="submit">Sign in</button>
              <button id="hh-forgot-password" class="hh-auth-button hh-auth-link" type="button">Forgot password?</button>
            </form>

            <form id="hh-signup-form" class="hh-auth-form" hidden>
              <label>
                Email
                <input id="hh-signup-email" type="email" autocomplete="email" required>
              </label>
              <label>
                Password
                <input id="hh-signup-password" type="password" autocomplete="new-password" minlength="8" required>
              </label>
              <label>
                Confirm password
                <input id="hh-signup-confirm" type="password" autocomplete="new-password" minlength="8" required>
              </label>
              <button class="hh-auth-button hh-auth-primary" type="submit">Create account</button>
            </form>
          </div>

          <form id="hh-recovery-form" class="hh-auth-form" hidden>
            <h2>Choose a new password</h2>
            <p class="hh-auth-intro">Enter a new password for your HerdHarbor account.</p>
            <label>
              New password
              <input id="hh-recovery-password" type="password" autocomplete="new-password" minlength="8" required>
            </label>
            <label>
              Confirm new password
              <input id="hh-recovery-confirm" type="password" autocomplete="new-password" minlength="8" required>
            </label>
            <button class="hh-auth-button hh-auth-primary" type="submit">Update password</button>
          </form>
        </section>
      </main>
    `;

    root.hidden = true;
    document.body.appendChild(root);
    bindAuthEvents(root);
    return root;
  }

  function authMessage(message = "", type = "info") {
    const box = document.querySelector("#hh-auth-message");
    if (!box) return;
    box.textContent = message;
    box.className = "hh-auth-message";
    if (message) box.classList.add("show", type);
  }

  function showAuthChecking() {
    ensureStyles();
    const root = buildAuthRoot();
    root.hidden = false;
    document.documentElement.classList.add("hh-auth-locked");
    root.querySelector("#hh-auth-loading").hidden = false;
    root.querySelector("#hh-auth-card").hidden = true;
  }

  function showAuth(mode = "signin") {
    ensureStyles();
    const root = buildAuthRoot();
    root.hidden = false;
    document.documentElement.classList.add("hh-auth-locked");
    root.querySelector("#hh-auth-loading").hidden = true;
    root.querySelector("#hh-auth-card").hidden = false;

    const standard = root.querySelector("#hh-standard-auth");
    const recovery = root.querySelector("#hh-recovery-form");
    standard.hidden = false;
    recovery.hidden = true;

    const isSignin = mode === "signin";
    root.querySelector("#hh-signin-form").hidden = !isSignin;
    root.querySelector("#hh-signup-form").hidden = isSignin;
    root.querySelector("#hh-signin-tab").classList.toggle("active", isSignin);
    root.querySelector("#hh-signup-tab").classList.toggle("active", !isSignin);
    root.querySelector("#hh-auth-title").textContent = isSignin ? "Sign in" : "Create account";
  }

  function showRecovery() {
    ensureStyles();
    const root = buildAuthRoot();
    root.hidden = false;
    document.documentElement.classList.add("hh-auth-locked");
    root.querySelector("#hh-auth-loading").hidden = true;
    root.querySelector("#hh-auth-card").hidden = false;
    root.querySelector("#hh-standard-auth").hidden = true;
    root.querySelector("#hh-recovery-form").hidden = false;
  }

  function unlockApp() {
    const root = document.querySelector("#hh-auth-root");
    if (root) root.hidden = true;
    document.documentElement.classList.remove("hh-auth-locked");
    if (session?.user?.id) hydratedUserId = session.user.id;
    buildAccountControls();
  }

  function setFormBusy(form, busy) {
    form.querySelectorAll("button, input").forEach((element) => {
      element.disabled = busy;
    });
  }

  function bindAuthEvents(root) {
    root.querySelector("#hh-signin-tab").addEventListener("click", () => {
      authMessage();
      showAuth("signin");
    });

    root.querySelector("#hh-signup-tab").addEventListener("click", () => {
      authMessage();
      showAuth("signup");
    });

    root.querySelector("#hh-signin-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setFormBusy(form, true);
      authMessage("Signing in…", "info");

      const { error } = await client.auth.signInWithPassword({
        email: root.querySelector("#hh-signin-email").value.trim(),
        password: root.querySelector("#hh-signin-password").value
      });

      if (error) authMessage(error.message, "error");
      setFormBusy(form, false);
    });

    root.querySelector("#hh-signup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = root.querySelector("#hh-signup-password").value;
      const confirmation = root.querySelector("#hh-signup-confirm").value;

      if (password !== confirmation) {
        authMessage("The passwords do not match.", "error");
        return;
      }

      setFormBusy(form, true);
      authMessage("Creating your account…", "info");

      const { data, error } = await client.auth.signUp({
        email: root.querySelector("#hh-signup-email").value.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`
        }
      });

      if (error) {
        authMessage(error.message, "error");
      } else if (data.session) {
        authMessage("Account created and signed in.", "success");
      } else {
        authMessage(
          "Account created. Open the confirmation email, then return here to sign in.",
          "success"
        );
      }

      setFormBusy(form, false);
    });

    root.querySelector("#hh-forgot-password").addEventListener("click", async () => {
      const email = root.querySelector("#hh-signin-email").value.trim();
      if (!email) {
        authMessage("Enter your email address first.", "error");
        root.querySelector("#hh-signin-email").focus();
        return;
      }

      authMessage("Sending password-reset email…", "info");
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}`
      });

      authMessage(
        error ? error.message : "Password-reset email sent. Open the link in that email.",
        error ? "error" : "success"
      );
    });

    root.querySelector("#hh-recovery-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = root.querySelector("#hh-recovery-password").value;
      const confirmation = root.querySelector("#hh-recovery-confirm").value;

      if (password !== confirmation) {
        authMessage("The passwords do not match.", "error");
        return;
      }

      setFormBusy(form, true);
      authMessage("Updating password…", "info");
      const { error } = await client.auth.updateUser({ password });

      if (error) {
        authMessage(error.message, "error");
      } else {
        authMessage("Password updated successfully.", "success");
        unlockApp();
      }
      setFormBusy(form, false);
    });
  }

  function buildAccountControls() {
    if (!accountButton) {
      accountButton = document.createElement("button");
      accountButton.type = "button";
      accountButton.className = "hh-account-button";
      accountButton.textContent = "Account";
      accountButton.dataset.state = "info";
      accountButton.addEventListener("click", () => {
        accountDialog.hidden = false;
        const email = accountDialog.querySelector("#hh-account-email");
        email.textContent = session?.user?.email || "Signed-in user";
        const status = accountDialog.querySelector("#hh-account-sync-status");
        status.textContent = syncState;
      });
      document.body.appendChild(accountButton);
    }

    if (!accountDialog) {
      accountDialog = document.createElement("div");
      accountDialog.className = "hh-account-backdrop";
      accountDialog.hidden = true;
      accountDialog.innerHTML = `
        <section class="hh-account-dialog" role="dialog" aria-modal="true" aria-labelledby="hh-account-title">
          <h2 id="hh-account-title">HerdHarbor account</h2>
          <p id="hh-account-email" class="hh-account-email"></p>
          <p id="hh-account-sync-status">Checking sync status…</p>
          <div class="hh-account-actions">
            <button id="hh-sync-now" class="hh-account-sync" type="button">Save to cloud now</button>
            <button id="hh-download-recovery" class="hh-account-close" type="button">Download recovery copy</button>
            <button id="hh-close-account" class="hh-account-close" type="button">Close</button>
            <button id="hh-sign-out" class="hh-account-signout" type="button">Sign out</button>
          </div>
        </section>
      `;

      accountDialog.addEventListener("click", (event) => {
        if (event.target === accountDialog) accountDialog.hidden = true;
      });

      accountDialog.querySelector("#hh-close-account").addEventListener("click", () => {
        accountDialog.hidden = true;
      });

      accountDialog.querySelector("#hh-sync-now").addEventListener("click", async () => {
        await syncNow();
      });

      accountDialog.querySelector("#hh-download-recovery").addEventListener("click", async () => {
        const userId = session?.user?.id;
        const current = userId ? await readDurableState(userId) : null;
        const recovery = userId ? await readRecoveryRecord(`recovery:${userId}`) : null;
        const selected = recovery?.rawValue ? recovery : current;

        if (!selected?.rawValue || !safeParse(selected.rawValue)) {
          setSyncState("No recovery copy is available yet.", "error");
          return;
        }

        const blob = new Blob([selected.rawValue], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `herdharbor-recovery-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setSyncState("Recovery copy downloaded.", "success");
      });

      accountDialog.querySelector("#hh-sign-out").addEventListener("click", async () => {
        const saved = await syncNow();
        if (!saved) {
          setSyncState("Sign-out stopped because cloud save failed. Your local copy is still open.", "error");
          return;
        }

        const userId = session?.user?.id;
        const active = userId ? currentUserRaw(userId) : null;
        if (userId && active) {
          originalSetItem.call(localStorage, cacheKey(userId), active);
          await writeDurableState(userId, active, false, "safe-sign-out");
        }

        explicitSignOut = true;
        accountDialog.hidden = true;
        const { error } = await client.auth.signOut();

        if (error) {
          explicitSignOut = false;
          setSyncState(error.message || "Sign-out failed.", "error");
          return;
        }

        handleConfirmedSignedOut("Signed out successfully.", true);
        setTimeout(() => {
          explicitSignOut = false;
        }, SIGNED_OUT_CONFIRM_MS);
      });

      document.body.appendChild(accountDialog);
    }

    setSyncState(syncState, syncStateType);
  }

  async function hydrateUserData(activeSession) {
    clearTimeout(signedOutTimer);
    session = activeSession;
    const userId = session.user.id;
    const activeRaw = originalGetItem.call(localStorage, STORAGE_KEY);
    const activeOwner = originalGetItem.call(localStorage, ACTIVE_USER_KEY);
    const ownedActiveRaw = activeOwner === userId || (!activeOwner && activeRaw)
      ? activeRaw
      : null;
    const cachedRaw = originalGetItem.call(localStorage, cacheKey(userId));
    const durable = await readDurableState(userId);
    const localDirty = originalGetItem.call(localStorage, dirtyKey(userId)) !== null;
    const durableDirty = Boolean(durable?.dirty);
    const dirty = localDirty || durableDirty;

    if (!activeOwner && activeRaw) {
      originalSetItem.call(localStorage, ACTIVE_USER_KEY, userId);
    }

    if (dirty) {
      const unsyncedRaw = localDirty
        ? (ownedActiveRaw || cachedRaw || durable?.rawValue)
        : (durable?.rawValue || ownedActiveRaw || cachedRaw);

      if (unsyncedRaw && safeParse(unsyncedRaw)) {
        setInternalStorage(STORAGE_KEY, unsyncedRaw);
        setInternalStorage(ACTIVE_USER_KEY, userId);
        setInternalStorage(cacheKey(userId), unsyncedRaw);
        unlockApp();
        setSyncState("Unsynced local changes found; saving…", "working");
        const saved = await syncRawNow(unsyncedRaw);
        if (!saved) {
          setSyncState("Cloud save failed; durable local copy retained.", "error");
        }
        return;
      }
    }

    setSyncState("Loading cloud records…", "working");

    const { data, error } = await client
      .from(TABLE_NAME)
      .select("app_state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("HerdHarbor cloud load failed:", error);
      const fallbackRaw = ownedActiveRaw || cachedRaw || durable?.rawValue;

      if (fallbackRaw && safeParse(fallbackRaw)) {
        setInternalStorage(STORAGE_KEY, fallbackRaw);
        setInternalStorage(ACTIVE_USER_KEY, userId);
        setInternalStorage(cacheKey(userId), fallbackRaw);
        unlockApp();
        setSyncState("Offline copy loaded; cloud unavailable.", "error");
        return;
      }

      authMessage(
        "Your account is signed in, but HerdHarbor could not load the cloud record. Try again shortly.",
        "error"
      );
      showAuth("signin");
      return;
    }

    if (data?.app_state) {
      const cloudRaw = JSON.stringify(data.app_state);
      const stateChanged = ownedActiveRaw !== cloudRaw;

      if (ownedActiveRaw && safeParse(ownedActiveRaw) && stateChanged) {
        await stashRecoveryState(userId, ownedActiveRaw, "before-cloud-refresh");
      }

      setInternalStorage(STORAGE_KEY, cloudRaw);
      setInternalStorage(ACTIVE_USER_KEY, userId);
      setInternalStorage(cacheKey(userId), cloudRaw);
      originalRemoveItem.call(localStorage, dirtyKey(userId));
      await writeDurableState(userId, cloudRaw, false, "cloud-load");

      if (stateChanged) {
        const reloadKey = `hh_cloud_loaded_${userId}_${data.updated_at || cloudRaw.length}`;
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
          return;
        }
      }

      unlockApp();
      setSyncState("Cloud records loaded", "success");
      return;
    }

    const newUserRaw = cachedRaw || ownedActiveRaw || durable?.rawValue;
    if (newUserRaw && safeParse(newUserRaw)) {
      setInternalStorage(STORAGE_KEY, newUserRaw);
      setInternalStorage(ACTIVE_USER_KEY, userId);
      setInternalStorage(cacheKey(userId), newUserRaw);
      originalSetItem.call(localStorage, dirtyKey(userId), String(Date.now()));
      await writeDurableState(userId, newUserRaw, true, "new-cloud-account");
      unlockApp();
      await syncRawNow(newUserRaw);
      return;
    }

    if (activeRaw && activeOwner && activeOwner !== userId) {
      await stashRecoveryState(activeOwner, activeRaw, "account-switch");
    }

    const stateChanged = Boolean(activeRaw);
    removeInternalStorage(STORAGE_KEY);
    setInternalStorage(ACTIVE_USER_KEY, userId);
    await writeDurableState(userId, "{}", false, "empty-cloud-account");

    if (stateChanged) {
      const reloadKey = `hh_empty_account_${userId}`;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        return;
      }
    }

    unlockApp();
    setSyncState("New cloud account ready", "success");
  }

  function hydrateSession(activeSession) {
    if (!activeSession?.user?.id) return Promise.resolve();
    clearTimeout(signedOutTimer);

    if (hydratedUserId === activeSession.user.id) {
      session = activeSession;
      unlockApp();
      return Promise.resolve();
    }

    if (hydrationPromise && hydrationUserId === activeSession.user.id) {
      session = activeSession;
      return hydrationPromise;
    }

    hydrationUserId = activeSession.user.id;
    hydrationPromise = hydrateUserData(activeSession).finally(() => {
      hydrationPromise = null;
      hydrationUserId = null;
    });
    return hydrationPromise;
  }

  function removeAccountControls() {
    if (accountButton) accountButton.remove();
    if (accountDialog) accountDialog.remove();
    accountButton = null;
    accountDialog = null;
  }

  function handleConfirmedSignedOut(message, clearActive = false) {
    const userId = session?.user?.id
      || originalGetItem.call(localStorage, ACTIVE_USER_KEY);
    const activeRaw = userId ? currentUserRaw(userId) : null;

    if (userId && activeRaw && safeParse(activeRaw)) {
      originalSetItem.call(localStorage, cacheKey(userId), activeRaw);
      writeDurableState(
        userId,
        activeRaw,
        originalGetItem.call(localStorage, dirtyKey(userId)) !== null,
        clearActive ? "signed-out" : "session-expired"
      );
    }

    if (clearActive) {
      removeInternalStorage(STORAGE_KEY);
      removeInternalStorage(ACTIVE_USER_KEY);
    }

    session = null;
    hydratedUserId = null;
    removeAccountControls();
    showAuth("signin");
    authMessage(message, "success");
  }

  function confirmSignedOutAfterGrace() {
    clearTimeout(signedOutTimer);
    signedOutTimer = setTimeout(async () => {
      const { data, error } = await client.auth.getSession();

      if (!error && data.session) {
        session = data.session;
        await hydrateSession(data.session);
        return;
      }

      handleConfirmedSignedOut(
        "Your session ended. Sign in again; your unsynced local copy has been retained.",
        false
      );
    }, SIGNED_OUT_CONFIRM_MS);
  }

  async function initialize() {
    installStorageBridge();
    ensureStyles();
    showAuthChecking();

    const { data, error } = await client.auth.getSession();

    if (error) {
      authMessage(error.message, "error");
      showAuth("signin");
      return;
    }

    if (!data.session) {
      authMessage();
      showAuth("signin");
      return;
    }

    await hydrateSession(data.session);
  }

  client.auth.onAuthStateChange((event, activeSession) => {
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") {
        clearTimeout(signedOutTimer);
        session = activeSession;
        showRecovery();
        authMessage("Your reset link is valid. Choose a new password.", "info");
        return;
      }

      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && activeSession) {
        clearTimeout(signedOutTimer);
        hydrateSession(activeSession);
        return;
      }

      if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && activeSession) {
        clearTimeout(signedOutTimer);
        session = activeSession;
        return;
      }

      if (event === "SIGNED_OUT") {
        if (explicitSignOut) {
          handleConfirmedSignedOut("Signed out successfully.", true);
        } else {
          confirmSignedOutAfterGrace();
        }
      }
    }, 0);
  });

  window.addEventListener("online", () => {
    if (
      session?.user?.id
      && originalGetItem.call(localStorage, dirtyKey(session.user.id)) !== null
    ) {
      syncNow();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible"
      && session?.user?.id
      && originalGetItem.call(localStorage, dirtyKey(session.user.id)) !== null
    ) {
      syncNow();
    }
  });

  window.HerdHarborCloud = {
    syncNow,
    getSession: () => session,
    getSyncState: () => syncState,
    getRecoveryState: async () => {
      const userId = session?.user?.id
        || originalGetItem.call(localStorage, ACTIVE_USER_KEY);
      return userId ? readRecoveryRecord(`recovery:${userId}`) : null;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();