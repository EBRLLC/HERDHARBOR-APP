<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0D2540">
  <title>HerdHarbor Account Test</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <style>
    :root {
      --navy: #0D2540;
      --teal: #2E7D7B;
      --cream: #F7F2E8;
      --paper: #FFFFFF;
      --text: #18212A;
      --muted: #65727E;
      --border: #D8E0E5;
      --danger: #A33A3A;
      --success: #2E6A45;
      color-scheme: light;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(46,125,123,.16), transparent 34%),
        linear-gradient(160deg, var(--cream), #EDF3F4);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .shell { width: min(560px, 100%); }
    .brand {
      margin-bottom: 14px;
      text-align: center;
    }
    .brand h1 {
      margin: 0;
      color: var(--navy);
      font-size: clamp(2rem, 7vw, 3.2rem);
      letter-spacing: -.04em;
    }
    .brand p { margin: 6px 0 0; color: var(--muted); }
    .card {
      padding: clamp(22px, 5vw, 36px);
      background: rgba(255,255,255,.94);
      border: 1px solid rgba(13,37,64,.12);
      border-radius: 24px;
      box-shadow: 0 24px 70px rgba(13,37,64,.14);
    }
    h2 { margin: 0 0 8px; color: var(--navy); }
    .intro { margin: 0 0 22px; color: var(--muted); line-height: 1.55; }
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 22px;
      padding: 5px;
      background: #EDF2F3;
      border-radius: 14px;
    }
    .tab {
      min-height: 42px;
      border: 0;
      border-radius: 10px;
      color: var(--navy);
      background: transparent;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .tab.active { color: white; background: var(--navy); }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 7px; font-weight: 750; color: var(--navy); }
    input {
      width: 100%;
      min-height: 48px;
      padding: 11px 13px;
      color: var(--text);
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      font: inherit;
    }
    input:focus {
      outline: 3px solid rgba(46,125,123,.18);
      border-color: var(--teal);
    }
    button {
      min-height: 46px;
      padding: 11px 15px;
      border: 0;
      border-radius: 12px;
      font: inherit;
      font-weight: 850;
      cursor: pointer;
    }
    button:disabled { opacity: .55; cursor: wait; }
    .primary { color: white; background: var(--teal); }
    .secondary { color: white; background: var(--navy); }
    .ghost { color: var(--navy); background: #EDF2F3; }
    .danger { color: white; background: var(--danger); }
    .link-button {
      min-height: auto;
      padding: 4px;
      color: var(--teal);
      background: transparent;
      text-decoration: underline;
    }
    .row { display: flex; flex-wrap: wrap; gap: 10px; }
    .row > button { flex: 1 1 180px; }
    .status {
      display: none;
      margin: 0 0 18px;
      padding: 12px 14px;
      border-radius: 12px;
      line-height: 1.45;
    }
    .status.show { display: block; }
    .status.info { color: var(--navy); background: #E9F0F5; }
    .status.success { color: var(--success); background: #E8F4EC; }
    .status.error { color: #7C2020; background: #F9E8E8; }
    .hidden { display: none !important; }
    .account-box {
      display: grid;
      gap: 16px;
    }
    .identity {
      padding: 14px;
      background: #F3F6F7;
      border: 1px solid var(--border);
      border-radius: 14px;
    }
    .identity strong, .identity span { display: block; }
    .identity span { margin-top: 4px; color: var(--muted); overflow-wrap: anywhere; }
    .note {
      margin-top: 18px;
      padding-top: 18px;
      color: var(--muted);
      border-top: 1px solid var(--border);
      font-size: .9rem;
      line-height: 1.55;
    }
    .cloud-details {
      margin: 0;
      padding: 12px 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--navy);
      background: #F3F6F7;
      border: 1px solid var(--border);
      border-radius: 12px;
      font: 500 .82rem/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="brand">
      <h1>HerdHarbor</h1>
      <p>Secure account and cloud-connection test</p>
    </header>

    <section class="card">
      <div id="status" class="status" role="status" aria-live="polite"></div>

      <div id="auth-panel">
        <h2 id="auth-title">Sign in</h2>
        <p class="intro">Test the account system before it is added to the main HerdHarbor dashboard.</p>

        <div class="tabs" aria-label="Account options">
          <button id="signin-tab" class="tab active" type="button">Sign in</button>
          <button id="signup-tab" class="tab" type="button">Create account</button>
        </div>

        <form id="signin-form">
          <label>
            Email
            <input id="signin-email" type="email" autocomplete="email" required>
          </label>
          <label>
            Password
            <input id="signin-password" type="password" autocomplete="current-password" minlength="8" required>
          </label>
          <button class="primary" type="submit">Sign in</button>
          <button id="forgot-password" class="link-button" type="button">Forgot password?</button>
        </form>

        <form id="signup-form" class="hidden">
          <label>
            Email
            <input id="signup-email" type="email" autocomplete="email" required>
          </label>
          <label>
            Password
            <input id="signup-password" type="password" autocomplete="new-password" minlength="8" required>
          </label>
          <label>
            Confirm password
            <input id="signup-confirm" type="password" autocomplete="new-password" minlength="8" required>
          </label>
          <button class="primary" type="submit">Create account</button>
        </form>
      </div>

      <div id="recovery-panel" class="hidden">
        <h2>Choose a new password</h2>
        <p class="intro">Enter a new password for your HerdHarbor account.</p>
        <form id="recovery-form">
          <label>
            New password
            <input id="recovery-password" type="password" autocomplete="new-password" minlength="8" required>
          </label>
          <label>
            Confirm new password
            <input id="recovery-confirm" type="password" autocomplete="new-password" minlength="8" required>
          </label>
          <button class="primary" type="submit">Update password</button>
        </form>
      </div>

      <div id="account-panel" class="hidden">
        <h2>Account connected</h2>
        <p class="intro">Authentication is working. You can now test the secured cloud table.</p>

        <div class="account-box">
          <div class="identity">
            <strong>Signed in as</strong>
            <span id="account-email"></span>
          </div>

          <div class="row">
            <button id="check-cloud" class="secondary" type="button">Check cloud record</button>
            <button id="upload-local" class="ghost" type="button">Upload local HerdHarbor data</button>
          </div>

          <pre id="cloud-details" class="cloud-details">No cloud check has been run.</pre>

          <button id="signout" class="danger" type="button">Sign out</button>
        </div>
      </div>

      <p class="note">
        This page is isolated from the main app. Uploading local data copies the
        <code>herdharbor_pre_alpha_v1</code> browser record into your secured Supabase row.
        It does not delete the browser copy.
      </p>
    </section>
  </main>

  <script>
    (() => {
      "use strict";

      const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
      const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
      const STORAGE_KEY = "herdharbor_pre_alpha_v1";
      const redirectUrl = window.location.origin + window.location.pathname;

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

      const $ = (selector) => document.querySelector(selector);
      const status = $("#status");
      const authPanel = $("#auth-panel");
      const recoveryPanel = $("#recovery-panel");
      const accountPanel = $("#account-panel");
      const signinForm = $("#signin-form");
      const signupForm = $("#signup-form");
      const signinTab = $("#signin-tab");
      const signupTab = $("#signup-tab");

      function setStatus(message = "", type = "info") {
        status.textContent = message;
        status.className = "status";
        if (message) status.classList.add("show", type);
      }

      function setBusy(form, busy) {
        form.querySelectorAll("button, input").forEach((element) => {
          element.disabled = busy;
        });
      }

      function showAuth(mode = "signin") {
        authPanel.classList.remove("hidden");
        recoveryPanel.classList.add("hidden");
        accountPanel.classList.add("hidden");

        const signingIn = mode === "signin";
        signinForm.classList.toggle("hidden", !signingIn);
        signupForm.classList.toggle("hidden", signingIn);
        signinTab.classList.toggle("active", signingIn);
        signupTab.classList.toggle("active", !signingIn);
        $("#auth-title").textContent = signingIn ? "Sign in" : "Create account";
      }

      function showRecovery() {
        authPanel.classList.add("hidden");
        accountPanel.classList.add("hidden");
        recoveryPanel.classList.remove("hidden");
      }

      function showAccount(session) {
        authPanel.classList.add("hidden");
        recoveryPanel.classList.add("hidden");
        accountPanel.classList.remove("hidden");
        $("#account-email").textContent = session.user.email || session.user.id;
      }

      async function refreshScreen() {
        const { data, error } = await client.auth.getSession();
        if (error) {
          setStatus(error.message, "error");
          showAuth();
          return;
        }
        if (data.session) {
          showAccount(data.session);
        } else {
          showAuth();
        }
      }

      signinTab.addEventListener("click", () => {
        setStatus();
        showAuth("signin");
      });

      signupTab.addEventListener("click", () => {
        setStatus();
        showAuth("signup");
      });

      signinForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setBusy(signinForm, true);
        setStatus("Signing in…", "info");

        try {
          const { error } = await client.auth.signInWithPassword({
            email: $("#signin-email").value.trim(),
            password: $("#signin-password").value
          });
          if (error) throw error;
          setStatus("Signed in successfully.", "success");
        } catch (error) {
          setStatus(error.message || "Sign-in failed.", "error");
        } finally {
          setBusy(signinForm, false);
        }
      });

      signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = $("#signup-password").value;
        const confirmPassword = $("#signup-confirm").value;
        if (password !== confirmPassword) {
          setStatus("The passwords do not match.", "error");
          return;
        }

        setBusy(signupForm, true);
        setStatus("Creating your account…", "info");

        try {
          const { data, error } = await client.auth.signUp({
            email: $("#signup-email").value.trim(),
            password,
            options: { emailRedirectTo: redirectUrl }
          });
          if (error) throw error;

          if (data.session) {
            setStatus("Account created and signed in.", "success");
          } else {
            setStatus(
              "Account created. Check your email and open the confirmation link, then return here to sign in.",
              "success"
            );
          }
        } catch (error) {
          setStatus(error.message || "Account creation failed.", "error");
        } finally {
          setBusy(signupForm, false);
        }
      });

      $("#forgot-password").addEventListener("click", async () => {
        const email = $("#signin-email").value.trim();
        if (!email) {
          setStatus("Enter your email address first.", "error");
          $("#signin-email").focus();
          return;
        }

        setStatus("Sending password-reset email…", "info");
        try {
          const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
          });
          if (error) throw error;
          setStatus("Password-reset email sent. Open the link in that email.", "success");
        } catch (error) {
          setStatus(error.message || "Could not send the reset email.", "error");
        }
      });

      $("#recovery-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const password = $("#recovery-password").value;
        const confirmPassword = $("#recovery-confirm").value;

        if (password !== confirmPassword) {
          setStatus("The passwords do not match.", "error");
          return;
        }

        setBusy(form, true);
        setStatus("Updating password…", "info");

        try {
          const { error } = await client.auth.updateUser({ password });
          if (error) throw error;
          setStatus("Password updated successfully.", "success");
          await refreshScreen();
        } catch (error) {
          setStatus(error.message || "Password update failed.", "error");
        } finally {
          setBusy(form, false);
        }
      });

      $("#signout").addEventListener("click", async () => {
        setStatus("Signing out…", "info");
        const { error } = await client.auth.signOut();
        if (error) {
          setStatus(error.message, "error");
        } else {
          setStatus("Signed out.", "success");
          showAuth();
        }
      });

      $("#check-cloud").addEventListener("click", async () => {
        setStatus("Checking your secured cloud row…", "info");
        const details = $("#cloud-details");

        const { data: sessionData } = await client.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) {
          setStatus("Your session expired. Sign in again.", "error");
          showAuth();
          return;
        }

        const { data, error } = await client
          .from("herdharbor_user_data")
          .select("created_at, updated_at, app_state")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          details.textContent = error.message;
          setStatus(
            "Cloud check failed. Confirm that the SQL schema was run in Supabase.",
            "error"
          );
          return;
        }

        if (!data) {
          details.textContent = "Connection succeeded. No cloud record exists for this account yet.";
          setStatus("Supabase connection and row-level security are working.", "success");
          return;
        }

        const appState = data.app_state || {};
        details.textContent = JSON.stringify({
          created_at: data.created_at,
          updated_at: data.updated_at,
          animal_count: Array.isArray(appState.animals) ? appState.animals.length : 0,
          breeding_count: Array.isArray(appState.breedings) ? appState.breedings.length : 0,
          litter_count: Array.isArray(appState.litters) ? appState.litters.length : 0,
          has_profile: Boolean(appState.profile)
        }, null, 2);
        setStatus("Your secured cloud record loaded successfully.", "success");
      });

      $("#upload-local").addEventListener("click", async () => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setStatus("No existing HerdHarbor browser data was found on this device.", "error");
          return;
        }

        let appState;
        try {
          appState = JSON.parse(raw);
        } catch {
          setStatus("The local HerdHarbor record is not valid JSON.", "error");
          return;
        }

        const animalCount = Array.isArray(appState.animals) ? appState.animals.length : 0;
        const message =
          `Upload this browser's HerdHarbor data to your cloud account?\n\n` +
          `Animals found: ${animalCount}\n\n` +
          `This replaces any existing cloud copy but does not delete the browser copy.`;

        if (!window.confirm(message)) return;

        setStatus("Uploading the local HerdHarbor record…", "info");

        const { data: sessionData } = await client.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) {
          setStatus("Your session expired. Sign in again.", "error");
          showAuth();
          return;
        }

        const { error } = await client
          .from("herdharbor_user_data")
          .upsert(
            { user_id: user.id, app_state: appState },
            { onConflict: "user_id" }
          );

        if (error) {
          setStatus(error.message || "Cloud upload failed.", "error");
          return;
        }

        setStatus("Local HerdHarbor data was copied to your secured cloud account.", "success");
        $("#check-cloud").click();
      });

      client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          showRecovery();
          setStatus("Your reset link is valid. Choose a new password.", "info");
          return;
        }

        if (session) {
          showAccount(session);
        } else if (event === "SIGNED_OUT") {
          showAuth();
        }
      });

      refreshScreen();
    })();
  </script>
</body>
</html>
