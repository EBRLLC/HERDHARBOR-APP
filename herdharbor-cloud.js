(() => {
  "use strict";

  // HerdHarbor cloud integration v1.1 — stable password-recovery flow.

  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const TABLE_NAME = "herdharbor_user_data";
  const SYNC_DELAY_MS = 700;

  if (!window.supabase?.createClient) {
    console.error("HerdHarbor Cloud: Supabase JavaScript library did not load.");
    return;
  }

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  let session = null;
  let syncTimer = null;
  let internalStorageWrite = false;
  let accountButton = null;
  let accountDialog = null;
  let syncState = "Checking account…";
  let recoveryMode = (() => {
    try {
      const url = new URL(window.location.href);
      return (
        url.searchParams.get("password-recovery") === "1" ||
        /(?:^|[&#])type=recovery(?:&|$)/.test(url.hash)
      );
    } catch {
      return false;
    }
  })();

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

      if (
        this === localStorage &&
        key === STORAGE_KEY &&
        !internalStorageWrite &&
        session?.user?.id
      ) {
        const userId = session.user.id;
        originalSetItem.call(localStorage, cacheKey(userId), value);
        originalSetItem.call(localStorage, dirtyKey(userId), "1");
        scheduleCloudSync(value);
      }

      return result;
    };

    Storage.prototype.removeItem = function patchedRemoveItem(key) {
      const result = originalRemoveItem.call(this, key);

      if (
        this === localStorage &&
        key === STORAGE_KEY &&
        !internalStorageWrite &&
        session?.user?.id
      ) {
        const userId = session.user.id;
        originalRemoveItem.call(localStorage, cacheKey(userId));
        originalSetItem.call(localStorage, dirtyKey(userId), "1");
        scheduleCloudSync("{}");
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
      setSyncState("Cloud save failed; local copy retained.", "error");
      return false;
    }

    originalRemoveItem.call(localStorage, dirtyKey(userId));
    originalSetItem.call(localStorage, cacheKey(userId), rawValue);
    setSyncState("Saved to cloud", "success");
    return true;
  }

  function scheduleCloudSync(rawValue) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncValueToCloud(rawValue);
    }, SYNC_DELAY_MS);
  }

  async function syncNow() {
    const raw = originalGetItem.call(localStorage, STORAGE_KEY);
    if (!raw) {
      setSyncState("No HerdHarbor data is available to sync.", "error");
      return false;
    }
    clearTimeout(syncTimer);
    return syncValueToCloud(raw);
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

      #hh-auth-root[hidden] { display: none !important; }

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

        <section class="hh-auth-card">
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

  function showAuth(mode = "signin") {
    ensureStyles();
    const root = buildAuthRoot();
    root.hidden = false;
    document.documentElement.classList.add("hh-auth-locked");

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
    root.querySelector("#hh-standard-auth").hidden = true;
    root.querySelector("#hh-recovery-form").hidden = false;
  }

  function unlockApp() {
    const root = document.querySelector("#hh-auth-root");
    if (root) root.hidden = true;
    document.documentElement.classList.remove("hh-auth-locked");
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
      const recoveryUrl = new URL(`${window.location.origin}${window.location.pathname}`);
      recoveryUrl.searchParams.set("password-recovery", "1");

      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryUrl.toString()
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
        setFormBusy(form, false);
        return;
      }

      recoveryMode = false;
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("password-recovery");
        cleanUrl.hash = "";
        window.history.replaceState({}, document.title, cleanUrl.toString());
      } catch {}

      await client.auth.signOut();
      showAuth("signin");
      authMessage(
        "Password updated successfully. Sign in with your new password.",
        "success"
      );
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

      accountDialog.querySelector("#hh-sign-out").addEventListener("click", async () => {
        await syncNow();
        if (session?.user?.id) {
          const active = originalGetItem.call(localStorage, STORAGE_KEY);
          if (active) originalSetItem.call(localStorage, cacheKey(session.user.id), active);
        }
        removeInternalStorage(STORAGE_KEY);
        accountDialog.hidden = true;
        await client.auth.signOut();
      });

      document.body.appendChild(accountDialog);
    }

    setSyncState(syncState, "success");
  }

  async function hydrateUserData(activeSession) {
    session = activeSession;

    if (recoveryMode) {
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    const userId = session.user.id;
    const activeRaw = originalGetItem.call(localStorage, STORAGE_KEY);
    const cachedRaw = originalGetItem.call(localStorage, cacheKey(userId));
    const dirty = originalGetItem.call(localStorage, dirtyKey(userId)) === "1";

    if (dirty) {
      const unsyncedRaw = activeRaw || cachedRaw;
      if (unsyncedRaw && safeParse(unsyncedRaw)) {
        if (!activeRaw) setInternalStorage(STORAGE_KEY, unsyncedRaw);
        unlockApp();
        setSyncState("Unsynced local changes found; saving…", "working");
        await syncValueToCloud(unsyncedRaw);
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

      if (cachedRaw && safeParse(cachedRaw)) {
        setInternalStorage(STORAGE_KEY, cachedRaw);
        unlockApp();
        setSyncState("Offline cache loaded; cloud unavailable.", "error");
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
      const stateChanged = activeRaw !== cloudRaw;

      setInternalStorage(STORAGE_KEY, cloudRaw);
      setInternalStorage(cacheKey(userId), cloudRaw);
      originalRemoveItem.call(localStorage, dirtyKey(userId));

      if (stateChanged) {
        const reloadKey = `hh_cloud_loaded_${userId}_${data.updated_at || "current"}`;
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

    const newUserRaw = cachedRaw || activeRaw;
    if (newUserRaw && safeParse(newUserRaw)) {
      setInternalStorage(STORAGE_KEY, newUserRaw);
      unlockApp();
      await syncValueToCloud(newUserRaw);
      return;
    }

    removeInternalStorage(STORAGE_KEY);
    unlockApp();
    setSyncState("New cloud account ready", "success");
  }

  async function initialize() {
    installStorageBridge();
    ensureStyles();
    document.documentElement.classList.add("hh-auth-locked");
    buildAuthRoot();
    authMessage("Checking your secure session…", "info");

    const { data, error } = await client.auth.getSession();

    if (error) {
      authMessage(error.message, "error");
      showAuth("signin");
      return;
    }

    if (!data.session) {
      removeInternalStorage(STORAGE_KEY);
      authMessage();
      showAuth("signin");
      return;
    }

    session = data.session;
    if (recoveryMode) {
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    await hydrateUserData(data.session);
  }

  client.auth.onAuthStateChange((event, activeSession) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      session = activeSession;
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    if (event === "SIGNED_IN" && activeSession) {
      session = activeSession;
      if (recoveryMode) {
        showRecovery();
        authMessage("Your reset link is valid. Choose a new password.", "info");
        return;
      }
      hydrateUserData(activeSession);
      return;
    }

    if (event === "SIGNED_OUT") {
      session = null;
      removeInternalStorage(STORAGE_KEY);
      if (accountButton) accountButton.remove();
      if (accountDialog) accountDialog.remove();
      accountButton = null;
      accountDialog = null;
      showAuth("signin");
      authMessage("Signed out successfully.", "success");
    }
  });

  window.HerdHarborCloud = {
    syncNow,
    getSession: () => session,
    getSyncState: () => syncState
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();