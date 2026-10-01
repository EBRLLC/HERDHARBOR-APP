"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("v1.8.4 keeps auth architecture frozen and canonical cloud client singular",()=>{
  const cloud=read("herdharbor-cloud.js");
  const security=read("scripts/repository-security-audit.mjs");
  assert.match(cloud,/window\.supabase\.createClient/);
  assert.match(security,/duplicate browser Supabase client creation/i);
});

test("sign-in startup resilience remains before cloud initialization without unlocking auth",()=>{
  const index=read("index.html");
  assert.ok(index.indexOf("herdharbor-build.js") < index.indexOf("herdharbor-cloud.js"));
  const build=read("herdharbor-build.js");
  assert.match(build,/AUTH_FETCH_TIMEOUT_MS\s*=\s*12000/);
  assert.match(build,/SIGN_IN_WATCHDOG_MS\s*=\s*15000/);
  assert.doesNotMatch(build,/classList\.remove\(["\']hh-auth-locked["\']\)/);
});

test("auth callbacks stay deferred outside Supabase auth notification lock",()=>{
  const guard=read("herdharbor-release-v1.6.1.js");
  assert.match(guard,/__HH_SUPABASE_AUTH_DEADLOCK_GUARD__/);
  assert.match(guard,/setTimeout/);
});

test("registration overlay continues to reuse canonical HerdHarborCloud client",()=>{
  const registration=read("registration-safety-v1.8.1.js");
  assert.match(registration,/HerdHarborCloud/);
  assert.doesNotMatch(registration,/supabase\.createClient\(/);
});

test("existing auth regression gates remain present",()=>{
  for(const file of [
    "tests/auth-freeze-resilience-v1.8.2.test.cjs",
    "tests/auth-freeze-resilience-manifest-v1.8.2.test.cjs",
    "tests/auth-signin-deadlock-v1.6.7.test.cjs"
  ]) assert.equal(fs.existsSync(path.join(root,file)),true,file);
});


test("account switching fences prior local state and removes the retired active-user pointer",()=>{
  const cloud=read("herdharbor-cloud.js");
  assert.match(cloud,/LEGACY_ACTIVE_OWNER_KEY = "herdharbor_active_user_id"/);
  assert.match(cloud,/Local copy retained before authenticated account switch/);
  assert.match(cloud,/async function ensureAuthenticatedAccountBoundary/);
  assert.match(cloud,/preserveActiveForUser\([\s\S]*policy\.staleOwnerId/);
  assert.match(cloud,/clearActiveUserData\(\);[\s\S]*safeStorageSet\(ACTIVE_OWNER_KEY, authenticatedUserId\)/);
  assert.match(cloud,/originalRemoveItem\.call\(localStorage, LEGACY_ACTIVE_OWNER_KEY\)/);
});


test("legacy poisoned browser state gets one-time safe recovery and member-facing refresh",()=>{
  const cloud=read("herdharbor-cloud.js");
  assert.match(cloud,/ACCOUNT_BOUNDARY_RECOVERY_MARKER_PREFIX = "herdharbor_account_boundary_recovery_v1"/);
  assert.match(cloud,/async function runLegacyAccountBoundaryRecovery\(activeSession\)/);
  assert.match(cloud,/allowUnownedQuarantine: !alreadyRecovered/);
  assert.match(cloud,/UNATTRIBUTED_RECOVERY_USER_ID/);
  assert.match(cloud,/recordRecoverySnapshot\([\s\S]*UNATTRIBUTED_RECOVERY_USER_ID/);
  assert.match(cloud,/id="hh-refresh-account-data"/);
  assert.match(cloud,/async function refreshAuthenticatedAccountData\(\)/);
  assert.match(cloud,/clearAccountSessionMarkers\(userId\)/);
  assert.doesNotMatch(cloud,/async function initialize\(\) \{[\s\S]{0,500}originalRemoveItem\.call\(localStorage, LEGACY_ACTIVE_OWNER_KEY\)/);
});

test("Phase 3 retires only HerdHarbor shell caches and never performs a site-wide storage wipe",()=>{
  const cloud=read("herdharbor-cloud.js");
  assert.match(cloud,/key\.startsWith\("herdharbor-shell-"\) && key !== CURRENT_SHELL_CACHE_NAME/);
  assert.match(cloud,/navigator\.serviceWorker\?\.getRegistration/);
  assert.doesNotMatch(cloud,/localStorage\.clear\(\)/);
  assert.doesNotMatch(cloud,/sessionStorage\.clear\(\)/);
  assert.doesNotMatch(cloud,/indexedDB\.deleteDatabase/);
});
