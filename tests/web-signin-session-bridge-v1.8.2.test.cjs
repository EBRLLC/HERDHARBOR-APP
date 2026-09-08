"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-build.js"), "utf8");

test("public release identity remains v1.8.1", () => {
  assert.match(source, /version:\s*["']1\.8\.1["']/);
});

test("web sign-in bridge uses an isolated persisted Supabase client", () => {
  assert.match(source, /function\s+getIsolatedSignInClient\s*\(/);
  assert.match(source, /persistSession:\s*true/);
  assert.match(source, /autoRefreshToken:\s*false/);
  assert.match(source, /detectSessionInUrl:\s*false/);
  assert.match(source, /global:\s*\{\s*fetch:\s*isolatedAuthFetch\s*\}/);
});

test("web sign-in bridge bypasses the old form handler and reloads only after a valid session", () => {
  assert.match(source, /form\.id\s*!==\s*["']hh-signin-form["']/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /data\?\.session\?\.access_token/);
  assert.match(source, /data\?\.session\?\.user\?\.id/);
  assert.match(source, /Signed in\. Loading your HerdHarbor records/);
  assert.match(source, /root\.location\.replace/);
});

test("isolated password sign-in uses the original native fetch with a bounded request", () => {
  assert.match(source, /function\s+isolatedAuthFetch\s*\(/);
  assert.match(source, /originalFetch\(input,\s*\{\s*\.\.\.\(init\s*\|\|\s*\{\}\),\s*signal:\s*controller\.signal\s*\}\)/);
  assert.match(source, /AUTH_FETCH_TIMEOUT_MS/);
});

test("isolated sign-in always returns form control on error", () => {
  assert.match(source, /catch\s*\(error\)[\s\S]*HerdHarbor isolated web sign-in failed/);
  assert.match(source, /finally\s*\(\)\s*=>|finally\s*\{/);
  assert.match(source, /setAuthFormBusy\(form, false\)/);
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
  assert.doesNotMatch(block, /onAuthStateChange\s*\(/);
});
