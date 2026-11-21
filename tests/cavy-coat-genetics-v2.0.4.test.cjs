const test=require('node:test'),assert=require('node:assert/strict');
const identity=require('../cavy-identity-v2.0.3.js');
const genetics=require('../cavy-genetics-v2.0.4.js');
const cavy=(id,pattern,alleles)=>({id,species:'Cavy',cavy:{coatPattern:pattern},genetics:{loci:alleles?{roan:{alleles}}:{}}});
test('catalogs expose cavy-specific colors and coat patterns without rabbit values',()=>{
 assert.ok(identity.COAT_COLORS.includes('Chocolate'));
 assert.ok(identity.COAT_COLORS.includes('Golden Agouti'));
 assert.ok(identity.COAT_PATTERNS.includes('Tortoiseshell and White'));
 assert.ok(identity.COAT_PATTERNS.includes('Roan'));
 assert.ok(identity.COAT_TYPES.includes('Teddy'));
 const html=identity.editorHtml({species:'Cavy',cavy:{coatColor:'My Custom Color',coatPattern:'My Custom Pattern'}});
 assert.match(html,/list="hh-cavy-coatColor"/);
 assert.match(html,/list="hh-cavy-coatPattern"/);
 assert.match(html,/My Custom Color/);
 assert.match(html,/My Custom Pattern/);
 assert.equal(identity.validate({coatColor:'My Custom Color',coatPattern:'My Custom Pattern'}).valid,true);
});
test('roan-Dalmatian pairing warns even without exact genotypes',()=>{
 const result=genetics.predict(cavy('a','Roan'),cavy('b','Dalmatian'));
 assert.equal(result.safety.highRisk,true);
 assert.equal(result.safety.status,'do-not-pair');
 assert.equal(result.outcomes[0].probabilities,false);
 assert.equal(result.coatColorPercentages,null);
});
test('unmarked partner does not produce a guaranteed safe declaration',()=>{
 const result=genetics.predict(cavy('a','Roan'),cavy('b','Self / Solid'));
 assert.equal(result.safety.status,'requires-pedigree-review');
 assert.equal(result.outcomes[0].status,'insufficient-genotypes');
});
test('confirmed complete genotypes yield exact roan-locus inheritance only',()=>{
 const result=genetics.predict(cavy('a','Roan',['Rn','rn']),cavy('b','Roan',['Rn','rn']));
 assert.equal(result.outcomes[0].probabilities,true);
 const probabilities=Object.fromEntries(result.outcomes[0].outcomes.map(x=>[x.genotype,x.probability]));
 assert.deepEqual(probabilities,{'Rn/Rn':0.25,'Rn/rn':0.5,'rn/rn':0.25});
 assert.equal(result.outcomes[0].outcomes.find(x=>x.genotype==='Rn/Rn').risk,'lethal-white-associated');
 assert.equal(result.coatColorPercentages,null);
});
test('rejects cross species and unknown / unsupported allele claims',()=>{
 assert.equal(genetics.predict(cavy('a','Roan'),{species:'Rabbit'}).supported,false);
 const row=genetics.exactCross('roan',cavy('a','', ['Rn','?']),cavy('b','',['rn','rn']));
 assert.equal(row.probabilities,false);
 assert.equal(genetics.exactCross('fake',cavy('a',''),cavy('b','')).status,'unsupported');
});

const offspring=require('../cavy-offspring-v2.0.3.js');
const fs=require('node:fs'),path=require('node:path');
test('offspring family genotype is deterministic only for fixed parental genotypes',()=>{
 const sow={...cavy('s','Self / Solid',['rn','rn']),sex:'Female',ownerId:'o'};
 const boar={...cavy('b','Self / Solid',['rn','rn']),sex:'Male',ownerId:'o'};
 const child={id:'p',species:'Cavy',sex:'Female',ownerId:'o',sourceBirthId:'l',damId:'s',sireId:'b',paternityStatus:'breeder-attributed',paternityEvidence:{reference:'breeder-mating-record'}};
 const result=genetics.reconcile({animals:[sow,boar,child]});
 assert.equal(result.changed,1);
 assert.deepEqual(result.state.animals[2].genetics.loci.roan.alleles,['rn','rn']);
 assert.equal(result.state.animals[2].genetics.loci.roan.source,'cavy-family-inferred');
 assert.equal(child.genetics,undefined);
 assert.equal(genetics.reconcile(result.state).changed,0);
});
test('ambiguous parental outcomes have possibilities but never a fabricated genotype',()=>{
 const sow={...cavy('s','Self / Solid',['rn','rn']),sex:'Female'};
 const boar={...cavy('b','Roan',['Rn','rn']),sex:'Male'};
 const child={id:'p',species:'Cavy',sourceBirthId:'l',damId:'s',sireId:'b',paternityStatus:'breeder-attributed',paternityEvidence:{reference:'breeder-mating-record'}};
 const row=genetics.reconcile({animals:[sow,boar,child]}).state.animals[2].genetics.loci.roan;
 assert.deepEqual(row.alleles,[]);
 assert.equal(row.possibleGenotypes.length,2);
 assert.equal(row.status,'possible');
});
test('uncertain sire, duplicates, unrelated species and owner conflicts do not transmit alleles',()=>{
 const sow={...cavy('s','',['rn','rn']),sex:'Female',ownerId:'one'};
 const boar={...cavy('b','',['rn','rn']),sex:'Male',ownerId:'two'};
 const pup={id:'p',species:'Cavy',sourceBirthId:'l',damId:'s',sireId:'b'};
 assert.equal(genetics.reconcile({animals:[sow,boar,pup]}).changed,0);
 assert.equal(genetics.reconcile({animals:[sow,boar,{...pup,ownerId:'one'}]}).changed,0);
 assert.equal(genetics.reconcile({animals:[sow,boar,{...pup,paternityStatus:'unresolved'}]}).changed,0);
 assert.equal(genetics.reconcile({animals:[sow,boar,boar,pup]}).changed,0);
 assert.equal(genetics.reconcile({animals:[sow,{...boar,species:'Rabbit'},pup]}).changed,0);
});
test('manual genetics is not overwritten or wiped by recalculation',()=>{
 const sow={...cavy('s','',['rn','rn']),sex:'Female'},boar={...cavy('b','',['rn','rn']),sex:'Male'};
 const pup={id:'p',species:'Cavy',sourceBirthId:'l',damId:'s',sireId:'b',genetics:{loci:{roan:{source:'breeder-reported',status:'breeder-reported',alleles:['Rn','rn'],evidenceRef:'record'}}}};
 assert.equal(genetics.reconcile({animals:[sow,boar,pup]}).changed,0);
 assert.deepEqual(pup.genetics.loci.roan.alleles,['Rn','rn']);
});
test('birth generator adds inferred cavy genotype only when sire is explicitly attributed',()=>{
 const sow={...cavy('s','',['rn','rn']),sex:'Female',ownerId:'one'};
 const boar={...cavy('b','',['rn','rn']),sex:'Male',ownerId:'one'};
 const state={animals:[sow,boar],litters:[{id:'l',damId:'s',birthDate:'2026-11-01',bornAlive:1,sireId:'b'}]};
 const result=offspring.generatePups(state,'l',[{id:'p',name:'Pup',confirmedSireId:'b',parentageEvidenceRef:'pairing-note'}]);
 assert.equal(result.valid,true);
 assert.deepEqual(result.state.animals[2].genetics.loci.roan.alleles,['rn','rn']);
 assert.equal(state.animals.length,2);
 const uncertain=offspring.generatePups({...state,litters:[{...state.litters[0],potentialSireIds:['b','other']}]},'l',[{id:'q',name:'Unknown Pup'}]);
 assert.equal(uncertain.valid,true);
 assert.equal(uncertain.state.animals[2].genetics,undefined);
});
test('cavy genetics is wired to the profile and main script before animal runtime',()=>{
 const profile=fs.readFileSync(path.join(__dirname,'../animal-profile-runtime-v1.8.3.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(profile,/detail-cavy-genetics/);
 assert.match(profile,/HerdHarborCavyGenetics\?\.reconcile\?\./);
 assert.ok(html.indexOf('cavy-genetics-v2.0.4.js')>0);
 assert.ok(html.indexOf('cavy-genetics-v2.0.4.js')<html.indexOf('animal-profile-runtime-v1.8.3.js'));
});

test('ASIP 2019 deletion variant predicts genotype inheritance, not whole coat color',()=>{
 const parents=[{...cavy('boar',''),sex:'Male'},{...cavy('sow',''),sex:'Female'}];
 for(const p of parents)p.genetics.loci['asip-del4']={alleles:['N','del4'],source:'dna-reported',evidenceRef:'ASIP report'};
 const result=genetics.predict(...parents);
 const row=result.outcomes.find(x=>x.locus==='asip-del4');
 assert.equal(row.probabilities,true);
 assert.deepEqual(Object.fromEntries(row.outcomes.map(x=>[x.genotype,x.probability])),{'N/N':0.25,'N/del4':0.5,'del4/del4':0.25});
 assert.match(row.outcomes.find(x=>x.genotype==='del4/del4').interpretation,/associated with recessive black/);
 assert.equal(result.coatColorPercentages,null);
 assert.equal(genetics.LOCI['asip-del4'].variant,'c.181_184delTTCA');
});
test('missing or malformed ASIP variants never produce calculated percentages',()=>{
 const boar={...cavy('b',''),sex:'Male',genetics:{loci:{'asip-del4':{alleles:['N','?']}}}};
 const sow={...cavy('s',''),sex:'Female',genetics:{loci:{'asip-del4':{alleles:['N','del4']}}}};
 assert.equal(genetics.predict(boar,sow).outcomes.find(x=>x.locus==='asip-del4').probabilities,false);
});
test('manually entered cavy with known parents inherits both supported loci',()=>{
 const boar={...cavy('b','',['rn','rn']),sex:'Male',ownerId:'one'};
 const sow={...cavy('s','',['rn','rn']),sex:'Female',ownerId:'one'};
 for(const a of [boar,sow])a.genetics.loci['asip-del4']={alleles:['del4','del4'],source:'breeder-reported'};
 const pup={id:'p',species:'Cavy',sex:'Female',sireId:'b',damId:'s',ownerId:'one'};
 const output=genetics.reconcile({animals:[boar,sow,pup]}).state.animals[2].genetics.loci;
 assert.deepEqual(output.roan.alleles,['rn','rn']);
 assert.deepEqual(output['asip-del4'].alleles,['del4','del4']);
});
test('second and third generation of fixed alleles are updated as data changes',()=>{
 const boar={...cavy('b','',['rn','rn']),sex:'Male'};
 const sow={...cavy('s','',['rn','rn']),sex:'Female'};
 const offspring1={id:'f1',species:'Cavy',sex:'Female',sireId:'b',damId:'s'};
 const child2={id:'f2',species:'Cavy',sex:'Female',sireId:'b',damId:'f1'};
 let result=genetics.reconcile({animals:[boar,sow,offspring1,child2]});
 assert.deepEqual(result.state.animals[2].genetics.loci.roan.alleles,['rn','rn']);
 assert.deepEqual(result.state.animals[3].genetics.loci.roan.alleles,['rn','rn']);
 const updated=result.state.animals.map(x=>x.id==='b'?{...x,genetics:{loci:{}}}:x);
 result=genetics.reconcile({animals:updated});
 assert.equal(result.state.animals[2].genetics.loci.roan,undefined);
 assert.equal(result.state.animals[3].genetics.loci.roan,undefined);
});
test('ASIP inference does not overwrite breeder-reported or DNA-confirmed test evidence',()=>{
 const male={...cavy('b',''),sex:'Male',genetics:{loci:{'asip-del4':{alleles:['N','N']}}}};
 const female={...cavy('s',''),sex:'Female',genetics:{loci:{'asip-del4':{alleles:['N','N']}}}};
 const kid={id:'p',species:'Cavy',sireId:'b',damId:'s',genetics:{loci:{'asip-del4':{alleles:['del4','del4'],source:'dna-confirmed',evidenceRef:'report'}}}};
 const result=genetics.reconcile({animals:[male,female,kid]});
 assert.equal(result.changed,0);
 assert.deepEqual(kid.genetics.loci['asip-del4'].alleles,['del4','del4']);
});
test('the cavy genetics UI renders both labeled evidence fields and variant scope warnings',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../cavy-genetics-v2.0.4.js'),'utf8');
 assert.match(src,/data-cavy-genotype/);
 assert.match(src,/data-cavy-evidence/);
 assert.match(src,/not full coat-color predictions/);
 assert.match(src,/ASIP recessive-black variant/);
});

test('ownerless imported descendants do not receive account-owned alleles',()=>{
 const male={...cavy('male','',['rn','rn']),sex:'Male',ownerId:'owner-1'};
 const female={...cavy('female','',['rn','rn']),sex:'Female',ownerId:'owner-1'};
 const kid={id:'kid',species:'Cavy',sireId:'male',damId:'female'};
 const out=genetics.reconcile({animals:[male,female,kid]});
 assert.equal(out.changed,0);
 assert.equal(out.state.animals[2].genetics,undefined);
});

test('risk detection checks historic variety and top-level color, not only coatPattern',()=>{
 const boar={...cavy('b','Self / Solid'),variety:'Dalmatian',sex:'Male'};
 const sow={...cavy('s','Self / Solid'),color:'Roan',sex:'Female'};
 assert.equal(genetics.roanSafety(boar,sow).status,'do-not-pair');
 const typo={...cavy('t','Dalmation'),sex:'Male'};
 assert.equal(genetics.roanSafety(typo,sow).status,'do-not-pair');
});

test('ASIP molecular variant and roan breeder model have distinct scientific statuses',()=>{
 assert.equal(genetics.LOCI.roan.molecularMarker,false);
 assert.equal(genetics.LOCI.roan.scientificStatus,'historical-breeding-model');
 assert.equal(genetics.LOCI['asip-del4'].molecularMarker,true);
 const sire={...cavy('s','Roan',['Rn','rn']),sex:'Male'};
 const dam={...cavy('d','Roan',['Rn','rn']),sex:'Female'};
 const prediction=genetics.predict(sire,dam);
 assert.equal(prediction.outcomes[0].status,'conditional-mendelian-model');
 assert.match(prediction.outcomes[0].conditionalOn,/not verified/);
 assert.match(prediction.notice,/historical breeder notation/);
});
test('pedigree contradictions are reported without rewriting recorded genotype',()=>{
 const sire={...cavy('s','',['rn','rn']),sex:'Male',ownerId:'o'};
 const dam={...cavy('d','',['rn','rn']),sex:'Female',ownerId:'o'};
 const child={...cavy('p','',['Rn','rn']),sireId:'s',damId:'d',sex:'Female',ownerId:'o',
   genetics:{loci:{roan:{alleles:['Rn','rn'],source:'dna-confirmed',evidenceRef:'lab'}}}};
 const state={animals:[sire,dam,child]};
 const conflicts=genetics.pedigreeConflicts(state);
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].status,'review-required');
 assert.equal(conflicts[0].locus,'roan');
 assert.deepEqual(state.animals[2].genetics.loci.roan.alleles,['Rn','rn']);
 assert.equal(genetics.reconcile(state).changed,0);
});
test('pedigree review does not assume missing parent genotype or unverified sire identity',()=>{
 const sire={...cavy('s',''),sex:'Male'},dam={...cavy('d','',['rn','rn']),sex:'Female'};
 const kid={...cavy('p','',['Rn','rn']),sireId:'s',damId:'d'};
 assert.equal(genetics.pedigreeConflicts({animals:[sire,dam,kid]}).length,0);
 sire.genetics.loci.roan={alleles:['rn','rn']};
 kid.paternityStatus='recorded-unverified';
 assert.equal(genetics.pedigreeConflicts({animals:[sire,dam,kid]}).length,0);
});

test('FGF5 c.403C>T heterozygous parents yield per-locus 1:2:1 Mendelian genotypes',()=>{
 const sire={...cavy('s',''),sex:'Male',genetics:{loci:{'fgf5-c403t':{alleles:['C','T'],source:'test-reported'}}}};
 const dam={...cavy('d',''),sex:'Female',genetics:{loci:{'fgf5-c403t':{alleles:['T','C'],source:'test-reported'}}}};
 const row=genetics.exactCross('fgf5-c403t',sire,dam);
 assert.equal(row.probabilities,true);
 assert.deepEqual(Object.fromEntries(row.outcomes.map(x=>[x.genotype,x.probability])),{'C/C':0.25,'C/T':0.5,'T/T':0.25});
 assert.match(row.outcomes.find(x=>x.genotype==='T/T').interpretation,/recessive long hair/);
 assert.equal(genetics.predict(sire,dam).coatColorPercentages,null);
 assert.equal(genetics.LOCI['fgf5-c403t'].variant,'c.403C>T');
 assert.equal(genetics.LOCI['fgf5-c403t'].molecularMarker,true);
});
test('FGF5 unknown allele cannot generate percentages',()=>{
 const a={...cavy('s',''),genetics:{loci:{'fgf5-c403t':{alleles:['T','?']}}}};
 const b={...cavy('d',''),genetics:{loci:{'fgf5-c403t':{alleles:['T','T']}}}};
 assert.equal(genetics.exactCross('fgf5-c403t',a,b).status,'insufficient-genotypes');
});
test('FGF5 can be inherited in cavy descendants but remains labeled as inferred',()=>{
 const sire={...cavy('s',''),sex:'Male',ownerId:'o',genetics:{loci:{'fgf5-c403t':{alleles:['T','T'],source:'test-reported'}}}};
 const dam={...cavy('d',''),sex:'Female',ownerId:'o',genetics:{loci:{'fgf5-c403t':{alleles:['T','T'],source:'test-reported'}}}};
 const child={id:'p',species:'Cavy',sireId:'s',damId:'d',ownerId:'o'};
 const result=genetics.reconcile({animals:[sire,dam,child]});
 assert.deepEqual(result.state.animals[2].genetics.loci['fgf5-c403t'].alleles,['T','T']);
 assert.equal(result.state.animals[2].genetics.loci['fgf5-c403t'].source,'cavy-family-inferred');
 assert.equal(result.state.animals[2].genetics.loci['fgf5-c403t'].status,'model-inferred');
});
test('recorded-unverified sire must not produce inferred genotype, but attributed evidence can',()=>{
 const sire={...cavy('s','',['rn','rn']),sex:'Male',ownerId:'o'};
 const dam={...cavy('d','',['rn','rn']),sex:'Female',ownerId:'o'};
 const pup={id:'p',species:'Cavy',sourceBirthId:'l',sireId:'s',damId:'d',ownerId:'o',paternityStatus:'recorded-unverified'};
 assert.equal(genetics.reconcile({animals:[sire,dam,pup]}).changed,0);
 const attributed={...pup,paternityStatus:'breeder-attributed',paternityEvidence:{reference:'observed-mating'}};
 assert.deepEqual(genetics.reconcile({animals:[sire,dam,attributed]}).state.animals[2].genetics.loci.roan.alleles,['rn','rn']);
});

test('a possible inferred roan carrier triggers pedigree review rather than safe pairing',()=>{
 const sire={...cavy('s',''),genetics:{loci:{roan:{source:'cavy-family-inferred',status:'possible',alleles:[],possibleGenotypes:[{genotype:'Rn/rn',probability:0.5},{genotype:'rn/rn',probability:0.5}]}}}};
 const dam={...cavy('d','Self / Solid'),genetics:{loci:{}}};
 const risk=genetics.roanSafety(sire,dam);
 assert.equal(risk.status,'requires-pedigree-review');
 assert.equal(risk.possibleRisk,true);
 assert.equal(risk.highRisk,false);
 const both={...dam,cavy:{coatPattern:'Dalmatian'}};
 assert.equal(genetics.roanSafety(sire,both).status,'requires-pedigree-review');
 assert.equal(genetics.roanSafety({...sire,cavy:{coatPattern:'Roan'}},both).status,'do-not-pair');
});

test('genotype editor requires explicit locus clear and protects DNA-confirmed calls',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../cavy-genetics-v2.0.4.js'),'utf8');
 assert.match(src,/data-cavy-clear/);
 assert.match(src,/if\(!choice\)continue; \/\/ Blank is not an instruction to delete/);
 assert.match(src,/previous\?\.source==="dna-confirmed"/);
 assert.match(src,/DNA-confirmed evidence is read-only here/);
});

test('birth-linked pup requires documented sire attribution, not a matching ID alone',()=>{
 const sire={...cavy('s','',['rn','rn']),sex:'Male',ownerId:'o'};
 const dam={...cavy('d','',['rn','rn']),sex:'Female',ownerId:'o'};
 const pup={id:'p',species:'Cavy',sourceBirthId:'l',sireId:'s',damId:'d',ownerId:'o'};
 const inferred=genetics.reconcile({animals:[sire,dam,pup]});
 assert.equal(inferred.changed,0);
 assert.equal(genetics.pedigreeConflicts({animals:[sire,dam,{...pup,genetics:{loci:{roan:{alleles:['Rn','Rn']}}}}]}).length,0);
 const claimed={...pup,paternityStatus:'breeder-attributed'};
 assert.equal(genetics.reconcile({animals:[sire,dam,claimed]}).changed,0);
 const evidenced={...claimed,paternityEvidence:{reference:'recorded breeding'}};
 assert.deepEqual(genetics.reconcile({animals:[sire,dam,evidenced]}).state.animals[2].genetics.loci.roan.alleles,['rn','rn']);
});
test('pedigree cycles prevent inferred transmission and false conflicts',()=>{
 const male={...cavy('b','',['rn','rn']),sex:'Male'};
 const female={...cavy('s','',['rn','rn']),sex:'Female'};
 const child={id:'c',species:'Cavy',sex:'Female',damId:'s',sireId:'b'};
 const grandchild={id:'g',species:'Cavy',sex:'Female',damId:'c',sireId:'b'};
 const acyclic=genetics.reconcile({animals:[male,female,child,grandchild]});
 assert.deepEqual(acyclic.state.animals[3].genetics.loci.roan.alleles,['rn','rn']);
 const cyclicMale={...male,damId:'g'};
 const cyclic=genetics.reconcile({animals:[cyclicMale,female,child,grandchild]});
 assert.equal(cyclic.changed,0);
 const observed={...grandchild,genetics:{loci:{roan:{alleles:['Rn','rn'],source:'breeder-reported'}}}};
 assert.equal(genetics.pedigreeConflicts({animals:[cyclicMale,female,child,observed]}).length,0);
});
test('partially owned pedigrees are not safe account-isolated evidence',()=>{
 const male={...cavy('b','',['rn','rn']),sex:'Male',ownerId:'owner1'};
 const female={...cavy('s','',['rn','rn']),sex:'Female'};
 const child={id:'c',species:'Cavy',sireId:'b',damId:'s',ownerId:'owner1'};
 assert.equal(genetics.reconcile({animals:[male,female,child]}).changed,0);
});

test('inheritance follows a twelve-generation pedigree without a five-pass cutoff',()=>{
 const sire={...cavy('boar','',['rn','rn']),sex:'Male'};
 const dam={...cavy('dam','',['rn','rn']),sex:'Female'};
 const animals=[sire,dam];
 for(let i=1;i<=12;i++)animals.push({
   id:'gen'+i,species:'Cavy',sex:'Female',sireId:'boar',
   damId:i===1?'dam':'gen'+(i-1)
 });
 // Deliberately reverse descendant order to disallow dependence on array ordering.
 const input={animals:animals.slice(0,2).concat(animals.slice(2).reverse())};
 const out=genetics.reconcile(input);
 assert.equal(out.changed,12);
 for(let i=1;i<=12;i++)assert.deepEqual(
   out.state.animals.find(a=>a.id==='gen'+i).genetics.loci.roan.alleles,['rn','rn']);
 assert.equal(genetics.reconcile(out.state).changed,0);
});
test('uncertain upstream genotypes propagate as possibilities, not invented percentages',()=>{
 const sire={...cavy('boar','',['Rn','rn']),sex:'Male'};
 const dam={...cavy('dam','',['rn','rn']),sex:'Female'};
 const sibling={id:'p',species:'Cavy',sex:'Female',sireId:'boar',damId:'dam'};
 const descendant={id:'q',species:'Cavy',sex:'Female',sireId:'boar',damId:'p'};
 const state=genetics.reconcile({animals:[sire,dam,sibling,descendant]}).state;
 const first=state.animals.find(a=>a.id==='p').genetics.loci.roan;
 const second=state.animals.find(a=>a.id==='q').genetics.loci.roan;
 assert.equal(first.possibleGenotypes.length,2);
 assert.equal(first.possibleGenotypes.reduce((n,x)=>n+x.probability,0),1);
 assert.equal(second.status,'possible');
 assert.deepEqual(second.alleles,[]);
 assert.ok(second.possibleGenotypes.length>1);
 assert.ok(second.possibleGenotypes.every(x=>x.probability===null));
 assert.equal(genetics.roanSafety(state.animals.find(a=>a.id==='q'),dam).status,'requires-pedigree-review');
 assert.equal(genetics.reconcile(state).changed,0);
});
test('removing parental source evidence clears stale inferred descendants in one traversal',()=>{
 const sire={...cavy('boar','',['rn','rn']),sex:'Male'};
 const dam={...cavy('dam','',['rn','rn']),sex:'Female'};
 const child={id:'p',species:'Cavy',sex:'Female',sireId:'boar',damId:'dam'};
 const grandchild={id:'g',species:'Cavy',sex:'Female',sireId:'boar',damId:'p'};
 let state=genetics.reconcile({animals:[sire,dam,child,grandchild]}).state;
 state={...state,animals:state.animals.map(a=>a.id==='dam'?{...a,genetics:{loci:{}}}:a)};
 const out=genetics.reconcile(state);
 assert.equal(out.changed,2);
 assert.equal(out.state.animals.find(a=>a.id==='p').genetics.loci.roan,undefined);
 assert.equal(out.state.animals.find(a=>a.id==='g').genetics.loci.roan,undefined);
});

test('2.0.4 cavy module URLs and offline cache fingerprints match release manifest',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const sw=fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8');
 const paths=[
  'cavy-identity-v2.0.3.js?v=2.0.4-g1',
  'cavy-genetics-v2.0.4.js?v=2.0.4-g1',
  'cavy-offspring-v2.0.3.js?v=2.0.4-g1',
  'animal-profile-runtime-v1.8.3.js?v=2.0.4-g1'
 ];
 for(const p of paths){assert.ok(html.includes(p),'index lacks '+p);assert.ok(sw.includes(p),'service worker lacks '+p);}
 assert.match(sw,/herdharbor-shell-v2\.0\.4-cavy-genetics-1/);
 const required=sw.slice(sw.indexOf('const REQUIRED_SHELL = ['),sw.indexOf('const RUNTIME_CACHE_PATHS'));
 assert.match(required,/cavy-genetics-v2\.0\.4\.js\?v=2\.0\.4-g1/);
});

test('pup creation refuses ambiguous litter/dam identifiers before changing state',()=>{
 const dam={...cavy('s',''),sex:'Female'};
 const litter={id:'l',damId:'s',birthDate:'2026-11-01',bornAlive:1};
 const before={animals:[dam],litters:[litter]};
 const entry=[{id:'p',name:'New pup'}];
 assert.equal(offspring.generatePups({...before,animals:[dam,{...dam}]},'l',entry).valid,false);
 assert.equal(offspring.generatePups({...before,litters:[litter,{...litter}]},'l',entry).valid,false);
 assert.equal(offspring.generatePups({...before,litters:[{...litter,bornAlive:1.5}]},'l',entry).valid,false);
 assert.equal(offspring.generatePups({...before,animals:[{...dam,sex:'Male'}]},'l',entry).valid,false);
 assert.equal(before.animals.length,1);
 assert.equal(before.litters.length,1);
});

test('legacy userId and accountId identities still enforce family account isolation',()=>{
 const sire={...cavy('s','',['rn','rn']),sex:'Male',userId:'farm-a'};
 const dam={...cavy('d','',['rn','rn']),sex:'Female',accountId:'farm-b'};
 const child={id:'p',species:'Cavy',sireId:'s',damId:'d',userId:'farm-a'};
 assert.equal(genetics.reconcile({animals:[sire,dam,child]}).changed,0);
 const compatible={...dam,accountId:'farm-a'};
 assert.deepEqual(genetics.reconcile({animals:[sire,compatible,child]}).state.animals[2].genetics.loci.roan.alleles,['rn','rn']);
});
test('generated pups preserve legacy sow account identity and isolate attributed sires',()=>{
 const sow={...cavy('s','',['rn','rn']),sex:'Female',userId:'farm-a'};
 const boar={...cavy('b','',['rn','rn']),sex:'Male',accountId:'farm-b'};
 const state={animals:[sow,boar],litters:[{id:'l',damId:'s',birthDate:'2026-11-01',bornAlive:1,potentialSireIds:['b']}]};
 const entries=[{id:'p',name:'Pup',confirmedSireId:'b',parentageEvidenceRef:'mating-record'}];
 assert.equal(offspring.generatePups(state,'l',entries).valid,false);
 const allowed=offspring.generatePups({...state,animals:[sow,{...boar,accountId:'farm-a'}]},'l',entries);
 assert.equal(allowed.valid,true);
 assert.equal(allowed.created[0].ownerId,'farm-a');
 assert.deepEqual(allowed.created[0].genetics.loci.roan.alleles,['rn','rn']);
});

test('pairing UI recalculates from provisional edited records and refuses unsupported evidence',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../cavy-genetics-v2.0.4.js'),'utf8');
 assert.match(src,/const draftLoci=/);
 assert.match(src,/const draft=\{\.\.\.target,genetics:/);
 assert.match(src,/PROVISIONAL UNSAVED GENOTYPE CHOICES/);
 assert.match(src,/missingEvidence\.length/);
 assert.match(src,/data-cavy-evidence.*input.*render/);
});
