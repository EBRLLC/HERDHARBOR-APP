"use strict";

import crypto from "node:crypto";

const dsnText = String(process.env.HERDHARBOR_SENTRY_DSN || "").trim();
if (!dsnText) throw new Error("HERDHARBOR_SENTRY_DSN is required for the controlled delivery check.");

let dsn;
try { dsn = new URL(dsnText); } catch { throw new Error("HERDHARBOR_SENTRY_DSN is not a valid URL."); }
const publicKey = dsn.username;
const projectId = dsn.pathname.split("/").filter(Boolean).at(-1);
if (!publicKey || !projectId) throw new Error("The Sentry DSN must include a public key and project id.");

const eventId = crypto.randomUUID().replace(/-/g, "");
const sentAt = new Date().toISOString();
const endpoint = `${dsn.protocol}//${dsn.host}/api/${encodeURIComponent(projectId)}/envelope/`;
const envelopeHeader = JSON.stringify({
  event_id: eventId,
  sent_at: sentAt,
  dsn: dsnText
});
const itemHeader = JSON.stringify({ type: "event" });
const event = JSON.stringify({
  event_id: eventId,
  timestamp: sentAt,
  platform: "javascript",
  level: "info",
  message: "HerdHarbor controlled production monitoring acceptance",
  release: "HerdHarbor@1.6.6",
  environment: "production",
  tags: {
    module: "release_acceptance",
    build: "completion-debt-1",
    privacy: "synthetic_only"
  }
});
const envelope = `${envelopeHeader}\n${itemHeader}\n${event}\n`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-sentry-envelope",
    "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=herdharbor-release-acceptance/1.6.6`
  },
  body: envelope
});

if (!response.ok) {
  const text = await response.text().catch(() => "");
  throw new Error(`Sentry rejected the controlled event (${response.status}). ${text.slice(0, 300)}`);
}

console.log(`Controlled Sentry event accepted. Event ID: ${eventId}`);
console.log("Payload classification: synthetic-only; no user, farm, animal, customer, request, notes, credentials, or cloud-state data included.");
