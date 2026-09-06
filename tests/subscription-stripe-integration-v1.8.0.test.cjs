const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PRICES = [
  'price_1UCOktGlRukEX5RKPo6jm6Vr',
  'price_1UCOwAGlRukEX5RK34xr9dQS',
  'price_1UCOjrGlRukEX5RK9my06yUP',
  'price_1UCOvPGlRukEX5RKJA05lDmb',
  'price_1UCOuYGlRukEX5RKo6LUWZq3',
  'price_1UCOnnGlRukEX5RK36kjzNZ6'
];

test('Stripe provider maps all six verified live recurring prices', () => {
  const billing = read('supabase/functions/subscription-billing/index.ts');
  const correction = read('supabase/v1.8.0-stripe-price-id-correction.sql');
  for (const price of PRICES) {
    assert.match(billing, new RegExp(price));
    assert.match(correction, new RegExp(price));
  }
});

test('billing secrets remain server-side', () => {
  const provider = read('subscription-stripe-provider-v1.8.0.js');
  const billing = read('supabase/functions/subscription-billing/index.ts');
  const webhook = read('supabase/functions/subscription-webhook/index.ts');
  assert.doesNotMatch(provider, /sk_(?:live|test)_/i);
  assert.doesNotMatch(provider, /whsec_/i);
  assert.match(billing, /Deno\.env\.get\("STRIPE_SECRET_KEY"\)/);
  assert.match(webhook, /Deno\.env\.get\("STRIPE_WEBHOOK_SIGNING_SECRET"\)/);
});

test('webhook verifies Stripe signature and is idempotent', () => {
  const webhook = read('supabase/functions/subscription-webhook/index.ts');
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /Stripe-Signature/);
  assert.match(webhook, /provider_event_id/);
  assert.match(webhook, /23505/);
});

test('browser provider supports monthly and yearly billing without owning auth', () => {
  const provider = read('subscription-stripe-provider-v1.8.0.js');
  assert.match(provider, /selectedInterval/);
  assert.match(provider, /"year"/);
  assert.match(provider, /const cloud = window\.HerdHarborCloud/);
  assert.match(provider, /cloud\.invokeFunction\("subscription-billing"/);
  assert.match(provider, /appReadyForBilling/);
  assert.match(provider, /classList\.contains\("hh-auth-locked"\)/);
  assert.doesNotMatch(provider, /signOut\s*\(/);
  assert.doesNotMatch(provider, /setSession\s*\(/);
  assert.doesNotMatch(provider, /createClient\s*\(/);
});

test('service worker refreshes the Stripe provider instead of serving stale v1.8.0 assets', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /subscription-engine-8/);
  assert.match(sw, /subscription-stripe-provider-v1\.8\.0\.js/);
  assert.match(sw, /NETWORK_FIRST_PATHS/);
});
