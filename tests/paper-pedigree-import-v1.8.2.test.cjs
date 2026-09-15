const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../paper-pedigree-import-core-v1.8.2.js');

function samplePedigree() {
  return {
    sourceName: 'sample-pedigree.jpg',
    subject: {
      name: 'Maple', registrationNumber: 'R-100', tattoo: 'M100', species: 'Rabbit',
      breed: 'Holland Lop', sex: 'Doe', dob: '2026-04-01', color: 'Harlequin'
    },
    sire: {
      name: 'Atlas', registrationNumber: 'R-200', breed: 'Holland Lop', sex: 'Buck',
      sire: { name: 'Titan', registrationNumber: 'R-300', breed: 'Holland Lop' },
      dam: { name: 'Pearl', registrationNumber: 'R-301', breed: 'Holland Lop' }
    },
    dam: {
      name: 'Willow', registrationNumber: 'R-201', breed: 'Holland Lop', sex: 'Doe',
      sire: { name: 'Cedar', registrationNumber: 'R-302', breed: 'Holland Lop' },
      dam: { name: 'Ivy', registrationNumber: 'R-303', breed: 'Holland Lop' }
    }
  };
}

test('normalizes a nested three-generation paper pedigree into canonical roles', () => {
  const extraction = Core.normalizeExtraction(samplePedigree());
  assert.equal(extraction.contract, 'paper-pedigree-import-v1');
  assert.equal(extraction.sourceName, 'sample-pedigree.jpg');
  const present = extraction.nodes.filter((node) => node.present);
  assert.equal(present.length, 7);
  assert.equal(present.find((node) => node.role === 'subject').name, 'Maple');
  assert.equal(present.find((node) => node.role === 'sire').sex, 'Male');
  assert.equal(present.find((node) => node.role === 'dam').sex, 'Female');
  assert.equal(present.find((node) => node.role === 'sireSire').name, 'Titan');
  assert.equal(present.find((node) => node.role === 'damDam').name, 'Ivy');
});

test('builds subject and ancestor records with the correct sire/dam links', () => {
  const plan = Core.buildImportPlan({ animals: [] }, samplePedigree());
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.canCommit, true);
  const byRole = Object.fromEntries(plan.actions.map((action) => [action.role, action]));
  assert.equal(byRole.subject.sireId, byRole.sire.animalId);
  assert.equal(byRole.subject.damId, byRole.dam.animalId);
  assert.equal(byRole.sire.sireId, byRole.sireSire.animalId);
  assert.equal(byRole.sire.damId, byRole.sireDam.animalId);
  assert.equal(byRole.dam.sireId, byRole.damSire.animalId);
  assert.equal(byRole.dam.damId, byRole.damDam.animalId);

  const result = Core.applyImportPlan({ animals: [] }, plan);
  assert.equal(result.state.animals.length, 7);
  const subject = result.state.animals.find((row) => row.id === result.subjectAnimalId);
  assert.equal(subject.status, 'Active');
  assert.equal(subject.name, 'Maple');
  assert.ok(subject.sireId);
  assert.ok(subject.damId);
  const ancestors = result.state.animals.filter((row) => row.id !== subject.id);
  assert.ok(ancestors.every((row) => row.status === 'Ancestor Only'));
  assert.ok(ancestors.every((row) => row.pedigreeImport?.contract === Core.CONTRACT));
});

test('deduplicates against an existing animal by a strong identifier and fills only missing fields', () => {
  const state = {
    animals: [{
      id: 'existing-sire', name: 'Atlas', registrationNumber: 'R-200', species: 'Rabbit',
      breed: 'Holland Lop', sex: 'Male', color: '', status: 'Active'
    }]
  };
  const input = samplePedigree();
  input.sire.color = 'Black Tort';
  const plan = Core.buildImportPlan(state, input);
  const sireAction = plan.actions.find((row) => row.role === 'sire');
  assert.equal(sireAction.mode, 'merge');
  assert.equal(sireAction.animalId, 'existing-sire');
  assert.equal(sireAction.matchReason, 'registrationNumber');
  assert.equal(plan.conflicts.length, 0);

  const result = Core.applyImportPlan(state, plan);
  const sire = result.state.animals.find((row) => row.id === 'existing-sire');
  assert.equal(sire.color, 'Black Tort');
  assert.equal(result.state.animals.filter((row) => row.registrationNumber === 'R-200').length, 1);
});

test('blocks conflicting identity data instead of silently overwriting an existing pedigree animal', () => {
  const state = {
    animals: [{
      id: 'existing-sire', name: 'Atlas', registrationNumber: 'R-200', species: 'Rabbit',
      breed: 'Holland Lop', sex: 'Male', color: 'Black Tort', status: 'Active'
    }]
  };
  const input = samplePedigree();
  input.sire.color = 'Blue';
  const plan = Core.buildImportPlan(state, input);
  assert.equal(plan.canCommit, false);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].type, 'field-conflict');
  assert.equal(plan.conflicts[0].fields[0].field, 'color');
  assert.throws(() => Core.applyImportPlan(state, plan), /Resolve pedigree field conflicts/);
  assert.equal(state.animals[0].color, 'Black Tort');
});

test('blocks ambiguous matches instead of guessing which existing animal is correct', () => {
  const state = {
    animals: [
      { id: 'a1', name: 'Atlas', registrationNumber: 'R-200', species: 'Rabbit' },
      { id: 'a2', name: 'Atlas II', registrationNumber: 'R-200', species: 'Rabbit' }
    ]
  };
  const plan = Core.buildImportPlan(state, samplePedigree());
  const sireAction = plan.actions.find((row) => row.role === 'sire');
  assert.equal(sireAction.mode, 'blocked');
  assert.equal(plan.canCommit, false);
  assert.ok(plan.conflicts.some((row) => row.type === 'ambiguous-match' && row.role === 'sire'));
});

test('low-confidence extracted fields are flagged for human review', () => {
  const input = samplePedigree();
  input.subject.confidence = { name: 0.96, registrationNumber: 0.61, color: 0.52 };
  const extraction = Core.normalizeExtraction(input);
  const subject = extraction.nodes.find((node) => node.role === 'subject');
  assert.equal(subject.reviewRequired, true);
  assert.ok(subject.warnings.some((warning) => warning.includes('registrationNumber')));
  assert.ok(subject.warnings.some((warning) => warning.includes('color')));
  const plan = Core.buildImportPlan({ animals: [] }, extraction);
  assert.equal(plan.requiresReview, true);
  assert.equal(plan.canCommit, true);
});

test('applying an import does not mutate the caller state', () => {
  const original = { animals: [] };
  const plan = Core.buildImportPlan(original, samplePedigree());
  const result = Core.applyImportPlan(original, plan);
  assert.equal(original.animals.length, 0);
  assert.equal(result.state.animals.length, 7);
});
