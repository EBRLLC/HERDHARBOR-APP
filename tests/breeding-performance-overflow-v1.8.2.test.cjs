const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'..','breeding-performance-dashboard-v1.8.2.css'),'utf8');
const build=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');

test('breeding performance cards contain wide tables instead of expanding the page',()=>{
  assert.match(css,/\.hh-bpd\{[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(css,/\.hh-bpd-card\{[^}]*min-width:0[^}]*max-width:100%[^}]*overflow:hidden/);
  assert.match(css,/\.hh-bpd-two\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css,/\.hh-bpd-two>\*\{[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(css,/\.hh-bpd-table-wrap\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow-x:auto[^}]*overflow-y:hidden/);
});

test('breeding analytics stylesheet cache key is bumped without changing public release identity',()=>{
  assert.match(build,/breeding-performance-dashboard-v1\.8\.2\.css\?v=2/);
  assert.match(build,/version:\s*"1\.8\.1"/);
  assert.doesNotMatch(build,/version:\s*"1\.8\.2"/);
});
