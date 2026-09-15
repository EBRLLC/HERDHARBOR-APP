const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('paper pedigree browser runtimes compile as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(read('paper-pedigree-import-core-v1.8.2.js'), { filename: 'paper-pedigree-import-core-v1.8.2.js' }));
  assert.doesNotThrow(() => new vm.Script(read('paper-pedigree-import-v1.8.2.js'), { filename: 'paper-pedigree-import-v1.8.2.js' }));
});

test('paper pedigree Edge Function compiles as TypeScript', () => {
  const result = esbuild.transformSync(read('supabase/functions/paper-pedigree-extract/index.ts'), {
    loader: 'ts',
    target: 'es2022',
    format: 'esm'
  });
  assert.ok(result.code.includes('paper-pedigree-photo'));
  assert.ok(result.code.includes('gpt-5.6-luna'));
});
