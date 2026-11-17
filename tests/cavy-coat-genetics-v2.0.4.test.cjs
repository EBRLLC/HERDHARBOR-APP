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
