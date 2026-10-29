(() => {
  "use strict";

  // HerdHarbor cloud integration v1.4 — automatic three-way merge and local recovery.

  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const TABLE_NAME = "herdharbor_user_data";
  const SYNC_DELAY_MS = 2500;
  const LARGE_STATE_SYNC_DELAY_MS = 2500;
  const LARGE_STATE_THRESHOLD_CHARS = 750000;
  const MAX_SYNC_DEBOUNCE_MS = 15000;
  const ACTIVE_OWNER_KEY = "herdharbor_active_user_v1";
  const LEGACY_ACTIVE_OWNER_KEY = "herdharbor_active_user_id";
  const ACCOUNT_BOUNDARY_RECOVERY_MARKER_PREFIX = "herdharbor_account_boundary_recovery_v1";
  const UNATTRIBUTED_RECOVERY_USER_ID = "__unattributed__";
  const RECOVERY_DB_NAME = "herdharbor_recovery_v1";
  const RECOVERY_STORE_NAME = "snapshots";
  const RECOVERY_DB_VERSION = 2;
  const MAX_RECOVERY_SNAPSHOTS = 6;
  const MAX_RECOVERY_BYTES = 8_000_000;
  const ACCOUNT_DELETION_REQUEST_URL = "https://formspree.io/f/xpqvpwwb";

  if (!window.supabase?.createClient) {
    console.error("HerdHarbor Cloud: Supabase JavaScript library did not load.");
    const renderStartupFailure = () => {
      if (!document.body) {
        const retry = () => {
          if (document.body) {
            renderStartupFailure();
            return;
          }
          setTimeout(retry, 0);
        };
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", retry, { once: true });
        } else {
          setTimeout(retry, 0);
        }
        return;
      }

      const failureStyle = document.createElement("style");
      failureStyle.textContent = `
        html.hh-auth-locked body > *:not(#hh-cloud-startup-error) { visibility: hidden !important; }
        #hh-cloud-startup-error {
          position: fixed;
          inset: 0;
          z-index: 100000;
          display: grid;
          place-items: center;
          padding: 24px;
          color: #18212A;
          background: #F7F2E8;
          font: 700 1rem/1.5 system-ui, sans-serif;
          text-align: center;
        }
        #hh-cloud-startup-error strong { display: block; margin-bottom: 8px; color: #0D2540; font-size: 1.5rem; }
      `;
      const styleTarget = document.head || document.documentElement || document.body;
      if (styleTarget && !document.getElementById("hh-cloud-startup-style")) {
        failureStyle.id = "hh-cloud-startup-style";
        styleTarget.appendChild(failureStyle);
      }
      if (document.documentElement) document.documentElement.classList.add("hh-auth-locked");
      const failureTarget = document.body;
      if (failureTarget && !document.getElementById("hh-cloud-startup-error")) {
        const failure = document.createElement("div");
        failure.id = "hh-cloud-startup-error";
        failure.innerHTML = "<div><strong>HerdHarbor could not start securely.</strong>Your local records were not removed. Check your connection and reload the app.</div>";
        failureTarget.appendChild(failure);
      }
    };
    renderStartupFailure();
    return;
  }

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const canonicalStateStore = window.HerdHarborStateStore || null;
  const accountBoundaryFence = window.HerdHarborAccountBoundaryCore?.createGenerationFence?.() || null;

  let session = null;
  let syncTimer = null;
  let syncDebounceStartedAt = 0;
  let syncInFlight = null;
  let syncInFlightRaw = null;
  let pendingSync = null;
  let writeSequence = 0;
  let lastCloudCheckAt = 0;
  const FOREGROUND_CLOUD_CHECK_INTERVAL_MS = 30000;
  const NORMALIZED_COHORT_STATUS_TTL_MS = 60000;
  let normalizedCohortStatusCache = null;
  let normalizedCohortStatusInFlight = null;
  let accountButton = null;
  let accountDialog = null;
  let syncConflict = null;
  let syncState = "Checking account…";
  let syncStateType = "info";
  let reloadAfterSync = false;
  let accessProfile = null;
  let normalizedRollout = null;
  let normalizedUpgradeS20 = null;
  let normalizedRefreshInFlight = null;
  let hydrationInFlight = null;
  let hydrationUserId = "";
  let lastHydratedUserId = "";
  let accountBoundaryRecoveryInFlight = null;
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
  const baseKey = (userId) => `herdharbor_user_cloud_base_${userId}`;
  const versionKey = (userId) => `herdharbor_user_cloud_version_${userId}`;
  const cloudBaselineMemory = new Map();
  const legacyBaselineStore = (() => {
    try {
      return window.HerdHarborLegacyCloudBaseline?.createIndexedDbStore?.({
        indexedDB: window.indexedDB
      }) || null;
    } catch (error) {
      console.warn("HerdHarbor durable cloud baseline storage is unavailable:", error);
      return null;
    }
  })();
  const DEVICE_LOCAL_SETTINGS = new Set(["theme", "sidebarCollapsed"]);
  const ACCESS_TABLE = "account_access";
  const ADMIN_AUDIT_TABLE = "admin_audit_log";
  const ADMIN_DIRECTORY_RPC = "admin_member_directory_v2";

  function fallbackAccessProfile() {
    return {
      account_role: "user",
      membership_tier: "member",
      membership_source: "default",
      account_status: "active",
      override_expires_at: null,
      subscription_status: "not_configured",
      feature_flags: { ...(window.HerdHarborRelease?.featureFlags || {}) },
      backend_ready: false
    };
  }

  function publishAccessProfile(profile) {
    accessProfile = { ...fallbackAccessProfile(), ...(profile || {}) };
    document.dispatchEvent(new CustomEvent("herdharbor:access-profile", { detail: { ...accessProfile } }));
    return { ...accessProfile };
  }

  function dispatchAuthSession() {
    document.dispatchEvent(new CustomEvent("herdharbor:auth-session", {
      detail: { signedIn: Boolean(session?.user?.id) }
    }));
  }

  function reportAccountOperationFailure(operation) {
    document.dispatchEvent(new CustomEvent("herdharbor:account-operation-failure", {
      detail: { operation, result: "failure" }
    }));
  }

  const CLOUD_SYNC_ENGINE = "legacy-full-state";
  const CLOUD_PROVIDER = "supabase";
  const CLOUD_SYNC_COMPONENT_BUILD = "legacy-full-state-observability-3";
  const CLOUD_SYNC_APP_RELEASE = "2.0.2";
  const CLOUD_RETRY_DELAYS_MS = [750, 2000];

  function sanitizeCloudDiagnosticText(value, maxLength = 240) {
    return String(value ?? "")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-token]")
      .replace(/\b(password|passcode|token|access_token|refresh_token|authorization|cookie|session|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
      .slice(0, maxLength);
  }

  function cloudStatus(error) {
    const numericStatus = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
    return Number.isFinite(numericStatus) && numericStatus > 0 ? numericStatus : null;
  }

  function classifyCloudFailure(error, online = navigator?.onLine !== false) {
    if (!online) return "offline";
    const status = cloudStatus(error);
    const code = String(error?.code || "").toLowerCase();
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (status === 401) return "auth";
    if (status === 403 || code === "42501" || /row.level.security|permission denied|not authorized/.test(message)) return "permission";
    if (status === 409 || code === "23505" || code === "40001" || /conflict/.test(message)) return "conflict";
    if (status === 413) return "payload";
    if (status === 429) return "rate_limit";
    if (status && status >= 500 && status <= 599) return "server";
    if (name === "aborterror" || /timeout|timed out|aborted/.test(message)) return "timeout";
    if (/failed to fetch|networkerror|network request failed|load failed/.test(message)) return "network";
    if (status === 400 || status === 422 || code === "22023" || /invalid input|validation/.test(message)) return "validation";
    return "unknown";
  }

  function serializedStateBytes(rawValue) {
    if (typeof rawValue !== "string") return null;
    try {
      if (typeof TextEncoder === "function") return new TextEncoder().encode(rawValue).byteLength;
    } catch {}
    try { return unescape(encodeURIComponent(rawValue)).length; } catch {}
    return rawValue.length;
  }

  function normalizeCloudFailure(error, stateBytes = null) {
    const code = sanitizeCloudDiagnosticText(error?.code || error?.name || "unknown", 80);
    const online = navigator?.onLine !== false;
    return {
      error_name: sanitizeCloudDiagnosticText(error?.name || "Error", 80),
      code,
      status: cloudStatus(error),
      message: sanitizeCloudDiagnosticText(error?.message || "Cloud provider request failed.", 240),
      provider_details: sanitizeCloudDiagnosticText(error?.details || "", 240),
      provider_hint: sanitizeCloudDiagnosticText(error?.hint || "", 240),
      classification: classifyCloudFailure(error, online),
      online,
      serialized_state_bytes: Number.isFinite(Number(stateBytes)) ? Number(stateBytes) : null
    };
  }

  function normalizeCloudAttemptTelemetry(telemetry = {}) {
    const retryAttempts = Number(telemetry?.retry_attempts);
    return {
      retry_attempts: Number.isFinite(retryAttempts) && retryAttempts > 0 ? Math.floor(retryAttempts) : 0,
      retry_result: sanitizeCloudDiagnosticText(telemetry?.retry_result || "not_attempted", 40),
      session_refresh_attempted: telemetry?.session_refresh_attempted === true,
      session_refresh_result: sanitizeCloudDiagnosticText(telemetry?.session_refresh_result || "not_attempted", 40)
    };
  }

  function withCloudRequestTelemetry(result, telemetry = {}) {
    const base = result && typeof result === "object" ? result : { data: null, error: null };
    return { ...base, __hhTelemetry: normalizeCloudAttemptTelemetry(telemetry) };
  }

  function reportCloudSyncFailure(operation, error, stateBytes = null, attemptTelemetry = {}) {
    const failure = normalizeCloudFailure(error, stateBytes);
    const telemetry = normalizeCloudAttemptTelemetry(attemptTelemetry);
    try {
      document.dispatchEvent(new CustomEvent("herdharbor:cloud-sync-failure", {
        detail: {
          operation: String(operation || "cloud-sync").slice(0, 80),
          result: "failure",
          error_name: failure.error_name,
          error_code: failure.code,
          status_code: failure.status,
          message: failure.message,
          provider_details: failure.provider_details,
          provider_hint: failure.provider_hint,
          classification: failure.classification,
          online: failure.online,
          sync_engine: CLOUD_SYNC_ENGINE,
          cloud_provider: CLOUD_PROVIDER,
          sync_stage: "legacy",
          app_release: CLOUD_SYNC_APP_RELEASE,
          component_build: CLOUD_SYNC_COMPONENT_BUILD,
          serialized_state_bytes: failure.serialized_state_bytes,
          retry_attempts: telemetry.retry_attempts,
          retry_result: telemetry.retry_result,
          session_refresh_attempted: telemetry.session_refresh_attempted,
          session_refresh_result: telemetry.session_refresh_result,
          source_error: error instanceof Error ? error : null
        }
      }));
    } catch {}
    return failure;
  }

  function isTransientCloudFailure(error) {
    const category = classifyCloudFailure(error, navigator?.onLine !== false);
    return ["network", "timeout", "rate_limit", "server"].includes(category);
  }

  function cloudRetryDelay(attempt) {
    const base = CLOUD_RETRY_DELAYS_MS[Math.min(attempt, CLOUD_RETRY_DELAYS_MS.length - 1)] || 2000;
    return base + Math.floor(Math.random() * Math.max(100, Math.floor(base * 0.25)));
  }

  async function waitForCloudRetry(attempt) {
    await new Promise((resolve) => setTimeout(resolve, cloudRetryDelay(attempt)));
  }

  async function runCloudRequest(request, { allowAuthRefresh = true } = {}) {
    let authRefreshed = false;
    const telemetry = {
      retry_attempts: 0,
      retry_result: "not_needed",
      session_refresh_attempted: false,
      session_refresh_result: "not_attempted"
    };

    for (let attempt = 0; attempt <= CLOUD_RETRY_DELAYS_MS.length; attempt += 1) {
      let result;
      try {
        result = await request();
      } catch (error) {
        result = { data: null, error };
      }
      const error = result?.error;
      if (!error) {
        if (telemetry.retry_attempts > 0) telemetry.retry_result = "recovered";
        return withCloudRequestTelemetry(result, telemetry);
      }

      const category = classifyCloudFailure(error, navigator?.onLine !== false);
      if (category === "auth" && allowAuthRefresh && !authRefreshed && typeof client?.auth?.refreshSession === "function") {
        authRefreshed = true;
        telemetry.session_refresh_attempted = true;
        try {
          const refreshed = await client.auth.refreshSession();
          if (!refreshed?.error) {
            telemetry.session_refresh_result = "success";
            continue;
          }
          telemetry.session_refresh_result = "failure";
        } catch {
          telemetry.session_refresh_result = "exception";
        }
        return withCloudRequestTelemetry(result, telemetry);
      }

      const transient = isTransientCloudFailure(error);
      if (!transient || attempt >= CLOUD_RETRY_DELAYS_MS.length) {
        telemetry.retry_result = transient ? "exhausted" : "not_retryable";
        return withCloudRequestTelemetry(result, telemetry);
      }

      telemetry.retry_attempts += 1;
      telemetry.retry_result = "retrying";
      await waitForCloudRetry(attempt);
    }

    telemetry.retry_result = "exhausted";
    return withCloudRequestTelemetry(
      { data: null, error: new Error("Cloud request retry limit reached.") },
      telemetry
    );
  }

  async function loadAccessProfile() {
    if (!session?.user?.id) return publishAccessProfile(fallbackAccessProfile());
    const userId = session.user.id;
    const operationToken = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(operationToken, userId);
    const cached = () => window.HerdHarborAccessCache?.read?.(userId);
    const initialCachedSnapshot = cached();
    if (initialCachedSnapshot) {
      publishAccessProfile({
        ...initialCachedSnapshot,
        backend_ready: false,
        offline_cached: true
      });
    }
    const publishCachedOrFallback = () => {
      if (!stillCurrent()) return accessProfile;
      const snapshot = cached();
      return publishAccessProfile(snapshot
        ? { ...snapshot, backend_ready: false, offline_cached: true }
        : fallbackAccessProfile());
    };

    let recordResult;
    let roleResult;
    try {
      [recordResult, roleResult] = await Promise.all([
        client.from(ACCESS_TABLE).select("*").eq("user_id", userId).maybeSingle(),
        client.rpc("herdharbor_account_role")
      ]);
    } catch {
      if (!stillCurrent()) return accessProfile;
      reportAccountOperationFailure("load_access");
      return publishCachedOrFallback();
    }
    if (!stillCurrent()) return accessProfile;
    if (recordResult.error || !recordResult.data) {
      reportAccountOperationFailure("load_access");
      return publishCachedOrFallback();
    }
    const role = !roleResult.error && ["owner", "admin", "user"].includes(String(roleResult.data || "").toLowerCase())
      ? String(roleResult.data).toLowerCase()
      : ["owner", "admin", "user"].includes(String(recordResult.data.account_role || "").toLowerCase())
        ? String(recordResult.data.account_role).toLowerCase()
        : "user";
    const authoritative = {
      ...recordResult.data,
      user_id: userId,
      account_role: role,
      last_verified_at: new Date().toISOString()
    };
    if (!stillCurrent()) return accessProfile;
    const stored = window.HerdHarborAccessCache?.write?.(userId, authoritative);
    if (!stillCurrent()) return accessProfile;
    return publishAccessProfile({
      ...authoritative,
      ...(stored || {}),
      backend_ready: true,
      offline_cached: false
    });
  }

  async function callAdminRpc(name, parameters) {
    if (!session?.user?.id) throw new Error("Sign in before managing members.");
    const { data, error } = await client.rpc(name, parameters);
    if (!error) return data;
    reportAccountOperationFailure(name);
    throw new Error(error.message || "The secure member-management request could not be completed.");
  }

  function currentActiveAnimalCount(userId) {
    if (!userId || userId !== session?.user?.id) return null;
    const localState = safeParse(activeStateRaw());
    const animals = Array.isArray(localState?.animals) ? localState.animals : [];
    return window.HerdHarborMembership?.activeAnimalCount?.(animals) ?? null;
  }

  async function listMembers(filters = {}) {
    if (!session?.user?.id) throw new Error("Sign in before opening the member directory.");
    const { data, error } = await client.rpc(ADMIN_DIRECTORY_RPC);
    if (error) {
      reportAccountOperationFailure("admin_list_members");
      throw new Error(error.message || "The secure member directory could not be loaded.");
    }
    const search = String(filters.search || "").trim().toLowerCase();
    return (Array.isArray(data) ? data : [])
      .map((row) => ({
        ...row,
        email: row.email || "",
        active_animal_count: Number.isFinite(Number(row.active_animal_count))
          ? Number(row.active_animal_count)
          : currentActiveAnimalCount(row.user_id),
        effective_membership_tier: window.HerdHarborMembership?.resolveProfile?.(row, {})?.tier
          || String(row.membership_tier || "member").toLowerCase()
      }))
      .filter((row) => !filters.role || row.account_role === String(filters.role).toLowerCase())
      .filter((row) => !filters.status || row.account_status === String(filters.status).toLowerCase())
      .filter((row) => !filters.tier || row.effective_membership_tier === String(filters.tier).toLowerCase())
      .filter((row) => !search || [row.user_id, row.email, row.name, row.display_name]
        .some((value) => String(value || "").toLowerCase().includes(search)))
      .slice(0, Math.min(250, Math.max(1, Number(filters.limit || 100))));
  }

  async function listMemberAudit(userId) {
    const { data, error } = await client
      .from(ADMIN_AUDIT_TABLE)
      .select("*")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) {
      reportAccountOperationFailure("admin_list_audit");
      throw new Error(error.message || "The administrative audit history could not be loaded.");
    }
    return Array.isArray(data) ? data : [];
  }

  async function getMemberDetail(userId) {
    const [directory, audit] = await Promise.all([
      listMembers({ search: userId, limit: 250 }),
      listMemberAudit(userId)
    ]);
    const member = directory.find((row) => row.user_id === userId);
    if (!member) throw new Error("That member account is not available to this administrator.");
    return { member, audit };
  }

  async function setMemberRole({ userId, accountRole, reason = "" } = {}) {
    const role = String(accountRole || "").toLowerCase();
    if (!userId || !["user", "admin"].includes(role)) throw new Error("Choose User or Admin for this account.");
    const safeReason = String(reason || "").slice(0, 500);
    const result = await callAdminRpc("admin_set_account_role", {
      target_user: userId,
      new_role: role,
      change_reason: safeReason || null
    });
    if (userId === session?.user?.id) await loadAccessProfile();
    return result;
  }

  async function setMemberMembership({ userId, membershipTier, expiresAt = null, reason = "" } = {}) {
    const tier = String(membershipTier || "").toLowerCase();
    if (!userId || !["junior", "founder", "member", "business"].includes(tier)) throw new Error("Choose a valid HerdHarbor membership tier.");
    const safeReason = String(reason || "").slice(0, 500);
    const result = await callAdminRpc("admin_set_membership", {
      target_user: userId,
      new_tier: tier,
      change_reason: safeReason || null,
      expires_at: expiresAt
    });
    if (userId === session?.user?.id) await loadAccessProfile();
    return result;
  }

  async function returnMemberToAutomatic(userId, reason = "") {
    if (!userId) throw new Error("Choose a member account first.");
    const safeReason = String(reason || "").slice(0, 500);
    const result = await callAdminRpc("admin_return_to_automatic_membership", {
      target_user: userId,
      change_reason: safeReason || null
    });
    if (userId === session?.user?.id) await loadAccessProfile();
    return result;
  }

  function normalizedAuthorityActive() {
    return normalizedRollout?.isNormalizedAuthority?.() === true;
  }

  async function refreshNormalizedAuthorityIfEligible() {
    if (normalizedAuthorityActive()) return true;
    // S20: freshly provisioned normalized-only accounts deliberately have
    // no internal_test cohort membership. A cohort gate here would reject
    // their record-writer initialization even though the server owns
    // normalized authority. checkEligibility itself validates server state.
    if (!normalizedRollout?.checkEligibility) return false;
    try {
      const decision = await normalizedRollout.checkEligibility();
      return decision?.authorityActive === true && normalizedAuthorityActive();
    } catch {
      return false;
    }
  }

  function normalizedRolloutStage() {
    return String(normalizedRollout?.status?.()?.stage || "legacy");
  }

  function normalizedOutboxPending(userId = session?.user?.id) {
    if (!userId || !canonicalStateStore?.getOutbox) return false;
    const stage = normalizedRolloutStage();
    if (stage !== "dual_write" && stage !== "normalized") return false;
    return canonicalStateStore.getOutbox(userId).length > 0;
  }

  function hasPendingCloudMutations(userId = session?.user?.id) {
    if (!userId) return false;
    return (
      originalGetItem.call(localStorage, dirtyKey(userId)) === "1" ||
      Boolean(pendingSync) ||
      normalizedOutboxPending(userId)
    );
  }

  function hasPendingAuthoritativeCloudMutations(userId = session?.user?.id) {
    if (!userId) return false;
    const legacyPending =
      originalGetItem.call(localStorage, dirtyKey(userId)) === "1" ||
      Boolean(pendingSync);
    if (normalizedAuthorityActive()) {
      // An inherited dirty legacy marker is still unfinished local work,
      // even when the record outbox happens to be empty. Do not tell PWA
      // update safety that the device is clean until it is reconciled.
      return legacyPending || normalizedOutboxPending(userId);
    }
    return legacyPending;
  }

  function getSyncDetails() {
    const userId = session?.user?.id || "";
    const unsynced = hasPendingAuthoritativeCloudMutations(userId);

    return {
      message: syncState,
      type: syncStateType,
      signedIn: Boolean(userId),
      email: session?.user?.email || "",
      online: navigator.onLine !== false,
      unsynced,
      syncing: Boolean(syncInFlight) || (
        syncStateType === "working" &&
        unsynced
      ),
      conflict: Boolean(syncConflict),
      lastSyncedAt: userId
        ? originalGetItem.call(localStorage, versionKey(userId)) || ""
        : ""
    };
  }

  function dispatchSyncStatus() {
    try {
      const details = getSyncDetails();
      // Shared UI state for PWA update safety without importing Cloud Sync
      // into the independent installer/update module.
      if (document.documentElement?.dataset) {
        document.documentElement.dataset.hhUnsynced = details.unsynced ? "true" : "false";
      }
      document.dispatchEvent(new CustomEvent("herdharbor:sync-status", {
        detail: details
      }));
    } catch (error) {
      console.warn("HerdHarbor could not publish the sync status:", error);
    }
  }

  function dispatchLegacyCloudCommit(sequence, updatedAt, options = {}) {
    try {
      document.dispatchEvent(new CustomEvent("herdharbor:legacy-cloud-commit", {
        detail: {
          sequence: Number(sequence || 0),
          updatedAt: updatedAt || null,
          userIdPresent: Boolean(session?.user?.id),
          normalizedHandled: options.normalizedHandled === true,
          normalizedOk: options.normalizedOk === true
        }
      }));
    } catch {}
  }

  async function completeNormalizedAfterLegacyCommit(sequence, updatedAt) {
    const normalizedHandled =
      normalizedRolloutStage() === "dual_write" &&
      Boolean(normalizedRollout?.afterLegacyCommit);

    if (normalizedHandled) {
      // During dual-write, the legacy row remains authoritative. Do not keep
      // the user-facing save in "Saving…" while normalized migration/shadow
      // work waits on a provider RPC. The normalized outbox is durable and
      // remains available for retry through syncNow()/lifecycle recovery.
      void normalizedRollout.afterLegacyCommit()
        .then((normalizedResult) => {
          const normalizedOk =
            normalizedResult?.ok !== false &&
            normalizedResult?.mode !== "dual-write-degraded" &&
            normalizedResult?.normalizedPending !== true;
          dispatchLegacyCloudCommit(sequence, updatedAt, {
            normalizedHandled: true,
            normalizedOk
          });
          if (!normalizedOk) {
            console.warn(
              "HerdHarbor normalized post-legacy sync remains pending:",
              normalizedResult?.normalizedErrorCode ||
              normalizedResult?.normalizedResult?.reason ||
              "normalized-pending"
            );
          }
        })
        .catch((error) => {
          console.error(
            "HerdHarbor normalized post-legacy sync failed:",
            error?.code || error?.message || error
          );
          dispatchLegacyCloudCommit(sequence, updatedAt, {
            normalizedHandled: true,
            normalizedOk: false
          });
        });

      return {
        handled: true,
        ok: true,
        deferred: true,
        result: null
      };
    }

    dispatchLegacyCloudCommit(sequence, updatedAt, {
      normalizedHandled: false,
      normalizedOk: true
    });

    return {
      handled: false,
      ok: true,
      deferred: false,
      result: null
    };
  }

  function deferNormalizedDualWriteCleanup({ ensureCurrent = true, reason = "background-maintenance" } = {}) {
    if (
      normalizedRolloutStage() !== "dual_write" ||
      !normalizedRollout?.afterLegacyCommit
    ) return false;

    const options = ensureCurrent ? { ensureCurrent: true } : undefined;
    void normalizedRollout.afterLegacyCommit(options)
      .then((result) => {
        const ok =
          result?.ok !== false &&
          result?.mode !== "dual-write-degraded" &&
          result?.normalizedPending !== true;
        if (!ok) {
          console.warn(
            "HerdHarbor normalized background maintenance remains pending:",
            reason,
            result?.normalizedErrorCode ||
            result?.normalizedResult?.reason ||
            "normalized-pending"
          );
        }
      })
      .catch((error) => {
        console.warn(
          "HerdHarbor normalized background maintenance failed:",
          reason,
          error?.code || error?.message || error
        );
      });
    return true;
  }

  function safeParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  // A partially initialized device must never upload the empty onboarding
  // state over an operation already configured in the cloud.
  function hasConfiguredOperationProfile(value) {
    const operation = typeof value === "string" ? safeParse(value) : value;
    const profile = operation?.profile;
    return Boolean(
      profile &&
      typeof profile === "object" &&
      !Array.isArray(profile) &&
      String(profile.operationName || "").trim()
    );
  }

  function hasUnsyncedDomainRecords(rawValue) {
    const operation = safeParse(rawValue);
    if (!operation || typeof operation !== "object") return false;
    const recordSections = [
      "animals", "breedings", "litters", "pedigrees", "pedigreeDrafts",
      "health", "tasks", "customers", "sales", "payments", "transfers",
      "transactions", "productionRecords", "budgetPlans", "annualBudgetPlans",
      "activity"
    ];
    return recordSections.some((name) => Array.isArray(operation[name]) && operation[name].length > 0);
  }

  function animalStateTransitionResult(beforeRaw, afterRaw) {
    const beforeState = safeParse(beforeRaw);
    const afterState = safeParse(afterRaw);
    if (!beforeState || !afterState) return { allowed: true };

    const validator = window.HerdHarborMembership?.validateAnimalTransition;
    if (typeof validator !== "function") return { allowed: true };

    return validator(
      Array.isArray(beforeState.animals) ? beforeState.animals : [],
      Array.isArray(afterState.animals) ? afterState.animals : []
    );
  }

  function allowAnimalStateTransition(beforeRaw, afterRaw, message) {
    const result = animalStateTransitionResult(beforeRaw, afterRaw);
    if (result.allowed) return true;

    window.HerdHarborMembership?.showJuniorLimit?.(result);
    setSyncState(
      message || "Cloud sync paused: the change would exceed HerdHarbor Junior's limit of 5 active animals.",
      "error"
    );
    return false;
  }

  function canonicalize(value, path = [], includeDeviceSettings = false) {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        canonicalize(item, [...path, String(index)], includeDeviceSettings)
      );
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((result, key) => {
          if (
            !includeDeviceSettings &&
            path.length === 1 &&
            path[0] === "settings" &&
            DEVICE_LOCAL_SETTINGS.has(key)
          ) {
            return result;
          }
          result[key] = canonicalize(
            value[key],
            [...path, key],
            includeDeviceSettings
          );
          return result;
        }, {});
    }
    return value;
  }

  function stateFingerprint(rawValue, includeDeviceSettings = false) {
    const parsed = safeParse(rawValue);
    return parsed
      ? JSON.stringify(canonicalize(parsed, [], includeDeviceSettings))
      : "";
  }

  function sameState(left, right) {
    if (left === right) return Boolean(safeParse(left));
    const leftFingerprint = stateFingerprint(left);
    return Boolean(leftFingerprint) && leftFingerprint === stateFingerprint(right);
  }

  function exactSameState(left, right) {
    if (left === right) return Boolean(safeParse(left));
    const leftFingerprint = stateFingerprint(left, true);
    return Boolean(leftFingerprint) &&
      leftFingerprint === stateFingerprint(right, true);
  }

  function valueFingerprint(value) {
    if (value === undefined) return "undefined:";
    return `${typeof value}:${JSON.stringify(canonicalize(value, [], true))}`;
  }

  function sameValue(left, right) {
    return valueFingerprint(left) === valueFingerprint(right);
  }

  function isPlainObject(value) {
    return Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value);
  }

  function isIdRecordArray(values) {
    const definedArrays = values.filter(Array.isArray);
    const items = definedArrays.flat();
    return Boolean(items.length) &&
      items.every((item) =>
        isPlainObject(item) &&
        typeof item.id === "string" &&
        Boolean(item.id)
      );
  }

  function mergePrimitiveArray(base, local, remote, path) {
    const pathKey = path.join(".");
    const isAdditiveSetting =
      pathKey === "settings.species" ||
      pathKey.startsWith("settings.breedsBySpecies.");

    if (!isAdditiveSetting) {
      return {
        value: local,
        conflicts: [pathKey || "farm records"]
      };
    }

    const merged = [];
    [...(local || []), ...(remote || []), ...(base || [])].forEach((item) => {
      if (!merged.some((existing) => sameValue(existing, item))) {
        merged.push(item);
      }
    });
    return { value: merged, conflicts: [] };
  }

  function mergeIdRecordArray(base = [], local = [], remote = [], path = []) {
    const baseMap = new Map(base.map((item) => [item.id, item]));
    const localMap = new Map(local.map((item) => [item.id, item]));
    const remoteMap = new Map(remote.map((item) => [item.id, item]));
    const orderedIds = [
      ...local.map((item) => item.id),
      ...remote.map((item) => item.id),
      ...base.map((item) => item.id)
    ].filter((id, index, values) => values.indexOf(id) === index);
    const conflicts = [];
    const value = [];

    orderedIds.forEach((id) => {
      const merged = mergeValue(
        baseMap.get(id),
        localMap.get(id),
        remoteMap.get(id),
        [...path, id]
      );
      conflicts.push(...merged.conflicts);
      if (merged.value !== undefined) value.push(merged.value);
    });

    if (path.join(".") === "activity") {
      value.sort((left, right) =>
        String(right.date || "").localeCompare(String(left.date || ""))
      );
      value.splice(30);
    }

    return { value, conflicts };
  }

  function mergeValue(base, local, remote, path = []) {
    const pathKey = path.join(".");
    const fieldName = path[path.length - 1] || "";
    if (
      path.length === 2 &&
      path[0] === "settings" &&
      DEVICE_LOCAL_SETTINGS.has(path[1])
    ) {
      return {
        value: local !== undefined ? local : remote,
        conflicts: []
      };
    }

    if (sameValue(local, remote)) return { value: local, conflicts: [] };
    if (sameValue(local, base)) return { value: remote, conflicts: [] };
    if (sameValue(remote, base)) return { value: local, conflicts: [] };

    if (
      ["createdAt", "updatedAt", "savedAt", "logoUpdatedAt", "completedAt"].includes(fieldName) &&
      typeof local === "string" &&
      typeof remote === "string" &&
      Number.isFinite(Date.parse(local)) &&
      Number.isFinite(Date.parse(remote))
    ) {
      return {
        value: fieldName === "createdAt"
          ? (Date.parse(local) <= Date.parse(remote) ? local : remote)
          : (Date.parse(local) >= Date.parse(remote) ? local : remote),
        conflicts: []
      };
    }

    if (local === undefined || remote === undefined) {
      return {
        value: local,
        conflicts: [pathKey || "farm records"]
      };
    }

    if (Array.isArray(local) && Array.isArray(remote)) {
      if (isIdRecordArray([base, local, remote])) {
        return mergeIdRecordArray(
          Array.isArray(base) ? base : [],
          local,
          remote,
          path
        );
      }
      return mergePrimitiveArray(
        Array.isArray(base) ? base : [],
        local,
        remote,
        path
      );
    }

    if (isPlainObject(local) && isPlainObject(remote)) {
      const baseObject = isPlainObject(base) ? base : {};
      const keys = [...new Set([
        ...Object.keys(baseObject),
        ...Object.keys(local),
        ...Object.keys(remote)
      ])].sort();
      const value = {};
      const conflicts = [];

      keys.forEach((key) => {
        const merged = mergeValue(
          baseObject[key],
          local[key],
          remote[key],
          [...path, key]
        );
        conflicts.push(...merged.conflicts);
        if (merged.value !== undefined) value[key] = merged.value;
      });

      return { value, conflicts };
    }

    return {
      value: local,
      conflicts: [pathKey || "farm records"]
    };
  }

  function mergeRawStates(baseRaw, localRaw, remoteRaw) {
    const base = safeParse(baseRaw);
    const local = safeParse(localRaw);
    const remote = safeParse(remoteRaw);
    if (!base || !local || !remote) {
      return {
        ok: false,
        conflicts: ["farm records"],
        rawValue: localRaw
      };
    }

    const merged = mergeValue(base, local, remote);
    return {
      ok: merged.conflicts.length === 0,
      conflicts: [...new Set(merged.conflicts)],
      value: merged.value,
      rawValue: JSON.stringify(merged.value)
    };
  }

  function applyDevicePreferences(cloudRaw, deviceRaw) {
    const cloudState = safeParse(cloudRaw);
    const deviceState = safeParse(deviceRaw);
    if (!cloudState || !deviceState?.settings) return cloudRaw;

    cloudState.settings = isPlainObject(cloudState.settings)
      ? cloudState.settings
      : {};
    DEVICE_LOCAL_SETTINGS.forEach((key) => {
      if (deviceState.settings[key] !== undefined) {
        cloudState.settings[key] = deviceState.settings[key];
      }
    });
    return JSON.stringify(cloudState);
  }

  function activeStateRaw() {
    return canonicalStateStore?.compatibilitySnapshot?.() || originalGetItem.call(localStorage, STORAGE_KEY) || "";
  }

  function safeStorageSet(key, value) {
    try {
      originalSetItem.call(localStorage, key, value);
      return true;
    } catch (error) {
      console.warn(`HerdHarbor could not retain local safety key ${key}:`, error);
      return false;
    }
  }

  function safeStorageRemove(key) {
    try {
      originalRemoveItem.call(localStorage, key);
    } catch (error) {
      console.warn(`HerdHarbor could not remove local safety key ${key}:`, error);
    }
  }

  async function readCloudBaseline(userId) {
    if (!userId) return null;
    const memory = cloudBaselineMemory.get(userId);
    if (memory && safeParse(memory)) return memory;

    const legacyRaw = originalGetItem.call(localStorage, baseKey(userId));
    if (legacyRaw && safeParse(legacyRaw)) {
      cloudBaselineMemory.set(userId, legacyRaw);
      if (legacyBaselineStore) {
        try {
          await legacyBaselineStore.set(userId, legacyRaw);
          safeStorageRemove(baseKey(userId));
        } catch (error) {
          console.warn("HerdHarbor could not migrate the cloud baseline to durable storage:", error);
        }
      }
      return legacyRaw;
    }

    if (!legacyBaselineStore) return null;
    try {
      const durableRaw = await legacyBaselineStore.get(userId);
      if (!durableRaw || !safeParse(durableRaw)) return null;
      cloudBaselineMemory.set(userId, durableRaw);
      return durableRaw;
    } catch (error) {
      console.warn("HerdHarbor could not read the durable cloud baseline:", error);
      return null;
    }
  }

  async function writeCloudBaseline(userId, rawValue) {
    if (!userId || !rawValue || !safeParse(rawValue)) return false;
    cloudBaselineMemory.set(userId, rawValue);

    if (legacyBaselineStore) {
      try {
        await legacyBaselineStore.set(userId, rawValue);
        safeStorageRemove(baseKey(userId));
        return true;
      } catch (error) {
        console.warn("HerdHarbor could not retain the durable cloud baseline:", error);
      }
    }

    return safeStorageSet(baseKey(userId), rawValue);
  }

  function removeRedundantStateCache(userId) {
    if (!userId) return;
    // The active farm state is already retained under STORAGE_KEY and the last
    // confirmed cloud state is retained separately as the merge baseline.
    // Keeping a third full JSON copy exhausted mobile localStorage for larger
    // herds even after pedigree documents moved to IndexedDB.
    safeStorageRemove(cacheKey(userId));
  }

  function setInternalStorage(key, value, reason = "legacy-cloud-state-replace") {
    if (key === STORAGE_KEY) {
      if (!canonicalStateStore?.replaceRaw) throw new Error("Canonical state store is unavailable.");
      const result = canonicalStateStore.replaceRaw(value, {
        source: "cloud",
        reason,
        notify: false
      });
      if (!result?.ok) throw result?.error || new Error("Canonical state replacement failed.");
      return;
    }
    originalSetItem.call(localStorage, key, value);
  }

  function removeInternalStorage(key) {
    if (key === STORAGE_KEY) {
      if (!canonicalStateStore?.replaceRaw) throw new Error("Canonical state store is unavailable.");
      const result = canonicalStateStore.replaceRaw(null, {
        source: "cloud",
        reason: "legacy-cloud-state-clear",
        notify: false
      });
      if (!result?.ok) throw result?.error || new Error("Canonical state clear failed.");
      return;
    }
    originalRemoveItem.call(localStorage, key);
  }

  function recoverySchemaError(message, cause = null) {
    const error = new Error(message);
    error.name = "HerdHarborRecoverySchemaError";
    error.code = "HH_RECOVERY_SCHEMA_INVALID";
    if (cause) error.cause = cause;
    return error;
  }

  function ensureRecoverySnapshotSchema(database, upgradeTransaction) {
    let store = null;

    if (!database.objectStoreNames.contains(RECOVERY_STORE_NAME)) {
      store = database.createObjectStore(RECOVERY_STORE_NAME, {
        keyPath: "id",
        autoIncrement: true
      });
    } else if (upgradeTransaction) {
      store = upgradeTransaction.objectStore(RECOVERY_STORE_NAME);
    }

    if (!store) return;

    if (!store.indexNames.contains("userId")) {
      store.createIndex("userId", "userId");
    }
    if (!store.indexNames.contains("createdAt")) {
      store.createIndex("createdAt", "createdAt");
    }
  }

  function validateRecoveryDatabase(database) {
    if (!database.objectStoreNames.contains(RECOVERY_STORE_NAME)) {
      throw recoverySchemaError(
        `Recovery storage schema is missing the "${RECOVERY_STORE_NAME}" object store.`
      );
    }

    let store;
    try {
      const transaction = database.transaction(RECOVERY_STORE_NAME, "readonly");
      store = transaction.objectStore(RECOVERY_STORE_NAME);
    } catch (error) {
      throw recoverySchemaError("Recovery storage schema could not be inspected.", error);
    }

    for (const indexName of ["userId", "createdAt"]) {
      if (!store.indexNames.contains(indexName)) {
        throw recoverySchemaError(
          `Recovery storage schema is missing the "${indexName}" index.`
        );
      }
    }

    return true;
  }

  function openRecoveryDatabase({ timeoutMs = 8000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      let settled = false;
      const finish = (error, database) => {
        if (settled) {
          try { database?.close?.(); } catch {}
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        if (error) reject(error);
        else resolve(database);
      };
      const timer = window.setTimeout(() => {
        finish(new Error("Recovery storage open timed out."));
      }, Math.max(1, Number(timeoutMs) || 8000));
      let upgradeError = null;
      const request = indexedDB.open(RECOVERY_DB_NAME, RECOVERY_DB_VERSION);
      request.onupgradeneeded = () => {
        try {
          ensureRecoverySnapshotSchema(request.result, request.transaction);
        } catch (error) {
          upgradeError = recoverySchemaError("Recovery storage schema upgrade failed.", error);
          try { request.transaction?.abort(); } catch {}
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          try { database.close(); } catch {}
          return;
        }
        try {
          validateRecoveryDatabase(database);
          finish(null, database);
        } catch (error) {
          try { database.close(); } catch {}
          console.error("HerdHarbor recovery storage schema validation failed:", error);
          finish(error);
        }
      };
      request.onerror = () => finish(
        upgradeError || request.error || new Error("Recovery storage could not open.")
      );
      request.onblocked = () => finish(
        new Error("Recovery storage upgrade is blocked by another open HerdHarbor tab.")
      );
    });
  }

  async function recordRecoverySnapshot(userId, rawValue, reason, { timeoutMs = 8000 } = {}) {
    if (!userId || !rawValue || !safeParse(rawValue)) return false;

    let database = null;
    try {
      database = await openRecoveryDatabase({ timeoutMs });
      await new Promise((resolve, reject) => {
        let settled = false;
        let transaction;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const timer = window.setTimeout(() => {
          try { transaction?.abort(); } catch {}
          finish(new Error("Recovery storage transaction timed out."));
        }, Math.max(1, Number(timeoutMs) || 8000));
        transaction = database.transaction(RECOVERY_STORE_NAME, "readwrite");
        const store = transaction.objectStore(RECOVERY_STORE_NAME);
        const index = store.index("userId");
        const request = index.getAll(userId);

        request.onsuccess = () => {
          if (settled) return;
          const snapshots = request.result
            .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

          // Repeated UI saves can describe the same pre-change state. Keep one
          // recovery point instead of spending IndexedDB space on duplicates.
          if (snapshots[0]?.rawValue === rawValue) return;

          store.add({
            userId,
            createdAt: new Date().toISOString(),
            reason,
            rawValue
          });

          let retainedBytes = rawValue.length * 2;
          snapshots.forEach((snapshot, index) => {
            const snapshotBytes = String(snapshot.rawValue || "").length * 2;
            const exceedsCount = index >= MAX_RECOVERY_SNAPSHOTS - 1;
            const exceedsBudget = retainedBytes + snapshotBytes > MAX_RECOVERY_BYTES;
            if (exceedsCount || exceedsBudget) {
              store.delete(snapshot.id);
            } else {
              retainedBytes += snapshotBytes;
            }
          });
        };
        request.onerror = () => finish(request.error || new Error("Recovery snapshot read failed."));
        transaction.oncomplete = () => finish();
        transaction.onerror = () => finish(transaction.error || new Error("Recovery snapshot write failed."));
        transaction.onabort = () => finish(transaction.error || new Error("Recovery snapshot write was aborted."));
      });
      return true;
    } catch (error) {
      console.warn("HerdHarbor local recovery snapshot was not stored:", error);
      return false;
    } finally {
      try { database?.close?.(); } catch {}
    }
  }

  async function preserveActiveForUser(userId, reason, rawValue = activeStateRaw()) {
    // An empty workspace has nothing to preserve; initial SIGNED_OUT may
    // arrive before any user or local operation has been established.
    if (!rawValue) return true;
    if (!userId) return false;
    // A malformed or unreadable workspace must not be treated as preserved.
    if (!safeParse(rawValue)) return false;
    const cacheId = cacheKey(userId);
    const result = await window.HerdHarborAccountBoundaryCore.preserveWithFallback({
      localPreserve: () => {
        try {
          return safeStorageSet(cacheId, rawValue) &&
            originalGetItem.call(localStorage, cacheId) === rawValue;
        } catch (error) {
          console.warn("HerdHarbor local account backup could not be verified:", error);
          return false;
        }
      },
      // A verified localStorage copy is sufficient. IndexedDB is the bounded
      // fallback only when localStorage could not durably preserve the records.
      indexedDbPreserve: () => recordRecoverySnapshot(userId, rawValue, reason, { timeoutMs: 8000 }),
      timeoutMs: 8500
    });
    return result.ok === true;
  }

  function setActiveUserData(userId, rawValue, reason = "legacy-cloud-state-replace") {
    const authenticatedUserId = String(session?.user?.id || "");
    if (authenticatedUserId && String(userId || "") !== authenticatedUserId) {
      console.warn("HerdHarbor blocked stale cross-account state activation.");
      return false;
    }
    try {
      setInternalStorage(STORAGE_KEY, rawValue, reason);
    } catch (error) {
      // A previous duplicate cache can consume the final mobile quota needed
      // to refresh the active copy. The caller still holds rawValue in memory,
      // so release only that redundant copy and retry once.
      removeRedundantStateCache(userId);
      setInternalStorage(STORAGE_KEY, rawValue, reason);
    }
    removeRedundantStateCache(userId);
    setInternalStorage(ACTIVE_OWNER_KEY, userId);
    return true;
  }

  function clearActiveUserData() {
    removeInternalStorage(STORAGE_KEY);
    removeInternalStorage(ACTIVE_OWNER_KEY);
    return originalGetItem.call(localStorage, STORAGE_KEY) === null &&
      originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === null;
  }

  function resetAccountBoundaryRuntime() {
    clearTimeout(syncTimer);
    syncTimer = null;
    syncDebounceStartedAt = 0;
    hydrationInFlight = null;
    hydrationUserId = "";
    lastHydratedUserId = "";
    pendingSync = null;
    syncInFlight = null;
    syncInFlightRaw = null;
    syncConflict = null;
    reloadAfterSync = false;
    normalizedRefreshInFlight = null;
    normalizedCohortStatusCache = null;
    normalizedCohortStatusInFlight = null;
    accessProfile = null;
    lastCloudCheckAt = 0;
  }

  function captureAccountOperation(userId = session?.user?.id) {
    const id = String(userId || "");
    return accountBoundaryFence?.capture?.(id) || null;
  }

  function isAccountOperationCurrent(token, userId = token?.userId) {
    return Boolean(
      token &&
      String(userId || "") &&
      accountBoundaryFence?.isCurrent?.(token, session?.user?.id)
    );
  }

  function clearAccountSessionMarkers(userId) {
    const target = String(userId || "");
    if (!target) return;
    try {
      const removals = [];
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (
          key &&
          (
            key.startsWith(`hh_cloud_loaded_${target}_`) ||
            key.startsWith(`hh_normalized_loaded_${target}_`)
          )
        ) removals.push(key);
      }
      removals.forEach((key) => sessionStorage.removeItem(key));
    } catch {}
  }

  function accountBoundaryRecoveryMarkerKey(userId) {
    return `${ACCOUNT_BOUNDARY_RECOVERY_MARKER_PREFIX}_${String(userId || "")}`;
  }

  function showAccountBoundaryRecovery(message = "HerdHarbor is refreshing your account data. Your records are safe.") {
    ensureStyles();
    buildAuthRoot();
    document.documentElement.classList.add("hh-auth-locked");
    const root = document.querySelector("#hh-auth-root");
    if (root) {
      root.hidden = false;
      const refresh = root.querySelector("#hh-refresh-account-data");
      if (refresh) refresh.hidden = false;
      const blankStart = root.querySelector("#hh-auth-only-empty-start");
      if (blankStart) blankStart.hidden = true;
    }
    authMessage(message, "info");
  }

  async function ensureAuthenticatedAccountBoundary(activeSession, options = {}) {
    const authenticatedUserId = String(activeSession?.user?.id || "");
    if (!authenticatedUserId || !accountBoundaryFence) {
      showAccountBoundaryRecovery("HerdHarbor could not verify the signed-in account. Please sign in again.");
      return Object.freeze({ ok: false, reason: "missing-authenticated-user" });
    }

    if (String(session?.user?.id || "") !== authenticatedUserId) {
      return Object.freeze({ ok: false, reason: "account-boundary-session-changed" });
    }
    if (accountBoundaryRecoveryInFlight?.userId === authenticatedUserId &&
        isAccountOperationCurrent(accountBoundaryRecoveryInFlight.token, authenticatedUserId)) {
      return accountBoundaryRecoveryInFlight.promise;
    }

    const fenceToken = accountBoundaryFence.advance(authenticatedUserId);
    const staleBoundary = () => Object.freeze({ ok: false, reason: "account-boundary-session-changed" });
    const run = (async () => {
      const activeRaw = activeStateRaw();
      const activeOwnerId = String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "");
      const legacyOwnerId = String(originalGetItem.call(localStorage, LEGACY_ACTIVE_OWNER_KEY) || "");
      const workspaceUnchanged = () => (
        isAccountOperationCurrent(fenceToken, authenticatedUserId) &&
        activeStateRaw() === activeRaw &&
        String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "") === activeOwnerId &&
        String(originalGetItem.call(localStorage, LEGACY_ACTIVE_OWNER_KEY) || "") === legacyOwnerId
      );
      const parsedActive = safeParse(activeRaw);
      if (activeRaw && (!parsedActive || typeof parsedActive !== "object" || Array.isArray(parsedActive))) {
        showAccountBoundaryRecovery("HerdHarbor could not read the local recovery data. The workspace remains locked and was not removed.");
        return Object.freeze({ ok: false, reason: "invalid-active-state" });
      }
      const authenticatedCache = originalGetItem.call(localStorage, cacheKey(authenticatedUserId)) || "";
      const authenticatedCacheMatchesActive = Boolean(
        activeRaw &&
        authenticatedCache &&
        safeParse(activeRaw) &&
        safeParse(authenticatedCache) &&
        sameState(activeRaw, authenticatedCache)
      );
      const policy = window.HerdHarborAccountBoundaryCore?.evaluate?.({
        authenticatedUserId,
        activeOwnerId,
        legacyOwnerId,
        hasActiveState: Boolean(activeRaw && safeParse(activeRaw)),
        authenticatedCacheMatchesActive
      });

      if (!policy?.ok) {
        if (
          policy?.reason === "unowned-active-state" &&
          options.allowUnownedQuarantine === true &&
          activeRaw &&
          safeParse(activeRaw)
        ) {
          const preserved = await recordRecoverySnapshot(
            UNATTRIBUTED_RECOVERY_USER_ID,
            activeRaw,
            options.reason || "Unattributed local state retained during account recovery"
          );
          if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return staleBoundary();
          if (!workspaceUnchanged()) {
            showAccountBoundaryRecovery("The local workspace changed during recovery. Your current records were not removed. Retry recovery after saving your work.");
            return Object.freeze({ ok: false, reason: "account-boundary-workspace-changed" });
          }
          if (preserved !== true) {
            showAccountBoundaryRecovery(
              "HerdHarbor could not safely preserve the local recovery copy. Your records were not removed."
            );
            return Object.freeze({ ok: false, reason: "unowned-recovery-preserve-failed" });
          }
          if (!workspaceUnchanged()) return Object.freeze({ ok: false, reason: "account-boundary-workspace-changed" });
          const cleared = clearActiveUserData();
          if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return staleBoundary();
          const ownerWritten = cleared && safeStorageSet(ACTIVE_OWNER_KEY, authenticatedUserId) &&
            originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === authenticatedUserId;
          if (!ownerWritten) {
            showAccountBoundaryRecovery(
              "HerdHarbor preserved the unattributed records, but could not verify the new account marker. The workspace remains locked for recovery."
            );
            return Object.freeze({ ok: false, reason: "unowned-owner-marker-unverified" });
          }
          if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return staleBoundary();
          resetAccountBoundaryRuntime();
          try {
            if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return staleBoundary();
            originalRemoveItem.call(localStorage, LEGACY_ACTIVE_OWNER_KEY);
          } catch {}
          return Object.freeze({
            ok: true,
            reason: "unowned-state-quarantined",
            action: "quarantine-and-recover",
            userId: authenticatedUserId,
            token: fenceToken,
            quarantined: true
          });
        }

        showAccountBoundaryRecovery(
          options.message || "HerdHarbor found local account data that could not be safely attributed. Your records were not removed."
        );
        return Object.freeze({ ok: false, reason: policy?.reason || "boundary-policy-unavailable" });
      }

      let clearedBoundaryWorkspace = false;
      const execution = await window.HerdHarborAccountBoundaryCore?.applyPlan?.({
        authenticatedUserId,
        activeOwnerId,
        legacyOwnerId,
        hasActiveState: Boolean(activeRaw && safeParse(activeRaw)),
        authenticatedCacheMatchesActive
      }, {
        lock: () => {
          document.documentElement.classList.add("hh-auth-locked");
          return true;
        },
        isCurrent: () => isAccountOperationCurrent(fenceToken, authenticatedUserId),
        preserve: async (staleOwnerId) => {
          const preserved = await preserveActiveForUser(
            staleOwnerId,
            options.reason || "Local copy retained before account boundary recovery",
            activeRaw
          );
          // Authentication can advance while the archival transaction commits.
          // Never clear an account after its recovery token became stale.
          if (!preserved || !workspaceUnchanged()) return false;
          clearAccountSessionMarkers(staleOwnerId);
          clearAccountSessionMarkers(authenticatedUserId);
          return true;
        },
        clearActive: () => {
          if (!workspaceUnchanged()) return false;
          clearedBoundaryWorkspace = clearActiveUserData() === true;
          return clearedBoundaryWorkspace;
        },
        resetRuntime: () => isAccountOperationCurrent(fenceToken, authenticatedUserId) && resetAccountBoundaryRuntime(),
        setOwner: (userId) => isAccountOperationCurrent(fenceToken, authenticatedUserId) && safeStorageSet(ACTIVE_OWNER_KEY, userId) &&
          originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === userId,
        verifyOwner: (userId) => originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === userId,
        restoreOwner: (userId) => {
          if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return false;
          // Rollback cannot overwrite a replacement workspace created during an await.
          if (!workspaceUnchanged() && !(clearedBoundaryWorkspace && !activeStateRaw() &&
              [null, "", authenticatedUserId].includes(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY)))) return false;
          if (userId) return safeStorageSet(ACTIVE_OWNER_KEY, userId) &&
            originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === userId;
          try { originalRemoveItem.call(localStorage, ACTIVE_OWNER_KEY); } catch { return false; }
          return originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === null;
        },
        removeLegacy: () => {
          if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return;
          try {
            originalRemoveItem.call(localStorage, LEGACY_ACTIVE_OWNER_KEY);
          } catch {}
        }
      });

      if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return staleBoundary();
      if (!execution?.ok) {
        showAccountBoundaryRecovery(
          options.message || "HerdHarbor could not safely refresh the local account boundary. Your records were not removed."
        );
        return Object.freeze({ ok: false, reason: execution?.reason || "boundary-transition-failed" });
      }

      return Object.freeze({
        ...execution,
        token: fenceToken
      });
    })();

    // Cache the fenced, error-normalized promise, not the raw archival work.
    // Same-generation callers must receive the same fail-closed result.
    const guarded = run.then((result) =>
      isAccountOperationCurrent(fenceToken, authenticatedUserId) ? result : staleBoundary(),
    () => {
      if (!isAccountOperationCurrent(fenceToken, authenticatedUserId)) return staleBoundary();
      showAccountBoundaryRecovery("HerdHarbor could not verify recovery storage. The workspace remains locked for recovery.");
      return Object.freeze({ ok: false, reason: "account-boundary-storage-failed" });
    });
    accountBoundaryRecoveryInFlight = { userId: authenticatedUserId, token: fenceToken, promise: guarded };
    try {
      return await guarded;
    } finally {
      if (accountBoundaryRecoveryInFlight?.promise === guarded) {
        accountBoundaryRecoveryInFlight = null;
      }
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
    updateConflictControls();
    dispatchSyncStatus();
  }

  function dispatchBaselineRestored(userId, reason) {
    try {
      window.dispatchEvent?.(new CustomEvent("herdharbor:cloud-baseline-restored", {
        detail: { userIdPresent: Boolean(userId), reason: String(reason || "state-store").slice(0, 80) }
      }));
    } catch {}
  }

  async function restoreMissingCloudBaseline(userId, reason = "state-store") {
    if (!userId) return false;
    if (await readCloudBaseline(userId)) return false;
    if (originalGetItem.call(localStorage, dirtyKey(userId)) === "1") return false;
    if (!originalGetItem.call(localStorage, versionKey(userId))) return false;
    const activeRaw = activeStateRaw();
    if (!activeRaw || !safeParse(activeRaw)) return false;
    const stored = await writeCloudBaseline(userId, activeRaw);
    if (!stored) return false;
    dispatchBaselineRestored(userId, reason);
    return true;
  }

  function captureCleanBaselineBeforeLocalCommit(userId, previousValue, reason = "before-local-edit") {
    if (!userId || !previousValue || !safeParse(previousValue)) return false;

    const memoryBaseline = cloudBaselineMemory.get(userId);
    if (memoryBaseline && safeParse(memoryBaseline)) return false;

    if (originalGetItem.call(localStorage, dirtyKey(userId)) === "1") return false;
    if (!originalGetItem.call(localStorage, versionKey(userId))) return false;

    // A clean local state immediately before the first edit is a safe merge
    // baseline. Stage it synchronously so durable IndexedDB latency can never
    // postpone the cloud-save timer. Persistence continues in the background,
    // and the baseline-restored event keeps its existing durable-success
    // semantics.
    cloudBaselineMemory.set(userId, previousValue);
    void (async () => {
      const stored = await writeCloudBaseline(userId, previousValue);
      if (!stored) return false;
      dispatchBaselineRestored(userId, reason);
      return true;
    })().catch((error) => {
      console.warn("HerdHarbor could not retain the pre-edit cloud baseline:", error);
    });

    return true;
  }

  async function handleCanonicalStateCommit(detail) {
    if (!detail || detail.source !== "local" || !detail.cloudRelevant || !session?.user?.id) return false;
    const userId = session.user.id;
    const rawValue = String(detail.rawValue || "");
    const previousValue = String(detail.previousRaw || "");
    if (!safeParse(rawValue)) return false;

    safeStorageSet(ACTIVE_OWNER_KEY, userId);
    removeRedundantStateCache(userId);

    writeSequence += 1;
    syncConflict = null;
    if (previousValue && !sameState(previousValue, rawValue)) {
      void recordRecoverySnapshot(userId, previousValue, "Before local change");
    }

    if (normalizedAuthorityActive()) {
      safeStorageRemove(dirtyKey(userId));
      scheduleCloudSync(rawValue, writeSequence);
      return true;
    }

    captureCleanBaselineBeforeLocalCommit(userId, previousValue);
    safeStorageSet(dirtyKey(userId), "1");
    scheduleCloudSync(rawValue, writeSequence);
    return true;
  }

  function installStateStoreBridge() {
    if (window.__HERDHARBOR_STATE_STORE_CLOUD_BRIDGE__) return true;
    if (!canonicalStateStore?.subscribe) {
      throw new Error("HerdHarbor cloud sync requires the canonical state store.");
    }
    window.__HERDHARBOR_STATE_STORE_CLOUD_BRIDGE__ = canonicalStateStore.subscribe(handleCanonicalStateCommit);
    return true;
  }

  async function fetchCloudRecord(userId) {
    return runCloudRequest(() => client
      .from(TABLE_NAME)
      .select("app_state, updated_at")
      .eq("user_id", userId)
      .maybeSingle());
  }

  async function fetchCloudVersion(userId) {
    return runCloudRequest(() => client
      .from(TABLE_NAME)
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle());
  }

  async function markConflict(userId, localRaw, remoteRecord, message) {
    const operationToken = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(operationToken, userId);
    if (!stillCurrent()) return false;
    const remoteRaw = remoteRecord?.app_state
      ? JSON.stringify(remoteRecord.app_state)
      : null;

    syncConflict = {
      userId,
      localRaw,
      remoteRaw,
      remoteUpdatedAt: remoteRecord?.updated_at || null
    };

    await Promise.all([
      recordRecoverySnapshot(userId, localRaw, "Local copy saved during sync conflict"),
      recordRecoverySnapshot(userId, remoteRaw, "Cloud copy saved during sync conflict")
    ]);
    if (!stillCurrent()) {
      if (syncConflict?.userId === userId) syncConflict = null;
      return false;
    }

    setSyncState(
      message || "Sync paused: this device and the cloud both changed. Choose which copy to keep.",
      "error"
    );
    return false;
  }

  async function writeCloudRecord(userId, appState, remoteRecord) {
    const nextVersion = new Date().toISOString();

    if (!remoteRecord) {
      const result = await runCloudRequest(() => client
        .from(TABLE_NAME)
        .insert({
          user_id: userId,
          app_state: appState,
          updated_at: nextVersion
        })
        .select("updated_at")
        .single());

      return { ...result, raced: result?.error?.code === "23505" };
    }

    let update = client
      .from(TABLE_NAME)
      .update({
        app_state: appState,
        updated_at: nextVersion
      })
      .eq("user_id", userId);

    update = remoteRecord.updated_at
      ? update.eq("updated_at", remoteRecord.updated_at)
      : update.is("updated_at", null);

    const result = await runCloudRequest(() => update
      .select("updated_at")
      .maybeSingle());

    return { ...result, raced: !result?.error && !result?.data };
  }

  async function syncValueToCloud(rawValue, sequence = writeSequence, options = {}) {
    if (!session?.user?.id) return false;

    let appState = safeParse(rawValue);
    if (!appState) {
      setSyncState("Local data could not be read.", "error");
      return false;
    }
    if (!hasConfiguredOperationProfile(appState)) {
      setSyncState("This device has not loaded an operation profile. Cloud upload is paused to protect existing records.", "error");
      return false;
    }

    const userId = String(session.user.id);
    const operationToken = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(operationToken, userId);
    if (!stillCurrent()) return false;
    let localRawBeforeMerge = null;
    let autoMerged = false;
    setSyncState("Saving to cloud…", "working");

    const knownVersion = originalGetItem.call(localStorage, versionKey(userId)) || "";
    let remoteRecord = null;

    if (!options.force && knownVersion) {
      // Fast path: the PATCH below already performs optimistic CAS on updated_at.
      // Avoid a separate version probe on every normal save. If the CAS misses,
      // the existing raced-save path reloads the latest cloud snapshot and
      // performs the protected three-way merge/retry.
      remoteRecord = { updated_at: knownVersion };
    } else {
      const {
        data: versionRecord,
        error: versionError,
        __hhTelemetry: versionTelemetry
      } = await fetchCloudVersion(userId);
      if (!stillCurrent()) return false;

      if (versionError) {
        const failure = reportCloudSyncFailure("cloud-preflight-version", versionError, serializedStateBytes(rawValue), versionTelemetry);
        console.error("HerdHarbor cloud version preflight failed:", versionError);
        console.warn("HerdHarbor cloud version preflight diagnostic:", failure.code, failure.status || "no-status");
        setSyncState("Cloud unavailable; changes are safe on this device and will retry.", "error");
        return false;
      }

      if (versionRecord) {
        const {
          data: loadedRecord,
          error: loadError,
          __hhTelemetry: loadTelemetry
        } = await fetchCloudRecord(userId);
        if (!stillCurrent()) return false;

        if (loadError) {
          const failure = reportCloudSyncFailure("cloud-preflight", loadError, serializedStateBytes(rawValue), loadTelemetry);
          console.error("HerdHarbor cloud preflight failed:", loadError);
          console.warn("HerdHarbor cloud preflight diagnostic:", failure.code, failure.status || "no-status");
          setSyncState("Cloud unavailable; changes are safe on this device and will retry.", "error");
          return false;
        }
        remoteRecord = loadedRecord || null;
      }
    }

    // 2.0.2: Never INSERT a whole-account legacy snapshot solely because this
    // authenticated identity has no cloud row. Older Auth-only accounts may
    // still have unreconciled data on another device. New signups use the
    // normalized writer and must never create their first legacy snapshot.
    if (!remoteRecord?.updated_at) {
      setSyncState(
        "No verified legacy cloud baseline exists. Local records were retained; first-login reconciliation is required before cloud upload.",
        "error"
      );
      return false;
    }

    const remoteRaw = remoteRecord?.app_state
      ? JSON.stringify(remoteRecord.app_state)
      : null;
    const activeRaw = activeStateRaw();
    const confirmedBase = await readCloudBaseline(userId);
    if (!stillCurrent()) return false;
    const localBaselineRaw = confirmedBase || activeRaw;

    if (
      localBaselineRaw &&
      !sameState(localBaselineRaw, rawValue) &&
      !allowAnimalStateTransition(
        localBaselineRaw,
        rawValue,
        "Cloud save paused: this change would exceed HerdHarbor Junior's limit of 5 active animals."
      )
    ) {
      return false;
    }

    if (remoteRaw && sameState(remoteRaw, rawValue)) {
      await writeCloudBaseline(userId, remoteRaw);
      if (!stillCurrent()) return false;
      if (remoteRecord.updated_at) {
        safeStorageSet(versionKey(userId), remoteRecord.updated_at);
      }
      if (sequence === writeSequence && !pendingSync) {
        removeRedundantStateCache(userId);
        safeStorageRemove(dirtyKey(userId));
      } else {
        safeStorageSet(dirtyKey(userId), "1");
      }
      syncConflict = null;
      const normalized = await completeNormalizedAfterLegacyCommit(
        sequence,
        remoteRecord.updated_at || null
      );
      if (!stillCurrent()) return false;
      if (!normalized.ok) {
        setSyncState(
          "Legacy cloud is saved; normalized sync is still finishing and will retry.",
          "error"
        );
        return false;
      }
      setSyncState("Saved to cloud", "success");
      return true;
    }

    const remoteChangedSinceBase =
      remoteRaw &&
      (!confirmedBase || !sameState(remoteRaw, confirmedBase));

    if (remoteChangedSinceBase && !options.force) {
      const merged = confirmedBase
        ? mergeRawStates(confirmedBase, rawValue, remoteRaw)
        : { ok: false, conflicts: ["missing sync history"] };

      if (!merged.ok) {
        const conflictLabel = merged.conflicts?.[0]
          ? ` The overlapping change is ${merged.conflicts[0]}.`
          : "";
        return markConflict(
          userId,
          rawValue,
          remoteRecord,
          `Sync paused because the same record changed on two devices.${conflictLabel}`
        );
      }

      localRawBeforeMerge = rawValue;
      rawValue = applyDevicePreferences(merged.rawValue, rawValue);
      appState = safeParse(rawValue);
      if (
        !allowAnimalStateTransition(
          localRawBeforeMerge,
          rawValue,
          "Cloud merge paused: the incoming change would exceed HerdHarbor Junior's limit of 5 active animals."
        )
      ) {
        return markConflict(
          userId,
          localRawBeforeMerge,
          remoteRecord,
          "Cloud merge paused because the combined records would exceed HerdHarbor Junior's limit of 5 active animals."
        );
      }
      autoMerged = true;
      reloadAfterSync = true;
      await Promise.all([
        recordRecoverySnapshot(
          userId,
          localRawBeforeMerge,
          "Local copy before automatic cloud merge"
        ),
        recordRecoverySnapshot(
          userId,
          remoteRaw,
          "Cloud copy before automatic device merge"
        )
      ]);
      if (!stillCurrent()) return false;
      if (sequence === writeSequence) {
        setActiveUserData(userId, rawValue);
      }
      safeStorageSet(dirtyKey(userId), "1");
      setSyncState("Combining protected changes from both devices…", "working");
    }

    if (options.force && remoteRaw) {
      await recordRecoverySnapshot(userId, remoteRaw, "Cloud copy before manual conflict resolution");
      if (!stillCurrent()) return false;
    }

    if (sequence < writeSequence && pendingSync && !options.force) {
      setSyncState("Newer changes queued; saving the latest copy…", "working");
      return true;
    }

    let {
      data: savedRecord,
      error,
      raced,
      __hhTelemetry: saveTelemetry
    } = await writeCloudRecord(
      userId,
      appState,
      remoteRecord || null
    );
    if (!stillCurrent()) return false;

    if (error) {
      const failure = reportCloudSyncFailure("cloud-save", error, serializedStateBytes(rawValue), saveTelemetry);
      console.error("HerdHarbor cloud save failed:", error);
      console.warn("HerdHarbor cloud save diagnostic:", failure.code, failure.status || "no-status");
      setSyncState("Cloud save failed; changes are safe on this device and will retry.", "error");
      return false;
    }

    if (raced) {
      const latest = await fetchCloudRecord(userId);
      if (!stillCurrent()) return false;
      if (latest.error) {
        reportCloudSyncFailure(
          "cloud-race-reload",
          latest.error,
          serializedStateBytes(rawValue),
          latest.__hhTelemetry
        );
        setSyncState("Cloud changed during save; local copy retained.", "error");
        return false;
      }

      // A newer local commit may have landed while this request was in flight.
      // Let the queue save that newest snapshot instead of turning our own
      // superseded request into a false cross-device conflict.
      if (sequence < writeSequence && pendingSync && !options.force) {
        setSyncState("Newer changes queued; saving the latest copy…", "working");
        return true;
      }

      const latestRaw = latest.data?.app_state
        ? JSON.stringify(latest.data.app_state)
        : null;

      // If another tab/client already committed the same logical state, accept
      // that cloud revision as the successful save.
      if (latestRaw && sameState(latestRaw, rawValue)) {
        savedRecord = latest.data;
        raced = false;
      } else if (latestRaw && confirmedBase && !options.force) {
        // Close the CAS race window by applying the same protected three-way
        // merge used during preflight, then retry once against the fresh cloud
        // revision. Only incompatible same-field edits reach the conflict UI.
        const raceMerge = mergeRawStates(confirmedBase, rawValue, latestRaw);
        if (!raceMerge.ok) {
          const conflictLabel = raceMerge.conflicts?.[0]
            ? ` The overlapping change is ${raceMerge.conflicts[0]}.`
            : "";
          return markConflict(
            userId,
            rawValue,
            latest.data,
            `Sync paused because the same record changed on two devices.${conflictLabel}`
          );
        }

        const rebasedRaw = applyDevicePreferences(raceMerge.rawValue, rawValue);
        const rebasedState = safeParse(rebasedRaw);
        if (
          !rebasedState ||
          !allowAnimalStateTransition(
            rawValue,
            rebasedRaw,
            "Cloud merge paused: the incoming change would exceed HerdHarbor Junior's limit of 5 active animals."
          )
        ) {
          return markConflict(
            userId,
            rawValue,
            latest.data,
            "Cloud merge paused because the combined records could not be applied safely."
          );
        }

        const retry = await writeCloudRecord(userId, rebasedState, latest.data);
        if (!stillCurrent()) return false;
        if (retry.error) {
          const failure = reportCloudSyncFailure(
            "cloud-race-retry",
            retry.error,
            serializedStateBytes(rebasedRaw),
            retry.__hhTelemetry
          );
          console.error("HerdHarbor cloud race retry failed:", retry.error);
          console.warn("HerdHarbor cloud race retry diagnostic:", failure.code, failure.status || "no-status");
          setSyncState("Cloud save failed; changes are safe on this device and will retry.", "error");
          return false;
        }

        if (retry.raced) {
          const newest = await fetchCloudRecord(userId);
          if (!stillCurrent()) return false;
          if (newest.error) {
            reportCloudSyncFailure(
              "cloud-race-retry-reload",
              newest.error,
              serializedStateBytes(rebasedRaw),
              newest.__hhTelemetry
            );
            setSyncState("Cloud changed again during save; local copy retained.", "error");
            return false;
          }
          return markConflict(
            userId,
            rebasedRaw,
            newest.data,
            "Sync paused because cloud records changed again while HerdHarbor was combining updates."
          );
        }

        rawValue = rebasedRaw;
        appState = rebasedState;
        savedRecord = retry.data;
        autoMerged = true;
      } else {
        return markConflict(
          userId,
          rawValue,
          latest.data,
          "Sync paused because another device saved at the same time."
        );
      }
    }

    const savedRaw = savedRecord?.app_state
      ? JSON.stringify(savedRecord.app_state)
      : rawValue;
    await writeCloudBaseline(userId, savedRaw);
    if (!stillCurrent()) return false;
    if (savedRecord?.updated_at) {
      safeStorageSet(versionKey(userId), savedRecord.updated_at);
    }

    if (autoMerged && sequence !== writeSequence) {
      const currentRaw = activeStateRaw();
      const rebased = mergeRawStates(
        localRawBeforeMerge,
        currentRaw,
        savedRaw
      );

      if (!rebased.ok) {
        return markConflict(
          userId,
          currentRaw,
          {
            app_state: safeParse(savedRaw),
            updated_at: savedRecord?.updated_at || null
          },
          "Sync paused because a record was edited again while device changes were being combined."
        );
      }

      const rebasedRaw = applyDevicePreferences(rebased.rawValue, currentRaw);
      setActiveUserData(userId, rebasedRaw);
      safeStorageSet(dirtyKey(userId), "1");
      pendingSync = {
        rawValue: rebasedRaw,
        sequence: writeSequence
      };
    } else if (sequence === writeSequence && !pendingSync) {
      removeRedundantStateCache(userId);
      safeStorageRemove(dirtyKey(userId));
    } else {
      safeStorageSet(dirtyKey(userId), "1");
    }

    syncConflict = null;
    const normalized = await completeNormalizedAfterLegacyCommit(
      sequence,
      savedRecord?.updated_at || null
    );
    if (!stillCurrent()) return false;
    if (!normalized.ok) {
      const deferredForNewerLocalSave =
        normalized?.result?.authoritativeLegacyReconcile?.reason === "local-state-ahead-of-legacy" &&
        (sequence !== writeSequence || Boolean(pendingSync));

      if (deferredForNewerLocalSave) {
        setSyncState("Saving newer device changes…", "working");
        return true;
      }

      setSyncState(
        "Legacy cloud is saved; normalized sync is still finishing and will retry.",
        "error"
      );
      return false;
    }
    setSyncState(
      autoMerged ? "Device and cloud changes combined and saved" : "Saved to cloud",
      "success"
    );
    return true;
  }

  async function drainSyncQueue() {
    if (syncInFlight) return syncInFlight;

    const userId = String(session?.user?.id || "");
    const operationToken = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(operationToken, userId);
    if (!userId || !stillCurrent()) return false;

    const run = (async () => {
      let lastResult = true;
      while (pendingSync && stillCurrent()) {
        const next = pendingSync;
        pendingSync = null;
        syncInFlightRaw = String(next.rawValue || "");
        try {
          lastResult = await syncValueToCloud(next.rawValue, next.sequence);
        } finally {
          if (stillCurrent()) syncInFlightRaw = null;
        }
        if (!stillCurrent()) return false;
        if (!lastResult && syncConflict) break;
      }
      return lastResult;
    })();

    syncInFlight = run;
    try {
      return await run;
    } finally {
      if (syncInFlight === run) {
        syncInFlight = null;
        syncInFlightRaw = null;
      }
      if (!stillCurrent()) return;
      if (pendingSync && !syncConflict) {
        queueMicrotask(() => drainSyncQueue());
      } else if (reloadAfterSync && !syncConflict) {
        reloadAfterSync = false;
        setTimeout(() => {
          if (stillCurrent()) window.location.reload();
        }, 0);
      }
    }
  }
  function boundedSyncDelay(baseDelay, startedAt, nowMs = Date.now()) {
    const safeDelay = Math.max(0, Number(baseDelay || 0));
    const firstScheduledAt = Number(startedAt || nowMs);
    const elapsed = Math.max(0, Number(nowMs) - firstScheduledAt);
    const remaining = Math.max(0, MAX_SYNC_DEBOUNCE_MS - elapsed);
    return Math.min(safeDelay, remaining);
  }

  function scheduleCloudSync(rawValue, sequence = writeSequence) {
    clearTimeout(syncTimer);
    const delay = String(rawValue || "").length >= LARGE_STATE_THRESHOLD_CHARS
      ? LARGE_STATE_SYNC_DELAY_MS
      : SYNC_DELAY_MS;
    const nowMs = Date.now();
    if (!syncDebounceStartedAt) syncDebounceStartedAt = nowMs;
    const boundedDelay = boundedSyncDelay(delay, syncDebounceStartedAt, nowMs);

    if (normalizedAuthorityActive()) {
      pendingSync = null;
      syncTimer = setTimeout(() => {
        syncTimer = null;
        syncDebounceStartedAt = 0;
        void syncNow();
      }, boundedDelay);
      return;
    }

    pendingSync = { rawValue, sequence };
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncDebounceStartedAt = 0;
      void drainSyncQueue();
    }, boundedDelay);
  }

  async function syncNow() {
    const syncUserIdAtStart = session?.user?.id;
    const syncToken = captureAccountOperation(syncUserIdAtStart);
    const syncAccountCurrent = () => isAccountOperationCurrent(syncToken, syncUserIdAtStart);
    const legacyWritePendingAtStart = Boolean(pendingSync) || Boolean(
      syncUserIdAtStart &&
      originalGetItem.call(localStorage, dirtyKey(syncUserIdAtStart)) === "1"
    );

    // S20: an account with no confirmed legacy cloud revision may be a new
    // normalized-only signup. Even if its first edit was staged before the
    // rollout runtime finished initialization, never send it through the
    // full-state legacy writer. Verify authority against the authenticated
    // server manifest BEFORE selecting a save engine. A failed status check
    // preserves the durable local outbox instead of guessing legacy.
    const legacyVersionConfirmed = syncUserIdAtStart
      ? Boolean(originalGetItem.call(localStorage, versionKey(syncUserIdAtStart)))
      : false;
    const localStageNormalized = normalizedRolloutStage() === "normalized";
    if (!normalizedAuthorityActive() &&
        (localStageNormalized || (syncUserIdAtStart && !legacyVersionConfirmed))) {
      let serverAuthority = null;
      try {
        serverAuthority = await getNormalizedSyncCohortStatus({ force: true });
      } catch (error) {
        console.warn("HerdHarbor could not verify first-save authority:", error?.message || error);
      }
      if (!syncAccountCurrent()) return false;
      if (!serverAuthority || serverAuthority.schemaVerified !== true ||
          !["legacy", "shadow", "dual_write", "normalized"].includes(serverAuthority.stage)) {
        setSyncState("Cloud save authority could not be verified; local changes remain protected.", "error");
        return false;
      }
      if (!localStageNormalized && serverAuthority.stage !== "normalized" &&
          !legacyVersionConfirmed) {
        // An account created before S22 may have Auth/access rows but no
        // canonical cloud snapshot or normalized manifest. Do not silently
        // initialize another legacy save account on its first edit.
        // Existing legacy breeders without a local version remain safe when
        // their authoritative legacy snapshot is actually present.
        let legacyCloud = null;
        try {
          legacyCloud = await fetchCloudRecord(syncUserIdAtStart);
        } catch (error) {
          console.warn("HerdHarbor could not verify a legacy first-save source:", error?.message || error);
        }
        if (!syncAccountCurrent()) return false;
        if (legacyCloud?.error || !legacyCloud?.data ||
            !legacyCloud.data.app_state || !legacyCloud.data.updated_at) {
          setSyncState("This existing account has no verified cloud save baseline. Local edits are protected; account migration is required before first cloud save.", "error");
          return false;
        }
      }
      if (localStageNormalized || serverAuthority.stage === "normalized") {
        await refreshNormalizedAuthorityIfEligible();
        if (!syncAccountCurrent()) return false;
        if (!normalizedAuthorityActive()) {
          setSyncState("Normalized record authority could not be verified; local changes remain protected.", "error");
          return false;
        }
      }
    }

    // In dual-write/legacy authority, never let an authority-readiness check
    // sit in front of a user save. Mobile photo/file pickers can trigger
    // lifecycle syncNow() calls; if the eligibility cache is cold, that check
    // may perform manifest/record verification before the pending legacy write.
    // Persist the user's dirty snapshot first. Authority readiness can refresh
    // on the next idle/check path after the save is protected in cloud.
    if (!normalizedAuthorityActive() && !legacyWritePendingAtStart) {
      await refreshNormalizedAuthorityIfEligible();
      if (!syncAccountCurrent()) return false;
    }
    if (normalizedAuthorityActive()) {
      // An older client can leave a legacy dirty marker without any durable
      // record mutations. An empty normalized outbox in that situation is
      // NOT evidence that those local edits reached the new cloud engine.
      // Preserve the device copy for explicit recovery rather than claiming
      // an empty drain means "Saved".
      const legacyDirtyWithoutOutbox =
        syncUserIdAtStart &&
        originalGetItem.call(localStorage, dirtyKey(syncUserIdAtStart)) === "1" &&
        !(canonicalStateStore?.getOutbox?.(syncUserIdAtStart)?.length > 0);
      if (legacyDirtyWithoutOutbox) {
        setSyncState("Older unsynced local records need recovery before normalized cloud saving can continue.", "error");
        return false;
      }
      clearTimeout(syncTimer);
      syncTimer = null;
      syncDebounceStartedAt = 0;
      pendingSync = null;
      setSyncState("Saving normalized cloud records…", "working");
      try {
        const result = await normalizedRollout.syncNormalizedNow();
        if (!syncAccountCurrent()) return false;
        // Never interpret a normalized authority failure as permission to
        // PATCH the old whole-account snapshot. A rollback or session race
        // must be re-verified separately before any save engine can change.
        if (result?.reason === "normalized-not-authoritative") {
          setSyncState("Normalized cloud authority changed; local records remain protected. Reconnect before saving.", "error");
          return false;
        }
        if (result?.ok) {
          // CAS/outbox has confirmed this account's normalized cloud write.
          safeStorageRemove(dirtyKey(syncUserIdAtStart));
          setSyncState("Saved to cloud", "success");
          return true;
        }
        setSyncState("Normalized cloud save is pending; local changes remain protected.", "error");
        return false;
      } catch (error) {
        if (!syncAccountCurrent()) return false;
        console.error("HerdHarbor normalized cloud save failed:", error);
        setSyncState("Normalized cloud unavailable; local changes remain protected.", "error");
        return false;
      }
    }

    if (!syncAccountCurrent()) return false;
    const syncUserId = session?.user?.id;
    const legacyDirty = syncUserId
      ? originalGetItem.call(localStorage, dirtyKey(syncUserId)) === "1"
      : false;
    if (
      syncUserId &&
      normalizedRolloutStage() === "dual_write" &&
      normalizedOutboxPending(syncUserId) &&
      !legacyDirty &&
      !pendingSync &&
      normalizedRollout?.afterLegacyCommit
    ) {
      // Legacy remains authoritative during dual-write. A stale normalized
      // outbox must not turn an otherwise clean account yellow or block the
      // user-facing save state. Repair it in the background.
      deferNormalizedDualWriteCleanup({
        ensureCurrent: true,
        reason: "sync-now-clean-legacy"
      });
      setSyncState("Saved to cloud", "success");
      return true;
    }

    const raw = activeStateRaw();
    if (!raw) {
      setSyncState("No HerdHarbor data is available to sync.", "error");
      return false;
    }

    // Lifecycle recovery (for example returning from the iOS photo picker)
    // can call syncNow() while the exact same state is already being saved.
    // Do not enqueue that raw state again or the queue will PATCH it a second
    // time immediately after the first save completes.
    if (syncInFlight && syncInFlightRaw && sameState(syncInFlightRaw, raw)) {
      return syncInFlight;
    }

    clearTimeout(syncTimer);
    syncTimer = null;
    syncDebounceStartedAt = 0;

    if (pendingSync && sameState(pendingSync.rawValue, raw)) {
      return drainSyncQueue();
    }

    pendingSync = { rawValue: raw, sequence: writeSequence };
    return drainSyncQueue();
  }

  async function invokeFunction(name, body = {}) {
    if (!session?.user?.id) throw new Error("Sign in before using this secure service.");
    const { data, error } = await client.functions.invoke(name, { body });
    if (error) throw new Error(error.message || `The ${name} service could not complete the request.`);
    return data;
  }

  async function invokeFunctionWithDiagnostics(name, body = {}) {
    if (!session?.user?.id) {
      const error = new Error("Sign in before using this secure service.");
      error.code = "authentication_required";
      throw error;
    }
    const { data, error } = await client.functions.invoke(name, { body });
    if (!error) return data;

    let diagnostic = null;
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        diagnostic = await response.clone().json();
      }
    } catch {
      diagnostic = null;
    }

    const safeCode = /^[a-z0-9_]{2,64}$/.test(String(diagnostic?.code || ""))
      ? String(diagnostic.code)
      : "secure_service_error";
    const safeMessage = typeof diagnostic?.error === "string" && diagnostic.error.trim()
      ? diagnostic.error.trim().slice(0, 320)
      : (error.message || `The ${name} service could not complete the request.`);
    const failure = new Error(safeMessage);
    failure.code = safeCode;
    if (diagnostic?.retryable === true) failure.retryable = true;
    if (typeof diagnostic?.retryAfter === "string" && diagnostic.retryAfter.length <= 80) {
      failure.retryAfter = diagnostic.retryAfter;
    }
    throw failure;
  }

  async function requestAccountDeletion({ reason = "", confirmation = "" } = {}) {
    if (!session?.user?.id || !session?.user?.email) {
      throw new Error("Sign in before requesting account deletion.");
    }
    if (confirmation !== "DELETE") {
      throw new Error("Type DELETE exactly to confirm the request.");
    }
    if (navigator.onLine === false) {
      throw new Error("Connect to the internet before submitting a deletion request.");
    }

    const userId = session.user.id;
    const dirty = hasPendingCloudMutations(userId);
    if (dirty && !(await syncNow())) {
      throw new Error("Your latest records have not synced. Download a backup, reconnect, and try again.");
    }

    let marketCleanup = { backendConfirmed: false, localQueueCleared: true };
    try {
      marketCleanup = await window.HerdHarborMarket?.prepareAccountDeletion?.() || marketCleanup;
    } catch {
      // Market Analytics cleanup is optional; the canonical deletion request must still proceed.
    }

    const formData = new FormData();
    formData.set("_subject", "HerdHarbor account deletion request");
    formData.set("request_type", "Account and associated data deletion");
    formData.set("request_source", "Signed-in HerdHarbor Settings");
    formData.set("account_email", session.user.email);
    formData.set("account_user_id", userId);
    formData.set("confirmation", confirmation);
    formData.set("reason", String(reason || "").slice(0, 1000));
    formData.set("requested_at", new Date().toISOString());
    formData.set("understand_permanent", "Yes");
    formData.set("market_queue_cleared", marketCleanup?.localQueueCleared ? "Yes" : "Unavailable");
    formData.set("market_backend_cleanup", marketCleanup?.backendConfirmed ? "Confirmed" : "Pending with account deletion");

    const response = await fetch(ACCOUNT_DELETION_REQUEST_URL, {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.errors?.[0]?.message || "The deletion request could not be submitted.");
    }
    return { ok: true, email: session.user.email };
  }

  async function checkNormalizedAuthorityChanges() {
    const userIdAtStart = String(session?.user?.id || "");
    const operationToken = captureAccountOperation(userIdAtStart);
    const stillCurrent = () => isAccountOperationCurrent(operationToken, userIdAtStart);
    if (!userIdAtStart || !stillCurrent()) return false;

    if (!normalizedAuthorityActive()) {
      await refreshNormalizedAuthorityIfEligible();
      if (!stillCurrent()) return false;
    }
    if (!normalizedAuthorityActive()) {
      // A missing normalized JS runtime is not proof that legacy regained
      // authority. Only the authenticated server may confirm that falling
      // back to the legacy cloud refresh is safe for this account.
      let status = null;
      try {
        status = await getNormalizedSyncCohortStatus({ force: true });
      } catch (error) {
        console.warn("HerdHarbor could not verify refresh authority:", error?.message || error);
      }
      if (!stillCurrent()) return false;
      if (status?.schemaVerified !== true ||
          !["legacy", "shadow", "dual_write", "normalized"].includes(status?.stage)) {
        setSyncState("Cloud refresh paused until server save authority can be verified.", "error");
        return false;
      }
      if (status.stage === "normalized" || status.authorityActive === true || status.recoveryPending === true) {
        setSyncState("Normalized cloud authority is active but the record reader is unavailable; local data was preserved.", "error");
        return false;
      }
      return null; // Server confirmed that a legacy-authoritative refresh is safe.
    }
    if (normalizedRefreshInFlight) return normalizedRefreshInFlight;

    const run = (async () => {
      try {
        const result = await normalizedRollout.refreshAuthoritative();
        if (!stillCurrent()) return false;
        if (result?.reason === "normalized-not-authoritative") {
          // Stale normalized context does not prove the legacy snapshot is
          // again authoritative. Preserve local data until fresh hydration.
          setSyncState("Normalized cloud authority changed; this device copy was not overwritten.", "error");
          return false;
        }
        if (!result?.ok) {
          setSyncState("Normalized cloud refresh is unavailable; this device copy was not overwritten.", "error");
          return false;
        }
        if (result?.skipped) return false;
        if (result?.source !== "normalized" || !result?.snapshot) {
          setSyncState("Normalized cloud refresh could not be verified; this device copy was not overwritten.", "error");
          return false;
        }

        const userId = userIdAtStart;
        const remoteRaw = JSON.stringify(result.snapshot);
        const activeRaw = activeStateRaw();
        if (!stillCurrent()) return false;
        // Matching JSON is not proof that this device's outbox/dirty marker
        // was acknowledged. A queued mutation must never be advertised as
        // "Saved to cloud" simply because the two snapshots compare equal.
        if (hasPendingCloudMutations(userId)) {
          setSyncState("Cloud refresh deferred; this device still has unsynced records.", "working");
          return false;
        }
        if (activeRaw && sameState(activeRaw, remoteRaw)) {
          setSyncState("Saved to cloud", "success");
          return false;
        }

        const deviceCloudRaw = applyDevicePreferences(remoteRaw, activeRaw);
        if (
          activeRaw &&
          !allowAnimalStateTransition(
            activeRaw,
            deviceCloudRaw,
            "Cloud update paused: the incoming records would exceed HerdHarbor Junior's limit of 5 active animals."
          )
        ) {
          setSyncState("Normalized cloud update paused by the current account animal limit.", "error");
          return false;
        }

        if (activeRaw) {
          const preserved = await recordRecoverySnapshot(
            userId,
            activeRaw,
            "Local copy before receiving normalized cloud changes"
          );
          if (!stillCurrent()) return false;
          if (preserved !== true) {
            setSyncState("Normalized cloud refresh paused because the local recovery copy could not be verified.", "error");
            return false;
          }
        }
        if (hasPendingCloudMutations(userId)) {
          return false;
        }
        if (!stillCurrent()) return false;

        if (setActiveUserData(userId, deviceCloudRaw, "normalized-cloud-state-replace") !== true) {
          setSyncState("Normalized cloud refresh could not store the verified device copy.", "error");
          return false;
        }
        safeStorageRemove(dirtyKey(userId));
        setSyncState("Newer normalized cloud records found; reloading…", "success");
        if (stillCurrent()) window.location.reload();
        return true;
      } catch (error) {
        if (!stillCurrent()) return false;
        console.error("HerdHarbor normalized cloud refresh failed:", error);
        setSyncState("Normalized cloud refresh failed; this device copy was not overwritten.", "error");
        return false;
      }
    })();

    normalizedRefreshInFlight = run;
    try {
      return await run;
    } finally {
      if (normalizedRefreshInFlight === run) normalizedRefreshInFlight = null;
    }
  }
  async function refreshDualWriteBaselineForRemoteState() {
    if (!normalizedRollout?.refreshDualWriteBaseline) {
      return Object.freeze({ ok: true, skipped: true, reason: "rollout-baseline-refresh-unavailable" });
    }

    const status = normalizedRollout.status?.();
    if (status?.stage !== "dual_write") {
      return Object.freeze({ ok: true, skipped: true, reason: "not-dual-write", stage: status?.stage || "legacy" });
    }

    try {
      const result = await normalizedRollout.refreshDualWriteBaseline();
      if (result?.ok === false) {
        console.warn(
          "HerdHarbor dual-write baseline refresh was blocked:",
          result?.reason || "unknown"
        );
      }
      return result;
    } catch (error) {
      console.warn(
        "HerdHarbor dual-write baseline refresh failed:",
        error?.code || error?.message || error
      );
      return Object.freeze({
        ok: false,
        skipped: false,
        reason: error?.code || "dual-write-baseline-refresh-failed"
      });
    }
  }

  async function checkForCloudChanges() {
    const userId = String(session?.user?.id || "");
    const operationToken = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(operationToken, userId);
    if (!userId || !stillCurrent() || syncInFlight || syncConflict) return false;

    const now = Date.now();
    if (now - lastCloudCheckAt < 15000) return false;
    lastCloudCheckAt = now;

    const normalizedHandled = await checkNormalizedAuthorityChanges();
    if (!stillCurrent()) return false;
    if (normalizedHandled !== null) return normalizedHandled;

    if (originalGetItem.call(localStorage, dirtyKey(userId)) === "1") {
      return syncNow();
    }

    const knownVersion = originalGetItem.call(localStorage, versionKey(userId)) || "";
    const { data: versionRecord, error: versionError } = await fetchCloudVersion(userId);
    if (!stillCurrent()) return false;
    if (versionError || !versionRecord) return false;

    const remoteVersion = String(versionRecord.updated_at || "");
    if (knownVersion && remoteVersion && knownVersion === remoteVersion) {
      setSyncState("Saved to cloud", "success");
      return false;
    }

    const { data, error } = await fetchCloudRecord(userId);
    if (!stillCurrent()) return false;
    if (error || !data?.app_state) return false;

    // A local edit can occur while the cloud refresh request is in flight
    // (for example, immediately after returning to an already-open device).
    // Re-check dirty state after the fetch so that fresh local work goes through
    // the normal three-way merge/save path instead of being mislabeled as a
    // two-device conflict.
    if (originalGetItem.call(localStorage, dirtyKey(userId)) === "1") {
      return syncNow();
    }

    const remoteRaw = JSON.stringify(data.app_state);
    const activeRaw = activeStateRaw();
    const confirmedBase = await readCloudBaseline(userId);
    if (!stillCurrent()) return false;

    if (activeRaw && sameState(activeRaw, remoteRaw)) {
      const baselineRefresh = await refreshDualWriteBaselineForRemoteState();
      if (!stillCurrent()) return false;
      if (baselineRefresh?.ok === false) {
        setSyncState(
          "Cloud records match, but normalized sync protection could not refresh yet.",
          "error"
        );
        return false;
      }
      await writeCloudBaseline(userId, remoteRaw);
      if (!stillCurrent()) return false;
      if (data.updated_at) safeStorageSet(versionKey(userId), data.updated_at);
      setSyncState("Saved to cloud", "success");
      return false;
    }

    if (confirmedBase && sameState(activeRaw, confirmedBase)) {
      await recordRecoverySnapshot(userId, activeRaw, "Local copy before receiving another device's changes");
      if (!stillCurrent()) return false;

      // The recovery snapshot is asynchronous. A local edit made while it is
      // being stored must not be overwritten by the cloud copy we fetched
      // earlier. Hand the newest local state to the normal sync/merge path.
      const latestActiveRaw = activeStateRaw();
      if (
        originalGetItem.call(localStorage, dirtyKey(userId)) === "1" ||
        !sameState(latestActiveRaw, activeRaw)
      ) {
        return syncNow();
      }

      const deviceCloudRaw = applyDevicePreferences(remoteRaw, activeRaw);
      if (
        !allowAnimalStateTransition(
          activeRaw,
          deviceCloudRaw,
          "Cloud update paused: the incoming records would exceed HerdHarbor Junior's limit of 5 active animals."
        )
      ) {
        return markConflict(
          userId,
          activeRaw,
          data,
          "Cloud update paused because the incoming records would exceed HerdHarbor Junior's limit of 5 active animals."
        );
      }
      const baselineRefresh = await refreshDualWriteBaselineForRemoteState();
      if (!stillCurrent()) return false;
      if (baselineRefresh?.ok === false) {
        setSyncState(
          "Newer cloud records found, but normalized sync protection could not refresh yet. Retrying shortly.",
          "error"
        );
        return false;
      }
      if (!stillCurrent()) return false;
      setActiveUserData(userId, deviceCloudRaw);
      await writeCloudBaseline(userId, remoteRaw);
      if (!stillCurrent()) return false;
      if (data.updated_at) safeStorageSet(versionKey(userId), data.updated_at);
      setSyncState("Newer cloud records found; reloading…", "success");
      if (stillCurrent()) window.location.reload();
      return true;
    }

    if (activeRaw) {
      return markConflict(
        userId,
        activeRaw,
        data,
        "Sync paused because this device and another device both have changes."
      );
    }

    return false;
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
        --hh-auth-page-start: #F7F2E8;
        --hh-auth-page-end: #EDF3F4;
        --hh-auth-surface: #FFFFFF;
        --hh-auth-text: #18212A;
        --hh-auth-heading: #0D2540;
        --hh-auth-muted: #65727E;
        --hh-auth-input: #FFFFFF;
        --hh-auth-border: #D8E0E5;
        --hh-auth-tabs: #EDF2F3;
        --hh-auth-active: #0D2540;
        --hh-auth-link: #2E7D7B;
        position: fixed;
        inset: 0;
        z-index: 100000;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        min-height: 100vh;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        overflow: auto;
        overscroll-behavior: contain;
        padding: 24px;
        color: var(--hh-auth-text);
        background:
          radial-gradient(circle at top left, rgba(46,125,123,.18), transparent 34%),
          linear-gradient(160deg, var(--hh-auth-page-start), var(--hh-auth-page-end));
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      html[data-theme="dark"] #hh-auth-root {
        --hh-auth-page-start: #071827;
        --hh-auth-page-end: #0D2235;
        --hh-auth-surface: #102A41;
        --hh-auth-text: #E8EEF2;
        --hh-auth-heading: #F3F6F8;
        --hh-auth-muted: #B8C5CE;
        --hh-auth-input: #0A2033;
        --hh-auth-border: rgba(208,225,235,.22);
        --hh-auth-tabs: #193247;
        --hh-auth-active: #2E7D7B;
        --hh-auth-link: #82D0CC;
        color-scheme: dark;
      }

      #hh-auth-root[hidden] { display: none !important; }

      #hh-auth-root .hh-auth-shell { width: min(520px, 100%); max-width: 100%; min-width: 0; }
      #hh-auth-root .hh-auth-brand { margin-bottom: 14px; text-align: center; }
      #hh-auth-root .hh-auth-brand h1 {
        margin: 0;
        color: var(--hh-auth-heading);
        font-size: clamp(2.2rem, 8vw, 3.5rem);
        letter-spacing: -.045em;
      }
      #hh-auth-root .hh-auth-brand p { margin: 7px 0 0; color: var(--hh-auth-muted); }
      #hh-auth-root .hh-auth-card {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        padding: clamp(22px, 5vw, 36px);
        background: var(--hh-auth-surface);
        border: 1px solid var(--hh-auth-border);
        border-radius: 24px;
        box-shadow: 0 24px 70px rgba(13,37,64,.16);
      }
      #hh-auth-root .hh-auth-card h2 { margin: 0 0 8px; color: var(--hh-auth-heading); }
      #hh-auth-root .hh-auth-intro { margin: 0 0 20px; color: var(--hh-auth-muted); line-height: 1.5; }
      #hh-auth-root .hh-auth-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 20px;
        padding: 5px;
        background: var(--hh-auth-tabs);
        border-radius: 14px;
      }
      #hh-auth-root .hh-auth-tab,
      #hh-auth-root .hh-auth-button,
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
      #hh-auth-root .hh-auth-tab { color: var(--hh-auth-heading); background: transparent; }
      #hh-auth-root .hh-auth-tab.active { color: white; background: var(--hh-auth-active); }
      #hh-auth-root .hh-auth-form { min-width: 0; display: grid; gap: 14px; }
      #hh-auth-root .hh-auth-form[hidden] { display: none !important; }
      #hh-auth-root .hh-auth-form label {
        display: grid;
        gap: 7px;
        color: var(--hh-auth-heading);
        font-weight: 750;
      }
      #hh-auth-root .hh-auth-form input {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        min-height: 48px;
        padding: 11px 13px;
        color: var(--hh-auth-text);
        -webkit-text-fill-color: var(--hh-auth-text);
        caret-color: var(--hh-auth-text);
        background: var(--hh-auth-input);
        border: 1px solid var(--hh-auth-border);
        border-radius: 12px;
        font: inherit;
      }
      #hh-auth-root .hh-auth-form input:focus {
        outline: 3px solid rgba(46,125,123,.18);
        border-color: #2E7D7B;
      }
      #hh-auth-root .hh-auth-form input:-webkit-autofill,
      #hh-auth-root .hh-auth-form input:-webkit-autofill:hover,
      #hh-auth-root .hh-auth-form input:-webkit-autofill:focus {
        -webkit-text-fill-color: var(--hh-auth-text);
        caret-color: var(--hh-auth-text);
        box-shadow: 0 0 0 1000px var(--hh-auth-input) inset;
        transition: background-color 9999s ease-out 0s;
      }
      #hh-auth-root .hh-auth-primary { color: white; background: #2E7D7B; }
      #hh-auth-root .hh-auth-link {
        min-height: auto;
        padding: 4px;
        color: var(--hh-auth-link);
        background: transparent;
        text-decoration: underline;
      }
      #hh-auth-root .hh-auth-message {
        display: none;
        margin: 0 0 17px;
        padding: 12px 14px;
        border-radius: 12px;
        line-height: 1.45;
      }
      #hh-auth-root .hh-auth-message.show { display: block; }
      #hh-auth-root .hh-auth-message.info { color: #0D2540; background: #E9F0F5; }
      #hh-auth-root .hh-auth-message.success { color: #2E6A45; background: #E8F4EC; }
      #hh-auth-root .hh-auth-message.error { color: #7C2020; background: #F9E8E8; }
      html[data-theme="dark"] #hh-auth-root .hh-auth-message.info { color: #D9E8F1; background: #173B5B; }
      html[data-theme="dark"] #hh-auth-root .hh-auth-message.success { color: #DCEADB; background: #183D2A; }
      html[data-theme="dark"] #hh-auth-root .hh-auth-message.error { color: #FFD4D1; background: #4A2526; }

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
      .hh-account-backup { color: #0D2540; background: #E9F0F5; }
      .hh-account-close { color: #0D2540; background: #EDF2F3; }
      .hh-account-signout { color: white; background: #AA3E3E; }
      html[data-theme="dark"] .hh-account-dialog {
        color: #18212A;
        background: #FFFFFF;
        color-scheme: light;
      }
      html[data-theme="dark"] .hh-account-dialog h2 { color: #0D2540; }
      html[data-theme="dark"] .hh-account-dialog .hh-account-email { color: #526474; }
      html[data-theme="dark"] .hh-account-dialog #hh-account-sync-status { color: #0D2540; background: #F0F4F5; }
      html[data-theme="dark"] .hh-account-dialog #hh-account-sync-status[data-type="success"] { color: #2E6A45; background: #E8F4EC; }
      html[data-theme="dark"] .hh-account-dialog #hh-account-sync-status[data-type="error"] { color: #7C2020; background: #F9E8E8; }
      html[data-theme="dark"] .hh-account-dialog .hh-account-backup,
      html[data-theme="dark"] .hh-account-dialog .hh-account-close { color: #0D2540; }
      html[data-theme="dark"] .hh-account-dialog .hh-conflict-actions p { color: #694713; }
      .hh-conflict-actions {
        display: grid;
        gap: 10px;
        margin: 0 0 16px;
        padding: 14px;
        background: #FFF3DC;
        border: 1px solid #E9C46A;
        border-radius: 12px;
      }
      .hh-conflict-actions[hidden] { display: none !important; }
      .hh-conflict-actions p { margin: 0; color: #694713; line-height: 1.45; }
      .hh-conflict-local { color: white; background: #2E7D7B; }
      .hh-conflict-cloud { color: white; background: #0D2540; }

      @media (max-width: 620px) {
        #hh-auth-root { padding: 14px; }
        .hh-account-button { right: 12px; bottom: 12px; }
      }
    `;
    const styleTarget = document.head || document.documentElement || document.body;
    if (styleTarget) styleTarget.appendChild(style);
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
          <p>Secure farm records, available wherever you sign in</p>
        </header>

        <section class="hh-auth-card">
          <div id="hh-auth-message" class="hh-auth-message" role="status" aria-live="polite"></div>

          <button id="hh-refresh-account-data" class="hh-auth-button hh-auth-primary" type="button" hidden>Refresh account data</button>
          <button id="hh-auth-only-empty-start" class="hh-auth-button hh-auth-primary" type="button" hidden>Start a new local operation after recovery review</button>

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

    const rootTarget = document.body || document.documentElement;
    if (!rootTarget) return root;
    rootTarget.appendChild(root);
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

    const refresh = root.querySelector("#hh-refresh-account-data");
    if (refresh) refresh.hidden = true;
    const blankStart = root.querySelector("#hh-auth-only-empty-start");
    if (blankStart) blankStart.hidden = true;

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

    root.querySelector("#hh-auth-only-empty-start").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await startFreshAuthOnlyWorkspace(); }
      finally { button.disabled = false; }
    });

    root.querySelector("#hh-refresh-account-data").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      authMessage("Refreshing your HerdHarbor account data…", "info");
      try {
        await refreshAuthenticatedAccountData();
      } finally {
        button.disabled = false;
      }
    });

    root.querySelector("#hh-signin-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setFormBusy(form, true);
      authMessage("Signing in…", "info");

      const submittedEmail = root.querySelector("#hh-signin-email").value.trim();
      const { error } = await client.auth.signInWithPassword({
        email: submittedEmail,
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
      authMessage("Verifying secure cloud account setup…", "info");

      // S20 fail-closed registration gate: if this client reaches a database
      // without normalized-only provisioning installed, do not create a new
      // legacy-authoritative account and falsely report signup success.
      let normalizedSignupReady = false;
      try {
        const { data: ready, error: readinessError } = await client.rpc(
          "herdharbor_normalized_signup_ready"
        );
        normalizedSignupReady = !readinessError && ready === true;
      } catch (error) {
        console.warn("HerdHarbor normalized signup preflight unavailable:", error?.code || error?.message || error);
      }
      if (!normalizedSignupReady) {
        authMessage(
          "Registration is temporarily unavailable while HerdHarbor verifies the new cloud save system. No account was created; try again after the update.",
          "error"
        );
        setFormBusy(form, false);
        return;
      }

      authMessage("Creating your account…", "info");
      const { data, error } = await client.auth.signUp({
        email: root.querySelector("#hh-signup-email").value.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          // The database rejects signups from older PWAs that cannot use the
          // normalized-only record writer. This is not an access/role claim.
          data: { hh_normalized_signup_client: "record-cas-v1" }
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

  let authOnlyRecoveryOwner = null;

  function updateAuthOnlyRecoveryControls() {
    if (!accountDialog) return;
    const control = accountDialog.querySelector("#hh-auth-only-recovery-actions");
    if (control) control.hidden = !(
      authOnlyRecoveryOwner &&
      authOnlyRecoveryOwner === String(session?.user?.id || "") &&
      String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "") === authOnlyRecoveryOwner &&
      hasConfiguredOperationProfile(activeStateRaw())
    );
  }

  function updateConflictControls() {
    if (!accountDialog) return;
    const controls = accountDialog.querySelector("#hh-conflict-actions");
    if (controls) controls.hidden = !syncConflict;
  }

  async function downloadSafetyBackup() {
    const rawValue = activeStateRaw();
    let appState = safeParse(rawValue);
    if (!appState) {
      setSyncState("No readable local records are available to back up.", "error");
      return;
    }

    if (window.HerdHarborAttachments?.stateWithPedigreeAttachments) {
      try {
        appState = await window.HerdHarborAttachments.stateWithPedigreeAttachments();
      } catch (error) {
        setSyncState("Safety backup stopped: a pedigree source document could not be recovered from this device. No incomplete backup was downloaded.", "error");
        return false;
      }
    }
    const payload = JSON.stringify({
      app: "HerdHarbor",
      version: window.HerdHarborBuild?.version || "2.0.2",
      backupType: "local-safety-backup",
      exportedAt: new Date().toISOString(),
      data: appState
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `herdharbor-safety-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSyncState("Safety backup downloaded.", "success");
  }

  // A formerly registered account with no local data on THIS device may start
  // an intentionally empty local operation only after an explicit warning
  // and fresh server reads. This DOES NOT create a cloud record; the owner
  // must still complete a profile and approve the durable recovery claim.
  async function startFreshAuthOnlyWorkspace() {
    const userId = String(session?.user?.id || "");
    const token = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(token, userId);
    if (!userId || !stillCurrent() || authOnlyRecoveryOwner !== userId) return false;

    const localWorkspaceClear = () => {
      const activeOwner = String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "");
      return (!activeOwner || activeOwner === userId) &&
        !activeStateRaw() &&
        !originalGetItem.call(localStorage, cacheKey(userId));
    };
    if (!localWorkspaceClear()) {
      showAccountBoundaryRecovery("Other device or account records are present. Preserve them first; do not start a blank operation.");
      return false;
    }
    if (!window.confirm(
      "This device has no operation records for the signed-in account. Have you checked your ORIGINAL devices " +
      "for unsynced animals, pedigrees, litters and medical information? Starting a local operation does not " +
      "restore any older records. Do not continue if another device contains data that must be recovered."
    )) return false;

    let legacy, manifest, normalizedRecords, authority;
    try {
      [legacy, manifest, normalizedRecords, authority] = await Promise.all([
        fetchCloudRecord(userId),
        client.from("herdharbor_sync_manifest").select("user_id")
          .eq("user_id", userId).maybeSingle(),
        client.from("herdharbor_sync_records").select("record_id")
          .eq("user_id", userId).limit(1).maybeSingle(),
        getNormalizedSyncCohortStatus({ force: true })
      ]);
    } catch (error) {
      if (stillCurrent()) setSyncState("The server could not verify this account as empty. No local operation was started.", "error");
      return false;
    }
    if (!stillCurrent()) return false;
    if (legacy?.error || legacy?.data || manifest?.error || manifest?.data ||
        normalizedRecords?.error || normalizedRecords?.data ||
        !authority || authority.schemaVerified !== true || authority.stage !== "legacy" ||
        !localWorkspaceClear()) {
      setSyncState("Cloud or device records may exist. Starting from an empty operation was stopped for account recovery.", "error");
      return false;
    }
    if (!safeStorageSet(ACTIVE_OWNER_KEY, userId) ||
        String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "") !== userId ||
        !stillCurrent()) {
      setSyncState("The new account workspace owner could not be verified. No local operation was started.", "error");
      return false;
    }
    const root = document.querySelector("#hh-auth-root");
    const blankStart = root?.querySelector("#hh-auth-only-empty-start");
    if (blankStart) blankStart.hidden = true;
    unlockApp();
    setSyncState("Local setup only. After creating your operation, use Account to explicitly import this device's records; no cloud baseline exists yet.", "error");
    return true;
  }

  // Auth-only recovery is owner-initiated. Every unknown cloud account stays
  // protected until a real local checkpoint and verified cloud readback exist.
  async function claimAuthOnlyDeviceRecovery() {
    const userId = String(session?.user?.id || "");
    const token = captureAccountOperation(userId);
    const stillCurrent = () => isAccountOperationCurrent(token, userId);
    if (!userId || !stillCurrent() || authOnlyRecoveryOwner !== userId) return false;

    const raw = activeStateRaw();
    const state = safeParse(raw);
    if (String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "") !== userId ||
        !state || !hasConfiguredOperationProfile(state)) {
      setSyncState("The local operation owner or profile could not be verified. No cloud import was attempted.", "error");
      return false;
    }

    // Pedigree originals may live only in this device's IndexedDB. Never
    // treat JSON references as proof the source files survived the recovery.
    const storedDocuments = [
      ...(Array.isArray(state.pedigrees) ? state.pedigrees.filter(x => x?.attachmentStored && !x?.sourceDataUrl) : []),
      ...(Array.isArray(state.pedigreeDrafts) ? state.pedigreeDrafts.filter(x => x?.sourceDocument?.attachmentStored && !x.sourceDocument?.dataUrl) : [])
    ];
    if (storedDocuments.length) {
      if (!window.HerdHarborAttachments?.stateWithPedigreeAttachments) {
        setSyncState("Pedigree attachments are stored only on this device and cannot be checked. Preserve the device and download a complete safety backup before migration.", "error");
        return false;
      }
      try {
        const exportState = await window.HerdHarborAttachments.stateWithPedigreeAttachments();
        // Validate references from the *current authenticated owner's raw
        // snapshot*, not just the rows returned by the runtime. An empty or
        // stale different-account runtime export cannot prove these originals
        // exist, even if it contains no unresolved attachment flags.
        const savedPedigrees = new Map((exportState?.pedigrees || []).map(x => [String(x?.id || ""), x]));
        const savedDrafts = new Map((exportState?.pedigreeDrafts || []).map(x => [String(x?.id || ""), x]));
        const unresolvedPedigrees = (state.pedigrees || [])
          .filter(x => x?.attachmentStored && !x?.sourceDataUrl)
          .some(x => !savedPedigrees.get(String(x.id || ""))?.sourceDataUrl);
        const unresolvedDrafts = (state.pedigreeDrafts || [])
          .filter(x => x?.sourceDocument?.attachmentStored && !x?.sourceDocument?.dataUrl)
          .some(x => !savedDrafts.get(String(x.id || ""))?.sourceDocument?.dataUrl);
        if (unresolvedPedigrees || unresolvedDrafts || !exportState) {
          setSyncState("At least one pedigree source document is not recoverable from this device. First cloud import is blocked.", "error");
          return false;
        }
      } catch (error) {
        setSyncState("A pedigree source attachment could not be verified. Keep the original device and preserve its records; first cloud import was blocked.", "error");
        return false;
      }
      if (!stillCurrent() || activeStateRaw() !== raw) return false;
      if (!window.confirm(
        "Pedigree source files in device storage are NOT included in the cloud JSON baseline. " +
        "Before continuing you must use Account > Download safety backup and verify the exported JSON contains the originals. " +
        "Keep this original device. Continue only after completing that separate backup?"
      )) return false;
    }

    const consent = window.confirm(
      "Use this device's operation records as the FIRST cloud recovery copy for this account? " +
      "Records on another offline device may differ. Download a separate safety backup and reconcile those devices. " +
      "This action cannot automatically merge other devices."
    );
    if (!consent) return false;

    const preserved = await recordRecoverySnapshot(
      userId, raw, "Owner-approved Auth-only device recovery before first cloud import"
    );
    if (!stillCurrent()) return false;
    if (!preserved) {
      setSyncState("Local recovery checkpoint failed. No cloud import was attempted.", "error");
      return false;
    }
    if (activeStateRaw() !== raw ||
        String(originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) || "") !== userId) {
      setSyncState("Device records changed during recovery preparation. No cloud import was attempted.", "error");
      return false;
    }

    // Server RPC derives the owner solely from auth.uid(), rejects any prior
    // cloud data, and atomically claims the initial recovery snapshot/cohort.
    let claim;
    try {
      claim = await client.rpc("herdharbor_claim_auth_only_local_recovery", {
        p_app_state: state
      });
    } catch (error) {
      if (stillCurrent()) setSyncState("Cloud recovery request was interrupted. Local data is retained; refresh to check for a completed claim.", "error");
      return false;
    }
    const { data, error } = claim || {};
    if (!stillCurrent()) return false;
    if (error || data?.ok !== true) {
      setSyncState("The recovery claim was not confirmed. Local records were kept; refresh to inspect cloud state before retrying.", "error");
      return false;
    }

    let readback;
    try { readback = await fetchCloudRecord(userId); }
    catch (error) {
      if (stillCurrent()) setSyncState("Cloud recovery readback failed. Do not retry the import until the server copy is checked.", "error");
      return false;
    }
    if (!stillCurrent()) return false;
    if (readback?.error || !readback?.data?.app_state ||
        !exactSameState(JSON.stringify(readback.data.app_state), raw) ||
        !readback.data.updated_at) {
      setSyncState("The first cloud recovery copy could not be verified. Keep the local checkpoint and stop for review.", "error");
      return false;
    }
    let baseline = false;
    try { baseline = await writeCloudBaseline(userId, raw); }
    catch (error) {
      if (stillCurrent()) setSyncState("Cloud recovery was saved but the local baseline failed. Keep the local checkpoint and retry account verification.", "error");
      return false;
    }
    if (!stillCurrent()) return false;
    if (baseline === false) {
      setSyncState("Cloud recovery was saved but the device baseline is unverified. Do not clear local records.", "error");
      return false;
    }
    safeStorageSet(versionKey(userId), readback.data.updated_at);
    authOnlyRecoveryOwner = null;
    updateAuthOnlyRecoveryControls();
    setSyncState(
      activeStateRaw() !== raw
        ? "Recovery baseline verified; newer device changes remain pending."
        : "First cloud recovery baseline verified. Preparing normalized migration.",
      "working"
    );
    // Preserve dirty/outbox flags. On refresh, new edits enter CAS/merge paths.
    try {
      const refreshed = await refreshAuthenticatedAccountData();
      // The refresh function intentionally invalidates the old account
      // boundary token, even for a successful same-owner refresh. Do not
      // misreport a verified import as failed merely because that old token
      // became stale. Verify the refreshed authenticated user instead.
      if (String(session?.user?.id || "") !== userId) return false;
      if (refreshed !== true) {
        setSyncState("Recovery copy verified, but account refresh remains pending. Retry Refresh account data; keep the local backup.", "error");
        return false;
      }
      return true;
    } catch (error) {
      if (stillCurrent()) setSyncState("Recovery copy verified, but account refresh was interrupted. Retry Refresh account data.", "error");
      return false;
    }
  }

  async function resolveConflict(choice) {
    if (!syncConflict || !session?.user?.id) return false;

    const conflict = syncConflict;
    if (choice === "cloud") {
      if (!conflict.remoteRaw || !safeParse(conflict.remoteRaw)) {
        setSyncState("The cloud copy could not be read; the local copy was not changed.", "error");
        return false;
      }

      await recordRecoverySnapshot(
        conflict.userId,
        conflict.localRaw,
        "Local copy before choosing cloud conflict version"
      );
      const deviceCloudRaw = applyDevicePreferences(
        conflict.remoteRaw,
        conflict.localRaw
      );
      if (
        !allowAnimalStateTransition(
          conflict.localRaw,
          deviceCloudRaw,
          "Cloud copy was not selected: it would exceed HerdHarbor Junior's limit of 5 active animals."
        )
      ) {
        return false;
      }
      const baselineRefresh = await refreshDualWriteBaselineForRemoteState();
      if (baselineRefresh?.ok === false) {
        setSyncState(
          "Cloud copy could not be selected until normalized sync protection refreshes.",
          "error"
        );
        return false;
      }
      setActiveUserData(conflict.userId, deviceCloudRaw);
      await writeCloudBaseline(conflict.userId, conflict.remoteRaw);
      if (conflict.remoteUpdatedAt) {
        safeStorageSet(versionKey(conflict.userId), conflict.remoteUpdatedAt);
      }
      safeStorageRemove(dirtyKey(conflict.userId));
      syncConflict = null;
      setSyncState("Cloud copy selected; reloading records…", "success");
      window.location.reload();
      return true;
    }

    const accepted = window.confirm(
      "Replace the cloud copy with the records currently on this device? A safety snapshot of both copies has already been retained."
    );
    if (!accepted) return false;

    pendingSync = null;
    const saved = await syncValueToCloud(conflict.localRaw, writeSequence, { force: true });
    updateConflictControls();
    return saved;
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
        const membership = accountDialog.querySelector("#hh-account-membership");
        const current = window.HerdHarborMembership?.getAccount?.() || accessProfile || fallbackAccessProfile();
        const tier = current.effectiveMembershipTier || current.membership_tier || "member";
        const role = current.accountRole || current.account_role || "user";
        const accountStatus = current.accountStatus || current.account_status || "active";
        membership.innerHTML = `${String(tier).replace(/^./, (letter) => letter.toUpperCase())} membership · ${String(role).replace(/^./, (letter) => letter.toUpperCase())} account<small>${String(accountStatus).replace(/^./, (letter) => letter.toUpperCase())}</small>`;
        const status = accountDialog.querySelector("#hh-account-sync-status");
        status.textContent = syncState;
        updateAuthOnlyRecoveryControls();
      });
      const accountButtonTarget = document.body || document.documentElement;
      if (accountButtonTarget) accountButtonTarget.appendChild(accountButton);
    }

    if (!accountDialog) {
      accountDialog = document.createElement("div");
      accountDialog.className = "hh-account-backdrop";
      accountDialog.hidden = true;
      accountDialog.innerHTML = `
        <section class="hh-account-dialog" role="dialog" aria-modal="true" aria-labelledby="hh-account-title">
          <h2 id="hh-account-title">HerdHarbor account</h2>
          <p id="hh-account-email" class="hh-account-email"></p>
          <p id="hh-account-membership" class="hh-account-membership">Member membership · User account<small>Active</small></p>
          <p id="hh-account-sync-status">Checking sync status…</p>
          <div id="hh-auth-only-recovery-actions" class="hh-conflict-actions" hidden>
            <p>No verified cloud copy exists. Use the original device and download a separate safety backup before importing. Other devices may contain different offline records.</p>
            <button id="hh-auth-only-claim" class="hh-conflict-local" type="button">Import this device's records to cloud</button>
          </div>
          <div id="hh-conflict-actions" class="hh-conflict-actions" hidden>
            <p>Both copies are protected. Choose which version should become the current record set.</p>
            <button id="hh-keep-local" class="hh-conflict-local" type="button">Keep this device's records</button>
            <button id="hh-use-cloud" class="hh-conflict-cloud" type="button">Use cloud records</button>
          </div>
          <div class="hh-account-actions">
            <button id="hh-sync-now" class="hh-account-sync" type="button">Save to cloud now</button>
            <button id="hh-download-safety" class="hh-account-backup" type="button">Download safety backup</button>
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

      accountDialog.querySelector("#hh-download-safety").addEventListener("click", () => {
        downloadSafetyBackup();
      });

      accountDialog.querySelector("#hh-auth-only-claim").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try { await claimAuthOnlyDeviceRecovery(); }
        finally { button.disabled = false; }
      });

      accountDialog.querySelector("#hh-keep-local").addEventListener("click", async () => {
        await resolveConflict("local");
      });

      accountDialog.querySelector("#hh-use-cloud").addEventListener("click", async () => {
        await resolveConflict("cloud");
      });

      accountDialog.querySelector("#hh-sign-out").addEventListener("click", async () => {
        const userId = session?.user?.id;
        const hasUnsyncedChanges = hasPendingCloudMutations(userId);
        if (hasUnsyncedChanges && !(await syncNow())) {
          setSyncState(
            "Sign-out paused to protect unsynced records. Reconnect and try Save to cloud now.",
            "error"
          );
          return;
        }
        const preserved = await preserveActiveForUser(userId, "Local copy retained at sign out");
        if (!preserved) {
          setSyncState(
            "Sign-out stopped because HerdHarbor could not verify a local recovery copy. Free storage space and try again; your current records remain open.",
            "error"
          );
          return;
        }
        if (!clearActiveUserData()) {
          showAccountBoundaryRecovery(
            "Sign-out was not completed because the active workspace could not be cleared. Your verified local recovery copy is retained; refresh account data to continue."
          );
          return;
        }
        clearAccountSessionMarkers(userId);
        resetAccountBoundaryRuntime();
        accountDialog.hidden = true;
        try {
          const { error } = await client.auth.signOut();
          if (error) throw error;
        } catch (error) {
          console.warn("HerdHarbor sign-out did not complete after local preservation:", error);
          showAccountBoundaryRecovery(
            "HerdHarbor could not finish signing out. Your local recovery copy is retained; refresh account data before trying again."
          );
        }
      });

      const accountDialogTarget = document.body || document.documentElement;
      if (accountDialogTarget) accountDialogTarget.appendChild(accountDialog);
    }

    setSyncState(syncState, syncConflict ? "error" : "success");
  }

  async function hydrateUserDataOnce(activeSession) {
    const userId = String(activeSession?.user?.id || "");
    const token = accountBoundaryFence?.capture?.(userId);
    const isCurrentHydration = () => Boolean(
      accountBoundaryFence?.isCurrent?.(token, session?.user?.id)
    );
    const staleHydration = () => Object.freeze({ stale: true, userId });
    if (!userId || !isCurrentHydration()) return staleHydration();
    authOnlyRecoveryOwner = null;
    updateAuthOnlyRecoveryControls();
    dispatchAuthSession();

    // Access/profile and sync-rollout hydration are independent network
    // phases. Start the access refresh immediately, but do not serialize the
    // entire cloud hydration path behind it.
    const accessProfilePromise = recoveryMode
      ? Promise.resolve(null)
      : loadAccessProfile();
    void window.HerdHarborBilling?.refresh?.();

    if (recoveryMode) {
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    const storedActiveRaw = activeStateRaw();
    const activeOwner = originalGetItem.call(localStorage, ACTIVE_OWNER_KEY);
    const activeRaw =
      !activeOwner || activeOwner === userId
        ? storedActiveRaw
        : null;
    const cachedRaw = originalGetItem.call(localStorage, cacheKey(userId));
    if (activeRaw && safeParse(activeRaw)) removeRedundantStateCache(userId);
    const dirty = originalGetItem.call(localStorage, dirtyKey(userId)) === "1";
    // An in-flight hydration is read-only until it proves that neither this
    // session nor another tab has changed the workspace it originally read.
    // An identity fence alone does not catch same-account edits during RPCs.
    const hydrationInputCurrent = () => (
      isCurrentHydration() &&
      activeStateRaw() === storedActiveRaw &&
      originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) === activeOwner &&
      (originalGetItem.call(localStorage, dirtyKey(userId)) === "1") === dirty
    );
    const deferHydrationForNewEdit = () => {
      setSyncState("Newer device edits were detected while loading cloud records. The local workspace was preserved; retry cloud sync.", "error");
      return Object.freeze({ ok: false, reason: "hydration-local-state-changed" });
    };
    let rolloutDecision = null;

    // S20: normalized-only signups must not probe the legacy data table.
    // Resolve server authority before requesting any legacy snapshot. This also
    // protects existing normalized accounts from a wasted legacy read on login.
    const knownCloudVersion =
      originalGetItem.call(localStorage, versionKey(userId)) || "";
    const canUseVersionOnlyPrefetch =
      !dirty &&
      // A matching revision is not sufficient if this device never loaded
      // the corresponding operation profile. Fetch the full cloud snapshot.
      hasConfiguredOperationProfile(activeRaw) &&
      Boolean(knownCloudVersion);
    const baselineRestorePromise = restoreMissingCloudBaseline(userId, "hydrate");
    const legacyCloudPrefetchMode = canUseVersionOnlyPrefetch ? "version" : "record";
    const rolloutHydrationPromise = normalizedRollout?.prepareHydration
      ? normalizedRollout.prepareHydration({ legacyDirty: dirty })
      : Promise.resolve(null);
    const legacyCloudPrefetchPromise = dirty
      ? null
      : rolloutHydrationPromise.then((decision) => {
        if (decision?.authoritative === true || decision?.stage === "normalized") return null;
        return canUseVersionOnlyPrefetch ? fetchCloudVersion(userId) : fetchCloudRecord(userId);
      }).catch(() => null);

    try {
      const [, decision] = await Promise.all([
        accessProfilePromise,
        rolloutHydrationPromise
      ]);
      if (!isCurrentHydration()) return staleHydration();
      rolloutDecision = decision;
    } catch (error) {
      if (!isCurrentHydration()) return staleHydration();
      console.error("HerdHarbor normalized authority check failed:", error);
      const offlineRaw = activeRaw || cachedRaw;
      if (offlineRaw && safeParse(offlineRaw)) {
        if (!activeRaw) {
          if (!isCurrentHydration()) return staleHydration();
          setActiveUserData(userId, offlineRaw, "normalized-authority-offline-copy");
        }
        unlockApp();
        setSyncState("Cloud authority could not be verified; this device copy was preserved.", "error");
        return;
      }
      authMessage(
        "Your account is signed in, but HerdHarbor could not verify the cloud authority. Try again shortly.",
        "error"
      );
      showAuth("signin");
      return;
    }

    // If the server already owns normalized authority but schema/worker
    // initialization is temporarily unavailable, NEVER hydrate from or write
    // back to the legacy cloud table. Keep this workspace locked for retry.
    if (rolloutDecision?.active === false && rolloutDecision?.authoritative !== true) {
      let serverAuthority = null;
      try { serverAuthority = await getNormalizedSyncCohortStatus({ force: true }); } catch {}
      if (!isCurrentHydration()) return staleHydration();
      if (!serverAuthority || serverAuthority.stage === "normalized") {
        showAuth("signin");
        authMessage("Cloud save authority could not be verified. Your records were retained; refresh account data to retry.", "error");
        return Object.freeze({ ok: false, reason: "s20-normalized-authority-unverified" });
      }
    }

    if (rolloutDecision?.authoritative === true) {
      if (!rolloutDecision.ok || !rolloutDecision.snapshot) {
        const protectedRaw = activeRaw || cachedRaw;
        if (protectedRaw && safeParse(protectedRaw)) {
          if (!activeRaw) {
            if (!isCurrentHydration()) return staleHydration();
            setActiveUserData(userId, protectedRaw, "normalized-authority-protected-local");
          }
          unlockApp();
          setSyncState(
            rolloutDecision?.reason === "legacy-dirty-without-record-outbox"
              ? "Unsynced records from an older client were preserved; normalized recovery is required before cloud overwrite."
              : "Normalized cloud records could not be verified; this device copy was preserved.",
            "error"
          );
          return;
        }
        authMessage(
          "Normalized cloud records could not be verified safely. No local records were removed.",
          "error"
        );
        showAuth("signin");
        return;
      }

      const cloudRaw = JSON.stringify(rolloutDecision.snapshot);
      const deviceCloudRaw = applyDevicePreferences(cloudRaw, activeRaw || cachedRaw);
      const stateChanged = !activeRaw || !sameState(activeRaw, deviceCloudRaw);

      if (
        activeRaw &&
        stateChanged &&
        !allowAnimalStateTransition(
          activeRaw,
          deviceCloudRaw,
          "Cloud load paused: the incoming records would exceed HerdHarbor Junior's limit of 5 active animals."
        )
      ) {
        unlockApp();
        setSyncState("Normalized cloud load paused by the current account animal limit.", "error");
        return;
      }

      if (activeRaw && stateChanged) {
        const preserved = await recordRecoverySnapshot(
          userId,
          activeRaw,
          "Local copy before loading normalized authoritative records"
        );
        if (!isCurrentHydration()) return staleHydration();
        if (!preserved) {
          showAccountBoundaryRecovery("HerdHarbor could not preserve the local state before normalized hydration. No records were replaced.");
          return Object.freeze({ ok: false, reason: "normalized-hydration-backup-failed" });
        }
      }

      if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
      setActiveUserData(userId, deviceCloudRaw, "normalized-authority-hydration");
      safeStorageRemove(dirtyKey(userId));
      pendingSync = null;
      syncConflict = null;

      if (stateChanged) {
        const reloadKey = `hh_normalized_loaded_${userId}_${rolloutDecision.generation || "current"}`;
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
          return;
        }
      }

      unlockApp();
      setSyncState("Normalized cloud records loaded", "success");
      return;
    }

    // A stale/empty onboarding state can be marked dirty before the cloud
    // profile is hydrated (especially across a mobile PWA reload). Do not
    // upload that empty state. Verify the legacy cloud record first; during
    // dual-write the legacy row is still the authoritative source.
    let verifiedExistingCloudRecord = null;
    if (dirty && !hasConfiguredOperationProfile(activeRaw || cachedRaw)) {
      const deviceRaw = activeRaw || cachedRaw;
      if (hasUnsyncedDomainRecords(deviceRaw)) {
        unlockApp();
        setSyncState("Local records without a configured profile need review before cloud recovery. No records were uploaded.", "error");
        return;
      }

      const cloudProbe = await fetchCloudRecord(userId);
      if (!isCurrentHydration()) return staleHydration();
      if (cloudProbe?.error) {
        setSyncState("Cloud baseline could not be checked. Device records remain protected; retry when connected.", "error");
        return Object.freeze({ ok: false, reason: "dirty-unconfigured-cloud-probe-failed" });
      }
      if (cloudProbe?.data?.app_state &&
          !hasConfiguredOperationProfile(cloudProbe.data.app_state)) {
        // A malformed existing cloud operation is NOT a new blank account.
        unlockApp();
        setSyncState("The existing cloud operation could not be verified. Automatic upload is paused; device records were retained.", "error");
        return Object.freeze({ ok: false, reason: "dirty-unconfigured-cloud-profile-invalid" });
      }
      // If the authenticated account truly has no legacy row, proceed to
      // the Auth-only hold and owner-consented recovery/new-operation choice.
      // Never unlock a blank workspace just because it was marked dirty.
      verifiedExistingCloudRecord = cloudProbe;
    }

    if (dirty && !verifiedExistingCloudRecord) {
      // A dirty flag must not bypass the Auth-only first-login hold below.
      // First verify a materialized cloud row before starting ANY legacy
      // write. A missing row falls through to reconciliation; a network
      // failure must never be interpreted as permission to initialize one.
      const firstLoginCloudProbe = await fetchCloudRecord(userId);
      if (!isCurrentHydration()) return staleHydration();
      if (firstLoginCloudProbe?.error) {
        setSyncState("Cloud baseline could not be checked. Device changes remain protected; retry when connected.", "error");
        return Object.freeze({ ok: false, reason: "first-login-cloud-probe-failed" });
      }
      if (!firstLoginCloudProbe?.data?.app_state || !firstLoginCloudProbe?.data?.updated_at) {
        verifiedExistingCloudRecord = firstLoginCloudProbe;
      } else {
        await baselineRestorePromise;
        if (!isCurrentHydration()) return staleHydration();
        const unsyncedRaw = activeRaw || cachedRaw;
        if (unsyncedRaw && safeParse(unsyncedRaw)) {
          if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
          if (!activeRaw) setActiveUserData(userId, unsyncedRaw);
          unlockApp();
          setSyncState("Unsynced local changes found; saving…", "working");
          pendingSync = { rawValue: unsyncedRaw, sequence: writeSequence };
          await drainSyncQueue();
          if (!isCurrentHydration()) return staleHydration();
          return;
        }
        verifiedExistingCloudRecord = firstLoginCloudProbe;
      }
    }

    setSyncState("Loading cloud records…", "working");

    const [prefetchedLegacy] = await Promise.all([
      verifiedExistingCloudRecord || legacyCloudPrefetchPromise || fetchCloudRecord(userId),
      baselineRestorePromise
    ]);
    if (!isCurrentHydration()) return staleHydration();

    if (prefetchedLegacy?.error) {
      console.error("HerdHarbor cloud load failed:", prefetchedLegacy.error);

      const offlineRaw = activeRaw || cachedRaw;
      if (offlineRaw && safeParse(offlineRaw)) {
        if (!isCurrentHydration()) return staleHydration();
        setActiveUserData(userId, offlineRaw);
        unlockApp();
        setSyncState("Offline copy loaded; changes will sync when connection returns.", "error");
        return;
      }

      authMessage(
        "Your account is signed in, but HerdHarbor could not load the cloud record. Try again shortly.",
        "error"
      );
      showAuth("signin");
      return;
    }

    let cloudLoadResult = prefetchedLegacy;
    if (legacyCloudPrefetchMode === "version") {
      const remoteVersion = String(prefetchedLegacy?.data?.updated_at || "");
      if (remoteVersion && remoteVersion === knownCloudVersion) {
        if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
        safeStorageRemove(dirtyKey(userId));
        pendingSync = null;
        syncConflict = null;

        if (
          rolloutDecision?.stage === "dual_write" &&
          normalizedRollout?.afterLegacyCommit &&
          normalizedOutboxPending(userId)
        ) {
          deferNormalizedDualWriteCleanup({
            ensureCurrent: true,
            reason: "startup-version-current"
          });
        }

        unlockApp();
        setSyncState("Cloud records loaded", "success");
        return;
      }

      cloudLoadResult = await fetchCloudRecord(userId);
      if (!isCurrentHydration()) return staleHydration();
      if (cloudLoadResult?.error) {
        console.error("HerdHarbor cloud load failed:", cloudLoadResult.error);

        const offlineRaw = activeRaw || cachedRaw;
        if (offlineRaw && safeParse(offlineRaw)) {
          if (!isCurrentHydration()) return staleHydration();
        setActiveUserData(userId, offlineRaw);
          unlockApp();
          setSyncState("Offline copy loaded; changes will sync when connection returns.", "error");
          return;
        }

        authMessage(
          "Your account is signed in, but HerdHarbor could not load the cloud record. Try again shortly.",
          "error"
        );
        showAuth("signin");
        return;
      }
    }

    const { data, error } = cloudLoadResult || {};
    if (error) {
      console.error("HerdHarbor cloud load failed:", error);
      return;
    }

    if (data?.app_state) {
      const cloudRaw = JSON.stringify(data.app_state);
      const stateChanged = !activeRaw || !sameState(activeRaw, cloudRaw);
      const deviceCloudRaw = applyDevicePreferences(
        cloudRaw,
        activeRaw || cachedRaw
      );

      if (activeRaw && stateChanged) {
        if (
          !allowAnimalStateTransition(
            activeRaw,
            deviceCloudRaw,
            "Cloud load paused: the incoming records would exceed HerdHarbor Junior's limit of 5 active animals."
          )
        ) {
          await markConflict(
            userId,
            activeRaw,
            data,
            "Cloud load paused because the incoming records would exceed HerdHarbor Junior's limit of 5 active animals."
          );
          if (!isCurrentHydration()) return staleHydration();
          unlockApp();
          return;
        }
        const preserved = await recordRecoverySnapshot(userId, activeRaw, "Local copy before loading newer cloud records");
        if (!isCurrentHydration()) return staleHydration();
        if (!preserved) {
          showAccountBoundaryRecovery("HerdHarbor could not preserve local records before replacing them with cloud data.");
          return Object.freeze({ ok: false, reason: "legacy-hydration-backup-failed" });
        }
      }
      const normalizedCleanupNeeded =
        rolloutDecision?.stage === "dual_write" &&
        Boolean(normalizedRollout?.afterLegacyCommit) &&
        (
          normalizedOutboxPending(userId) ||
          (activeRaw && sameState(activeRaw, cloudRaw))
        );

      // A first-time device has no configured operation and no local animal,
      // task, or activity edits to reconcile. The verified legacy cloud row is
      // already authoritative in dual-write; loading that read-only snapshot
      // must not wait on a potentially slow normalized-record baseline fetch.
      // Existing configured local operations still require baseline refresh
      // BEFORE replacing any local data, preserving the two-device contract.
      const pristineDevice = hasConfiguredOperationProfile(data.app_state) &&
        !hasConfiguredOperationProfile(activeRaw || cachedRaw) &&
        !hasUnsyncedDomainRecords(activeRaw || cachedRaw);
      const baselineRefresh = pristineDevice
        ? { ok: true, skipped: true, reason: "pristine-device-legacy-authority" }
        : await refreshDualWriteBaselineForRemoteState();
      if (!isCurrentHydration()) return staleHydration();
      if (baselineRefresh?.ok === false) {
        setSyncState(
          stateChanged
            ? "Cloud records are newer, but normalized sync protection could not refresh yet."
            : "Cloud records loaded, but normalized sync protection could not refresh yet.",
          "error"
        );
        // Never reveal a blank new-operation form while a verified existing
        // account is blocked by a consistency check.
        if (!hasConfiguredOperationProfile(activeRaw || cachedRaw)) {
          showAccountBoundaryRecovery("Your existing cloud operation is available, but synchronization protection needs to finish. Refresh account data to retry.");
        } else {
          unlockApp();
        }
        return;
      }
      if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
      setActiveUserData(userId, deviceCloudRaw);
      const installedHydrationRaw = activeStateRaw();
      await writeCloudBaseline(userId, cloudRaw);
      if (!isCurrentHydration()) return staleHydration();
      // Another tab or editor can commit an edit while durable baseline
      // persistence is pending. Never clear its dirty marker or claim an
      // earlier cloud revision as current after that edit.
      if (activeStateRaw() !== installedHydrationRaw ||
          originalGetItem.call(localStorage, dirtyKey(userId)) === "1") {
        setSyncState("Newer local changes are awaiting cloud sync; the hydrated records were preserved.", "working");
        return Object.freeze({ ok: false, reason: "hydration-new-local-edit-after-install" });
      }
      if (data.updated_at) safeStorageSet(versionKey(userId), data.updated_at);
      safeStorageRemove(dirtyKey(userId));
      syncConflict = null;

      if (normalizedCleanupNeeded) {
        deferNormalizedDualWriteCleanup({
          ensureCurrent: true,
          reason: "startup-hydration"
        });
      }

      // Adopt the now-persisted profile if the main runtime already rendered
      // onboarding before the cloud response arrived. A one-time sessionStorage
      // reload marker alone does not update the in-memory application state.
      const appNeedsOperation = !hasConfiguredOperationProfile(
        window.HerdHarborApp?.getState?.()
      );
      const runtimeRecovered = appNeedsOperation &&
        window.HerdHarborApp?.applyVerifiedCloudState?.() === true;
      if (stateChanged && !runtimeRecovered) {
        const reloadKey = `hh_cloud_loaded_${userId}_${data.updated_at || "current"}`;
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
          return;
        }
      }

      unlockApp();
      setSyncState("Cloud records loaded", "success");

      if (pristineDevice && rolloutDecision?.stage === "dual_write") {
        // Finish normalized baseline maintenance AFTER the customer can read
        // the verified legacy data. This task is read-only with respect to
        // legacy cloud authority and does not change the production cutover.
        window.setTimeout(() => {
          if (session?.user?.id !== userId) return;
          void refreshDualWriteBaselineForRemoteState().catch((error) => {
            console.warn("HerdHarbor deferred dual-write baseline refresh failed:", error?.code || error?.message || error);
          });
        }, 0);
      }
      return;
    }

    // 2.0.2: An existing Auth identity without a verified cloud record is
    // NOT a new empty account. Its owner may have unsynced records stored
    // only on a different/offline device. Never initialize an empty server
    // state or report a successful cloud setup from this hydration path.
    // Brand-new signups with verified normalized authority use the earlier
    // authoritative branch and do not reach this legacy/no-cloud hold.
    if (!data?.app_state && rolloutDecision?.authoritative !== true) {
      if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
      const retainedRaw = activeRaw || cachedRaw;
      if (retainedRaw && safeParse(retainedRaw)) {
        if (!activeRaw) setActiveUserData(userId, retainedRaw, "auth-only-reconciliation-hold");
        authOnlyRecoveryOwner = userId;
        unlockApp();
        updateAuthOnlyRecoveryControls();
        setSyncState(
          "No verified cloud save exists for this account. Device records were retained; first-login reconciliation is required before cloud upload.",
          "error"
        );
        return Object.freeze({ ok: false, reason: "auth-only-reconciliation-required", localPreserved: true });
      }
      authOnlyRecoveryOwner = userId;
      showAccountBoundaryRecovery(
        "This account has no verified cloud save. Another device may contain unsynced records. Use the original device to preserve and reconcile records before creating a cloud baseline."
      );
      const blankStart = document.querySelector("#hh-auth-only-empty-start");
      if (blankStart) blankStart.hidden = false;
      return Object.freeze({ ok: false, reason: "auth-only-reconciliation-required", localPreserved: false });
    }

    const newUserRaw = cachedRaw || activeRaw;
    if (newUserRaw && safeParse(newUserRaw)) {
      const stateChanged = !activeRaw || !sameState(activeRaw, newUserRaw);
      if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
      setActiveUserData(userId, newUserRaw);
      pendingSync = { rawValue: newUserRaw, sequence: writeSequence };
      await drainSyncQueue();
      if (!isCurrentHydration()) return staleHydration();
      if (stateChanged) {
        window.location.reload();
        return;
      }
      unlockApp();
      return;
    }

    if (storedActiveRaw && activeOwner && activeOwner !== userId) {
      const preserved = await recordRecoverySnapshot(activeOwner, storedActiveRaw, "Retained while switching accounts");
      if (!isCurrentHydration()) return staleHydration();
      if (!preserved) {
        showAccountBoundaryRecovery("HerdHarbor could not back up the previous account. Its local records remain intact.");
        return Object.freeze({ ok: false, reason: "legacy-owner-backup-failed" });
      }
    }
    if (!hydrationInputCurrent()) return deferHydrationForNewEdit();
    if (!clearActiveUserData() || !safeStorageSet(ACTIVE_OWNER_KEY, userId) ||
        originalGetItem.call(localStorage, ACTIVE_OWNER_KEY) !== userId) {
      showAccountBoundaryRecovery("HerdHarbor could not verify the new account workspace. Local recovery is required.");
      return Object.freeze({ ok: false, reason: "legacy-owner-switch-unverified" });
    }
    unlockApp();
    setSyncState("New cloud account ready", "success");
    if (storedActiveRaw) window.location.reload();
  }

  async function hydrateUserData(activeSession) {
    const userId = String(activeSession?.user?.id || "");
    if (!userId) return hydrateUserDataOnce(activeSession);

    if (hydrationInFlight && hydrationUserId === userId) {
      return hydrationInFlight;
    }

    const run = hydrateUserDataOnce(activeSession);
    hydrationUserId = userId;
    hydrationInFlight = run;

    try {
      const result = await run;
      const stillCurrentUser = String(session?.user?.id || "") === userId;
      const appUnlocked = !document.documentElement?.classList?.contains?.("hh-auth-locked");
      if (stillCurrentUser && appUnlocked && !recoveryMode &&
          result?.reason !== "auth-only-reconciliation-required") {
        lastHydratedUserId = userId;
        // Migration is an additive opt-in handoff; never block account loading
        // or sign-in on a migration prompt, and never migrate offline/dirty work.
        if (typeof normalizedUpgradeS20 !== "undefined")
        void normalizedUpgradeS20?.afterLogin?.().catch((error) => {
          console.warn("HerdHarbor S20 upgrade readiness postponed:", error?.code || error?.message || error);
        });
      }
      return result;
    } finally {
      if (hydrationInFlight === run) {
        hydrationInFlight = null;
        hydrationUserId = "";
      }
    }
  }

  async function runLegacyAccountBoundaryRecovery(activeSession) {
    const userId = String(activeSession?.user?.id || "");
    if (!userId) return Object.freeze({ ok: false, reason: "missing-authenticated-user" });

    const markerKey = accountBoundaryRecoveryMarkerKey(userId);
    const alreadyRecovered = originalGetItem.call(localStorage, markerKey) === "1";
    const boundary = await ensureAuthenticatedAccountBoundary(activeSession, {
      reason: alreadyRecovered
        ? "Local copy retained during authenticated startup recovery"
        : "Local copy retained during one-time account boundary recovery",
      allowUnownedQuarantine: !alreadyRecovered
    });
    if (!boundary.ok) return boundary;
    if (!isAccountOperationCurrent(boundary.token, userId)) return Object.freeze({ ok: false, reason: "account-boundary-session-changed" });

    if (!alreadyRecovered) {
      clearAccountSessionMarkers(userId);

      safeStorageSet(markerKey, "1");
    }
    return boundary;
  }

  async function refreshAuthenticatedAccountData() {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.user?.id) {
      session = null;
      accountBoundaryFence?.invalidate?.();
      resetAccountBoundaryRuntime();
      showAuth("signin");
      authMessage(error?.message || "Your session ended. Sign in again to refresh your account data.", "error");
      return false;
    }

    const userId = String(data.session.user.id);
    session = data.session;
    accountBoundaryFence?.invalidate?.();
    resetAccountBoundaryRuntime();
    clearAccountSessionMarkers(userId);

    const boundary = await ensureAuthenticatedAccountBoundary(data.session, {
      reason: "Local copy retained during member-requested account refresh",
      allowUnownedQuarantine: true
    });
    if (!boundary.ok) return false;

    const hydrated = await hydrateUserData(data.session);
    if (String(session?.user?.id || "") !== userId) return false;
    // A protected recovery stop is not a successful completed refresh.
    if (hydrated?.ok === false || hydrated?.stale === true) return false;
    return true;
  }

  async function initialize() {
    installStateStoreBridge();
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

    const boundary = await runLegacyAccountBoundaryRecovery(data.session);
    if (!boundary.ok) return;
    await hydrateUserData(data.session);
  }

  client.auth.onAuthStateChange((event, activeSession) => {
    // Emit synchronously, before asynchronous identity/account hydration:
    // the existing auth-session event may be delayed by cloud recovery.
    // AI capture jobs must be invalidated on every authentication boundary
    // (including A→B→A), even if userId later returns to its original value.
    const currentUserId = String(session?.user?.id || "");
    const incomingUserId = String(activeSession?.user?.id || "");
    // Same-account sign-in and token refresh are not account boundaries. Preserve any
    // human-edited photo review through a routine credential refresh, but
    // immediately fence account switches and sign-out before async hydration.
    const accountChanged = incomingUserId !== currentUserId;
    if (event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" ||
        (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event) && accountChanged)) {
      document.dispatchEvent(new CustomEvent("herdharbor:auth-boundary", {
        detail: { event, previousUserId: currentUserId, nextUserId: incomingUserId }
      }));
    }
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      session = activeSession;
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    // A refresh or user-update event with a different account identity must
    // use full account-boundary recovery, never reuse the prior farm state.
    if (activeSession && (event === "SIGNED_IN" ||
        (accountChanged && ["TOKEN_REFRESHED", "USER_UPDATED"].includes(event)))) {
      const signedInUserId = String(activeSession.user?.id || "");
      if (accountChanged) {
        showAccountBoundaryRecovery("HerdHarbor is verifying the newly authenticated account.");
      }
      session = activeSession;
      if (recoveryMode) {
        showRecovery();
        authMessage("Your reset link is valid. Choose a new password.", "info");
        return;
      }

      void (async () => {
        const boundary = await ensureAuthenticatedAccountBoundary(activeSession, {
          reason: "Local copy retained before authenticated account switch"
        });
        if (!boundary.ok) return;

        const appUnlocked = !document.documentElement?.classList?.contains?.("hh-auth-locked");
        if (signedInUserId && signedInUserId === lastHydratedUserId && appUnlocked) {
          dispatchAuthSession();
          void loadAccessProfile();
          void window.HerdHarborBilling?.refresh?.();
          return;
        }

        await hydrateUserData(activeSession);
      })();
      return;
    }

    if (["TOKEN_REFRESHED", "USER_UPDATED"].includes(event) && activeSession) {
      session = activeSession;
      dispatchAuthSession();
      void loadAccessProfile();
      void window.HerdHarborBilling?.refresh?.();
      return;
    }

    if (event === "SIGNED_OUT") {
      const previousUserId = session?.user?.id;
      const previousRaw = activeStateRaw();
      showAccountBoundaryRecovery("HerdHarbor is securing your local records during sign-out.");
      accountBoundaryFence?.invalidate?.();
      session = null;
      dispatchAuthSession();
      void (async () => {
        const preserved = await preserveActiveForUser(
          previousUserId, "Local copy retained after session ended", previousRaw
        );
        // A newer sign-in owns the workspace. Its own account-boundary
        // recovery will handle the retained previous account state.
        if (session?.user?.id) return;
        if (!preserved) {
          showAccountBoundaryRecovery(
            "Sign-out completed, but HerdHarbor could not safely back up offline records. Local data is retained. Free storage space and sign in to the original account before switching."
          );
          return;
        }
        if (!clearActiveUserData()) {
          showAccountBoundaryRecovery(
            "Sign-out completed, but HerdHarbor could not clear the active workspace. The verified local recovery copy is retained; sign in to the original account to recover safely."
          );
          return;
        }
        clearAccountSessionMarkers(previousUserId);
        resetAccountBoundaryRuntime();
        normalizedCohortStatusCache = null;
        normalizedCohortStatusInFlight = null;
        publishAccessProfile(fallbackAccessProfile());
        if (accountButton) accountButton.remove();
        if (accountDialog) accountDialog.remove();
        accountButton = null;
        accountDialog = null;
        showAuth("signin");
        authMessage("Signed out successfully.", "success");
      })().catch((error) => {
        console.error("HerdHarbor could not securely finish sign-out:", error);
        if (!session?.user?.id) showAccountBoundaryRecovery(
          "Your previous local account records could not be safely backed up. They remain on this device."
        );
      });
    }
  });

  window.addEventListener("online", () => {
    void loadAccessProfile();
    const userId = session?.user?.id;
    if (
      userId &&
      hasPendingCloudMutations(userId) &&
      !syncConflict
    ) {
      syncNow();
    } else {
      checkForCloudChanges();
    }
  });

  window.addEventListener("offline", () => {
    setSyncState(
      "Offline; changes stay protected on this device and will sync after reconnection.",
      "error"
    );
  });

  document.addEventListener("visibilitychange", () => {
    const userId = session?.user?.id;
    if (
      document.visibilityState === "hidden" &&
      userId &&
      hasPendingCloudMutations(userId) &&
      !syncConflict
    ) {
      syncNow();
    } else if (document.visibilityState === "visible") {
      checkForCloudChanges();
    }
  });

  window.addEventListener("focus", () => {
    checkForCloudChanges();
  });

  // Keep an already-open foreground client current when another device writes.
  // Focus/visibility hooks are not enough on mobile PWAs that can remain visible
  // for long periods without another lifecycle transition.
  window.setInterval(() => {
    if (
      document.visibilityState !== "visible" ||
      navigator.onLine === false ||
      !session?.user?.id ||
      recoveryMode
    ) return;
    void checkForCloudChanges();
  }, FOREGROUND_CLOUD_CHECK_INTERVAL_MS);

  async function getNormalizedSyncCohortStatus(options = {}) {
    const userId = session?.user?.id;
    const accountToken = userId ? captureAccountOperation(userId) : null;
    const stillCurrent = () => isAccountOperationCurrent(accountToken, userId);
    if (!userId) {
      return Object.freeze({
        eligible: false,
        mode: "allowlist",
        percentageEnabled: false,
        schemaVerified: false
      });
    }

    const force = options?.force === true;
    const now = Date.now();
    if (
      !force &&
      normalizedCohortStatusCache?.userId === userId &&
      now - normalizedCohortStatusCache.checkedAt < NORMALIZED_COHORT_STATUS_TTL_MS
    ) {
      return normalizedCohortStatusCache.status;
    }

    if (normalizedCohortStatusInFlight?.userId === userId) {
      const pending = normalizedCohortStatusInFlight.promise;
      if (!force) return pending;
      // Forced checks protect the legacy/normalized authority boundary.
      // Reusing a request started BEFORE cutover is not a fresh answer:
      // await it, then issue a separate RPC after its completion.
      try { await pending; } catch {}
      if (!stillCurrent()) {
        throw Object.assign(new Error("Account changed before authority verification."), {
          code: "HH_SYNC_ACCOUNT_CHANGED"
        });
      }
    }

    const request = (async () => {
      const { data, error } = await client.rpc("herdharbor_sync_cohort_status");
      // An A -> B -> A login transition invalidates a response from the
      // earlier A generation, even though the user ID now matches again.
      if (!stillCurrent()) {
        throw Object.assign(new Error("Account changed while verifying cloud authority."), {
          code: "HH_SYNC_ACCOUNT_CHANGED"
        });
      }
      if (error) throw new Error(error.message || "Normalized sync cohort status could not be read.");

      const status = Object.freeze({
        eligible: data?.eligible === true,
        mode: String(data?.mode || "allowlist") === "allowlist" ? "allowlist" : "invalid",
        percentageEnabled: data?.percentage_enabled === true,
        // A malformed status payload is not proof that a legacy save is safe.
        // The writer decision needs both a verified schema and an explicit
        // authoritative stage from the server.
        schemaVerified: data?.schema_verified === true &&
          ["legacy", "shadow", "dual_write", "normalized"].includes(String(data?.stage || "")),
        stage: ["legacy", "shadow", "dual_write", "normalized"].includes(String(data?.stage || "legacy"))
          ? String(data.stage)
          : "legacy",
        authorityActive: data?.authority_active === true,
        recoveryPending: data?.recovery_pending === true
      });

      if (stillCurrent()) {
        normalizedCohortStatusCache = {
          userId,
          checkedAt: Date.now(),
          status
        };
      }
      return status;
    })().finally(() => {
      if (normalizedCohortStatusInFlight?.promise === request) {
        normalizedCohortStatusInFlight = null;
      }
    });

    normalizedCohortStatusInFlight = { userId, promise: request };
    return request;
  }

  function createNormalizedRecordStore(expectedUserId = session?.user?.id) {
    const userId = String(expectedUserId || "");
    if (!userId || session?.user?.id !== userId) {
      throw Object.assign(new Error("Authenticated account changed before the normalized record store was created."), {
        code: "HH_SYNC_ACCOUNT_CHANGED"
      });
    }
    const api = window.HerdHarborCloudRecordStore;
    if (!api?.createRecordStore) throw new Error("The normalized record-store module is not loaded.");
    return api.createRecordStore({ client, userId });
  }

  async function readLegacySnapshotForNormalizedSync(expectedUserId = session?.user?.id) {
    const userId = String(expectedUserId || "");
    if (!userId || session?.user?.id !== userId) {
      throw Object.assign(new Error("Authenticated account changed before the legacy snapshot was read."), {
        code: "HH_SYNC_ACCOUNT_CHANGED"
      });
    }
    const { data, error } = await fetchCloudRecord(userId);
    if (session?.user?.id !== userId) {
      throw Object.assign(new Error("Authenticated account changed while the legacy snapshot was read."), {
        code: "HH_SYNC_ACCOUNT_CHANGED"
      });
    }
    if (error) throw new Error(error.message || "The legacy cloud snapshot could not be read.");
    return {
      snapshot: data?.app_state && typeof data.app_state === "object" ? data.app_state : {},
      updatedAt: data?.updated_at || null
    };
  }

  window.HerdHarborCloud = {
    syncNow,
    invokeFunction,
    invokeFunctionWithDiagnostics,
    getSession: () => session,
    getNormalizedSyncCohortStatus,
    createNormalizedRecordStore,
    readLegacySnapshotForNormalizedSync,
    getSyncState: () => syncState,
    getSyncDetails,
    hasUnsyncedChanges: () => hasPendingAuthoritativeCloudMutations(session?.user?.id),
    hasConflict: () => Boolean(syncConflict),
    downloadSafetyBackup,
    requestAccountDeletion,
    getAccessProfile: () => ({ ...(accessProfile || fallbackAccessProfile()) }),
    refreshAccess: loadAccessProfile,
    listMembers,
    getMemberDetail,
    setMemberRole,
    setMemberMembership,
    returnMemberToAutomatic
  };

  if (
    window.HerdHarborNormalizedSyncRolloutRuntime?.createBrowserRuntime &&
    canonicalStateStore
  ) {
    try {
      normalizedRollout = window.HerdHarborNormalizedSyncRolloutRuntime.createBrowserRuntime(window);
      window.HerdHarborNormalizedSyncRollout = normalizedRollout;
      void normalizedRollout.start({ confirmLegacy: false }).catch((error) => {
        console.warn(
          "HerdHarbor normalized rollout stayed disabled:",
          error?.code || error?.message || error
        );
      });
    } catch (error) {
      console.warn(
        "HerdHarbor normalized rollout could not initialize:",
        error?.code || error?.message || error
      );
      normalizedRollout = null;
    }
  }

  // S20 migration: verified legacy save, owner-confirmed old-client shutdown,
  // PWA update handoff, then S18's guarded normalized-primary cutover.
  function showS20UpgradeOffer({ accept, dismiss }) {
    if (document.getElementById("hh-s20-upgrade-offer")) return;
    const root = document.createElement("aside");
    root.id = "hh-s20-upgrade-offer";
    root.className = "hh-pwa-update";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Upgrade HerdHarbor cloud saves");
    root.innerHTML = `<strong>HerdHarbor cloud save upgrade</strong>
      <span>Your current records are ready for a safer, record-based save system.
      Save and close HerdHarbor on your other devices before continuing. Unsaved
      offline changes on an older version cannot be recovered automatically.</span>
      <label style="display:block;margin:8px 0;">
        <input type="checkbox" data-hh-s20-closed>
        All my other HerdHarbor tabs and devices have finished syncing and are closed.
      </label>
      <span data-hh-s20-message role="status" aria-live="polite"></span>
      <div><button type="button" data-hh-s20-accept>Save &amp; Upgrade</button>
      <button type="button" data-hh-s20-later>Later</button></div>`;
    const message = root.querySelector("[data-hh-s20-message]");
    const button = root.querySelector("[data-hh-s20-accept]");
    button.addEventListener("click", async () => {
      button.disabled = true;
      message.textContent = "Verifying cloud saves and recovery backups…";
      try {
        const result = await accept({
          legacyClientsClosed: root.querySelector("[data-hh-s20-closed]").checked
        });
        if (result?.ok && result.stage === "update-offered") {
          message.textContent = "Your cloud save is protected. Select Update Now in the app update prompt to continue.";
          root.remove();
        } else if (result?.ok && result.stage === "normalized") {
          message.textContent = "Normalized cloud saving is active.";
          root.remove();
        } else {
          message.textContent = result?.reason === "close-old-clients-first"
            ? "Confirm that your other devices have finished saving and are closed."
            : "Upgrade paused: " + String(result?.reason || "cloud verification incomplete").replace(/[^a-zA-Z0-9 _-]/g, " ");
        }
      } catch (error) {
        message.textContent = "Upgrade paused; your records remain protected. Retry after verifying cloud sync.";
        console.warn("HerdHarbor S20 cutover stayed pending:", error?.code || error?.message || error);
      } finally { button.disabled = false; }
    });
    root.querySelector("[data-hh-s20-later]").addEventListener("click", () => {
      dismiss();
      root.remove();
    });
    (document.body || document.documentElement)?.appendChild(root);
  }

  // Keep migration coordination independent from the PWA module. The cloud
  // side can require editor safety without importing the update controller.
  function s20HasUnsavedEditor() {
    try {
      return Boolean(document.querySelector?.(
        '#hh-paper-pedigree-dialog[open], #photo-entry-review input, #photo-entry-review textarea, ' +
        'dialog[open] input, dialog[open] textarea, [role="dialog"]:not([hidden]) textarea, ' +
        '#modal-backdrop:not(.hidden) #modal-content input, ' +
        '#modal-backdrop:not(.hidden) #modal-content textarea, ' +
        '#modal-backdrop:not(.hidden) #modal-content select'
      ));
    } catch { return true; }
  }

  if (window.HerdHarborNormalizedUpgradeS20?.create && normalizedRollout) {
    normalizedUpgradeS20 = window.HerdHarborNormalizedUpgradeS20.create({
      getUserId: () => session?.user?.id,
      getStatus: async () => {
        const decision = await normalizedRollout.checkEligibility();
        return {
          eligible: decision?.eligible === true,
          schemaVerified: decision?.schemaVerified === true,
          stage: decision?.stage || normalizedRollout.status?.()?.stage || "legacy"
        };
      },
      isClean: (userId) => (
        navigator.onLine !== false &&
        session?.user?.id === userId &&
        !recoveryMode &&
        !syncConflict &&
        !hasPendingCloudMutations(userId) &&
        canonicalStateStore?.getOutbox?.(userId)?.length === 0 &&
        !s20HasUnsavedEditor() &&
        document.documentElement?.dataset?.hhUnsynced !== "true"
      ),
      getRevision: (userId) => Number(canonicalStateStore?.getRevision?.(userId) || 0),
      sync: async () => {
        // A clean dual-write account already has a confirmed legacy snapshot.
        // Do not force another full-state PATCH merely to perform cutover:
        // S18's repeated reconciliation supplies fresh cloud confirmation.
        const userId = session?.user?.id;
        if (!userId || navigator.onLine === false) return false;
        return hasPendingCloudMutations(userId) ? syncNow() : true;
      },
      prepare: (options) => normalizedRollout.prepareHydration(options),
      validate: () => normalizedRollout.validateNow(),
      readLegacy: readLegacySnapshotForNormalizedSync,
      saveRecovery: async (userId, read) => {
        const original = JSON.stringify(read.snapshot);
        const archived = await recordRecoverySnapshot(userId, original, "S20 verified cloud snapshot before normalized cutover");
        if (!archived) return false;
        const local = activeStateRaw();
        if (local && !sameState(local, original)) {
          return Boolean(await recordRecoverySnapshot(userId, local, "S20 local device snapshot before normalized cutover"));
        }
        return true;
      },
      cutover: (options) => normalizedRollout.cutoverToNormalizedPrimary(options),
      offer: showS20UpgradeOffer,
      updateAvailable: () => {
        const detail = { promise: null };
        document.dispatchEvent(new CustomEvent("herdharbor:s20-check-app-update", { detail }));
        // Missing PWA listener is an UNKNOWN update state, not permission
        // to migrate without a verified update check.
        return detail.promise || Promise.resolve(null);
      },
      afterPromotion: async () => {
        setSyncState("Normalized cloud saving activated", "success");
        if (session?.user?.id && !hasPendingCloudMutations(session.user.id)) window.location.reload();
      },
      sessionStorage: (() => {
        try { return window.sessionStorage; } catch { return null; }
      })()
    });
    document.addEventListener("herdharbor:auth-boundary", (event) => {
      normalizedUpgradeS20?.fenceAccountBoundary?.(event.detail || {});
      document.querySelector("#hh-s20-upgrade-offer")?.remove();
    });
    for (const target of ["online", "focus"]) {
      window.addEventListener(target, () => {
        if (session?.user?.id && document.documentElement?.classList?.contains?.("hh-auth-locked") === false) {
          void normalizedUpgradeS20.afterLogin().catch(() => {});
        }
      });
    }
  }

  initialize().catch((error) => {
    console.error("HerdHarbor cloud initialization failed:", error);
    ensureStyles();
    showAuth("signin");
    authMessage(
      "HerdHarbor could not start the secure account connection. Your local records were not removed. Refresh and try again.",
      "error"
    );
  });
})();
