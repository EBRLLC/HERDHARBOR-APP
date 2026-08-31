const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('Phase 3 modules load additively after rabbit genetics and are cached offline',()=>{
  const pwa=read('pwa.js'),worker=read('service-worker.js');
  for(const file of ['standards-registry-phase3.js','multispecies-genetics-phase3.js','phase3-ui.js','phase3.css']){assert.match(pwa+worker,new RegExp(file.replaceAll('.','\\.')));}
  assert.ok(pwa.indexOf('multispecies-genetics-phase3.js')>pwa.indexOf('rabbit-genetics-v1.6.1.js'));
  assert.match(worker,/phase3-standards-multispecies/);
});

test('species-aware UI provides optional Shows, animal, entry, genetics and failure states',()=>{
  const ui=read('phase3-ui.js');
  assert.match(ui,/Rabbit Resources/);assert.match(ui,/ARBA Standards & Judging/);
  assert.match(ui,/\.hh-show-entry-row/);assert.match(ui,/View ARBA Standard/);
  assert.match(ui,/View genetics/);assert.match(ui,/ARBA reference temporarily unavailable/);
  assert.match(ui,/Quantitative values are never shown as Mendelian percentages/);
});

test('monitoring metadata avoids animal names and includes calculation context',()=>{
  const engine=read('multispecies-genetics-phase3.js'),ui=read('phase3-ui.js');
  assert.match(engine,/speciesRuleVersion/);assert.match(engine,/calculationStage/);
  assert.match(ui,/optional_module_failure/);assert.doesNotMatch(engine,/monitoring:\{[^}]*name/);
});

test('mobile layouts exist for standards and genetics panels',()=>{
  const css=read('phase3.css');assert.match(css,/@media \(max-width: 600px\)/);assert.match(css,/100vw/);
});
