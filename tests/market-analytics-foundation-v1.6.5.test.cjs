"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const store = new Map();
global.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
const market = require("../market-analytics-v1.6.5.js");
const root = path.resolve(__dirname, "..");
const consent = (overrides = {}) => ({
  enabled: true,
  consentVersion: market.CONSENT_VERSION,
  enabledAt: "2026-01-01T00:00:00.000Z",
  disabledAt: "",
  includeHistorical: false,
  regionCountry: "US",
  regionCode: "KY",
  broadRegion: "Southeast",
  ...overrides
});
const state = (overrides = {}) => ({ settings: { marketAnalyticsConsent: consent() }, sales: [], ...overrides });
const completedSale = (overrides = {}) => ({
  id: "sale-1",
  status: "Completed",
  completedAt: "2026-02-01T12:00:00.000Z",
  saleDate: "2026-02-01",
  updatedAt: "2026-02-01T12:00:00.000Z",
  items: [{ id: "item-1", animalId: "animal-1", salePrice: "100.00", unitPrice: "100.00", listedPriceAtSale: "125.00" }],
  ...overrides
});

test.beforeEach(() => market.resetForTests());

test("Market Analytics is versioned, explicitly opt-in, and independent from Cloud Sync", () => {
  assert.equal(market.VERSION, "1.6.6");
  assert.equal(market.MINIMUM_SAMPLE_SIZE, 5);
  assert.equal(market.getConsent({ settings: {} }).enabled, false);
  assert.equal(market.reconcileSale(completedSale(), null, state({ settings: { marketAnalyticsConsent: consent({ enabled: false }) } })).length, 0);
  assert.equal(market.readQueue().length, 0);
});

test("only Completed sales qualify; Draft, Reserved, Pending, and Cancelled do not", () => {
  for (const status of ["Draft", "Reserved", "Pending", "Cancelled"]) {
    market.resetForTests();
    assert.equal(market.reconcileSale(completedSale({ status }), null, state()).length, 0, status);
    assert.equal(market.readQueue().length, 0, status);
  }
  assert.equal(market.reconcileSale(completedSale(), null, state()).length, 1);
  assert.equal(market.readQueue()[0].action, "upsert");
});

test("historical contribution defaults off and never treats missing completion time as future", () => {
  const historical = completedSale({ completedAt: "" });
  assert.equal(market.reconcileSale(historical, null, state()).length, 0);
  assert.equal(market.reconcileSale(historical, null, state({ settings: { marketAnalyticsConsent: consent({ includeHistorical: true }) } })).length, 1);
});

test("multiple animals create item-level queued observations without copying a private Sale", () => {
  const sale = completedSale({ items: [
    { id: "rabbit-item", animalId: "private-rabbit", salePrice: "100", listedPriceAtSale: "125" },
    { id: "cattle-item", animalId: "private-cattle", salePrice: "500", listedPriceAtSale: null }
  ], customerId: "private-customer", notes: "never queue", customerEmail: "buyer@example.test" });
  market.reconcileSale(sale, null, state());
  const queue = market.readQueue();
  assert.equal(queue.length, 2);
  assert.deepEqual(queue.map((entry) => entry.itemId).sort(), ["cattle-item", "rabbit-item"]);
  for (const entry of queue) {
    assert.deepEqual(Object.keys(entry).sort(), ["action", "consentVersion", "fingerprint", "itemId", "queuedAt", "saleId"].sort());
    assert.doesNotMatch(JSON.stringify(entry), /buyer@example|never queue|private-customer/);
  }
});

test("queue replacement gives retries idempotency and corrections supersede the same item", () => {
  const first = completedSale();
  market.reconcileSale(first, null, state());
  market.reconcileSale(first, null, state());
  assert.equal(market.readQueue().length, 1, "refresh/retry does not create another queue item");
  const originalFingerprint = market.readQueue()[0].fingerprint;
  const corrected = completedSale({ updatedAt: "2026-02-02T00:00:00Z", items: [{ id: "item-1", animalId: "animal-1", salePrice: "90", listedPriceAtSale: "125" }] });
  market.reconcileSale(corrected, first, state());
  assert.equal(market.readQueue().length, 1);
  assert.notEqual(market.readQueue()[0].fingerprint, originalFingerprint);
  assert.equal(market.readQueue()[0].action, "upsert");
});

test("cancelling a previously Completed sale queues withdrawal rather than another fact", () => {
  const previous = completedSale();
  const cancelled = { ...previous, status: "Cancelled", updatedAt: "2026-02-03T00:00:00Z" };
  const queued = market.reconcileSale(cancelled, previous, state());
  assert.equal(queued.length, 1);
  assert.equal(market.readQueue()[0].action, "withdraw");
});

test("opt-out immediately clears pending contributions and stops future contributions", async () => {
  const current = state();
  market.reconcileSale(completedSale(), null, current);
  assert.equal(market.readQueue().some((entry) => entry.action === "upsert"), true);
  await market.setConsent(current, { enabled: false });
  assert.equal(current.settings.marketAnalyticsConsent.enabled, false);
  assert.equal(market.readQueue().some((entry) => ["upsert", "withdraw"].includes(entry.action)), false);
  assert.equal(market.reconcileSale(completedSale(), null, current).length, 0);
});

test("allowlist serializer rejects every unapproved field, including identity and private notes", () => {
  const input = Object.fromEntries([
    ...market.ALLOWED_FACT_FIELDS.map((field) => [field, `${field}-value`]),
    ...market.PROHIBITED_FIELDS.map((field) => [field, "PROHIBITED"]),
    ["unexpected_private_blob", { secret: true }]
  ]);
  const safe = market.sanitizeMarketFact(input);
  assert.deepEqual(Object.keys(safe).sort(), [...market.ALLOWED_FACT_FIELDS].sort());
  assert.doesNotMatch(JSON.stringify(safe), /PROHIBITED|secret/);
});

test("asking price, listing snapshot, and actual sale price remain distinct in the canonical app", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const statusStart = html.indexOf("  function applySaleAnimalStatuses(");
  const statusEnd = html.indexOf("  function renderSales()", statusStart);
  const statusSource = html.slice(statusStart, statusEnd);
  assert.doesNotMatch(statusSource, /animal\.askingPrice\s*=/);
  assert.match(html, /listedPriceAtSale/);
  assert.match(html, /salePrice:\s*price\.toFixed/);
  assert.match(html, /previousSale\?\.status === "Completed"/);
  assert.match(html, /listedPriceAtSale = null/);
});

test("backend constructs facts from canonical state and exposes aggregates only after threshold", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");
  const edge = fs.readFileSync(path.join(root, "supabase/functions/market-contribution/index.ts"), "utf8");
  const factTable = sql.slice(sql.indexOf("create table if not exists market_private.market_facts"), sql.indexOf("create table if not exists market_private.market_config"));
  assert.match(sql, /public\.herdharbor_user_data/);
  assert.match(sql, /coalesce\(v_sale ->> 'status', ''\) <> 'Completed'/);
  assert.match(sql, /unique \(user_id, source_sale_id, source_item_id\)/);
  assert.match(sql, /percentile_cont\(0\.5\)/);
  assert.match(sql, /avg\(f\.sale_price\)/);
  assert.match(sql, /min\(f\.sale_price\)/);
  assert.match(sql, /max\(f\.sale_price\)/);
  assert.match(sql, /having count\(\*\) >= v_threshold/);
  assert.match(sql, /greatest\(coalesce\(v_threshold, 5\), 5\)/);
  assert.match(sql, /if v_count < v_threshold/);
  assert.doesNotMatch(factTable, /customer_|animal_id|account_id|user_id|notes|photo|document|payment_reference|street_address|latitude|longitude/);
  assert.match(sql, /revoke all on all tables in schema market_private from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant select[^;]+authenticated/i);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /admin\.rpc\("market_aggregate"/);
  assert.doesNotMatch(edge, /\.from\("?market_facts/);
});

test("privacy threshold contract suppresses four and permits five while retaining median-first metrics", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");
  assert.match(sql, /values \('minimum_sample_size', '5'::jsonb\)/);
  const suppressed = sql.slice(sql.indexOf("if v_count < v_threshold then"), sql.indexOf("end if;", sql.indexOf("if v_count < v_threshold then")));
  assert.match(suppressed, /'available', false/);
  assert.doesNotMatch(suppressed, /sampleSize/);
  assert.match(sql, /'available', true,[\s\S]*'medianSalePrice'/);
  const prices = [75, 90, 100, 125, 900].sort((a, b) => a - b);
  assert.equal(prices.length - 1 < market.MINIMUM_SAMPLE_SIZE, true);
  assert.equal(prices.length >= market.MINIMUM_SAMPLE_SIZE, true);
  assert.equal(prices[Math.floor(prices.length / 2)], 100);
});

test("account deletion clears device queue and backend linkage/facts cascade", () => {
  const marketSource = fs.readFileSync(path.join(root, "market-analytics-v1.6.5.js"), "utf8");
  const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");
  assert.match(marketSource, /function prepareAccountDeletion/);
  assert.match(marketSource, /writeReceipts\(\{\}\)/);
  assert.match(cloud, /HerdHarborMarket\?\.prepareAccountDeletion/);
  assert.match(sql, /function public\.market_delete_account_data/);
  assert.match(sql, /delete from market_private\.market_contribution_processing where user_id = p_user_id/);
  assert.match(sql, /delete from market_private\.market_consent where user_id = p_user_id/);
  assert.match(sql, /factsRemovedByCascade/);
});


test("market aggregates are currency-isolated and honor the Analytics date range", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/v1.6.5-market-analytics-foundation.sql"), "utf8");
  const edge = fs.readFileSync(path.join(root, "supabase/functions/market-contribution/index.ts"), "utf8");
  const analyticsSource = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");
  assert.match(edge, /"sale_month", "sale_year", "currency", "start", "end"/);
  assert.match(sql, /v_currency_filter := upper\(coalesce\(nullif\(btrim\(p_filters ->> 'currency'\), ''\), 'USD'\)\)/);
  assert.equal((sql.match(/f\.currency = v_currency_filter/g) || []).length, 2);
  assert.equal((sql.match(/make_date\(f\.sale_year, f\.sale_month, 1\)/g) || []).length, 4);
  assert.match(analyticsSource, /queryAggregate\(\{ species: ui\.species \|\| undefined, \.\.\.marketFilterPayload\(\), currency: "USD", start:/);
});


test("aggregate filter serialization keeps date and advanced filters without widening market fact fields", () => {
  const filters = market.sanitizeAggregateFilters({
    species: "Rabbit", breed: "Holland Lop", sex: "Female", age_bucket: "3–6 months",
    color_variety: "Broken", pedigree_status: "Pedigreed", registration_status: "Registered",
    region_country: "US", region_code: "KY", broad_region: "Southeast", sale_month: "6", sale_year: "2026",
    currency: "USD", start: "2026-01-01", end: "2026-06-30", customer_name: "never", notes: "never"
  });
  assert.equal(filters.start, "2026-01-01");
  assert.equal(filters.end, "2026-06-30");
  assert.equal(filters.breed, "Holland Lop");
  assert.equal(filters.sale_year, "2026");
  assert.equal(filters.currency, "USD");
  assert.equal(filters.customer_name, undefined);
  assert.equal(filters.notes, undefined);
});

test("enabled consent from an older language version requires review", () => {
  const result = market.getConsent({ settings: { marketAnalyticsConsent: consent({ consentVersion: "2026-09-v1" }) } });
  assert.equal(result.enabled, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.includeHistorical, false);
});

test("aggregate filters reject impossible dates and out-of-range calendar values", () => {
  const filters = market.sanitizeAggregateFilters({
    start: "2026-02-30", end: "2026-03-01", sale_month: "13", sale_year: "1899", breed: "Holland Lop"
  });
  assert.equal(filters.start, undefined);
  assert.equal(filters.end, "2026-03-01");
  assert.equal(filters.sale_month, undefined);
  assert.equal(filters.sale_year, undefined);
  assert.equal(filters.breed, "Holland Lop");
});

test("offline queue and receipts are account scoped", () => {
  let userId = "user-a";
  const previousCloud = global.HerdHarborCloud;
  try {
    global.HerdHarborCloud = { getSession: () => ({ user: { id: userId } }) };
    market.resetForTests();
    market.reconcileSale(completedSale(), null, state());
    assert.equal(store.has(`${market.QUEUE_KEY}:user-a`), true);
    userId = "user-b";
    assert.deepEqual(market.readQueue(), []);
    userId = "user-a";
    assert.equal(market.readQueue().length, 1);
  } finally {
    market.resetForTests();
    if (previousCloud === undefined) delete global.HerdHarborCloud;
    else global.HerdHarborCloud = previousCloud;
  }
});

test("flush never acknowledges a contribution after the account changes", async () => {
  let userId = "user-a";
  const invoked = [];
  const previousCloud = global.HerdHarborCloud;
  try {
    global.HerdHarborCloud = {
      getSession: () => ({ user: { id: userId } }),
      invokeFunction: async () => {
        invoked.push(userId);
        userId = "user-b";
        return { processedAt: "2026-09-01T00:00:00.000Z" };
      }
    };
    market.resetForTests();
    market.reconcileSale(completedSale(), null, state());
    const result = await market.flush();
    assert.deepEqual(invoked, ["user-a"]);
    assert.equal(result.submitted, 0);
    userId = "user-a";
    assert.equal(market.readQueue().length, 1);
  } finally {
    market.resetForTests();
    if (previousCloud === undefined) delete global.HerdHarborCloud;
    else global.HerdHarborCloud = previousCloud;
  }
});
