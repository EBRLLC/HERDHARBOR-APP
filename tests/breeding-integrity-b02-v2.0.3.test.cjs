const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('../breeding-integrity-v2.0.3.js');
const base = () => ({
  animals: [
    {id:'buck',species:'Rabbit',sex:'Male'},
    {id:'doe',species:'Rabbit',sex:'Female'},
    {id:'dog',species:'Dog',sex:'Male'}
  ],
  breedings:[],litters:[]
});
test('accepts valid same-species parents, breeding and litter', () => {
  const before=base(), after=structuredClone(before);
  after.animals.push({id:'kit',species:'Rabbit',sireId:'buck',damId:'doe'});
  after.breedings.push({id:'b1',maleId:'buck',femaleId:'doe'});
  after.litters.push({id:'l1',breedingId:'b1',sireId:'buck',damId:'doe'});
  assert.deepEqual(contract.validateMutation(before,after).errors,[]);
});
test('rejects cross-species, self-parent, duplicate identity and breeding ancestry mismatch', () => {
  const before=base(), after=structuredClone(before);
  after.animals.push({id:'kit',species:'Rabbit',sireId:'dog',damId:'kit'});
  after.animals.push({id:'buck',species:'Rabbit'});
  after.breedings.push({id:'b1',maleId:'dog',femaleId:'doe'});
  after.litters.push({id:'l1',breedingId:'b1',sireId:'buck',damId:'doe'});
  const codes=contract.validateMutation(before,after).errors.map(item=>item.code);
  assert.ok(codes.includes('duplicate-id'));
  assert.ok(codes.includes('cross-species-parent'));
  assert.ok(codes.includes('self-parent'));
  assert.ok(codes.includes('cross-species-breeding'));
  assert.ok(codes.includes('litter-parentage-mismatch'));
});
test('unknown or external pedigree references survive, without invented local animals', () => {
  const before=base(), after=structuredClone(before);
  after.animals.push({id:'imported-kit',species:'Rabbit',sireId:'EXT-ABC',damId:null});
  assert.equal(contract.validateMutation(before,after).ok,true);
  assert.equal(after.animals.length,4);
});
test('unchanged legacy duplicates do not block unrelated new breeding correction', () => {
  const before=base();
  before.animals.push({id:'old',species:'Rabbit'},{id:'old',species:'Rabbit'});
  const after=structuredClone(before);
  after.breedings.push({id:'b2',maleId:'buck',femaleId:'doe'});
  assert.equal(contract.validateMutation(before,after).ok,true);
});
test('browser loads integrity API before breeding-litter runtime and runtime validates transactional mutations', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const source=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
  assert.ok(html.indexOf('breeding-integrity-v2.0.3.js') >= 0);
  assert.ok(html.indexOf('breeding-integrity-v2.0.3.js') < html.indexOf('breeding-litter-runtime-v1.8.3.js'));
  assert.match(source,/integrity\.validateMutation\(snapshot, stateNow\(\)\)/);
  assert.match(source,/restoreState\(snapshot\)/);
});
