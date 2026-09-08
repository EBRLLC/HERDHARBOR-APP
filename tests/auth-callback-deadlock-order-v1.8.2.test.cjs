const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('build auth resilience still loads before cloud auth initialization', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const build = index.indexOf('herdharbor-build.js');
  const cloud = index.indexOf('herdharbor-cloud.js');
  assert.ok(build >= 0, 'index must load herdharbor-build.js');
  assert.ok(cloud >= 0, 'index must load herdharbor-cloud.js');
  assert.ok(build < cloud, 'auth deadlock prevention must install before herdharbor-cloud initializes Supabase');
});