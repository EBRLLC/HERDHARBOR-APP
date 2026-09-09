const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'herdharbor-build.js'), 'utf8');

class FakeStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key) {
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
}

function loadBuild() {
  const localStorage = new FakeStorage();
  const sessionStorage = new FakeStorage();
  const cloudBaseKey = 'herdharbor_user_cloud_base_user-1';
  localStorage.setItem(cloudBaseKey, '{"animals":[{"photoData":"large-photo"}]}');
  localStorage.setItem('herdharbor_pre_alpha_v1', '{"animals":[]}');

  const sandbox = {
    Storage: FakeStorage,
    localStorage,
    sessionStorage,
    URL,
    Promise,
    console,
    location: { href: 'https://app.herdharbor.com/' },
    document: null,
    fetch: null
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'herdharbor-build.js' });
  return { localStorage, sessionStorage, cloudBaseKey };
}

test('cloud merge baseline is migrated out of localStorage before cloud boot', () => {
  const { localStorage, sessionStorage, cloudBaseKey } = loadBuild();
  assert.equal(localStorage.map.has(cloudBaseKey), false);
  assert.equal(sessionStorage.map.has(cloudBaseKey), true);
  assert.match(sessionStorage.map.get(cloudBaseKey), /large-photo/);
});

test('cloud engine can keep reading and writing the baseline through localStorage API', () => {
  const { localStorage, sessionStorage, cloudBaseKey } = loadBuild();
  assert.match(localStorage.getItem(cloudBaseKey), /large-photo/);
  localStorage.setItem(cloudBaseKey, '{"animals":[{"name":"next"}]}');
  assert.equal(localStorage.map.has(cloudBaseKey), false);
  assert.match(sessionStorage.map.get(cloudBaseKey), /next/);
  assert.match(localStorage.getItem(cloudBaseKey), /next/);
});

test('normal HerdHarbor state remains in localStorage', () => {
  const { localStorage } = loadBuild();
  localStorage.setItem('herdharbor_pre_alpha_v1', '{"animals":[{"name":"Flop"}]}');
  assert.equal(localStorage.map.has('herdharbor_pre_alpha_v1'), true);
  assert.match(localStorage.getItem('herdharbor_pre_alpha_v1'), /Flop/);
});
