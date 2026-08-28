"use strict";

export const HERDHARBOR_MONITORING_RELEASE = "HerdHarbor@1.5.1";
export const HERDHARBOR_MONITORING_BUILD = "phase1-monitoring-review-1";

export const MODULES = Object.freeze([
  "dashboard",
  "animals",
  "pedigrees",
  "breeding",
  "rabbit-genetics",
  "births-litters",
  "health",
  "shows",
  "production",
  "sales",
  "finance",
  "tasks",
  "sync",
  "account",
  "backup",
  "import-export"
]);

const MODULE_SET = new Set(MODULES);
const ENVIRONMENTS = new Set(["development", "test", "production"]);
const SAFE_METADATA_KEYS = new Set([
  "operation",
  "result",
  "error_category",
  "record_count",
  "item_count",
  "attempt",
  "status_code",
  "http_status",
  "storage_type",
  "file_type",
  "source",
  "component",
  "phase",
  "module",
  "platform",
  "environment",
  "release",
  "build",
  "os",
  "browser",
  "device_class",
  "reference_id",
  "reason",
  "mode",
  "online"
]);

const SENSITIVE_EXACT_KEYS = new Set([
  "password", "passcode", "token", "access_token", "refreshtoken", "refresh_token",
  "session_token", "authorization", "cookie", "cookies", "session", "secret", "apikey",
  "api_key", "email", "phone", "address", "customer", "customers", "medical", "health",
  "treatment", "finance", "financial", "payment", "payments", "bank", "note", "notes",
  "description", "freetext", "free_text", "document", "documents", "photo", "photos",
  "backup", "backups", "spreadsheet", "spreadsheets", "pedigree", "pedigrees", "body",
  "requestbody", "request_body", "responsebody", "response_body", "payload", "content",
  "contents", "raw", "rawvalue", "raw_value", "rawstate", "raw_state", "app_state",
  "state", "form", "formdata", "form_data", "field", "fields", "value", "values",
  "record", "records", "animal", "animals", "farm", "farmname", "farm_name", "farmnotes",
  "farm_notes", "name", "username", "full_name", "fullname", "user_email", "useremail"
]);

const SENSITIVE_KEY_FRAGMENT = /(password|passcode|token|authorization|cookie|session|secret|api[_-]?key|email|phone|address|customer|medical|health|treatment|finance|financial|payment|bank|note|description|free[_-]?text|document|photo|backup|spreadsheet|pedigree|request[_-]?body|response[_-]?body|payload|raw[_-]?(value|state)|app[_-]?state|farm[_-]?(name|notes))/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PHONE_PATTERN = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;
const SECRET_ASSIGNMENT_PATTERN = /\b(password|passcode|token|access_token|refresh_token|authorization|cookie|session|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;

function normalizedKey(key) {
  return String(key || "").replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

export function isSensitiveKey(key) {
  const normalized = normalizedKey(key);
  if (!normalized) return false;
  if (SAFE_METADATA_KEYS.has(normalized)) return false;
  return SENSITIVE_EXACT_KEYS.has(normalized) || SENSITIVE_KEY_FRAGMENT.test(String(key));
}

export function sanitizeUrl(value) {
  if (!value) return "";
  try {
    const base = typeof location !== "undefined" && location.origin ? location.origin : "https://herdharbor.invalid";
    const parsed = new URL(String(value), base);
    if (parsed.origin === "https://herdharbor.invalid") return parsed.pathname;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(value).split(/[?#]/, 1)[0].slice(0, 300);
  }
}

export function sanitizeText(value, maxLength = 500) {
  let text = String(value ?? "");
  text = text
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, "[redacted-token]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[redacted]");

  text = text.replace(/https?:\/\/[^\s)\]}]+/gi, (url) => sanitizeUrl(url));
  return text.slice(0, maxLength);
}

function safeIdentifier(value, fallback = "unknown") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function sanitizeDiagnosticMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (!SAFE_METADATA_KEYS.has(normalized) || isSensitiveKey(key)) continue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      result[normalized] = rawValue;
    } else if (typeof rawValue === "boolean") {
      result[normalized] = rawValue;
    } else if (typeof rawValue === "string") {
      result[normalized] = sanitizeText(rawValue, 120);
    }
  }
  return result;
}

function sanitizeFrame(frame) {
  if (!frame || typeof frame !== "object") return undefined;
  return {
    filename: frame.filename ? sanitizeUrl(frame.filename) : undefined,
    abs_path: frame.abs_path ? sanitizeUrl(frame.abs_path) : undefined,
    function: frame.function ? sanitizeText(frame.function, 160) : undefined,
    module: frame.module ? sanitizeText(frame.module, 120) : undefined,
    lineno: Number.isFinite(frame.lineno) ? frame.lineno : undefined,
    colno: Number.isFinite(frame.colno) ? frame.colno : undefined,
    in_app: typeof frame.in_app === "boolean" ? frame.in_app : undefined
  };
}

export function sanitizeBreadcrumb(breadcrumb) {
  if (!breadcrumb || breadcrumb.category !== "herdharbor.action") return null;
  const data = sanitizeDiagnosticMetadata(breadcrumb.data || {});
  return {
    timestamp: breadcrumb.timestamp,
    category: "herdharbor.action",
    type: "default",
    level: ["debug", "info", "warning", "error"].includes(breadcrumb.level) ? breadcrumb.level : "info",
    message: safeIdentifier(breadcrumb.message || data.operation || "action", "action"),
    data
  };
}

export function sanitizeSentryEvent(event, runtimeContext = {}) {
  if (!event || typeof event !== "object") return null;
  const moduleName = MODULE_SET.has(runtimeContext.module) ? runtimeContext.module : "dashboard";
  const referenceId = runtimeContext.referenceId || createReferenceId(runtimeContext.runtime);
  const errorCategory = safeIdentifier(runtimeContext.errorCategory || "runtime_error", "runtime_error");
  const platform = safeIdentifier(runtimeContext.platform || "web", "web");
  const environment = ENVIRONMENTS.has(runtimeContext.environment) ? runtimeContext.environment : "development";
  const release = sanitizeText(runtimeContext.release || HERDHARBOR_MONITORING_RELEASE, 80);
  const build = sanitizeText(runtimeContext.build || HERDHARBOR_MONITORING_BUILD, 80);
  const os = sanitizeText(runtimeContext.os || "unknown", 60);
  const browser = sanitizeText(runtimeContext.browser || "unknown", 60);
  const deviceClass = sanitizeText(runtimeContext.deviceClass || "unknown", 30);

  const sanitized = {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform || "javascript",
    level: event.level,
    logger: event.logger ? safeIdentifier(event.logger, "herdharbor") : "herdharbor",
    release,
    environment,
    message: event.message ? sanitizeText(event.message) : undefined,
    exception: event.exception?.values ? {
      values: event.exception.values.slice(0, 3).map((exception) => ({
        type: sanitizeText(exception?.type || "Error", 100),
        value: sanitizeText(exception?.value || "Unexpected application error"),
        mechanism: exception?.mechanism ? {
          handled: typeof exception.mechanism.handled === "boolean" ? exception.mechanism.handled : undefined,
          type: exception.mechanism.type ? safeIdentifier(exception.mechanism.type, "generic") : undefined
        } : undefined,
        stacktrace: exception?.stacktrace?.frames ? {
          frames: exception.stacktrace.frames.slice(-60).map(sanitizeFrame).filter(Boolean)
        } : undefined
      }))
    } : undefined,
    breadcrumbs: Array.isArray(event.breadcrumbs)
      ? event.breadcrumbs.map(sanitizeBreadcrumb).filter(Boolean).slice(-30)
      : undefined,
    request: event.request ? {
      method: event.request.method ? sanitizeText(event.request.method, 12) : undefined,
      url: event.request.url ? sanitizeUrl(event.request.url) : undefined
    } : undefined,
    user: runtimeContext.anonymousUserId ? { id: runtimeContext.anonymousUserId } : undefined,
    tags: {
      hh_module: moduleName,
      hh_error_category: errorCategory,
      hh_reference: referenceId,
      hh_build: build,
      hh_platform: platform,
      hh_os: os,
      hh_browser: browser,
      hh_device_class: deviceClass
    },
    contexts: {
      herdharbor: {
        module: moduleName,
        error_category: errorCategory,
        reference_id: referenceId,
        build,
        platform,
        os,
        browser,
        device_class: deviceClass
      }
    },
    extra: sanitizeDiagnosticMetadata(event.extra || {}),
    fingerprint: ["herdharbor", moduleName, errorCategory, sanitizeText(event.exception?.values?.[0]?.type || "error", 80)]
  };

  return sanitized;
}

export function createReferenceId(runtime = globalThis) {
  try {
    const bytes = new Uint8Array(4);
    runtime?.crypto?.getRandomValues?.(bytes);
    if (bytes.some((value) => value !== 0)) {
      return `HH-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    }
  } catch {}
  const fallback = Math.floor((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)
    .toString(16)
    .padStart(8, "0")
    .slice(-8)
    .toUpperCase();
  return `HH-${fallback}`;
}

function coarseOs(runtime) {
  const ua = String(runtime?.navigator?.userAgent || "");
  const platform = String(runtime?.navigator?.userAgentData?.platform || runtime?.navigator?.platform || "");
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua) || /iPhone|iPad|iPod/i.test(platform)) return "iOS";
  if (/windows/i.test(ua) || /Win/i.test(platform)) return "Windows";
  if (/macintosh|mac os/i.test(ua) || /Mac/i.test(platform)) return "macOS";
  if (/linux/i.test(ua) || /Linux/i.test(platform)) return "Linux";
  return "unknown";
}

function coarseBrowser(runtime) {
  const ua = String(runtime?.navigator?.userAgent || "");
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) || /crios\//i.test(ua)) return "Chromium";
  if (/safari\//i.test(ua) && !/chrome|crios|android/i.test(ua)) return "Safari";
  return "WebView/Browser";
}

function coarseDeviceClass(runtime) {
  const ua = String(runtime?.navigator?.userAgent || "");
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobile|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

export function detectPlatform(runtime = globalThis) {
  try {
    if (runtime?.Capacitor?.isNativePlatform?.()) {
      const nativePlatform = runtime.Capacitor.getPlatform?.();
      if (nativePlatform === "ios") return "ios-capacitor";
    }
  } catch {}
  const referrer = String(runtime?.document?.referrer || "");
  if (referrer.startsWith("android-app://com.ebrllc.herdharbor")) return "android-twa";
  try {
    if (runtime?.matchMedia?.("(display-mode: standalone)")?.matches || runtime?.navigator?.standalone === true) return "pwa";
  } catch {}
  return "web";
}

export function detectEnvironment(config = {}, runtime = globalThis) {
  const configured = String(config.environment || "").toLowerCase();
  if (ENVIRONMENTS.has(configured)) return configured;
  const hostname = String(runtime?.location?.hostname || "").toLowerCase();
  if (hostname === "app.herdharbor.com") return "production";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) return "development";
  return "development";
}

async function anonymousHash(value, runtime = globalThis) {
  const source = `herdharbor-monitoring-v1|${String(value || "")}`;
  try {
    const subtle = runtime?.crypto?.subtle;
    const Encoder = runtime?.TextEncoder || globalThis.TextEncoder;
    if (subtle?.digest && Encoder) {
      const digest = await subtle.digest("SHA-256", new Encoder().encode(source));
      return `anon-${Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {}
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `anon-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function classifyRuntimeError(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  if (/quota|storage|indexeddb|localstorage/.test(`${name} ${message}`)) return "storage_failure";
  if (/json|serialize|serialization|cyclic|circular/.test(`${name} ${message}`)) return "serialization_failure";
  return "runtime_error";
}

function moduleFromHash(runtime) {
  const route = String(runtime?.location?.hash || "").replace(/^#/, "").split(/[?&/]/, 1)[0].toLowerCase();
  const aliases = {
    litters: "births-litters",
    births: "births-litters",
    breeding: "breeding",
    animals: "animals",
    pedigrees: "pedigrees",
    health: "health",
    shows: "shows",
    production: "production",
    sales: "sales",
    finance: "finance",
    budgeting: "finance",
    tasks: "tasks",
    sync: "sync",
    dashboard: "dashboard"
  };
  return aliases[route] || (MODULE_SET.has(route) ? route : "dashboard");
}

function failureMessage(category) {
  if (category === "upload_failure" || category === "download_failure" || category === "network_unavailable") {
    return "Cloud synchronization operation failed";
  }
  if (category.includes("authentication") || category.includes("session") || category.includes("auth")) {
    return "Authentication operation failed";
  }
  if (category.includes("storage") || category.includes("serialization")) return "Local persistence operation failed";
  if (category.includes("import") || category.includes("export")) return "Import or export operation failed";
  return "Unexpected HerdHarbor operation failed";
}

export function createHerdHarborMonitoring(sentrySdk, runtime = globalThis) {
  const state = {
    initialized: false,
    enabled: false,
    module: "dashboard",
    environment: "development",
    release: HERDHARBOR_MONITORING_RELEASE,
    build: HERDHARBOR_MONITORING_BUILD,
    platform: detectPlatform(runtime),
    os: coarseOs(runtime),
    browser: coarseBrowser(runtime),
    deviceClass: coarseDeviceClass(runtime),
    anonymousUserId: "",
    enableTestCrash: false,
    dedupe: new Map(),
    hourly: new Map(),
    lastReferenceId: "",
    config: {},
    installedBrowserInstrumentation: false,
    cloudWrapped: false,
    spreadsheetWrapped: false
  };

  function currentContext(referenceId = "", errorCategory = "runtime_error") {
    return {
      runtime,
      module: state.module,
      environment: state.environment,
      release: state.release,
      build: state.build,
      platform: state.platform,
      os: state.os,
      browser: state.browser,
      deviceClass: state.deviceClass,
      anonymousUserId: state.anonymousUserId,
      referenceId,
      errorCategory
    };
  }

  function canReport(key, category) {
    const now = Date.now();
    const offline = category === "network_unavailable";
    const dedupeWindow = offline ? 15 * 60_000 : 60_000;
    const last = state.dedupe.get(key) || 0;
    if (now - last < dedupeWindow) return false;
    state.dedupe.set(key, now);

    const bucket = Math.floor(now / 3_600_000);
    const hourlyKey = `${bucket}:${key}`;
    const count = state.hourly.get(hourlyKey) || 0;
    if (count >= 5) return false;
    state.hourly.set(hourlyKey, count + 1);
    for (const storedKey of state.hourly.keys()) {
      if (!storedKey.startsWith(`${bucket}:`)) state.hourly.delete(storedKey);
    }
    return true;
  }

  function init(config = {}) {
    if (state.initialized) return state.enabled;
    state.initialized = true;
    state.config = { ...config };
    state.environment = detectEnvironment(config, runtime);
    state.release = sanitizeText(config.release || HERDHARBOR_MONITORING_RELEASE, 80);
    state.build = sanitizeText(config.build || HERDHARBOR_MONITORING_BUILD, 80);
    state.platform = detectPlatform(runtime);
    state.enableTestCrash = Boolean(config.enableTestCrash) && state.environment !== "production";

    const dsn = typeof config.dsn === "string" ? config.dsn.trim() : "";
    if (!dsn || !sentrySdk?.init) {
      state.enabled = false;
      return false;
    }

    try {
      sentrySdk.init({
        dsn,
        environment: state.environment,
        release: state.release,
        sendDefaultPii: false,
        enableLogs: false,
        tracesSampleRate: 0,
        sampleRate: 1,
        maxBreadcrumbs: 30,
        attachStacktrace: true,
        normalizeDepth: 3,
        defaultIntegrations: (integrations) => integrations.filter((integration) => {
          const name = String(integration?.name || "");
          return !["Breadcrumbs", "GlobalHandlers", "TryCatch", "Replay", "BrowserTracing"].some((blocked) => name.includes(blocked));
        }),
        beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb),
        beforeSend: (event) => sanitizeSentryEvent(event, currentContext(
          event?.tags?.hh_reference || state.lastReferenceId || createReferenceId(runtime),
          event?.tags?.hh_error_category || "runtime_error"
        ))
      });
      state.enabled = true;
      sentrySdk.setTag?.("hh_platform", state.platform);
      sentrySdk.setTag?.("hh_build", state.build);
      sentrySdk.setTag?.("hh_module", state.module);
      sentrySdk.setContext?.("herdharbor", sanitizeDiagnosticMetadata({
        module: state.module,
        platform: state.platform,
        environment: state.environment,
        release: state.release,
        build: state.build,
        os: state.os,
        browser: state.browser,
        device_class: state.deviceClass
      }));
      return true;
    } catch {
      state.enabled = false;
      return false;
    }
  }

  function setModule(moduleName) {
    const next = MODULE_SET.has(moduleName) ? moduleName : "dashboard";
    state.module = next;
    if (state.enabled) {
      try { sentrySdk.setTag?.("hh_module", next); } catch {}
    }
    return next;
  }

  async function setUser(internalAnonymousAccountId) {
    if (!internalAnonymousAccountId) {
      state.anonymousUserId = "";
      if (state.enabled) {
        try { sentrySdk.setUser?.(null); } catch {}
      }
      return "";
    }
    state.anonymousUserId = await anonymousHash(internalAnonymousAccountId, runtime);
    if (state.enabled) {
      try { sentrySdk.setUser?.({ id: state.anonymousUserId }); } catch {}
    }
    return state.anonymousUserId;
  }

  function setContext(name, metadata = {}) {
    const contextName = safeIdentifier(name, "context");
    if (isSensitiveKey(contextName)) return false;
    const safe = sanitizeDiagnosticMetadata(metadata);
    if (state.enabled) {
      try { sentrySdk.setContext?.(`herdharbor.${contextName}`, safe); } catch {}
    }
    return safe;
  }

  function addBreadcrumb({ module = state.module, action = "action", result = "", metadata = {} } = {}) {
    const safeModule = MODULE_SET.has(module) ? module : state.module;
    const safeAction = safeIdentifier(action, "action");
    const safeData = sanitizeDiagnosticMetadata({
      ...metadata,
      module: safeModule,
      operation: safeAction,
      result: result ? safeIdentifier(result, "unknown") : undefined
    });
    if (state.enabled) {
      try {
        sentrySdk.addBreadcrumb?.({
          category: "herdharbor.action",
          message: safeAction,
          level: result === "failure" ? "warning" : "info",
          data: safeData
        });
      } catch {}
    }
    return { category: "herdharbor.action", message: safeAction, data: safeData };
  }

  function captureError(error, options = {}) {
    const category = safeIdentifier(options.errorCategory || classifyRuntimeError(error), "runtime_error");
    const moduleName = MODULE_SET.has(options.module) ? options.module : state.module;
    const safeMessage = sanitizeText(error?.message || error || failureMessage(category), 240);
    const errorType = sanitizeText(error?.name || "Error", 80);
    const dedupeKey = `${moduleName}|${category}|${errorType}|${safeMessage}`;
    const referenceId = createReferenceId(runtime);
    state.lastReferenceId = referenceId;
    if (!canReport(dedupeKey, category)) return { captured: false, suppressed: true, referenceId };

    if (!state.enabled) return { captured: false, suppressed: false, referenceId, reason: "monitoring-disabled" };

    let eventId = "";
    try {
      const originalModule = state.module;
      state.module = moduleName;
      sentrySdk.withScope?.((scope) => {
        scope.setTag?.("hh_module", moduleName);
        scope.setTag?.("hh_error_category", category);
        scope.setTag?.("hh_reference", referenceId);
        scope.setTag?.("hh_build", state.build);
        scope.setTag?.("hh_platform", state.platform);
        scope.setFingerprint?.(["herdharbor", moduleName, category, errorType]);
        const safeMeta = sanitizeDiagnosticMetadata(options.metadata || {});
        if (Object.keys(safeMeta).length) scope.setContext?.("herdharbor.operation", safeMeta);
        eventId = sentrySdk.captureException?.(error instanceof Error ? error : new Error(safeMessage)) || "";
      });
      state.module = originalModule;
      return { captured: true, suppressed: false, referenceId, eventId };
    } catch {
      return { captured: false, suppressed: false, referenceId, reason: "monitoring-unavailable" };
    }
  }

  function captureMessage(message, options = {}) {
    const category = safeIdentifier(options.errorCategory || "operational_failure", "operational_failure");
    const moduleName = MODULE_SET.has(options.module) ? options.module : state.module;
    const safeMessage = sanitizeText(message || failureMessage(category), 240);
    const dedupeKey = `${moduleName}|${category}|message|${safeMessage}`;
    const referenceId = createReferenceId(runtime);
    state.lastReferenceId = referenceId;
    if (!canReport(dedupeKey, category)) return { captured: false, suppressed: true, referenceId };
    if (!state.enabled) return { captured: false, suppressed: false, referenceId, reason: "monitoring-disabled" };

    try {
      let eventId = "";
      sentrySdk.withScope?.((scope) => {
        scope.setTag?.("hh_module", moduleName);
        scope.setTag?.("hh_error_category", category);
        scope.setTag?.("hh_reference", referenceId);
        scope.setTag?.("hh_build", state.build);
        scope.setTag?.("hh_platform", state.platform);
        scope.setFingerprint?.(["herdharbor", moduleName, category, safeIdentifier(options.code || "handled", "handled")]);
        const safeMeta = sanitizeDiagnosticMetadata(options.metadata || {});
        if (Object.keys(safeMeta).length) scope.setContext?.("herdharbor.operation", safeMeta);
        eventId = sentrySdk.captureMessage?.(safeMessage, options.level || "error") || "";
      });
      return { captured: true, suppressed: false, referenceId, eventId };
    } catch {
      return { captured: false, suppressed: false, referenceId, reason: "monitoring-unavailable" };
    }
  }

  function captureOperationalFailure(errorCategory, metadata = {}, error = null) {
    const category = safeIdentifier(errorCategory, "operational_failure");
    if (category === "network_unavailable" && runtime?.navigator?.onLine === false) {
      addBreadcrumb({ module: metadata.module || state.module, action: metadata.operation || "offline", result: "failure", metadata: { ...metadata, error_category: category, online: false } });
    }
    return error
      ? captureError(error, { module: metadata.module, errorCategory: category, metadata })
      : captureMessage(failureMessage(category), { module: metadata.module, errorCategory: category, metadata, code: category });
  }

  function instrumentCloud() {
    const cloud = runtime?.HerdHarborCloud;
    if (!cloud || state.cloudWrapped) return false;
    state.cloudWrapped = true;

    if (typeof cloud.syncNow === "function" && !cloud.syncNow.__hhMonitoringWrapped) {
      const originalSyncNow = cloud.syncNow.bind(cloud);
      const wrapped = async (...args) => {
        setModule("sync");
        addBreadcrumb({ module: "sync", action: "upload_changes" });
        try {
          const result = await originalSyncNow(...args);
          if (!result) {
            const details = typeof cloud.getSyncDetails === "function" ? cloud.getSyncDetails() : {};
            const category = runtime?.navigator?.onLine === false
              ? "network_unavailable"
              : details?.conflict
                ? "conflict_failure"
                : details?.signedIn === false
                  ? "authentication_failure"
                  : "upload_failure";
            captureOperationalFailure(category, {
              module: "sync",
              operation: "cloud_upload",
              result: "failure",
              online: runtime?.navigator?.onLine !== false
            });
          } else {
            addBreadcrumb({ module: "sync", action: "upload_changes", result: "success" });
          }
          return result;
        } catch (error) {
          captureOperationalFailure("unexpected_sync_exception", {
            module: "sync",
            operation: "cloud_upload",
            result: "failure",
            online: runtime?.navigator?.onLine !== false
          }, error);
          throw error;
        }
      };
      wrapped.__hhMonitoringWrapped = true;
      cloud.syncNow = wrapped;
    }

    if (typeof cloud.downloadSafetyBackup === "function" && !cloud.downloadSafetyBackup.__hhMonitoringWrapped) {
      const originalBackup = cloud.downloadSafetyBackup.bind(cloud);
      const wrappedBackup = async (...args) => {
        setModule("backup");
        addBreadcrumb({ module: "backup", action: "create_backup" });
        try {
          const result = await originalBackup(...args);
          addBreadcrumb({ module: "backup", action: "create_backup", result: "success" });
          return result;
        } catch (error) {
          captureOperationalFailure("backup_failure", { module: "backup", operation: "backup_export", result: "failure" }, error);
          throw error;
        }
      };
      wrappedBackup.__hhMonitoringWrapped = true;
      cloud.downloadSafetyBackup = wrappedBackup;
    }

    try {
      const session = cloud.getSession?.();
      if (session?.user?.id) setUser(session.user.id);
    } catch {}
    return true;
  }

  function instrumentSpreadsheet() {
    const spreadsheet = runtime?.HerdHarborSpreadsheet;
    if (!spreadsheet || state.spreadsheetWrapped) return false;
    state.spreadsheetWrapped = true;
    const operations = {
      openImport: ["spreadsheet_import", "import_failure"],
      downloadTemplate: ["spreadsheet_template_export", "export_failure"],
      downloadExport: ["spreadsheet_export", "export_failure"],
      downloadBreedingReport: ["breeding_report_export", "export_failure"],
      downloadProductionReport: ["production_report_export", "export_failure"]
    };

    for (const [methodName, [operation, failureCategory]] of Object.entries(operations)) {
      const original = spreadsheet[methodName];
      if (typeof original !== "function" || original.__hhMonitoringWrapped) continue;
      const wrapped = (...args) => {
        setModule("import-export");
        addBreadcrumb({ module: "import-export", action: operation });
        try {
          const result = original.apply(spreadsheet, args);
          if (result && typeof result.then === "function") {
            return result.then((value) => {
              addBreadcrumb({ module: "import-export", action: operation, result: "success" });
              return value;
            }).catch((error) => {
              captureOperationalFailure(failureCategory, { module: "import-export", operation, result: "failure" }, error);
              throw error;
            });
          }
          addBreadcrumb({ module: "import-export", action: operation, result: "success" });
          return result;
        } catch (error) {
          captureOperationalFailure(failureCategory, { module: "import-export", operation, result: "failure" }, error);
          throw error;
        }
      };
      wrapped.__hhMonitoringWrapped = true;
      spreadsheet[methodName] = wrapped;
    }
    return true;
  }

  function installBrowserInstrumentation() {
    if (state.installedBrowserInstrumentation || !runtime?.addEventListener) return false;
    state.installedBrowserInstrumentation = true;
    setModule(moduleFromHash(runtime));
    addBreadcrumb({ module: state.module, action: "application_startup" });

    runtime.addEventListener("error", (event) => {
      const error = event?.error instanceof Error ? event.error : new Error(sanitizeText(event?.message || "Unhandled JavaScript error"));
      captureError(error, { module: state.module, errorCategory: classifyRuntimeError(error), metadata: { module: state.module, operation: "uncaught_exception", result: "failure" } });
    });

    runtime.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      const error = reason instanceof Error ? reason : new Error(sanitizeText(reason || "Unhandled promise rejection"));
      captureError(error, { module: state.module, errorCategory: "unhandled_rejection", metadata: { module: state.module, operation: "unhandled_rejection", result: "failure" } });
    });

    runtime.addEventListener("hashchange", () => {
      const nextModule = moduleFromHash(runtime);
      if (nextModule !== state.module) {
        setModule(nextModule);
        addBreadcrumb({ module: nextModule, action: "open_module" });
      }
    });

    runtime.document?.addEventListener?.("herdharbor:sync-status", (event) => {
      const detail = event?.detail || {};
      if (detail.type !== "error") return;
      if (detail.online === false) {
        captureOperationalFailure("network_unavailable", { module: "sync", operation: "sync_status", result: "failure", online: false });
        return;
      }
      if (detail.conflict) {
        captureOperationalFailure("conflict_failure", { module: "sync", operation: "sync_status", result: "failure", online: true });
        return;
      }
      const message = String(detail.message || "").toLowerCase();
      const category = /session|sign.?in|auth/.test(message)
        ? "authentication_failure"
        : /load|download|newer cloud/.test(message)
          ? "download_failure"
          : /save|upload|cloud/.test(message)
            ? "upload_failure"
            : "unexpected_sync_exception";
      captureOperationalFailure(category, { module: category === "authentication_failure" ? "account" : "sync", operation: "sync_status", result: "failure", online: true });
    });

    if (runtime.MutationObserver && runtime.document?.documentElement) {
      let previousAuthErrorVisible = false;
      const observer = new runtime.MutationObserver(() => {
        const message = runtime.document.querySelector?.("#hh-auth-root .hh-auth-message.error.show, #hh-auth-root .hh-auth-message.show.error");
        const visible = Boolean(message);
        if (visible && !previousAuthErrorVisible) {
          captureOperationalFailure("login_request_failed", { module: "account", operation: "login_request", result: "failure", online: runtime?.navigator?.onLine !== false });
        }
        previousAuthErrorVisible = visible;
      });
      try { observer.observe(runtime.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] }); } catch {}
    }

    let attempts = 0;
    const timer = runtime.setInterval?.(() => {
      attempts += 1;
      instrumentCloud();
      instrumentSpreadsheet();
      try {
        const session = runtime?.HerdHarborCloud?.getSession?.();
        if (session?.user?.id && !state.anonymousUserId) setUser(session.user.id);
      } catch {}
      if ((state.cloudWrapped && state.spreadsheetWrapped) || attempts >= 40) runtime.clearInterval?.(timer);
    }, 500);
    return true;
  }

  function friendlyErrorMessage(kind = "unexpected", referenceId = state.lastReferenceId) {
    const reference = referenceId ? `\n\nReference: ${referenceId}` : "";
    if (kind === "sync") return `We couldn't sync right now. Your local records remain available. We'll try again when a connection is available.${reference}`;
    if (kind === "save") return `We couldn't save that change. Your previous record remains protected. Please try again.${reference}`;
    return `Something went wrong. Your records remain protected. Please try again.${reference}`;
  }

  const api = {
    init,
    captureError,
    captureMessage,
    captureOperationalFailure,
    addBreadcrumb,
    setModule,
    setUser,
    setContext,
    installBrowserInstrumentation,
    instrumentCloud,
    instrumentSpreadsheet,
    friendlyErrorMessage,
    isEnabled: () => state.enabled,
    getStatus: () => ({
      initialized: state.initialized,
      enabled: state.enabled,
      environment: state.environment,
      release: state.release,
      build: state.build,
      platform: state.platform,
      module: state.module,
      userCorrelated: Boolean(state.anonymousUserId)
    }),
    __test: {
      state,
      classifyRuntimeError,
      moduleFromHash,
      anonymousHash
    }
  };

  Object.defineProperty(api, "testCrash", {
    enumerable: true,
    get() {
      if (!state.enableTestCrash) return undefined;
      return () => {
        setModule("dashboard");
        addBreadcrumb({ module: "dashboard", action: "controlled_monitoring_test" });
        return captureError(new Error("HerdHarbor controlled monitoring test"), {
          module: "dashboard",
          errorCategory: "controlled_test",
          metadata: { module: "dashboard", operation: "controlled_test", result: "failure" }
        });
      };
    }
  });

  return api;
}
