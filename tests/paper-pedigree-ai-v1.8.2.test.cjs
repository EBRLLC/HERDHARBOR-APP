const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('paper pedigree AI key stays server-side and the browser uses HerdHarbor secure function invocation', () => {
  const ui = read('paper-pedigree-import-v1.8.2.js');
  const edge = read('supabase/functions/paper-pedigree-extract/index.ts');
  assert.doesNotMatch(ui, /OPENAI_API_KEY|api\.openai\.com|Bearer\s+\$\{openAiKey\}/);
  assert.match(ui, /invokeFunction\("paper-pedigree-extract"/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /if \(!token\).*Authentication is required/);
});

test('extractor is privacy bounded and does not request provider-side response storage', () => {
  const edge = read('supabase/functions/paper-pedigree-extract/index.ts');
  assert.match(edge, /store:\s*false/);
  assert.match(edge, /ALLOWED_MIME = new Set\(\["image\/jpeg", "image\/png"\]\)/);
  assert.match(edge, /MAX_DATA_URL_LENGTH/);
  assert.match(edge, /Automatic pedigree reading currently supports JPG and PNG photos/);
  assert.match(edge, /Your farm records were not changed/);
});

test('extractor uses structured JSON output and the defined three-generation lineage roles', () => {
  const edge = read('supabase/functions/paper-pedigree-extract/index.ts');
  assert.match(edge, /type:\s*"json_schema"/);
  assert.match(edge, /strict:\s*true/);
  for (const role of ['subject','sire','dam','sireSire','sireDam','damSire','damDam','sireSireSire','damDamDam']) {
    assert.match(edge, new RegExp(`"${role}"`));
  }
  assert.match(edge, /Do not invent missing names/);
  assert.match(edge, /draft for human review/);
});

test('paper pedigree reader uses the current image-capable low-cost model with an environment override', () => {
  const edge = read('supabase/functions/paper-pedigree-extract/index.ts');
  assert.match(edge, /DEFAULT_MODEL = "gpt-5\.6-luna"/);
  assert.match(edge, /OPENAI_PEDIGREE_MODEL/);
  assert.match(edge, /type:\s*"input_image"/);
  assert.match(edge, /detail:\s*"high"/);
});

test('UI requires explicit review before any canonical state commit', () => {
  const ui = read('paper-pedigree-import-v1.8.2.js');
  assert.match(ui, /Review required/);
  assert.match(ui, /Nothing has been added to your records yet/);
  assert.match(ui, /Review complete — import pedigree/);
  assert.match(ui, /async function commitReviewedPedigree\(\)/);
  const commitCalls = [...ui.matchAll(/commitState\(/g)];
  assert.equal(commitCalls.length, 1, 'paper pedigree UI should have one explicit canonical commit path');
});

test('UI launches from Pedigrees and Quick Add without replacing the existing pedigree builder', () => {
  const ui = read('paper-pedigree-import-v1.8.2.js');
  assert.match(ui, /#import-pedigree/);
  assert.match(ui, /data-quick="pedigree"/);
  assert.match(ui, /Import paper pedigree photo/);
  assert.match(ui, /Paper pedigree photo/);
  assert.doesNotMatch(ui, /remove\(.*import-pedigree/);
});

test('Supabase config requires authentication for the paper pedigree extractor', () => {
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.paper-pedigree-extract\][\s\S]*?verify_jwt = true/);
});
