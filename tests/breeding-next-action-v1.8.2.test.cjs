const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Core=require('../breeding-next-action-core-v1.8.2.js');
const BreedingRuntime=require('../breeding-litter-runtime-v1.8.3.js');

function rabbitFixture(){return{
  animals:[
    {id:'doe',name:'Judy',species:'Rabbit',breed:'Holland Lop',sex:'Female',status:'Breeding'},
    {id:'buck',name:'Jack',species:'Rabbit',breed:'Holland Lop',sex:'Male',status:'Active'}
  ],
  breedings:[{id:'b1',femaleId:'doe',maleId:'buck',breedingDate:'2026-09-01',status:'Bred',pregnancyCheckStatus:'Not checked'}],
  litters:[],sales:[],transfers:[]
};}

test('rabbit defaults derive day-12 pregnancy check, day-31 due date, and a conservative day-42 weaning target',()=>{
  const state=rabbitFixture(),breeding=state.breedings[0];
  assert.equal(Core.derivedPregnancyCheckDate(state,breeding),'2026-09-13');
  assert.equal(Core.derivedDueDate(state,breeding),'2026-10-02');
  assert.equal(Core.RABBIT_DEFAULTS.weaningDay,42);
});

test('rabbit breeding tells the breeder the pregnancy check is due on day 12',()=>{
  const state=rabbitFixture();
  const next=Core.breedingNextAction(state,state.breedings[0],'2026-09-13');
  assert.equal(next.kind,'pregnancy-check');
  assert.equal(next.shortLabel,'Record pregnancy check');
  assert.equal(next.dueDate,'2026-09-13');
  assert.equal(next.urgency,'today');
});

test('confirmed pregnancy advances to birth instead of asking for another pregnancy check',()=>{
  const state=rabbitFixture();state.breedings[0]={...state.breedings[0],pregnancyCheckStatus:'Positive',status:'Confirmed Pregnant'};
  const approaching=Core.breedingNextAction(state,state.breedings[0],'2026-09-30');
  assert.equal(approaching.kind,'prepare-birth');
  const due=Core.breedingNextAction(state,state.breedings[0],'2026-10-02');
  assert.equal(due.kind,'record-birth');
});

test('linked litter advances through offspring details and weaning',()=>{
  const state=rabbitFixture();
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-10-02',bornAlive:'2',weaned:'0',expectedWeanDate:'2026-11-20',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Judy Kit 1',species:'Rabbit',sex:'Unknown',status:'Active',sourceBirthId:'l1'},
    {id:'k2',name:'Judy Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'Active',sourceBirthId:'l1'}
  );
  let next=Core.breedingNextAction(state,state.breedings[0],'2026-10-10');
  assert.equal(next.kind,'update-offspring');
  state.animals[2]={...state.animals[2],sex:'Male',tag:'WT1'};
  next=Core.breedingNextAction(state,state.breedings[0],'2026-11-20');
  assert.equal(next.kind,'wean-litter');
});

test('four-day-old rabbit litter cannot be evaluated for weaning from a legacy weaned count',()=>{
  const state=rabbitFixture();
  state.breedings[0]={...state.breedings[0],breedingDate:'2026-08-03',status:'Delivered'};
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-09-03',bornAlive:'2',weaned:'2',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Judy Kit 1',species:'Rabbit',sex:'Male',tag:'WT1',status:'Active',sourceBirthId:'l1'},
    {id:'k2',name:'Judy Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'Active',sourceBirthId:'l1'}
  );
  assert.equal(Core.derivedWeanDate(state,state.litters[0]),'2026-10-15');
  assert.equal(Core.effectiveWeanedCount(state,state.litters[0],'2026-09-07'),0);
  assert.equal(Core.weaningComplete(state,state.litters[0],'2026-09-07'),false);
  const next=Core.litterNextAction(state,state.litters[0],'2026-09-07');
  assert.equal(next.kind,'manage-litter');
  assert.equal(next.dueDate,'2026-10-15');
  assert.match(next.label,/Weaning in 38 days/);
  assert.equal(Core.dashboardActions(state,'2026-09-07',14).length,0);
});

test('an explicit expected wean date overrides the rabbit default',()=>{
  const state=rabbitFixture();
  const litter={id:'l1',damId:'doe',sireId:'buck',birthDate:'2026-09-03',expectedWeanDate:'2026-10-01'};
  assert.equal(Core.derivedWeanDate(state,litter),'2026-10-01');
});

test('explicit offspring weaning records can advance the workflow even when earlier than the default target',()=>{
  const state=rabbitFixture();
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-09-03',bornAlive:'2',weaned:'0',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Kit 1',species:'Rabbit',sex:'Male',tag:'WT1',status:'Active',sourceBirthId:'l1',weanedDate:'2026-10-01'},
    {id:'k2',name:'Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'Active',sourceBirthId:'l1',weanedDate:'2026-10-01'}
  );
  assert.equal(Core.weaningComplete(state,state.litters[0],'2026-10-01'),true);
  assert.equal(Core.litterNextAction(state,state.litters[0],'2026-10-01').kind,'evaluate-litter');
});

test('weaned litter asks for evaluation once, then moves to buyer sale',()=>{
  const state=rabbitFixture();
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-10-02',bornAlive:'2',weaned:'2',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Kit 1',species:'Rabbit',sex:'Male',tag:'WT1',status:'Active',sourceBirthId:'l1'},
    {id:'k2',name:'Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'For Sale',sourceBirthId:'l1'}
  );
  let next=Core.litterNextAction(state,state.litters[0],'2026-11-20');
  assert.equal(next.kind,'evaluate-litter');
  const marked=Core.markEvaluated(state,'l1',['k1','k2']);
  next=Core.litterNextAction(marked,marked.litters[0],'2026-11-20');
  assert.equal(next.kind,'create-sale');
});

test('completed litter sale advances to member transfer when no transfer exists',()=>{
  let state=rabbitFixture();
  state.litters=[{id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',bornAlive:'1',weaned:'1',offspringIds:['k1'],nextActionEvaluatedIds:['k1']}];
  state.animals.push({id:'k1',name:'Kit 1',status:'Sold',sourceBirthId:'l1'});
  state.sales=[{id:'s1',saleNumber:'HH-2026-1',status:'Completed',sourceLitterId:'l1',items:[{animalId:'k1'}]}];
  const next=Core.litterNextAction(state,state.litters[0],'2026-11-20');
  assert.equal(next.kind,'transfer-buyer');assert.equal(next.saleId,'s1');
  state.transfers=[{id:'t1',sourceSaleNumber:'HH-2026-1',animalIds:['k1'],status:'accepted'}];
  assert.equal(Core.litterNextAction(state,state.litters[0],'2026-11-20').kind,'lifecycle-complete');
});

test('dashboard only surfaces breeding actions inside the selected horizon plus immediate workflow actions',()=>{
  const state=rabbitFixture();
  assert.equal(Core.dashboardActions(state,'2026-09-01',5).length,0);
  const due=Core.dashboardActions(state,'2026-09-10',5);
  assert.equal(due.length,1);assert.equal(due[0].kind,'open-breeding');
});

test('UI surfaces next action on profile, breeding cards, litter workspace, and Today',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','breeding-next-action-v1.8.2.js'),'utf8');
  for(const token of ['hh-next-profile','hh-next-card-row','hh-next-workspace','hh-next-dashboard'])assert.match(ui,new RegExp(token));
  assert.match(ui,/HerdHarborFlowPhase2\?\.openAnimalProfile/);
  assert.match(ui,/HerdHarborBreedingWorkspace\?\.open/);
  assert.match(ui,/data-hh-bw-disposition/);
  assert.match(ui,/HerdHarborApp\?\.openRecordBirth/);
  assert.doesNotMatch(ui,/nav-item\[data-route="breeding"\]/);
  assert.doesNotMatch(ui,/data-record-birth=/);
  assert.doesNotMatch(ui,/data-hh-p2-life-action="record-birth"/);
  assert.doesNotMatch(ui,/hh-p2-life-actions button:first-child/);
});

test('Today Record Birth click opens the canonical birth form for the exact breeding',()=>{
  const state={
    animals:[
      {id:'doe1',name:'First Doe',species:'Rabbit',sex:'Female',status:'Breeding'},
      {id:'buck1',name:'First Buck',species:'Rabbit',sex:'Male',status:'Active'},
      {id:'doe2',name:'Target Doe',species:'Rabbit',sex:'Female',status:'Breeding'},
      {id:'buck2',name:'Target Buck',species:'Rabbit',sex:'Male',status:'Active'}
    ],
    breedings:[
      {id:'b1',femaleId:'doe1',maleId:'buck1',breedingDate:'2026-09-15',dueDate:'2026-10-16',status:'Confirmed pregnant',pregnancyCheckStatus:'Positive'},
      {id:'b2',femaleId:'doe2',maleId:'buck2',breedingDate:'2026-09-01',dueDate:'2026-10-02',status:'Confirmed pregnant',pregnancyCheckStatus:'Positive'}
    ],
    litters:[],tasks:[],sales:[],transfers:[],profile:{},settings:{}
  };
  let captured=null;
  const input=value=>({value,addEventListener(){}});
  const form={addEventListener(){}};
  const fields={
    '[name="breedingId"]':input('b2'),
    '[name="damId"]':input('doe2'),
    '[name="sireId"]':input('buck2'),
    '[name="birthDate"]':input('2026-10-02'),
    '[name="expectedWeanDate"]':input('')
  };
  const $=selector=>{
    if(selector==='#litter-form')return form;
    if(selector==='#delete-litter')return null;
    return fields[selector]||{addEventListener(){}};
  };
  const animalName=id=>state.animals.find(animal=>animal.id===id)?.name||id;
  const addDays=(date,days)=>{
    const value=new Date(date+'T12:00:00Z');
    value.setUTCDate(value.getUTCDate()+Number(days||0));
    return value.toISOString().slice(0,10);
  };
  const runtime=BreedingRuntime.create({
    getState:()=>state,$,$$:()=>[],esc:value=>String(value??''),headerHtml:()=>'',statCard:()=>'',emptyState:()=>'',animalName,
    formatDate:value=>String(value||''),daysFromNow:()=>0,ensureSpreadsheetToolsReady:async()=>({}),
    openModal:(title,html)=>{captured={title,html};},closeModal:()=>{},
    selectAnimalField:(label,name,selected)=>`<label>${label}<select name="${name}"><option value="${selected}" selected>${selected}</option></select></label>`,
    field:(label,name,value)=>`<label>${label}<input name="${name}" value="${value??''}"></label>`,
    selectField:(label,name,options,selected)=>`<label>${label}<select name="${name}"><option value="${selected}" selected>${selected}</option></select></label>`,
    textareaField:(label,name,value)=>`<label>${label}<textarea name="${name}">${value??''}</textarea></label>`,
    todayISO:()=> '2026-10-02',toast:()=>{},navigate:()=>{},uid:prefix=>prefix+'_1',recordActivity:()=>{},
    saveState:()=>true,renderCurrentView:()=>{},addDays,allowsAnimalTransition:()=>true,rememberBreed:()=>{},completeWorkflowTasks:()=>{}
  });

  const action=Core.dashboardActions(state,'2026-10-02',14).find(item=>item.kind==='record-birth'&&item.breedingId==='b2');
  assert.ok(action,'target breeding is surfaced as a Today Record Birth action');

  const clickHandlers=[];
  const context={
    HerdHarborBreedingNextActionCore:Core,
    HerdHarborApp:{getState:()=>state,openRecordBirth:id=>runtime.openRecordBirth(id)},
    HerdHarborFlowPhase2:{},HerdHarborBreedingWorkspace:{},
    document:{body:{},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null},
    MutationObserver:class{observe(){} disconnect(){}},
    addEventListener:(name,handler)=>{if(name==='click')clickHandlers.push(handler);},
    requestAnimationFrame:handler=>{handler();return 1;},
    setTimeout:handler=>{handler();return 1;},
    Date,console
  };
  context.globalThis=context;
  const ui=fs.readFileSync(path.join(__dirname,'..','breeding-next-action-v1.8.2.js'),'utf8');
  vm.runInNewContext(ui,context,{filename:'breeding-next-action-v1.8.2.js'});
  assert.equal(clickHandlers.length,1);

  const button={
    dataset:{
      hhNextKind:action.kind,
      hhNextAnimal:action.animalId||'',
      hhNextBreeding:action.breedingId||'',
      hhNextLitter:action.litterId||'',
      hhNextSale:action.saleId||'',
      hhNextTab:action.tab||''
    },
    closest:selector=>selector==='[data-hh-next-kind]'?button:null
  };
  clickHandlers[0]({target:button,preventDefault(){},stopPropagation(){}});

  assert.equal(captured?.title,'Record birth or litter');
  assert.match(captured?.html||'',/<option value="b2" selected>/);
  assert.match(captured?.html||'',/<option value="doe2" selected>/);
  assert.match(captured?.html||'',/<option value="buck2" selected>/);
  assert.doesNotMatch(captured?.html||'',/<option value="b1" selected>/);
});

test('Record Birth command is shared by Breeding, Today, and animal-profile lifecycle surfaces',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','herdharbor-app-runtime.js'),'utf8');
  const breeding=fs.readFileSync(path.join(__dirname,'..','breeding-litter-runtime-v1.8.3.js'),'utf8');
  const lifecycle=fs.readFileSync(path.join(__dirname,'..','flow-phase2-lifecycle-v1.8.2.js'),'utf8');
  assert.match(app,/openRecordBirth:\s*\(breedingId\)\s*=>\s*openRecordBirth\(breedingId\)/);
  assert.match(breeding,/button\.addEventListener\("click",\s*\(\)\s*=>\s*openRecordBirth\(button\.dataset\.recordBirth\)\)/);
  assert.match(breeding,/\$\$\('\[data-record-birth\]'/);
  assert.match(lifecycle,/if\(kind==="record-birth"\)\{[\s\S]*rememberReturn\(animalId\)[\s\S]*const command=root\.HerdHarborApp\?\.openRecordBirth[\s\S]*typeof command!=="function"[\s\S]*const opened=command\(breedingId\)[\s\S]*waitFor\("#litter-form",form=>restoreAfterForm\(form\)\)/);
  assert.match(lifecycle,/if\(opened!==true\)\{pendingReturn=null;return;\}/);
  assert.doesNotMatch(lifecycle,/kind==="record-birth"\?\`\[data-record-birth=/);
});

test('animal-profile Record Birth returns to the same Breeding tab after the birth form closes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','flow-phase2-lifecycle-v1.8.2.js'),'utf8');
  const queued=[];
  const handlers={};
  const profileOpens=[];
  const form={isConnected:true};
  const markerNode={dataset:{hhP2AnimalId:'doe'}};
  const view={
    querySelector(selector){
      if(selector==='[data-hh-p2-animal-id]')return markerNode;
      return null;
    }
  };
  const action={
    dataset:{hhP2LifeAction:'record-birth',breedingId:'b1'},
    closest(selector){
      if(selector==='[data-hh-p2-life-action]')return action;
      return null;
    }
  };
  const context={
    HerdHarborApp:{
      getState:()=>rabbitFixture(),
      openRecordBirth:id=>id==='b1'
    },
    HerdHarborFlowPhase2:{
      parseProfileHash:()=>({animalId:'doe'}),
      openAnimalProfile:(animalId,tab,options)=>profileOpens.push({animalId,tab,history:options?.history})
    },
    document:{
      body:{},
      querySelector(selector){
        if(selector==='#view-animal-profile.hh-p2-profile-view.active')return view;
        if(selector==='#litter-form')return form;
        return null;
      },
      createElement:()=>({className:'',innerHTML:'',appendChild(){}})
    },
    location:{hash:''},
    MutationObserver:class{observe(){} disconnect(){}},
    addEventListener:(name,handler)=>{handlers[name]=handler;},
    removeEventListener:()=>{},
    requestAnimationFrame:()=>1,
    setTimeout:handler=>{queued.push(handler);return queued.length;},
    Date,console
  };
  context.globalThis=context;
  vm.runInNewContext(source,context,{filename:'flow-phase2-lifecycle-v1.8.2.js'});

  handlers.click({target:action,preventDefault(){},stopPropagation(){}});
  assert.equal(queued.length,1,'connected birth form should install a close watcher');

  form.isConnected=false;
  queued.shift()();
  assert.equal(queued.length,1,'closing the form should schedule profile restoration');
  queued.shift()();

  assert.deepEqual(profileOpens,[{animalId:'doe',tab:'breeding',history:'replace'}]);
});

test('release loader includes the next-action engine under the formal v1.8.4 identity',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');
  for(const asset of ['breeding-next-action-core-v1.8.2.js','breeding-next-action-v1.8.2.js','breeding-next-action-v1.8.2.css'])assert.match(build,new RegExp(asset.replace(/\./g,'\\.')));
  assert.match(build,/breeding-next-action-core-v1\.8\.2\.js\?v=2/);
  assert.match(build,/version:\s*"1\.8\.4"/);
  assert.match(build,/buildId:\s*"alpha-v1\.8\.4-release-1"/);
});
