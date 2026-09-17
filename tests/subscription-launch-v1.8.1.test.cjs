const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("subscription-launch-v1.8.1.js", "utf8");

function loadPolicy(baseAccount = {}, snapshot = {}, verified = true) {
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
    showJuniorLimit() {},
    canAccessAdmin: () => ["owner", "admin"].includes(account.accountRole)
  };
  const listeners = new Map();
  const document = {
    documentElement: { dataset: {} },
    addEventListener(name, fn) { listeners.set(name, fn); },
    dispatchEvent() {}
  };
  const window = {
    document,
    HerdHarborMembership: original,
    HerdHarborSubscriptionEngine: { getState: () => ({ ...snapshot }) },
    HerdHarborStripeSnapshotTrust: { isVerified: () => verified }
  };
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

test("pre-launch fallback keeps full Member access while billing snapshot settles", () => {
  const api = loadPolicy({}, {}, false).HerdHarborSubscriptionLaunch;
  const resolved = api.__test.resolveAccount(new Date("2026-09-20T12:00:00-04:00"));
  assert.equal(api.version, "1.8.2");
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "launch_trial_fallback");
  assert.equal(resolved.trialEndsAt, "2026-10-01T00:00:00-04:00");
  assert.equal(resolved.backendTrialVerified, false);
});

test("September 24 signup remains a trusted Member trial through October 24", () => {
  const snapshot = {
    status: "trialing",
    plan: "member",
    initialTrial: true,
    initialTrialStartsAt: "2026-09-24T14:30:00.000Z",
    trialEndsAt: "2026-10-24T14:30:00.000Z",
    initialTrialEndsAt: "2026-10-24T14:30:00.000Z",
    serverNow: "2026-10-10T12:00:00.000Z",
    hardLaunchAt: "2026-10-01T04:00:00.000Z",
    providerSubscriptionId: null
  };
  const resolved = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "initial_trial");
  assert.equal(resolved.subscriptionStatus, "trialing");
  assert.equal(resolved.trialEndsAt, "2026-10-24T14:30:00.000Z");
  assert.equal(resolved.subscriptionRequired, false);
});

test("expired adult trial remains Member identity and never silently becomes Junior", () => {
  const snapshot = {
    status: "expired",
    plan: "member",
    initialTrial: true,
    subscriptionRequired: true,
    trialEndsAt: "2026-10-24T14:30:00.000Z",
    serverNow: "2026-10-25T12:00:00.000Z",
    providerSubscriptionId: null
  };
  const resolved = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "subscription_required");
  assert.equal(resolved.subscriptionStatus, "expired");
  assert.equal(resolved.maxActiveAnimals, null);
  assert.equal(resolved.subscriptionRequired, true);
  assert.equal(resolved.readOnly, true);
});

test("legitimate Junior enrollment remains Junior", () => {
  const snapshot = { status: "free_junior", plan: "junior", requestedPlan: "junior", serverNow: "2026-11-01T12:00:00.000Z" };
  const resolved = loadPolicy({ membershipTier: "junior", effectiveMembershipTier: "junior" }, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "junior");
  assert.equal(resolved.maxActiveAnimals, 5);
  assert.equal(resolved.subscriptionRequired, false);
});

test("owner, admin, manual override and founder remain untouched by trial policy", () => {
  const trial = { status: "expired", plan: "member", subscriptionRequired: true, serverNow: "2026-11-01T12:00:00.000Z" };
  const owner = loadPolicy({ accountRole: "owner", membershipTier: "business", effectiveMembershipTier: "business" }, trial, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(owner.accountRole, "owner");
  assert.equal(owner.effectiveMembershipTier, "business");
  const admin = loadPolicy({ accountRole: "admin", membershipTier: "business", effectiveMembershipTier: "business" }, trial, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(admin.accountRole, "admin");
  const manual = loadPolicy({ membershipSource: "manual_override", storedMembershipSource: "manual_override", membershipTier: "business", effectiveMembershipTier: "business" }, trial, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(manual.effectiveMembershipTier, "business");
  const founder = loadPolicy({ membershipSource: "founder", storedMembershipSource: "founder", membershipTier: "founder", effectiveMembershipTier: "founder" }, trial, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(founder.effectiveMembershipTier, "founder");
});

test("verified paid Stripe subscription wins over initial-trial policy", () => {
  const snapshot = {
    status: "active",
    plan: "member",
    initialTrial: false,
    providerSubscriptionId: "sub_123",
    serverNow: "2026-10-05T12:00:00.000Z"
  };
  const resolved = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "subscription");
  assert.equal(resolved.subscriptionStatus, "active");
});

test("webhook-synchronized backend subscription is honored before browser refresh", () => {
  const base = {
    membershipTier: "business",
    effectiveMembershipTier: "business",
    membershipSource: "subscription",
    storedMembershipSource: "subscription",
    subscriptionStatus: "active"
  };
  const resolved = loadPolicy(base, {}, false).HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-10-02T12:00:00-04:00"));
  assert.equal(resolved.effectiveMembershipTier, "business");
  assert.equal(resolved.membershipSource, "subscription");
});

test("unverified browser subscription state cannot manufacture a rolling trial", () => {
  const snapshot = {
    status: "trialing",
    plan: "member",
    initialTrial: true,
    trialEndsAt: "2099-01-01T00:00:00.000Z",
    serverNow: "2026-11-01T00:00:00.000Z"
  };
  const resolved = loadPolicy({}, snapshot, false).HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-11-01T00:00:00-04:00"));
  assert.notEqual(resolved.membershipSource, "initial_trial");
  assert.equal(resolved.backendTrialVerified, false);
  assert.equal(resolved.trialEndsAt, undefined);
});

test("Junior animal limit applies only to legitimate Junior accounts", () => {
  const junior = loadPolicy({ membershipTier: "junior", effectiveMembershipTier: "junior" }, { status: "free_junior", plan: "junior", requestedPlan: "junior" }, true);
  const before = Array.from({ length: 5 }, (_, id) => ({ id, status: "Active" }));
  const after = Array.from({ length: 6 }, (_, id) => ({ id, status: "Active" }));
  assert.equal(junior.HerdHarborMembership.validateAnimalTransition(before, after).allowed, false);

  const expired = loadPolicy({}, { status: "expired", plan: "member", subscriptionRequired: true }, true);
  const check = expired.HerdHarborMembership.validateAnimalTransition(before, after);
  assert.equal(check.limit, null);
});
