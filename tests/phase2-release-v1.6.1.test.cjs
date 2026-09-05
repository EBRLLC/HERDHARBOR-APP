const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('current release build identity has one authoritative source',()=>{
  const build=read('herdharbor-build.js'),html=read('index.html'),pwa=read('pwa.js');
  assert.match(build,/version:\s*"1\.7\.0"/);
  assert.match(build,/buildId:\s*"multispecies-genetics-foundation-1"/);
  assert.match(html,/HerdHarborBuild\?\.version/);
  assert.match(pwa,/HerdHarborBuild\?\.version/);
});

test('sync state is pinned in the top bar and settings build details are compact',()=>{
  const html=read('index.html');
  assert.match(html,/id="topbar-sync"/);
  assert.match(html,/id="topbar-sync-label"/);
  assert.match(html,/<details class="settings-about">/);
});

test('new genetics engine is loaded after compatibility runtimes and cached offline',()=>{
  const pwa=read('pwa.js'),worker=read('service-worker.js');
  assert.ok(pwa.indexOf('rabbit-genetics-v1.6.1.js')>pwa.indexOf('rabbit-genetics-runtime-v1.6.1.js'));
  assert.match(worker,/rabbit-genetics-v1\.6\.1\.js\?v=1\.7\.0/);
});
