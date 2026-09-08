const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'herdharbor-build.js'), 'utf8');

function loadBuild() {
  let registeredAuthCallback = null;
  const timers = [];
  const sandbox = {
    URL,
    Promise,
    Array,
    Object,
    console,
    location: { href: 'https://app.herdharbor.com/' },
    document: null,
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
    supabase: {
      createClient() {
        return {
          auth: {
            onAuthStateChange(callback) {
              registeredAuthCallback = callback;
              return { data: { subscription: { unsubscribe() {} } } };
            }
          }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'herdharbor-build.js' });
  return { sandbox, timers, getRegistered: () => registeredAuthCallback };
}

test('public release identity stays v1.8.1', () => {
  const { sandbox } = loadBuild();
  assert.equal(sandbox.HerdHarborBuild.version, '1.8.1');
});

test('Supabase auth callbacks are deferred out of the auth notification lock', async () => {
  const { sandbox, timers, getRegistered } = loadBuild();
  const client = sandbox.supabase.createClient('https://example.supabase.co', 'key');
  let called = false;
  let receivedEvent = null;

  client.auth.onAuthStateChange((event) => {
    called = true;
    receivedEvent = event;
  });

  const registered = getRegistered();
  assert.equal(typeof registered, 'function');
  registered('SIGNED_IN', { user: { id: 'user-1' } });

  assert.equal(called, false, 'callback must not run synchronously inside Supabase auth notification');
  assert.equal(timers.length, 1, 'callback should be queued into a later task');

  timers.shift()();
  await Promise.resolve();
  assert.equal(called, true);
  assert.equal(receivedEvent, 'SIGNED_IN');
});

test('auth callback deferral installs before herdharbor-cloud can create its client', () => {
  const installIndex = source.indexOf('installSupabaseAuthCallbackDeferral();');
  const documentGuardIndex = source.indexOf('if (!root.document) return;');
  assert.ok(installIndex >= 0, 'deferral installer must exist');
  assert.ok(documentGuardIndex >= 0, 'document guard must exist');
  assert.ok(installIndex < documentGuardIndex, 'deferral must install before cloud initialization can begin');
});

test('watchdog promotes a stuck sign-in message to a visible error state', () => {
  assert.match(source, /box\.className\s*=\s*["']hh-auth-message show error["']/);
});