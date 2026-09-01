"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const cloud = read("herdharbor-cloud.js");

class MemoryStorage {
  constructor(shared = new Map()) { this.shared = shared; }
  getItem(key) { return this.shared.has(key) ? this.shared.get(key) : null; }
  setItem(key, value) { this.shared.set(key, String(value)); }
  removeItem(key) { this.shared.delete(key); }
}

function browserContext(storage) {
  const listeners = new Map();
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const document = {
    documentElement: { dataset: {} },
    body: { appendChild() {} },
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    },
    createElement() { throw new Error("No dialog is needed by the offline entitlement test."); }
  };
  const context = { console, Date, JSON, Promise, Set, CustomEvent, document, localStorage: storage };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("herdharbor-release-v1.6.1.js"), context, { filename: "herdharbor-release-v1.6.1.js" });
  vm.runInContext(read("herdharbor-membership-v1.6.1.js"), context, { filename: "herdharbor-membership-v1.6.1.js" });
  vm.runInContext(read("herdharbor-access-cache-v1.6.1.js"), context, { filename: "herdharbor-access-cache-v1.6.1.js" });
  return context;
}

const shared = new Map();
const firstLaunch = browserContext(new MemoryStorage(shared));
const cache = firstLaunch.HerdHarborAccessCache;
const juniorId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

const juniorOnline = cache.write(juniorId, {
  user_id: juniorId,
  account_role: "user",
  membership_tier: "junior",
  membership_source: "manual_override",
  account_status: "active",
  override_expires_at: null,
  email: "must-not-be-cached@example.com",
  display_name: "Must Not Be Cached",
  token: "must-not-be-cached"
});
assert.equal(juniorOnline.membership_tier, "junior", "successful online Junior access is retained");

const storedJunior = JSON.parse(shared.get(cache.keyFor(juniorId)));
assert.deepEqual(Object.keys(storedJunior).sort(), [
  "account_role",
  "account_status",
  "last_verified_at",
  "membership_source",
  "membership_tier",
  "override_expires_at",
  "user_id",
  "version"
].sort(), "offline cache contains only the minimum entitlement fields");
assert.equal(JSON.stringify(storedJunior).includes("must-not-be-cached"), false);

// A fresh VM represents an installed PWA/TWA restarting while offline.
const offlineRestart = browserContext(new MemoryStorage(shared));
const cachedJunior = offlineRestart.HerdHarborAccessCache.read(juniorId);
assert.equal(cachedJunior.membership_tier, "junior", "Junior survives an offline app restart");
offlineRestart.HerdHarborMembership.applyAccessProfile({ ...cachedJunior, backend_ready: false, offline_cached: true });
const five = Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, status: "Active" }));
assert.equal(
  offlineRestart.HerdHarborMembership.validateAnimalTransition(five, [...five, { id: "a5", status: "Active" }]).allowed,
  false,
  "cached Junior access still blocks the sixth active animal"
);

cache.write("offline-admin", {
  account_role: "admin",
  membership_tier: "member",
  membership_source: "default",
  account_status: "active"
});
const cachedAdmin = offlineRestart.HerdHarborAccessCache.read("offline-admin");
offlineRestart.HerdHarborMembership.applyAccessProfile({ ...cachedAdmin, backend_ready: false, offline_cached: true });
assert.equal(
  offlineRestart.HerdHarborMembership.canAccessAdmin(),
  false,
  "a cached Admin role cannot expose Admin controls until Supabase re-verifies it"
);

cache.write("member-user", {
  account_role: "user",
  membership_tier: "member",
  membership_source: "default",
  account_status: "active"
});
cache.write("founder-user", {
  account_role: "user",
  membership_tier: "founder",
  membership_source: "founder",
  account_status: "active"
});
assert.equal(cache.read("member-user").membership_tier, "member", "Member remains Member offline");
assert.equal(cache.read("founder-user").membership_tier, "founder", "Founder remains Founder offline");

assert.equal(cache.read(otherId), null, "a different signed-in account cannot inherit the Junior cache");
shared.set(cache.keyFor(otherId), JSON.stringify(storedJunior));
assert.equal(cache.read(otherId), null, "an embedded UUID mismatch is rejected even under another account's key");

cache.write("expired-junior", {
  account_role: "user",
  membership_tier: "junior",
  membership_source: "manual_override",
  account_status: "active",
  override_expires_at: "2026-01-01T00:00:00.000Z"
});
const expiredOffline = cache.read("expired-junior");
offlineRestart.HerdHarborMembership.applyAccessProfile({ ...expiredOffline, backend_ready: false, offline_cached: true });
assert.equal(offlineRestart.HerdHarborMembership.getTier(), "member", "an expired offline override resolves to Automatic Member");

const refreshStore = new MemoryStorage();
let verifiedAt = "2026-08-29T12:00:00.000Z";
const refreshCache = cache.__test.create(refreshStore, () => verifiedAt);
refreshCache.write("reconnect-user", {
  account_role: "user",
  membership_tier: "junior",
  membership_source: "manual_override",
  account_status: "active"
});
verifiedAt = "2026-08-29T13:00:00.000Z";
refreshCache.write("reconnect-user", {
  account_role: "user",
  membership_tier: "member",
  membership_source: "default",
  account_status: "active"
});
assert.equal(refreshCache.read("reconnect-user").membership_tier, "member", "reconnect replaces cache with backend truth");
assert.equal(refreshCache.read("reconnect-user").last_verified_at, verifiedAt);

assert.match(cloud, /recordResult\.error \|\| !recordResult\.data[\s\S]*return publishCachedOrFallback\(\)/);
assert.match(cloud, /const initialCachedSnapshot = cached\(\);[\s\S]*publishAccessProfile\(\{[\s\S]*offline_cached: true[\s\S]*\}\);[\s\S]*await Promise\.all/, "known access is enforced before an offline request can time out");
assert.match(cloud, /HerdHarborAccessCache\?\.write\?\.\(userId, authoritative\)/);
assert.match(cloud, /window\.addEventListener\("online", \(\) => \{\s*void loadAccessProfile\(\)/);
assert.match(cloud, /event === "SIGNED_OUT"[\s\S]*publishAccessProfile\(fallbackAccessProfile\(\)\)/, "sign-out clears the in-memory entitlement before another account signs in");
assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/, "farm-state storage remains unchanged");

console.log("Alpha v1.6.1 per-account offline entitlement cache tests passed");
