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
    backendReady: false,
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

test("unverified pre-launch browser state cannot manufacture a trial while backend status settles", () => {
  const api = loadPolicy({}, {}, false).HerdHarborSubscriptionLaunch;
  const resolved = api.__test.resolveAccount(new Date("2026-09-20T12:00:00-04:00"));
  assert.equal(api.version, "1.8.2");
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "default");
  assert.equal(resolved.accessMode, "pending");
  assert.equal(resolved.trialEndsAt, undefined);
  assert.equal(resolved.backendTrialVerified, false);
  assert.equal(api.getExperienceState().key, "checking");
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
  assert.equal(resolved.maxActiveAnimals, null);
});

test("expired adult trial falls back to adult Free and never becomes Junior", () => {
  const snapshot = {
    status: "free_adult",
    plan: "member",
    initialTrial: false,
    freeAdult: true,
    maxActiveAnimals: 5,
    subscriptionRequired: false,
    trialEndsAt: "2026-10-24T14:30:00.000Z",
    serverNow: "2026-10-25T12:00:00.000Z",
    providerSubscriptionId: null
  };
  const resolved = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "free_adult");
  assert.equal(resolved.subscriptionStatus, "free_adult");
  assert.equal(resolved.maxActiveAnimals, 5);
  assert.equal(resolved.subscriptionRequired, false);
  assert.equal(resolved.readOnly, false);
  assert.equal(resolved.accessMode, "free_adult");
});

test("legacy expired snapshot also degrades safely into adult Free", () => {
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
  assert.equal(resolved.membershipSource, "free_adult");
  assert.equal(resolved.maxActiveAnimals, 5);
  assert.equal(resolved.readOnly, false);
});

test("legitimate Junior enrollment remains Junior", () => {
  const snapshot = { status: "free_junior", plan: "junior", requestedPlan: "junior", serverNow: "2026-11-01T12:00:00.000Z" };
  const resolved = loadPolicy({ membershipTier: "junior", effectiveMembershipTier: "junior" }, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "junior");
  assert.equal(resolved.membershipSource, "default");
  assert.equal(resolved.maxActiveAnimals, 5);
  assert.equal(resolved.subscriptionRequired, false);
  assert.equal(resolved.accessMode, "junior");
});

test("owner, admin, manual override and founder remain untouched by trial/free policy", () => {
  const free = { status: "free_adult", plan: "member", freeAdult: true, serverNow: "2026-11-01T12:00:00.000Z" };
  const owner = loadPolicy({ accountRole: "owner", membershipTier: "business", effectiveMembershipTier: "business" }, free, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(owner.accountRole, "owner");
  assert.equal(owner.effectiveMembershipTier, "business");
  const admin = loadPolicy({ accountRole: "admin", membershipTier: "business", effectiveMembershipTier: "business" }, free, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(admin.accountRole, "admin");
  const manual = loadPolicy({ membershipSource: "manual_override", storedMembershipSource: "manual_override", membershipTier: "business", effectiveMembershipTier: "business" }, free, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(manual.effectiveMembershipTier, "business");
  const founder = loadPolicy({ membershipSource: "founder", storedMembershipSource: "founder", membershipTier: "founder", effectiveMembershipTier: "founder" }, free, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(founder.effectiveMembershipTier, "founder");
});

test("verified paid Stripe subscription wins over fallback policy", () => {
  const snapshot = {
    status: "active",
    plan: "member",
    initialTrial: false,
    freeAdult: false,
    providerSubscriptionId: "sub_123",
    serverNow: "2026-10-05T12:00:00.000Z"
  };
  const resolved = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch.__test.resolveAccount();
  assert.equal(resolved.effectiveMembershipTier, "member");
  assert.equal(resolved.membershipSource, "subscription");
  assert.equal(resolved.subscriptionStatus, "active");
  assert.equal(resolved.maxActiveAnimals, null);
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

test("unverified browser subscription state cannot manufacture a rolling trial or Free membership", () => {
  const snapshot = {
    status: "free_adult",
    plan: "member",
    initialTrial: false,
    freeAdult: true,
    trialEndsAt: "2099-01-01T00:00:00.000Z",
    serverNow: "2026-11-01T00:00:00.000Z"
  };
  const resolved = loadPolicy({}, snapshot, false).HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-11-01T00:00:00-04:00"));
  assert.notEqual(resolved.membershipSource, "free_adult");
  assert.equal(resolved.backendTrialVerified, false);
  assert.equal(resolved.trialEndsAt, undefined);
});

test("Junior and adult Free share the five-animal transition limit", () => {
  const before = Array.from({ length: 5 }, (_, id) => ({ id, status: "Active" }));
  const after = Array.from({ length: 6 }, (_, id) => ({ id, status: "Active" }));

  const junior = loadPolicy({ membershipTier: "junior", effectiveMembershipTier: "junior" }, { status: "free_junior", plan: "junior", requestedPlan: "junior" }, true);
  assert.equal(junior.HerdHarborMembership.validateAnimalTransition(before, after).allowed, false);
  assert.equal(junior.HerdHarborMembership.validateAnimalTransition(before, after).limit, 5);

  const freeAdult = loadPolicy({}, { status: "free_adult", plan: "member", freeAdult: true, maxActiveAnimals: 5 }, true);
  const check = freeAdult.HerdHarborMembership.validateAnimalTransition(before, after);
  assert.equal(check.limit, 5);
  assert.equal(check.allowed, false);
});

test("adult Free preserves an existing herd above five but cannot increase it", () => {
  const freeAdult = loadPolicy({}, { status: "free_adult", plan: "member", freeAdult: true, maxActiveAnimals: 5 }, true);
  const eight = Array.from({ length: 8 }, (_, id) => ({ id, status: "Active" }));
  const nine = Array.from({ length: 9 }, (_, id) => ({ id, status: "Active" }));
  const seven = Array.from({ length: 7 }, (_, id) => ({ id, status: "Active" }));

  assert.equal(freeAdult.HerdHarborMembership.validateAnimalTransition(eight, eight).allowed, true);
  assert.equal(freeAdult.HerdHarborMembership.validateAnimalTransition(eight, seven).allowed, true);
  assert.equal(freeAdult.HerdHarborMembership.validateAnimalTransition(eight, nine).allowed, false);
});

test("fresh backend Free Adult status is authoritative before the Stripe snapshot settles", () => {
  const api = loadPolicy({
    backendReady: true,
    subscriptionStatus: "free_adult"
  }, {}, false).HerdHarborSubscriptionLaunch;
  const resolved = api.__test.resolveAccount();
  assert.equal(resolved.membershipSource, "free_adult");
  assert.equal(resolved.accessMode, "free_adult");
  assert.equal(resolved.maxActiveAnimals, 5);
  assert.equal(resolved.backendTrialVerified, true);
  assert.equal(api.getExperienceState().key, "free_adult");
});

test("trusted trial experience reports authoritative date and rounded days remaining", () => {
  const snapshot = {
    status: "trialing",
    plan: "member",
    initialTrial: true,
    initialTrialStartsAt: "2026-09-24T14:30:00.000Z",
    initialTrialEndsAt: "2026-10-24T14:30:00.000Z",
    trialEndsAt: "2026-10-24T14:30:00.000Z",
    serverNow: "2026-10-10T12:00:00.000Z"
  };
  const api = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch;
  const experience = api.getExperienceState();
  assert.equal(experience.key, "trial_active");
  assert.equal(experience.endsAt, "2026-10-24T14:30:00.000Z");
  assert.equal(experience.daysRemaining, 15);
  assert.equal(experience.upgradeAvailable, true);
  assert.equal(experience.verified, true);
});

test("paid access ending remains paid through the provider period and advertises no destructive fallback", () => {
  const snapshot = {
    status: "active",
    plan: "member",
    providerSubscriptionId: "sub_ending",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-12-01T15:00:00.000Z",
    serverNow: "2026-11-15T12:00:00.000Z"
  };
  const api = loadPolicy({}, snapshot, true).HerdHarborSubscriptionLaunch;
  const resolved = api.__test.resolveAccount();
  const experience = api.getExperienceState();
  assert.equal(resolved.accessMode, "paid");
  assert.equal(resolved.maxActiveAnimals, null);
  assert.equal(experience.key, "paid_access_ending");
  assert.equal(experience.endsAt, "2026-12-01T15:00:00.000Z");
});

test("protected and Junior experience states remain separate from adult trial policy", () => {
  const owner = loadPolicy({ accountRole: "owner", backendReady: true }, {}, false)
    .HerdHarborSubscriptionLaunch.getExperienceState();
  assert.equal(owner.key, "protected_access");

  const junior = loadPolicy(
    { membershipTier: "junior", effectiveMembershipTier: "junior", backendReady: true },
    { status: "free_junior", plan: "junior", requestedPlan: "junior" },
    true
  ).HerdHarborSubscriptionLaunch.getExperienceState();
  assert.equal(junior.key, "junior");
  assert.equal(junior.maxActiveAnimals, 5);
});

test("terminal fresh backend subscription statuses resolve to Free Adult without browser trust", () => {
  for (const status of ["canceled", "expired", "unpaid", "incomplete_expired"]) {
    const api = loadPolicy({ backendReady: true, subscriptionStatus: status }, {}, false).HerdHarborSubscriptionLaunch;
    const resolved = api.__test.resolveAccount();
    assert.equal(resolved.membershipSource, "free_adult", status);
    assert.equal(resolved.maxActiveAnimals, 5, status);
  }
});
