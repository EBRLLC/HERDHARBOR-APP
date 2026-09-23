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
  assert.match(build,/AUTH_WATCHDOG_MS\s*=\s*15000/);
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
