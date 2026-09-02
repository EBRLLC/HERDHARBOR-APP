"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function browserContext() {
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
    createElement() { throw new Error("The limit dialog is not needed by this policy-unit test."); }
  };
  const context = { console, Date, JSON, Promise, Set, CustomEvent, document };
  context.window = context;
  vm.createContext(context);
  return context;
}

const context = browserContext();
vm.runInContext(read("herdharbor-release-v1.6.1.js"), context, { filename: "herdharbor-release-v1.6.1.js" });
vm.runInContext(read("herdharbor-membership-v1.6.1.js"), context, { filename: "herdharbor-membership-v1.6.1.js" });

const policy = context.HerdHarborMembership;
assert.ok(policy, "central membership policy is published");
assert.equal(context.HerdHarborRelease.featureFlags.juniorPlanEnabled, true);
assert.equal(context.HerdHarborRelease.featureFlags.billingEnabled, false);

// No current or newly registered user is silently converted to Junior.
assert.deepEqual(
  [policy.getRole(), policy.getTier(), policy.getSource()],
  ["user", "member", "default"]
);
assert.equal(policy.getEffectiveEntitlements().maxActiveAnimals, null);
assert.equal(policy.getEffectiveEntitlements().features.cloudSync, true);
assert.equal(policy.getEffectiveEntitlements().features.genetics, true);

policy.applyAccessProfile({ account_role: "owner", membership_tier: "member", membership_source: "default", backend_ready: true });
assert.equal(policy.isOwner(), true);
assert.equal(policy.canAccessAdmin(), true);

policy.applyAccessProfile({ account_role: "admin", membership_tier: "junior", membership_source: "manual_override", backend_ready: true });
assert.equal(policy.isAdmin(), true);
assert.equal(policy.canAccessAdmin(), true, "Admin access is based on account role, not billing tier");

policy.applyAccessProfile({ account_role: "admin", membership_tier: "member", membership_source: "default", backend_ready: false, offline_cached: true });
assert.equal(policy.canAccessAdmin(), false, "an offline cached Admin role cannot expose Admin controls without fresh server verification");

policy.applyAccessProfile({ account_role: "admin", account_status: "disabled", membership_tier: "member", membership_source: "default", backend_ready: true });
assert.equal(policy.canAccessAdmin(), false, "disabled accounts cannot enter Admin");

policy.applyAccessProfile({ account_role: "user", membership_tier: "founder", membership_source: "founder" });
assert.equal(policy.canAccessAdmin(), false, "Founder is not an administrative role");
assert.equal(policy.getTier(), "founder");
assert.equal(policy.getEffectiveEntitlements().maxActiveAnimals, null);

const expired = policy.__test.resolveEffectiveMembership({
  membership_tier: "junior",
  membership_source: "manual_override",
  override_expires_at: "2026-01-01T00:00:00.000Z"
}, {}, new Date("2026-08-28T00:00:00.000Z"));
assert.deepEqual(JSON.parse(JSON.stringify(expired)), { tier: "member", source: "default", overrideExpired: true });
assert.deepEqual(JSON.parse(JSON.stringify(policy.resolveProfile({
  membership_tier: "junior",
  membership_source: "manual_override",
  override_expires_at: "2026-01-01T00:00:00.000Z"
}, {}))), { tier: "member", source: "default", overrideExpired: true });
const expiredWithBilling = policy.__test.resolveEffectiveMembership({
  membership_tier: "junior",
  membership_source: "manual_override",
  override_expires_at: "2026-01-01T00:00:00.000Z"
}, { active: true, tier: "founder" }, new Date("2026-08-28T00:00:00.000Z"));
assert.deepEqual(JSON.parse(JSON.stringify(expiredWithBilling)), { tier: "member", source: "default", overrideExpired: true }, "disabled billing cannot silently replace the automatic Member default");

policy.applyAccessProfile({ account_role: "user", membership_tier: "junior", membership_source: "manual_override" });
const active = (id) => ({ id, status: "Active" });
for (const count of [0, 1, 4, 5]) {
  const animals = Array.from({ length: count }, (_, index) => active(`a${index}`));
  assert.equal(policy.activeAnimalCount(animals), count);
  assert.equal(policy.validateAnimalTransition(animals, animals).allowed, true);
}

const five = Array.from({ length: 5 }, (_, index) => active(`a${index}`));
assert.equal(policy.validateAnimalTransition(five, [...five, active("a5")]).allowed, false, "sixth active animal is blocked");
assert.equal(policy.activeAnimalCount([
  ...five,
  { status: "Sold" },
  { status: "Deceased" },
  { status: "Archived" },
  { status: "Ancestor Only" }
]), 5, "historical and pedigree-only records do not consume Junior slots");
assert.equal(policy.validateAnimalTransition(five, [...five, { status: "Archived" }]).allowed, true);
const fourPlusArchived = [...five.slice(0, 4), { id: "returning", status: "Archived" }];
assert.equal(
  policy.validateAnimalTransition(fourPlusArchived, [...five.slice(0, 4), active("returning")]).allowed,
  true,
  "returning an inactive animal to Active is allowed when it fills the fifth slot"
);
const fivePlusArchived = [...five, { id: "returning", status: "Archived" }];
assert.equal(
  policy.validateAnimalTransition(fivePlusArchived, [...five, active("returning")]).allowed,
  false,
  "returning an inactive animal to Active is blocked when it would create a sixth active animal"
);

const overLimit = Array.from({ length: 17 }, (_, index) => active(`over${index}`));
assert.equal(policy.validateAnimalTransition(overLimit, overLimit).allowed, true, "downgraded herds remain editable");
assert.equal(policy.validateAnimalTransition(overLimit, overLimit.slice(0, 16)).allowed, true, "reducing an over-limit herd remains allowed");
assert.equal(policy.validateAnimalTransition(overLimit, [...overLimit, active("over17")]).allowed, false, "over-limit herd cannot increase");

policy.applyAccessProfile({ account_role: "user", membership_tier: "member", membership_source: "default" });
assert.equal(policy.validateAnimalTransition(five, [...five, active("unlimited")]).allowed, true, "Member remains unlimited");

const flagOffContext = browserContext();
flagOffContext.HerdHarborRelease = {
  featureFlags: { juniorPlanEnabled: false, adminMemberManagementEnabled: true, billingEnabled: false }
};
vm.runInContext(read("herdharbor-membership-v1.6.1.js"), flagOffContext, { filename: "herdharbor-membership-v1.6.1.js" });
flagOffContext.HerdHarborMembership.applyAccessProfile({
  account_role: "user",
  membership_tier: "junior",
  membership_source: "manual_override"
});
assert.equal(
  flagOffContext.HerdHarborMembership.validateAnimalTransition(five, [...five, active("flag-off")]).allowed,
  true,
  "the Junior limit is inactive when the release feature flag is disabled"
);

console.log("Alpha v1.6.5 centralized membership and Junior policy tests passed");
