"use strict";

const SAFE_META = new Set([
  "operation", "result", "error_category", "record_count", "item_count", "attempt",
  "status_code", "http_status", "storage_type", "file_type", "source", "component",
  "phase", "module", "platform", "environment", "release", "build", "os", "browser",
  "device_class", "reference_id", "mode", "online"
]);

const SENSITIVE_KEY = /(password|passcode|token|authorization|cookie|session|secret|api[_-]?key|email|phone|address|customer|medical|health|treatment|finance|financial|payment|bank|note|description|free[_-]?text|document|photo|backup|spreadsheet|pedigree|request[_-]?body|response[_-]?body|payload|raw[_-]?(value|state)|app[_-]?state|farm|record|animal|name|body|content|field|value)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;
const BEARER = /\bBearer\s+[^\s,;]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function safeText(value, limit = 160) {
  return String(value ?? "")
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT, "[redacted-token]")
    .slice(0, limit);
}

function safeId(value, fallback = "unknown") {
  const id = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return id || fallback;
}

function stripUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(String(value), "https://herdharbor.invalid");
    const pathname = safeText(parsed.pathname, 240);
    return parsed.origin === "https://herdharbor.invalid" ? pathname : `${parsed.origin}${pathname}`;
  } catch {
    return safeText(String(value).split(/[?#]/, 1)[0], 300);
  }
}

function genericMessage(category) {
  const value = String(category || "runtime_error");
  if (/auth|session|login/.test(value)) return "Authentication operation failed";
  if (/upload|download|sync|conflict|network/.test(value)) return "Cloud synchronization operation failed";
  if (/storage|serialization|backup/.test(value)) return "Local persistence operation failed";
  if (/import|export|pdf/.test(value)) return "Import or export operation failed";
  if (/controlled_test/.test(value)) return "HerdHarbor controlled monitoring test";
  if (/startup|service_worker|update_check/.test(value)) return "HerdHarbor startup or update operation failed";
  return "Unexpected HerdHarbor application error";
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalized = String(key).toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!SAFE_META.has(normalized) || SENSITIVE_KEY.test(key)) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) result[normalized] = raw;
    else if (typeof raw === "boolean") result[normalized] = raw;
    else if (typeof raw === "string") result[normalized] = safeText(raw, 100);
  }
  return result;
}

function safeFrame(frame) {
  if (!frame || typeof frame !== "object") return undefined;
  return {
    filename: frame.filename ? stripUrl(frame.filename) : undefined,
    abs_path: frame.abs_path ? stripUrl(frame.abs_path) : undefined,
    function: frame.function ? safeText(frame.function, 120) : undefined,
    module: frame.module ? safeText(frame.module, 100) : undefined,
    lineno: Number.isFinite(frame.lineno) ? frame.lineno : undefined,
    colno: Number.isFinite(frame.colno) ? frame.colno : undefined,
    in_app: typeof frame.in_app === "boolean" ? frame.in_app : undefined
  };
}

export function hardenBreadcrumb(breadcrumb) {
  if (!breadcrumb || breadcrumb.category !== "herdharbor.action") return null;
  return {
    timestamp: breadcrumb.timestamp,
    category: "herdharbor.action",
    type: "default",
    level: ["debug", "info", "warning", "error"].includes(breadcrumb.level) ? breadcrumb.level : "info",
    message: safeId(breadcrumb.message || "action", "action"),
    data: safeMetadata(breadcrumb.data || {})
  };
}

export function hardenSentryEvent(event) {
  if (!event || typeof event !== "object") return null;
  const tags = event.tags && typeof event.tags === "object" ? event.tags : {};
  const category = safeId(tags.hh_error_category || "runtime_error", "runtime_error");
  const safeTags = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!String(key).startsWith("hh_")) continue;
    if (SENSITIVE_KEY.test(key)) continue;
    safeTags[safeId(key, "tag")] = safeText(value, 100);
  }

  const sourceContext = event.contexts?.herdharbor || {};
  const context = safeMetadata(sourceContext);
  const userId = typeof event.user?.id === "string" && event.user.id.startsWith("anon-")
    ? safeText(event.user.id, 80)
    : undefined;

  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform || "javascript",
    level: event.level,
    logger: event.logger ? safeId(event.logger, "herdharbor") : "herdharbor",
    release: event.release ? safeText(event.release, 80) : undefined,
    environment: event.environment ? safeId(event.environment, "development") : undefined,
    message: event.message ? genericMessage(category) : undefined,
    exception: event.exception?.values ? {
      values: event.exception.values.slice(0, 3).map((value) => ({
        type: safeText(value?.type || "Error", 80),
        value: genericMessage(category),
        mechanism: value?.mechanism ? {
          handled: typeof value.mechanism.handled === "boolean" ? value.mechanism.handled : undefined,
          type: value.mechanism.type ? safeId(value.mechanism.type, "generic") : undefined
        } : undefined,
        stacktrace: value?.stacktrace?.frames ? {
          frames: value.stacktrace.frames.slice(-60).map(safeFrame).filter(Boolean)
        } : undefined
      }))
    } : undefined,
    breadcrumbs: Array.isArray(event.breadcrumbs)
      ? event.breadcrumbs.map(hardenBreadcrumb).filter(Boolean).slice(-30)
      : undefined,
    request: event.request ? {
      method: event.request.method ? safeText(event.request.method, 12) : undefined,
      url: event.request.url ? stripUrl(event.request.url) : undefined
    } : undefined,
    user: userId ? { id: userId } : undefined,
    tags: safeTags,
    contexts: { herdharbor: context },
    extra: safeMetadata(event.extra || {}),
    fingerprint: Array.isArray(event.fingerprint)
      ? event.fingerprint.slice(0, 5).map((part) => safeId(part, "group"))
      : undefined
  };
}

export function createPrivacySentryAdapter(sdk) {
  if (!sdk || typeof sdk !== "object") return sdk;
  return new Proxy(sdk, {
    get(target, property, receiver) {
      if (property === "init") {
        return (options = {}) => {
          const existingBeforeSend = options.beforeSend;
          const existingBeforeBreadcrumb = options.beforeBreadcrumb;
          return target.init({
            ...options,
            sendDefaultPii: false,
            enableLogs: false,
            tracesSampleRate: 0,
            beforeBreadcrumb(breadcrumb, hint) {
              const firstPass = existingBeforeBreadcrumb ? existingBeforeBreadcrumb(breadcrumb, hint) : breadcrumb;
              return hardenBreadcrumb(firstPass);
            },
            beforeSend(event, hint) {
              const firstPass = existingBeforeSend ? existingBeforeSend(event, hint) : event;
              return hardenSentryEvent(firstPass);
            }
          });
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

export const __privacyTest = Object.freeze({ safeMetadata, stripUrl, genericMessage, safeText });
