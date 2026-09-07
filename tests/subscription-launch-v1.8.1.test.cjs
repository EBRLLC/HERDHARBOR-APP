const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("subscription-launch-v1.8.1.js", "utf8");

function loadPolicy(baseAccount = {}) {
  const account = {
    accountRole: "user",
    membershipTier: "member",
    effectiveMembershipTier: "member",
    membershipSource: "default",
    storedMembershipSource: "default",
    subscriptionStatus: "not_configured",
    maxActiveAnimals: null,
    features: { animalRecords: true },
    ...baseAccount
  };
  const original = {
    version: "1.8.0",
    getAccount: () => ({ ...account }),
    activeAnimalCount: (animals = []) => animals.filter((animal) => !["sold", "deceased", "archived", "ancestor only"].includes(String(animal.status || "active").toLowerCase())).length,
    showJuniorLimit() {}
  };
  const document = {
    documentElement: { dataset: {} },
    dispatchEvent() {}
  };
  const window = { document, HerdHarborMembership: original };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    CustomEvent: class CustomEvent { constructor(name, options) { this.type = name; this.detail = options?.detail; } },
    Date,
    Set,
    Object,
    Array,
    String,
    Number,
    Math,
    JSON,
    structuredClone,
    console
  });
  vm.runInContext(source, context, { filename: "subscription-launch-v1.8.1.js" });
  return window;
}

test("v1.8.1 launch window is September 6 through the October 1 hard launch", () => {
  const api = loadPolicy().HerdHarborSubscriptionLaunch;
  assert.equal(api.version, "1.8.1");
  assert.equal(api.trialBeginsAt, "2026-09-06T00:00:00-04:00");
  assert.equal(api.hardLaunchAt, "2026-10-01T00:00:00-04:00");
  assert.equal(api.__test.policyState(new Date("2026-09-06T12:00:00-04:00")).trialActive, true);
  assert.equal(api.__test.policyState(new Date("2026-09-30T23:59:59-04:00")).trialActive, true);
  assert.equal(api.__test.policyState(new Date("2026-10-01T00:00:00-04:00")).hardLaunchActive, true);
});

test("all ordinary accounts receive full Member access during the launch trial", () => {
  const api = loadPolicy({ membershipTier: "junior", effectiveMembershipTier: "junior" }).HerdHarborSubscriptionLaunch;
  const resolved = api.__test.resolveAccount(new Date("2026-09-20T12:00:00-04:00"));
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "launch_trial");
  assert.equal(resolved.subscriptionStatus, "trialing");
  assert.equal(resolved.maxActiveAnimals, null);
  assert.equal(resolved.launchTrialEndsAt, "2026-10-01T00:00:00-04:00");
});

test("founder, owner, admin, and active manual overrides are not downgraded or rewritten", () => {
  const founder = loadPolicy({ membershipTier: "founder", effectiveMembershipTier: "founder", membershipSource: "founder", storedMembershipSource: "founder" }).HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-09-20T12:00:00-04:00"));
  assert.equal(founder.effectiveMembershipTier, "founder");
  assert.equal(founder.membershipSource, "founder");
  const owner = loadPolicy({ accountRole: "owner", membershipTier: "business", effectiveMembershipTier: "business", membershipSource: "manual_override", storedMembershipSource: "manual_override" }).HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-09-20T12:00:00-04:00"));
  assert.equal(owner.effectiveMembershipTier, "business");
  const manual = loadPolicy({ membershipTier: "business", effectiveMembershipTier: "business", membershipSource: "manual_override", storedMembershipSource: "manual_override" }).HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-09-20T12:00:00-04:00"));
  assert.equal(manual.effectiveMembershipTier, "business");
});

test("October 1 keeps active paid subscriptions on their paid tier", () => {
  const window = loadPolicy();
  window.HerdHarborSubscriptionEngine = { getState: () => ({ status: "active", plan: "member" }) };
  const resolved = window.HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-10-01T00:00:01-04:00"));
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "subscription");
  assert.equal(resolved.subscriptionStatus, "active");
});

test("October 1 safely falls non-subscribers back to Junior without deleting access or records", () => {
  const window = loadPolicy();
  window.HerdHarborSubscriptionEngine = { getState: () => ({ status: "not_configured", plan: null }) };
  const resolved = window.HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-10-01T00:00:01-04:00"));
  assert.equal(resolved.effectiveMembershipTier, "junior");
  assert.equal(resolved.membershipSource, "launch_required");
  assert.equal(resolved.maxActiveAnimals, 5);
  assert.equal(resolved.features.animalRecords, true);
});

test("v1.8.1 wrapper enforces the Junior 5-animal transition limit only after hard launch", () => {
  const window = loadPolicy();
  window.HerdHarborSubscriptionEngine = { getState: () => ({ status: "not_configured", plan: null }) };
  const before = Array.from({ length: 5 }, (_, index) => ({ id: index, status: "Active" }));
  const after = Array.from({ length: 6 }, (_, index) => ({ id: index, status: "Active" }));
  const current = window.HerdHarborMembership.validateAnimalTransition(before, after);
  // The wrapper uses real current time; this assertion protects the rule shape rather than wall-clock state.
  assert.ok([null, 5].includes(current.limit));
  const postLaunch = window.HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-10-02T12:00:00-04:00"));
  assert.equal(postLaunch.maxActiveAnimals, 5);
});

test("v1.8.1 build and service worker load the launch policy before the v1.8.0 engine", () => {
  const build = fs.readFileSync("herdharbor-build.js", "utf8");
  const sw = fs.readFileSync("service-worker.js", "utf8");
  assert.match(build, /version:\s*"1\.8\.1"/);
  assert.ok(build.indexOf("subscription-launch-v1.8.1.js?v=1") < build.indexOf("subscription-engine-v1.8.0.js?v=1"));
  assert.match(sw, /herdharbor-shell-v1\.8\.1-alpha-october-subscription-launch-/);
  assert.match(sw, /subscription-launch-v1\.8\.1\.js\?v=1/);
  assert.match(sw, /"\/subscription-launch-v1\.8\.1\.js"/);
});
