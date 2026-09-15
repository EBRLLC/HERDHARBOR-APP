const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const Router = require('../animal-action-router-v1.8.3.js');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('v1.8.3 router owns the high-frequency animal profile actions', () => {
  assert.equal(Router.VERSION, '1.8.3');
  assert.deepEqual([...Router.DIRECT_ACTIONS], [
    'weight', 'health', 'episode', 'care', 'breeding', 'genetics', 'show-entry'
  ]);
  for (const action of Router.DIRECT_ACTIONS) assert.equal(Router.canHandle(action), true);
  for (const fallback of ['pedigree', 'print-pedigree', 'analytics', 'edit']) {
    assert.equal(Router.canHandle(fallback), false, `${fallback} should remain on the proven compatibility path until directly migrated`);
  }
});

test('breeding safeguards remain intact in the consolidated action router', () => {
  assert.deepEqual(Router.breedingAvailability({ status: 'Active', sex: 'Female' }, false), { allowed: true, reason: '' });
  assert.deepEqual(Router.breedingAvailability({ status: 'Breeding', sex: 'Male' }, false), { allowed: true, reason: '' });
  assert.deepEqual(Router.breedingAvailability({ status: 'Sold', sex: 'Female' }, false), { allowed: false, reason: 'historical' });
  assert.deepEqual(Router.breedingAvailability({ status: 'Ancestor Only', sex: 'Male' }, false), { allowed: false, reason: 'historical' });
  assert.deepEqual(Router.breedingAvailability({ status: 'Active', sex: 'Female' }, true), { allowed: false, reason: 'quarantined' });
  assert.deepEqual(Router.breedingAvailability({ status: 'Active', sex: '' }, false), { allowed: false, reason: 'missing-sex' });
  assert.deepEqual(Router.breedingAvailability(null, false), { allowed: false, reason: 'missing-animal' });
});

test('direct animal actions no longer depend on opening the legacy profile modal', () => {
  const source = read('animal-action-router-v1.8.3.js');
  assert.doesNotMatch(source, /hh-p1-profile-hub/);
  assert.doesNotMatch(source, /data-view-animal/);
  assert.doesNotMatch(source, /detail-import-pedigree|detail-print-pedigree|detail-edit|detail-analytics/);
  assert.match(source, /#view-animal-profile\.active \[data-hh-p2-action\]/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
});

test('router delegates to canonical domain entry points rather than creating replacement records', () => {
  const source = read('animal-action-router-v1.8.3.js');
  assert.match(source, /#add-health/);
  assert.match(source, /#health-form/);
  assert.match(source, /data\.hiAction = action/);
  assert.match(source, /#add-breeding/);
  assert.match(source, /#breeding-form/);
  assert.match(source, /HerdHarborAnimalGenetics\.open/);
  assert.match(source, /\[data-add-entry\]/);
  assert.doesNotMatch(source, /commitState\(/);
  assert.doesNotMatch(source, /state\.animals\s*=/);
});

test('runtime loads the v1.8.3 router after the profile shell and before profile add-ons', () => {
  const build = read('herdharbor-build.js');
  const profile = build.indexOf('flow-phase2-v1.8.2.js?v=1');
  const router = build.indexOf('animal-action-router-v1.8.3.js?v=1');
  const lifecycle = build.indexOf('flow-phase2-lifecycle-v1.8.2.js?v=1');
  assert.ok(profile >= 0, 'animal profile shell must be loaded');
  assert.ok(router > profile, 'animal action router must load after the profile shell API');
  assert.ok(lifecycle > router, 'lifecycle/profile add-ons must load after the router is installed');
});

test('PWA shell caches and network-refreshes the v1.8.3 router', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /\.\/animal-action-router-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/animal-action-router-v1\.8\.3\.js"/);
});
