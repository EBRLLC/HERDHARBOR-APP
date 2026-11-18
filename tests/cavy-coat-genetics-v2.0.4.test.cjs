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
 const child={id:'p',species:'Cavy',sex:'Female',ownerId:'o',sourceBirthId:'l',damId:'s',sireId:'b'};
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
 const child={id:'p',species:'Cavy',sourceBirthId:'l',damId:'s',sireId:'b'};
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
