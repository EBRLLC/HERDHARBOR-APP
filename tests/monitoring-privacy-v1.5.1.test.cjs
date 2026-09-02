"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const core = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-core.mjs")).href);
  const privacy = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-privacy.mjs")).href);

  const sensitiveValues = [
    "hunter2-password",
    "secret-access-token-123",
    "secret-refresh-token-456",
    "secret-session-token-789",
    "Bearer very-secret-auth-header",
    "customer@example.com",
    "859-555-1212",
    "123 Private Farm Road",
    "4111111111111111",
    "Judy medical note private",
    "Animal Judy private notes",
    "Farm private notes",
    "spreadsheet private row",
    "backup private content"
  ];

  const rawEvent = {
    event_id: "abc123",
    level: "error",
    message: `Save failed for Judy: ${sensitiveValues[5]} ${sensitiveValues[1]}`,
    exception: {
      values: [{
        type: "TypeError",
        value: `Could not save Judy with health notes ${sensitiveValues[9]}`,
        stacktrace: {
          frames: [{
            filename: "https://app.herdharbor.com/index.html?access_token=secret-access-token-123&email=customer@example.com",
            abs_path: "https://app.herdharbor.com/index.html?token=secret-session-token-789",
            function: "saveAnimal",
            lineno: 123,
            colno: 4,
            vars: { password: sensitiveValues[0] },
            context_line: sensitiveValues[10]
          }]
        }
      }]
    },
    request: {
      method: "POST",
      url: "https://okynebbksifqppwicghj.supabase.co/rest/v1/herdharbor_user_data?access_token=secret-access-token-123&email=customer@example.com",
      headers: {
        Authorization: sensitiveValues[4],
        Cookie: "session=secret-session-token-789"
      },
      data: {
        app_state: sensitiveValues[13],
        customer: sensitiveValues[5]
      }
    },
    user: {
      id: "raw-user-id-must-not-be-used",
      email: sensitiveValues[5],
      username: "Private Farmer",
      ip_address: "192.0.2.1"
    },
    extra: {
      password: sensitiveValues[0],
      access_token: sensitiveValues[1],
      refresh_token: sensitiveValues[2],
      session_token: sensitiveValues[3],
      customer_email: sensitiveValues[5],
      customer_phone: sensitiveValues[6],
      customer_address: sensitiveValues[7],
      financial: "checking balance 1234",
      payment: sensitiveValues[8],
      health: sensitiveValues[9],
      animal: { name: "Judy", notes: sensitiveValues[10] },
      farm_notes: sensitiveValues[11],
      notes: "generic free-text private notes",
      body: "request body contents",
      backup: sensitiveValues[13],
      spreadsheet: sensitiveValues[12],
      record_count: 4,
      operation: "cloud_upload",
      result: "failure"
    },
    contexts: {
      session: { token: sensitiveValues[3] },
      customer: { email: sensitiveValues[5] },
      financial: { amount: 999.99 }
    },
    breadcrumbs: [
      {
        category: "ui.click",
        message: "Opened Judy",
        data: { target: "Judy" }
      },
      {
        category: "herdharbor.action",
        message: "save",
        data: {
          module: "animals",
          operation: "save",
          result: "failure",
          record_count: 1,
          notes: "private breadcrumb notes",
          customer_email: sensitiveValues[5]
        }
      }
    ]
  };

  const firstPass = core.sanitizeSentryEvent(rawEvent, {
    module: "animals",
    environment: "test",
    release: "HerdHarbor@1.6.1",
    build: "privacy-test",
    platform: "web",
    os: "Windows",
    browser: "Chromium",
    deviceClass: "desktop",
    anonymousUserId: "anon-safe-user",
    referenceId: "HH-7F2A91C4",
    errorCategory: "storage_failure"
  });
  const sanitized = privacy.hardenSentryEvent(firstPass);

  const serialized = JSON.stringify(sanitized);
  for (const value of sensitiveValues) {
    assert.ok(!serialized.includes(value), `sensitive value must be removed: ${value}`);
  }
  for (const forbidden of [
    "raw-user-id-must-not-be-used",
    "Private Farmer",
    "192.0.2.1",
    "private breadcrumb notes",
    "request body contents",
    "checking balance 1234",
    "generic free-text private notes",
    "Opened Judy",
    "Judy"
  ]) {
    assert.ok(!serialized.includes(forbidden), `sensitive diagnostic content must be absent: ${forbidden}`);
  }

  assert.equal(sanitized.user.id, "anon-safe-user");
  assert.deepEqual(sanitized.request, {
    method: "POST",
    url: "https://okynebbksifqppwicghj.supabase.co/rest/v1/herdharbor_user_data"
  });
  assert.equal(sanitized.extra.record_count, 4);
  assert.equal(sanitized.extra.operation, "cloud_upload");
  assert.equal(sanitized.extra.result, "failure");
  assert.equal(sanitized.breadcrumbs.length, 1, "only explicit HerdHarbor action breadcrumbs survive");
  assert.equal(sanitized.breadcrumbs[0].message, "save");
  assert.equal(sanitized.breadcrumbs[0].data.notes, undefined);
  assert.equal(sanitized.contexts.herdharbor.reference_id, "HH-7F2A91C4");
  assert.match(sanitized.tags.hh_reference, /^HH-[A-F0-9]{8}$/);
  assert.equal(sanitized.exception.values[0].value, "Local persistence operation failed");
  assert.ok(!sanitized.exception.values[0].stacktrace.frames[0].filename.includes("?"));
  assert.equal(sanitized.exception.values[0].stacktrace.frames[0].vars, undefined);

  const safeBreadcrumb = privacy.hardenBreadcrumb({
    category: "herdharbor.action",
    message: "upload_changes",
    data: {
      module: "sync",
      operation: "cloud_upload",
      result: "failure",
      record_count: 4,
      notes: "do not send this",
      access_token: "secret"
    }
  });
  assert.equal(safeBreadcrumb.data.record_count, 4);
  assert.equal(safeBreadcrumb.data.notes, undefined);
  assert.equal(safeBreadcrumb.data.access_token, undefined);

  assert.equal(privacy.hardenBreadcrumb({ category: "ui.click", message: "Judy" }), null);
  assert.equal(privacy.hardenBreadcrumb({ category: "fetch", data: { url: "https://private" } }), null);

  console.log("Alpha v1.6.5 monitoring privacy scrubbing tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
