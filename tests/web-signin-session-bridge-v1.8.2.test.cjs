"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-build.js"), "utf8");

test("public release identity remains v1.8.1", () => {
  assert.equal(source.includes('version: "1.8.1"'), true);
});

test("web sign-in bridge uses an isolated persisted Supabase client", () => {
  assert.equal(source.includes("function getIsolatedSignInClient()"), true);
  assert.equal(source.includes("persistSession: true"), true);
  assert.equal(source.includes("autoRefreshToken: false"), true);
  assert.equal(source.includes("detectSessionInUrl: false"), true);
  assert.equal(source.includes("global: { fetch: isolatedAuthFetch }"), true);
});

test("web sign-in bridge bypasses the old form handler and reloads only after a valid session", () => {
  assert.equal(source.includes('form.id !== "hh-signin-form"'), true);
  assert.equal(source.includes("event.preventDefault();"), true);
  assert.equal(source.includes("event.stopImmediatePropagation();"), true);
  assert.equal(source.includes("data?.session?.access_token"), true);
  assert.equal(source.includes("data?.session?.user?.id"), true);
  assert.equal(source.includes("Signed in. Loading your HerdHarbor records…"), true);
  assert.equal(source.includes("root.location.replace(url.toString());"), true);
});

test("isolated password sign-in uses the original native fetch with a bounded request", () => {
  assert.equal(source.includes("function isolatedAuthFetch(input, init = {})"), true);
  assert.equal(source.includes("originalFetch(input, { ...(init || {}), signal: controller.signal })"), true);
  assert.equal(source.includes("AUTH_FETCH_TIMEOUT_MS"), true);
});

test("isolated sign-in always returns form control on error", () => {
  assert.equal(source.includes("HerdHarbor isolated web sign-in failed:"), true);
  assert.equal(source.includes("} finally {"), true);
  assert.equal(source.includes("setAuthFormBusy(form, false);"), true);
});

test("bridge is installed before cloud auth can bind its sign-in form", () => {
  const install = source.indexOf("installWebSignInSessionBridge();");
  assert.ok(install >= 0, "web sign-in bridge must install");
  const dynamicAssets = source.indexOf("const target = document.head");
  assert.ok(dynamicAssets > install, "bridge must install before later runtime asset loading");
});

test("isolated sign-in client has no auth-state subscription of its own", () => {
  const start = source.indexOf("function getIsolatedSignInClient");
  const end = source.indexOf("async function isolatedPasswordSignIn", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.equal(block.includes("onAuthStateChange("), false);
});
