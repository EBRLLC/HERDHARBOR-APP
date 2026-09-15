const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const modulePath = path.join(__dirname, '..', 'local-cache-v2-v1.8.2.js');
const source = fs.readFileSync(modulePath, 'utf8');
const cache = require(modulePath);

test('local cache V2 keeps the high-use working sections separate', () => {
  const state = {
    animals: [{ id: 'a1', name: 'Annie' }],
    tasks: [{ id: 't1', title: 'Check nest box' }],
    breedings: [{ id: 'b1' }],
    litters: [{ id: 'l1' }],
    settings: { theme: 'system' },
    sales: [{ id: 's1' }]
  };

  const hot = cache.extractHotSections(state);
  assert.deepEqual(Object.keys(hot).sort(), ['animals', 'breedings', 'litters', 'settings', 'tasks']);
  assert.equal(hot.animals[0].name, 'Annie');
  assert.equal(hot.sales, undefined);
});

test('local cache V2 rejects malformed state without touching app data', () => {
  assert.equal(cache.safeParse('{bad json'), null);
  assert.equal(cache.safeParse(''), null);
  assert.deepEqual(cache.safeParse('{"animals":[]}'), { animals: [] });
});

test('local cache V2 uses IndexedDB and gzip when the browser supports it', () => {
  assert.match(source, /herdharbor_local_cache_v2/);
  assert.match(source, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(source, /CompressionStream\("gzip"\)/);
  assert.match(source, /DecompressionStream\("gzip"\)/);
});

test('cache writes are deferred and do not block closing HerdHarbor', () => {
  assert.match(source, /requestIdleCallback/);
  assert.match(source, /CACHE_DELAY_MS = 700/);
  assert.match(source, /pagehide/);
  assert.doesNotMatch(source, /beforeunload/);
});

test('cache module exposes background cache diagnostics without changing auth', () => {
  assert.equal(cache.version, '2.0');
  assert.equal(cache.release, '1.8.2');
  assert.deepEqual(cache.hotSections, ['animals', 'tasks', 'breedings', 'litters', 'settings']);
  assert.doesNotMatch(source, /auth\.signIn/);
  assert.doesNotMatch(source, /auth\.signOut/);
});
