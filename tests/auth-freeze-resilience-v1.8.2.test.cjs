const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');

function loadBuild(){
  const sandbox={
    URL,
    AbortController,
    Promise,
    Array,
    Object,
    console,
    location:{href:'https://app.herdharbor.com/'},
    document:null,
    fetch:async()=>({ok:true}),
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'herdharbor-build.js'});
  return sandbox;
}

test('auth resilience stays frozen while the web runtime advances to v1.8.2',()=>{
  const sandbox=loadBuild();
  assert.equal(sandbox.HerdHarborBuild.version,'1.8.2');
  assert.equal(sandbox.HerdHarborBuild.buildId,'cloud-sync-v2-baseline-recovery-2');
});

test('auth resilience only bounds critical Supabase auth and first-hydration requests',()=>{
  const {HerdHarborAuthResilience:guard}=loadBuild();
  assert.equal(guard.isCriticalAuthUrl('https://okynebbksifqppwicghj.supabase.co/auth/v1/token?grant_type=password'),true);
  assert.equal(guard.isCriticalAuthUrl('https://okynebbksifqppwicghj.supabase.co/rest/v1/herdharbor_user_data?select=*'),true);
  assert.equal(guard.isCriticalAuthUrl('https://okynebbksifqppwicghj.supabase.co/rest/v1/account_access?select=*'),true);
  assert.equal(guard.isCriticalAuthUrl('https://okynebbksifqppwicghj.supabase.co/rest/v1/rpc/herdharbor_account_role'),true);
  assert.equal(guard.isCriticalAuthUrl('https://okynebbksifqppwicghj.supabase.co/storage/v1/object/photos/a.jpg'),false);
  assert.equal(guard.isCriticalAuthUrl('https://example.com/auth/v1/token'),false);
  assert.equal(guard.timeoutMs,12000);
  assert.equal(guard.watchdogMs,15000);
});

test('sign-in watchdog re-enables a stuck form but never removes the auth lock',()=>{
  const sandbox=loadBuild();
  let locked=true;
  const controls=[{disabled:true},{disabled:true},{disabled:false}];
  const message={textContent:'Signing in…',dataset:{},setAttribute(name,value){this[name]=value;}};
  const form={id:'hh-signin-form',isConnected:true,querySelectorAll(){return controls;}};
  sandbox.document={
    documentElement:{classList:{contains(name){return name==='hh-auth-locked'&&locked;}}},
    querySelector(selector){return selector==='#hh-auth-message'?message:null;}
  };

  const recovered=sandbox.HerdHarborAuthResilience.recoverSignInForm(form);
  assert.equal(recovered,true);
  assert.deepEqual(controls.map(row=>row.disabled),[false,false,false]);
  assert.match(message.textContent,/taking too long/i);
  assert.equal(message.dataset.type,'error');
  assert.equal(locked,true,'recovery must not bypass authentication by removing the lock');
});

test('watchdog does nothing after authentication has already unlocked the app',()=>{
  const sandbox=loadBuild();
  const controls=[{disabled:true}];
  const form={isConnected:true,querySelectorAll(){return controls;}};
  sandbox.document={
    documentElement:{classList:{contains(){return false;}}},
    querySelector(){return null;}
  };
  assert.equal(sandbox.HerdHarborAuthResilience.recoverSignInForm(form),false);
  assert.equal(controls[0].disabled,true);
});

test('source uses AbortController timeout protection without manually unlocking the app',()=>{
  assert.match(source,/AUTH_FETCH_TIMEOUT_MS\s*=\s*12000/);
  assert.match(source,/new root\.AbortController\(\)/);
  assert.match(source,/controller\.abort\(\)/);
  assert.match(source,/hh-signin-form/);
  assert.doesNotMatch(source,/classList\.remove\(["']hh-auth-locked["']\)/);
  assert.doesNotMatch(source,/\bunlockApp\s*\(/);
});