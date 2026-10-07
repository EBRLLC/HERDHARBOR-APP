const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const resources=path.join(root,'resources');
const articles=JSON.parse(fs.readFileSync(path.join(resources,'articles.json'),'utf8'));
const allowedSpecies=new Set(['rabbit','cattle','goat','sheep','poultry','swine']);
const allowedTopics=new Set(['Breeding & Reproduction','Genetics','Pedigrees & Records','Health & Biosecurity','Newborn & Young Stock','Selection & Herd Improvement']);
const allowedLevels=new Set(['Beginner','Intermediate','Advanced']);

test('education registry contains approved guides plus winter rabbit care',()=>{assert.equal(articles.length,23);});
test('education registry has unique canonical slugs and URLs',()=>{assert.equal(new Set(articles.map(a=>a.slug)).size,articles.length);assert.equal(new Set(articles.map(a=>a.url)).size,articles.length);});
test('education metadata uses canonical species topics and levels',()=>{for(const a of articles){assert.ok(a.slug&&a.title&&a.summary&&a.url);assert.ok(Array.isArray(a.species)&&a.species.length);assert.ok(Array.isArray(a.topics)&&a.topics.length);for(const s of a.species)assert.ok(allowedSpecies.has(s),`${a.slug}: ${s}`);for(const t of a.topics)assert.ok(allowedTopics.has(t),`${a.slug}: ${t}`);assert.ok(allowedLevels.has(a.level),`${a.slug}: ${a.level}`);assert.ok(Number.isInteger(a.readTime)&&a.readTime>0);assert.match(a.published,/^\d{4}-\d{2}-\d{2}$/);}});
test('every registry URL points to an article file',()=>{for(const a of articles){const rel=a.url.replace(/^\//,'');assert.ok(fs.existsSync(path.join(root,rel)),`${a.slug} missing ${rel}`);}});
test('education landing page is data-driven and exposes approved filters',()=>{const html=fs.readFileSync(path.join(resources,'index.html'),'utf8');const js=fs.readFileSync(path.join(resources,'library.js'),'utf8');assert.match(html,/id="animal-tabs"/);assert.match(html,/id="topic-filters"/);assert.match(html,/id="article-search"/);assert.match(html,/id="article-sort"/);assert.match(html,/\/resources\/library\.js/);assert.match(js,/URLSearchParams/);assert.match(js,/animal/);assert.match(js,/topic/);assert.match(js,/Beginner first|beginner/);assert.ok(!html.includes('articles.map('),'article cards must come from library.js registry rendering');});
test('winter rabbit care is categorized under Rabbits and Health & Biosecurity',()=>{const article=articles.find(a=>a.slug==='winter-rabbit-care');assert.ok(article);assert.deepEqual(article.species,['rabbit']);assert.ok(article.topics.includes('Health & Biosecurity'));assert.equal(article.url,'/resources/winter-rabbit-care.html');});
