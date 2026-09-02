"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-release-v1.6.1.js"), "utf8");
let registeredCallback = null;
let createCalls = 0;

const client = {
  auth: {
    onAuthStateChange(callback) {
      registeredCallback = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    }
  }
};

const context = {
  console,
  setTimeout,
  clearTimeout,
  localStorage: { getItem() { return null; } },
  document: {
    readyState: "loading",
    documentElement: { dataset: {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return null; }
  }
};
context.window = context;
context.window.supabase = {
  createClient(...args) {
    createCalls += 1;
    assert.equal(args[0], "url");
    return client;
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "herdharbor-release-v1.6.1.js" });

assert.equal(context.window.__HH_SUPABASE_AUTH_DEADLOCK_GUARD__, true, "the auth deadlock guard installs before cloud startup");

const guardedClient = context.window.supabase.createClient("url", "key");
assert.equal(createCalls, 1, "the wrapped createClient delegates exactly once");
assert.equal(guardedClient, client, "the wrapped createClient preserves the original client");

const observations = [];
let insideAuthNotification = true;
guardedClient.auth.onAuthStateChange((event, session) => {
  observations.push({ event, userId: session.user.id, insideAuthNotification });
});

assert.equal(typeof registeredCallback, "function", "the underlying Supabase auth listener is registered");
registeredCallback("SIGNED_IN", { user: { id: "user-1" } });
assert.deepEqual(observations, [], "HerdHarbor does not run application hydration inside the Supabase auth callback");
insideAuthNotification = false;

setTimeout(() => {
  assert.deepEqual(observations, [
    { event: "SIGNED_IN", userId: "user-1", insideAuthNotification: false }
  ], "the SIGNED_IN work runs on the next task after Supabase releases its auth lock");
  console.log("Alpha v1.6.7 sign-in auth deadlock regression test passed");
}, 10);
