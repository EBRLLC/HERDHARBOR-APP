"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-build.js"), "utf8");

test("public release identity remains v1.8.1", () => {
  assert.equal(source.includes('version: "1.8.1"'), true);
});

test("web sign-in bypasses Supabase client auth locks", () => {
  assert.equal(source.includes("getIsolatedSignInClient"), false);
  assert.equal(source.includes("signInWithPassword"), false);
  assert.equal(source.includes("/auth/v1/token?grant_type=password"), true);
  assert.equal(source.includes("function requestPasswordSession(email, password)"), true);
  assert.equal(source.includes("isolatedAuthFetch("), true);
});

test("password token request uses the project publishable key", () => {
  assert.equal(source.includes("apikey: SUPABASE_PUBLISHABLE_KEY"), true);
  assert.equal(source.includes("Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`"), true);
  assert.equal(source.includes('body: JSON.stringify({ email, password })'), true);
});

test("authenticated session is written to Supabase canonical storage", () => {
  assert.equal(source.includes('const SUPABASE_PROJECT_REF = "okynebbksifqppwicghj"'), true);
  assert.equal(source.includes("const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`"), true);
  assert.equal(source.includes("storage.setItem(SUPABASE_AUTH_STORAGE_KEY, serialized)"), true);
  assert.equal(source.includes("storage.getItem(SUPABASE_AUTH_STORAGE_KEY)"), true);
  assert.equal(source.includes("persisted?.access_token === session.access_token"), true);
  assert.equal(source.includes("persisted?.refresh_token === session.refresh_token"), true);
  assert.equal(source.includes("persisted?.user?.id === session.user.id"), true);
});

test("session normalization requires both tokens and a user", () => {
  assert.equal(source.includes("!payload?.access_token || !payload?.refresh_token || !payload?.user?.id"), true);
  assert.equal(source.includes("Math.floor(Date.now() / 1000) + expiresIn"), true);
});

test("web sign-in bridge bypasses legacy submit handler", () => {
  assert.equal(source.includes('form.id !== "hh-signin-form"'), true);
  assert.equal(source.includes("event.preventDefault();"), true);
  assert.equal(source.includes("event.stopImmediatePropagation();"), true);
  assert.equal(source.includes("void isolatedPasswordSignIn(form);"), true);
});

test("web sign-in does not require Supabase library initialization", () => {
  const start = source.indexOf("function installWebSignInSessionBridge()");
  const end = source.indexOf("root.HerdHarborAuthResilience", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.equal(block.includes("root.supabase"), false);
  assert.equal(block.includes("createClient"), false);
});

test("form is re-enabled on failure but stays locked while reload is scheduled", () => {
  assert.equal(source.includes("let reloadScheduled = false;"), true);
  assert.equal(source.includes("reloadScheduled = true;"), true);
  assert.equal(source.includes("if (!reloadScheduled) setAuthFormBusy(form, false);"), true);
});

test("bridge still installs before later runtime assets", () => {
  const install = source.indexOf("installWebSignInSessionBridge();");
  const dynamicAssets = source.indexOf("const target = document.head");
  assert.ok(install >= 0);
  assert.ok(dynamicAssets > install);
});
