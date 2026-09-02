"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const billingSource = fs.readFileSync(path.join(root, "herdharbor-billing-v1.6.1.js"), "utf8");
const releaseSource = fs.readFileSync(path.join(root, "herdharbor-release-v1.6.1.js"), "utf8");

function makeContext(release = null) {
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const document = {
    documentElement: { dataset: {} },
    dispatchEvent() { return true; }
  };
  const context = { console, Date, Promise, Set, CustomEvent, document };
  context.window = context;
  if (release) context.HerdHarborRelease = release;
  vm.createContext(context);
  return context;
}

(async () => {
  const disabledContext = makeContext();
  vm.runInContext(releaseSource, disabledContext, { filename: "herdharbor-release-v1.6.1.js" });
  vm.runInContext(billingSource, disabledContext, { filename: "herdharbor-billing-v1.6.1.js" });
  const disabled = disabledContext.HerdHarborBilling;
  assert.equal(disabled.enabled(), false);
  assert.equal(disabled.plans.junior.priceMonthly, 0);
  assert.equal(disabled.plans.founder.priceMonthly, 7.99);
  assert.equal(disabled.plans.member.priceMonthly, 14.99);
  assert.equal(disabled.plans.business.reserved, true);
  let providerCalls = 0;
  disabled.configureProvider({ name: "future-provider", async getCustomerInfo() { providerCalls += 1; return {}; } });
  const disabledState = await disabled.refresh();
  assert.equal(providerCalls, 0, "no billing provider is contacted while billing remains disabled");
  assert.equal(disabledState.status, "not_configured");
  assert.equal(disabledState.active, false);

  const enabledContext = makeContext({
    version: "1.6.1",
    featureFlags: { billingEnabled: true },
    plans: disabledContext.HerdHarborRelease.plans
  });
  vm.runInContext(billingSource, enabledContext, { filename: "herdharbor-billing-v1.6.1.js" });
  const enabled = enabledContext.HerdHarborBilling;
  assert.equal(enabled.__test.tierFromCustomerInfo({ entitlements: { active: { herdharbor_founder: {} } } }), "founder");
  assert.equal(enabled.__test.tierFromCustomerInfo({ entitlements: { active: { herdharbor_member: {} } } }), "member");
  assert.equal(enabled.__test.tierFromCustomerInfo({ entitlements: { active: { herdharbor_junior: {} } } }), "junior");
  enabled.configureProvider({
    name: "test-provider",
    async getCustomerInfo() { return { status: "active", entitlements: { active: { herdharbor_member: {} } } }; }
  });
  const activeState = await enabled.refresh();
  assert.equal(activeState.tier, "member");
  assert.equal(activeState.status, "active");
  assert.equal(activeState.active, true);

  enabled.configureProvider({
    name: "test-provider",
    async getCustomerInfo() { return { status: "past_due", entitlements: { active: { herdharbor_member: {} } } }; }
  });
  const pastDueState = await enabled.refresh();
  assert.equal(pastDueState.status, "past_due");
  assert.equal(pastDueState.active, false);

  console.log("Alpha v1.6.5 billing-ready centralized entitlement tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
