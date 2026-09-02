const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('Phase 3 modules load additively after rabbit genetics and are cached offline',()=>{
  const pwa=read('pwa.js'),worker=read('service-worker.js');
  for(const file of ['standards-registry-v1.6.1.js','multispecies-genetics-v1.6.1.js','standards-genetics-ui-v1.6.1.js','standards-genetics-v1.6.1.css']){assert.match(pwa+worker,new RegExp(file.replaceAll('.','\\.')));}
  assert.ok(pwa.indexOf('multispecies-genetics-v1.6.1.js')>pwa.indexOf('rabbit-genetics-v1.6.1.js'));
  assert.match(worker,/analytics-market-foundation/);
});

test('species-aware UI provides optional Shows, animal, entry, genetics and failure states',()=>{
  const ui=read('standards-genetics-ui-v1.6.1.js');
  assert.match(ui,/Rabbit Resources/);assert.match(ui,/ARBA Standards & Judging/);
  assert.match(ui,/\.hh-show-entry-row/);assert.match(ui,/View ARBA Standard/);
  assert.match(ui,/View genetics/);assert.match(ui,/ARBA reference temporarily unavailable/);
  assert.match(ui,/Quantitative values are never shown as Mendelian percentages/);
});

test('monitoring metadata avoids animal names and includes calculation context',()=>{
  const engine=read('multispecies-genetics-v1.6.1.js'),ui=read('standards-genetics-ui-v1.6.1.js');
  assert.match(engine,/speciesRuleVersion/);assert.match(engine,/calculationStage/);
  assert.match(ui,/optional_module_failure/);assert.doesNotMatch(engine,/monitoring:\{[^}]*name/);
});

test('mobile layouts exist for standards and genetics panels',()=>{
  const css=read('standards-genetics-v1.6.1.css');assert.match(css,/@media \(max-width: 600px\)/);assert.match(css,/100vw/);
});
