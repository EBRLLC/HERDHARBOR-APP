const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../paper-pedigree-import-core-v1.8.2.js');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('core accepts the extractor node-array shape directly', () => {
  const extraction = {
    sourceName: 'photo.jpg',
    extractionId: 'extract-1',
    nodes: [
      { role: 'subject', name: 'Maple', registrationNumber: 'R-100', species: 'Rabbit', breed: 'Holland Lop', sex: 'Female' },
      { role: 'sire', name: 'Atlas', registrationNumber: 'R-200', species: 'Rabbit', breed: 'Holland Lop', sex: 'Male' },
      { role: 'dam', name: 'Willow', registrationNumber: 'R-201', species: 'Rabbit', breed: 'Holland Lop', sex: 'Female' }
    ]
  };
  const plan = Core.buildImportPlan({ animals: [] }, extraction);
  assert.equal(plan.canCommit, true);
  const byRole = Object.fromEntries(plan.actions.map((row) => [row.role, row]));
  assert.equal(byRole.subject.sireId, byRole.sire.animalId);
  assert.equal(byRole.subject.damId, byRole.dam.animalId);
});

test('tester-gated runtime loader installs the paper pedigree core before the UI', () => {
  const build = read('herdharbor-build.js');
  const optional = read('herdharbor-optional-tools.js');
  assert.doesNotMatch(build, /paper-pedigree-import-(?:core-)?v1\.8\.2\.js/);
  const ensureStart = optional.indexOf('async function ensureAiLiveTools()');
  const ensureEnd = optional.indexOf('function setAiLiveTesterEnabled', ensureStart);
  const ensure = optional.slice(ensureStart, ensureEnd);
  const coreIndex = ensure.indexOf('ASSETS.paperPedigreeCore');
  const uiIndex = ensure.indexOf('ASSETS.paperPedigreeUi');
  assert.ok(coreIndex >= 0, 'paper pedigree core must be tester-gated');
  assert.ok(uiIndex > coreIndex, 'paper pedigree UI must load after the core');
});

test('service worker keeps paper pedigree runtime cached without mandatory install or duplicate classification', () => {
  const worker = read('service-worker.js');
  const required = worker.slice(worker.indexOf('const REQUIRED_SHELL'), worker.indexOf('const RUNTIME_CACHE_PATHS'));
  const runtime = worker.slice(worker.indexOf('const RUNTIME_CACHE_PATHS'), worker.indexOf('const NETWORK_FIRST_PATHS'));
  const network = worker.slice(worker.indexOf('const NETWORK_FIRST_PATHS'), worker.indexOf('function isNetworkFirstPath'));
  for (const asset of ['paper-pedigree-import-core-v1.8.2.js?v=1','paper-pedigree-import-v1.8.2.js?v=2']) {
    assert.equal(required.includes(asset), false, asset + ' must not block install');
    assert.equal(runtime.includes(asset), true, asset + ' stays runtime-cacheable');
  }
  assert.equal(network.includes('/paper-pedigree-import-core-v1.8.2.js'), false);
  assert.equal(network.includes('/paper-pedigree-import-v1.8.2.js'), false);
});

test('reviewed source photo uses local attachment storage instead of canonical cloud state', () => {
  const ui = read('paper-pedigree-import-v1.8.2.js');
  assert.match(ui, /ATTACHMENT_DB = "herdharbor_attachments_v1"/);
  assert.match(ui, /ATTACHMENT_STORE = "pedigreeDocuments"/);
  assert.match(ui, /putPedigreeAttachment\(record\.id, preparedImage\)/);
  assert.match(ui, /sourceDataUrl:\s*""/);
  assert.match(ui, /attachmentStored:\s*Boolean\(file\?\.dataUrl\)/);
  assert.doesNotMatch(ui, /sourceDataUrl:\s*file\?\.dataUrl/);
});

test('AI extractor defaults to the current low-cost GPT-5.6 vision model and remains overrideable', () => {
  const edge = read('supabase/functions/paper-pedigree-extract/index.ts');
  assert.match(edge, /DEFAULT_MODEL = "gpt-5\.6-luna"/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_PEDIGREE_MODEL"\) \|\| DEFAULT_MODEL/);
});
