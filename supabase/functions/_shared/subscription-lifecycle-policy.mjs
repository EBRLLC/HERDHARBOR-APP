export const EVENT_PROCESSING_LEASE_MS = 300000;

const LIVE = new Set(["active", "trialing", "past_due"]);
const TERMINAL = new Set(["canceled", "incomplete_expired", "unpaid"]);

export function timestampMs(value) {
  const parsed = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isProcessingLeaseStale(startedAt, nowMs = Date.now(), leaseMs = EVENT_PROCESSING_LEASE_MS) {
  const started = timestampMs(startedAt);
  return !started || started <= Number(nowMs) - Number(leaseMs);
}

export function isSubscriptionUpdateStale(input = {}) {
  const storedTime = timestampMs(input.storedProviderUpdatedAt);
  const eventTime = timestampMs(input.eventOccurredAt);
  if (storedTime > eventTime) return true;

  const different = Boolean(input.existingSubscriptionId)
    && Boolean(input.incomingSubscriptionId)
    && String(input.existingSubscriptionId) !== String(input.incomingSubscriptionId);
  if (!different) return false;

  return LIVE.has(String(input.existingStatus || "").toLowerCase())
    || TERMINAL.has(String(input.incomingStatus || "").toLowerCase());
}

export function shouldIgnorePaymentFailure(input = {}) {
  if (timestampMs(input.storedProviderUpdatedAt) > timestampMs(input.eventOccurredAt)) return true;
  return TERMINAL.has(String(input.currentStatus || "").toLowerCase());
}
