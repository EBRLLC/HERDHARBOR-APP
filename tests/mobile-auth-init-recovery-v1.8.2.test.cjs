const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'herdharbor-build.js'), 'utf8');

function loadBuild(fetchImpl) {
  const sandbox = {
    URL,
    Response,
    AbortController,
    Promise,
    Array,
    Object,
    JSON,
    console,
    location: { href: 'https://app.herdharbor.com/' },
    document: null,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'herdharbor-build.js' });
  return sandbox;
}

test('critical Supabase network failures resolve to a structured retryable response instead of rejecting startup', async () => {
  const sandbox = loadBuild(async () => {
    const error = new TypeError('Load failed');
    throw error;
  });

  const response = await sandbox.fetch('https://okynebbksifqppwicghj.supabase.co/auth/v1/token?grant_type=refresh_token');
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, 'HH_SECURE_NETWORK');
  assert.match(payload.message, /temporarily unavailable/i);
});

test('critical first-hydration REST failures are also converted into normal Supabase error responses', async () => {
  const sandbox = loadBuild(async () => { throw new TypeError('Network request failed'); });
  const response = await sandbox.fetch('https://okynebbksifqppwicghj.supabase.co/rest/v1/herdharbor_user_data?select=*');
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, 'secure_connection_unavailable');
});

test('noncritical network requests retain normal fetch rejection behavior', async () => {
  const sandbox = loadBuild(async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(
    sandbox.fetch('https://example.com/anything'),
    /Network request failed/
  );
});

test('an upstream caller abort is preserved and never converted into a fake server response', async () => {
  const sandbox = loadBuild((_input, init) => new Promise((resolve, reject) => {
    if (init.signal.aborted) {
      const error = new Error('caller aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    init.signal.addEventListener('abort', () => {
      const error = new Error('caller aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    sandbox.fetch('https://okynebbksifqppwicghj.supabase.co/auth/v1/token', { signal: controller.signal }),
    (error) => error?.name === 'AbortError'
  );
});

test('auth recovery remains fail-closed and never removes the authentication lock', () => {
  assert.match(source, /recoverableNetworkResponse/);
  assert.match(source, /status:\s*timedOut\s*\?\s*504\s*:\s*503/);
  assert.doesNotMatch(source, /classList\.remove\(["']hh-auth-locked["']\)/);
  assert.doesNotMatch(source, /\bunlockApp\s*\(/);
});
