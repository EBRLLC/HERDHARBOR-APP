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

test('runtime loader installs the paper pedigree core before the UI', () => {
  const build = read('herdharbor-build.js');
  const coreIndex = build.indexOf('paper-pedigree-import-core-v1.8.2.js?v=1');
  const uiIndex = build.indexOf('paper-pedigree-import-v1.8.2.js?v=2');
  assert.ok(coreIndex >= 0, 'paper pedigree core must be loaded');
  assert.ok(uiIndex > coreIndex, 'paper pedigree UI must load after the core');
});

test('service worker includes paper pedigree runtime in shell and network-first policy', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /\.\/paper-pedigree-import-core-v1\.8\.2\.js\?v=1/);
  assert.match(worker, /\.\/paper-pedigree-import-v1\.8\.2\.js\?v=2/);
  assert.match(worker, /"\/paper-pedigree-import-core-v1\.8\.2\.js"/);
  assert.match(worker, /"\/paper-pedigree-import-v1\.8\.2\.js"/);
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
