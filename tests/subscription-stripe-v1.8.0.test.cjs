const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const adapter = read('subscription-stripe-provider-v1.8.0.js');
const headerHelper = read('subscription-header-copy-v1.8.0.js');
const build = read('herdharbor-build.js');
const sw = read('service-worker.js');
const migration = read('supabase/v1.8.0-stripe-billing.sql');
const billing = read('supabase/functions/subscription-billing/index.ts');
const webhook = read('supabase/functions/subscription-webhook/index.ts');

const priceIds = [
  'price_1UCOktGIRukEX5RKPo6jm6Vr',
  'price_1UCOwAGIRukEX5RK34xr9dQS',
  'price_1UCOjrGIRukEX5RK9my06yUP',
  'price_1UCOvPGIRukEX5RKJA05IDmb',
  'price_1UCOuYGIRukEX5RKo6LUWZq3',
  'price_1UCOnnGIRukEX5RK36kjzNZ6'
];

test('all six approved Stripe prices are allowlisted server-side', () => {
  for (const id of priceIds) {
    assert.match(billing, new RegExp(id));
    assert.match(migration, new RegExp(id));
  }
});

test('browser adapter never contains Stripe secret credentials', () => {
  assert.doesNotMatch(adapter, /sk_(?:live|test)_/i);
  assert.doesNotMatch(adapter, /whsec_/i);
  assert.doesNotMatch(adapter, /STRIPE_SECRET_KEY/);
  assert.doesNotMatch(adapter, /createClient\s*\(/);
});

test('browser adapter reuses authenticated HerdHarborCloud transport', () => {
  assert.match(adapter, /HerdHarborCloud/);
  assert.match(adapter, /invokeFunction\("subscription-billing"/);
  assert.match(adapter, /billingInterval:\s*selectedInterval/);
  assert.match(adapter, /createPortalSession/);
  assert.match(adapter, /cancelSubscription/);
  assert.match(adapter, /reactivateSubscription/);
});

test('billing transport is bounded and cannot remain pending forever', () => {
  assert.match(adapter, /CALL_TIMEOUT_MS\s*=\s*15000/);
  assert.match(adapter, /Promise\.race/);
  assert.match(adapter, /window\.clearTimeout\(timeoutId\)/);
});

test('billing never calls the backend while HerdHarbor auth is locked', () => {
  assert.match(adapter, /appReadyForBilling/);
  assert.match(adapter, /classList\.contains\("hh-auth-locked"\)/);
  assert.match(adapter, /if \(!appReadyForBilling\(\)\) return null/);
});

test('retry timers are bounded and do not shadow the browser setInterval API', () => {
  assert.doesNotMatch(adapter, /function\s+setInterval\s*\(/);
  assert.match(adapter, /function\s+setBillingInterval\s*\(/);
  assert.match(adapter, /window\.setInterval/);
  assert.match(adapter, /attempts\s*>=\s*40/);
  assert.match(adapter, /window\.clearInterval\(timer\)/);
});

test('membership bridge suppresses duplicate membership-change storms', () => {
  assert.match(adapter, /lastMembershipSignature/);
  assert.match(adapter, /if \(signature === lastMembershipSignature\) return/);
});

test('normal sign-in does not force a Stripe refresh loop', () => {
  const authHandler = adapter.match(/document\.addEventListener\("herdharbor:auth-session"[\s\S]*?\n\s*}\);/)?.[0] || '';
  assert.match(authHandler, /refreshCheckoutWhenReady/);
  assert.doesNotMatch(authHandler, /SubscriptionEngine\?\.refresh/);
});

test('Subscription header presentation is event-driven and has no DOM observer loop', () => {
  assert.doesNotMatch(headerHelper, /MutationObserver/);
  assert.match(headerHelper, /herdharbor:subscription-engine-state/);
  assert.match(headerHelper, /data-hh-subscription-engine-tab/);
});

test('monthly and yearly prices are exposed in the member UI', () => {
  assert.match(adapter, /founder:[\s\S]*month:\s*999[\s\S]*year:\s*11000/);
  assert.match(adapter, /member:[\s\S]*month:\s*1499[\s\S]*year:\s*15000/);
  assert.match(adapter, /business:[\s\S]*month:\s*4999[\s\S]*year:\s*55000/);
  assert.match(adapter, /data-hh-stripe-interval="month"/);
  assert.match(adapter, /data-hh-stripe-interval="year"/);
});

test('checkout prices are selected only from server allowlist', () => {
  assert.match(billing, /const PRICES/);
  assert.match(billing, /PRICES\[planId\]\?\.\[billingInterval\]/);
  assert.match(billing, /line_items:\s*\[\{ price: price\.priceId, quantity: 1 \}\]/);
  assert.doesNotMatch(billing, /body\.priceId/);
});

test('webhook verifies Stripe signature before processing', () => {
  assert.match(webhook, /Stripe-Signature/);
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /STRIPE_WEBHOOK_SIGNING_SECRET/);
  assert.match(webhook, /subscription_events/);
  assert.match(webhook, /provider_event_id:\s*event\.id/);
  assert.match(webhook, /23505/);
});

test('webhook synchronizes subscription and payment lifecycle', () => {
  for (const event of [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed'
  ]) assert.match(webhook, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(webhook, /subscription_payments/);
  assert.match(webhook, /subscription_status/);
});

test('build loads Stripe adapter after existing subscription helpers', () => {
  assert.match(build, /buildId:\s*"subscription-engine-7"/);
  assert.match(build, /subscription-stripe-provider-v1\.8\.0\.js\?v=2/);
  const engine = build.indexOf('subscription-engine-v1.8.0.js');
  const visibility = build.indexOf('subscription-tab-visibility-v1.8.0.js');
  const header = build.indexOf('subscription-header-copy-v1.8.0.js');
  const stripe = build.indexOf('subscription-stripe-provider-v1.8.0.js');
  assert.ok(engine >= 0 && visibility > engine && header > visibility && stripe > header);
});

test('service worker rotates stale cache and covers all subscription assets', () => {
  assert.match(sw, /herdharbor-shell-v1\.8\.0-alpha-subscription-engine-7/);
  assert.match(sw, /subscription-stripe-provider-v1\.8\.0\.js\?v=2/);
  for (const asset of [
    'subscription-engine-v1.8.0.js',
    'subscription-engine-v1.8.0.css',
    'subscription-member-ui-v1.8.0.css',
    'subscription-tab-visibility-v1.8.0.js',
    'subscription-header-copy-v1.8.0.js',
    'subscription-stripe-provider-v1.8.0.js'
  ]) assert.match(sw, new RegExp(asset.replaceAll('.', '\\.')));
});
