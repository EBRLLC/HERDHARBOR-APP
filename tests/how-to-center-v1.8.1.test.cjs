const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const howTo = fs.readFileSync(path.join(root, 'how-to', 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'how-to-navigation-v1.8.1.js'), 'utf8');
const build = fs.readFileSync(path.join(root, 'herdharbor-build.js'), 'utf8');

const requiredGuides = [
  'How to Create a Pedigree',
  'How to Enter a New Birth or Litter',
  'How to Enter Health & Medical Data',
  'How to Record a Breeding',
  'How to Record Weight & Use Growth Charts',
  'How to Use Genetics',
  'Subscription & Referral Program',
  'Cloud Sync & Offline Use',
  'Youth & Junior Use'
];

test('How To Center is current for HerdHarbor Alpha v1.8.1', () => {
  assert.match(howTo, /Alpha v1\.8\.1/);
  assert.match(howTo, /September 30, 2026/);
  assert.match(howTo, /October 1, 2026/);
  assert.match(howTo, /Member is \$14\.99\/month/);
  assert.match(howTo, /Every five qualified referrals earns one Member-month credit/);
});

test('How To Center includes the core operational workflows', () => {
  for (const guide of requiredGuides) assert.ok(howTo.includes(guide), `missing guide: ${guide}`);
  assert.match(howTo, /enter once, reuse everywhere/i);
  assert.match(howTo, /animal-first workflow/i);
  assert.match(howTo, /not a substitute for veterinary diagnosis or treatment/i);
});

test('How To navigation is loaded by the current build and links to the canonical page', () => {
  assert.match(build, /how-to-navigation-v1\.8\.1\.js\?v=1/);
  assert.match(navigation, /const HOW_TO_URL = "\/how-to\/"/);
  assert.match(navigation, /herdharbor-how-to-nav/);
  assert.match(navigation, /herdharbor-how-to-shortcut/);
  assert.match(navigation, /How To Center/);
});

test('How To page provides search and a route back to the app', () => {
  assert.match(howTo, /id="guide-search"/);
  assert.match(howTo, /href="\/"/);
  assert.match(howTo, /Back to app/);
});
