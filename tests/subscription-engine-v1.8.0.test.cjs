const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("subscription-engine-v1.8.0.js", "utf8");

function loadEngine() {
  const listeners = new Map();
  const document = {
    readyState: "loading",
    documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatchEvent() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    visibilityState: "hidden"
  };
  const localStorage = {
    length: 0,
    getItem() { return null; },
    setItem() {},
    key() { return null; }
  };
  const window = {
    document,
    localStorage,
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    addEventListener() {},
    getComputedStyle() { return { display: "none", visibility: "hidden" }; },
    HerdHarborRelease: {
      plans: {
        junior: { label: "Junior", priceMonthly: 0, maxActiveAnimals: 5 },
        founder: { label: "Founder", priceMonthly: 7.99 },
        member: { label: "Member", priceMonthly: 14.99 },
        business: { label: "Business", priceMonthly: 49.99 }
      }
    }
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    localStorage,
    CustomEvent: class CustomEvent { constructor(name, options) { this.type = name; this.detail = options?.detail; } },
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    Intl,
    URL,
    Date,
    Number,
    Math,
    JSON,
    String,
    Set,
    Object,
    Array,
    Boolean,
    console,
    structuredClone
  });
  vm.runInContext(source, context, { filename: "subscription-engine-v1.8.0.js" });
  return window.HerdHarborSubscriptionEngine;
}

test("v1.8.0 subscription engine is standalone", () => {
  const engine = loadEngine();
  assert.equal(engine.version, "1.8.0");
  assert.equal(typeof engine.configureProvider, "function");
  assert.equal(typeof engine.runDiagnostics, "function");
  assert.equal(typeof engine.open, "function");
});

test("normalization accepts only known plans and safe status fields", () => {
  const engine = loadEngine();
  const result = engine.__test.normalizeState({
    plan: "MEMBER",
    status: "ACTIVE",
    priceCents: 1499.4,
    billingInterval: "year",
    referral: { successfulReferrals: 5.9 }
  });
  assert.equal(result.plan, "member");
  assert.equal(result.status, "active");
  assert.equal(result.priceCents, 1499);
  assert.equal(result.billingInterval, "year");
  assert.equal(result.referral.successfulReferrals, 5);
});

test("unknown plan does not become an entitlement", () => {
  const engine = loadEngine();
  assert.equal(engine.__test.normalizeState({ plan: "super-admin" }).plan, null);
});

test("referral milestones match HerdHarbor v1.8.0 rules", () => {
  const engine = loadEngine();
  const four = engine.referralProjection(4);
  assert.equal(four.achieved.length, 0);
  assert.equal(four.next.threshold, 5);
  assert.equal(four.next.remaining, 1);

  const five = engine.referralProjection(5);
  assert.equal(five.achieved[0].freeMonths, 1);
  assert.equal(five.next.threshold, 20);

  const twenty = engine.referralProjection(20);
  assert.equal(twenty.achieved.length, 2);
  assert.equal(twenty.next, null);
});

test("engine never aliases the legacy billing namespace", () => {
  assert.match(source, /window\.HerdHarborSubscriptionEngine/);
  assert.doesNotMatch(source, /window\.HerdHarborBilling\s*=/);
});

test("engine does not collect raw payment credentials", () => {
  assert.doesNotMatch(source, /cardNumber\s*[:=]/i);
  assert.doesNotMatch(source, /cvc\s*[:=]/i);
  assert.doesNotMatch(source, /cvv\s*[:=]/i);
  assert.doesNotMatch(source, /stripeSecret\s*[:=]/i);
});

test("subscription nav uses an isolated attribute rather than native app routing", () => {
  assert.match(source, /data-hh-subscription-engine-tab/);
  assert.doesNotMatch(source, /data-route=["']subscription["']/);
});

test("v1.8.0 build bootstraps the standalone engine", () => {
  const build = fs.readFileSync("herdharbor-build.js", "utf8");
  assert.match(build, /version:\s*"1\.8\.0"/);
  assert.match(build, /subscription-engine-v1\.8\.0\.js\?v=1/);
  assert.match(build, /subscription-engine-v1\.8\.0\.css\?v=1/);
});

test("legacy billing remains disabled by the existing release contract", () => {
  const release = fs.readFileSync("herdharbor-release-v1.6.1.js", "utf8");
  assert.match(release, /billingEnabled:\s*false/);
});

test("v1.8.0 service worker rolls the shell and keeps subscription assets network-first", () => {
  const worker = fs.readFileSync("service-worker.js", "utf8");
  assert.match(worker, /CACHE_NAME = "herdharbor-shell-v1\.8\.0-alpha-subscription-engine-1"/);
  assert.match(worker, /"\.\/subscription-engine-v1\.8\.0\.js\?v=1"/);
  assert.match(worker, /"\/subscription-engine-v1\.8\.0\.js"/);
  assert.match(worker, /"\/subscription-engine-v1\.8\.0\.css"/);
});
