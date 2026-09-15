const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../paper-pedigree-import-core-v1.8.2.js');

test('linebreeding reuses one imported ancestor in multiple pedigree positions', () => {
  const input = {
    extractionId: 'linebred-1',
    subject: { name: 'Maple', registrationNumber: 'R-100', species: 'Rabbit', breed: 'Holland Lop' },
    sire: {
      name: 'Atlas', registrationNumber: 'R-200', species: 'Rabbit', breed: 'Holland Lop',
      sire: { name: 'Titan', registrationNumber: 'R-300', species: 'Rabbit', breed: 'Holland Lop' },
      dam: { name: 'Pearl', registrationNumber: 'R-301', species: 'Rabbit', breed: 'Holland Lop' }
    },
    dam: {
      name: 'Willow', registrationNumber: 'R-201', species: 'Rabbit', breed: 'Holland Lop',
      sire: { name: 'Titan', registrationNumber: 'R-300', species: 'Rabbit', breed: 'Holland Lop' },
      dam: { name: 'Ivy', registrationNumber: 'R-303', species: 'Rabbit', breed: 'Holland Lop' }
    }
  };

  const plan = Core.buildImportPlan({ animals: [] }, input);
  assert.equal(plan.canCommit, true);
  const sireSire = plan.actions.find((row) => row.role === 'sireSire');
  const damSire = plan.actions.find((row) => row.role === 'damSire');
  assert.equal(sireSire.mode, 'create');
  assert.equal(damSire.mode, 'link');
  assert.equal(damSire.animalId, sireSire.animalId);

  const result = Core.applyImportPlan({ animals: [] }, plan);
  assert.equal(result.state.animals.filter((row) => row.registrationNumber === 'R-300').length, 1);
  assert.equal(result.state.animals.length, 6);
});

test('the same pedigree identifier with conflicting facts blocks import', () => {
  const input = {
    subject: { name: 'Maple', registrationNumber: 'R-100' },
    sire: {
      name: 'Atlas', registrationNumber: 'R-200',
      sire: { name: 'Titan', registrationNumber: 'R-300', color: 'Black' }
    },
    dam: {
      name: 'Willow', registrationNumber: 'R-201',
      sire: { name: 'Titan', registrationNumber: 'R-300', color: 'Blue' }
    }
  };
  const plan = Core.buildImportPlan({ animals: [] }, input);
  assert.equal(plan.canCommit, false);
  assert.ok(plan.conflicts.some((row) => row.type === 'duplicate-pedigree-conflict'));
  assert.throws(() => Core.applyImportPlan({ animals: [] }, plan), /Resolve pedigree field conflicts/);
});

test('a partially read identifier cannot create a nameless animal record', () => {
  const input = {
    subject: { name: 'Maple', registrationNumber: 'R-100' },
    sire: { registrationNumber: 'R-200', tattoo: 'A22' }
  };
  const plan = Core.buildImportPlan({ animals: [] }, input);
  assert.equal(plan.canCommit, false);
  const blocked = plan.actions.find((row) => row.role === 'sire');
  assert.equal(blocked.mode, 'blocked');
  assert.equal(blocked.reason, 'missing-required-field');
  assert.ok(plan.conflicts.some((row) => row.type === 'missing-required-field' && row.role === 'sire'));
});
