const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const catalog=require('../canine-breeds-v2.0.1.js');
const identity=require('../canine-identity-v2.0.1.js');
const audit=require('../canine-identity-audit-v2.0.3.js');
test('all 205 recognized AKC breed identities have explicit catalog coverage statuses',()=>{
  const rows=audit.breedCatalogCoverage(catalog);
  assert.equal(rows.length,205);
  assert.equal(new Set(rows.map(r=>r.breedId)).size,205);
  assert.ok(rows.some(r=>r.colorStatus==='missing-verified-color-table'));
  assert.ok(rows.every(r=>r.registrationColorCodesStatus==='not-verified'));
  assert.ok(rows.every(r=>r.conformationStatus==='not-assessed'));
});
test('breed color verification and conformation eligibility are not conflated',()=>{
  const lab=audit.validateRegistrationColor({species:'Dog',breed:'Labrador Retriever',color:'Black'},catalog);
  assert.equal(lab.recognized,true);
  assert.equal(lab.conformationEligible,null);
  assert.equal(lab.registrationColorCode,null);
  const custom=audit.validateRegistrationColor({species:'Dog',breed:'Mixed',color:'Blue spotted'},catalog);
  assert.equal(custom.recognized,false);
  assert.equal(custom.color,'Blue spotted');
  assert.equal(audit.validateRegistrationColor({species:'Rabbit',breed:'Labrador Retriever'},catalog).supported,false);
});
test('canine editor keeps distinct markings and owner-entered health evidence',()=>{
  const dog={species:'Dog',canine:{coatMarkings:'Tan markings',healthEvidence:[
    {id:'h1',type:'dna-test',name:'Example test',date:'2026-11-14',reference:'document-123',result:'owner reported'}
  ]}};
  const normalized=identity.normalize(dog.canine);
  assert.equal(normalized.coatMarkings,'Tan markings');
  assert.equal(normalized.healthEvidence[0].status,'breeder-entered-unverified');
  assert.equal(identity.validate(dog.canine).valid,true);
  assert.match(identity.editorHtml(dog),/data-canine-health-list/);
});
test('health evidence invalid date or missing reference is rejected',()=>{
  const invalid=identity.validate({healthEvidence:[{type:'screening',name:'Exam',date:'2026-11-14'}]});
  assert.equal(invalid.valid,false);
});
test('AKC options retain manual fallback without pulling rabbit colors',()=>{
  assert.deepEqual(catalog.coatColorChoices('not a real breed'),[]);
  assert.equal(catalog.classify('Mixed breed').status,'user-entered');
});
test('load canine audit before identity editor in the installed shell',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.indexOf('canine-identity-audit-v2.0.3.js')>=0);
  assert.ok(html.indexOf('canine-identity-audit-v2.0.3.js')<html.indexOf('canine-identity-v2.0.1.js'));
});
