"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const optional = read("herdharbor-optional-tools.js");
const index = read("index.html");
const paperUi = read("paper-pedigree-import-v1.8.2.js");
const paperEdge = read("supabase/functions/paper-pedigree-extract/index.ts");
const photo = read("photo-assisted-entry-v1.8.3.js");
const voice = read("voice-assisted-entry-v1.8.3.js");
const photoEdge = read("supabase/functions/record-photo-extract/index.ts");
const contract = read("V2.0.0-PRODUCTION-RELEASE-CONTRACT.md");

test("hidden AI tools remain gated and are not eagerly exposed to normal members", () => {
  assert.doesNotMatch(index, /<script[^>]+voice-assisted-entry-v1\.8\.3\.js/i);
  assert.doesNotMatch(index, /<script[^>]+photo-assisted-entry-v1\.8\.3\.js/i);
  assert.doesNotMatch(index, /<script[^>]+mobile-capture-v1\.8\.3\.js/i);
  assert.match(optional, /AI_TESTER_KEY/);
  assert.match(optional, /isAiLiveTester/);
  assert.match(optional, /ensureAiLiveTools/);
  assert.match(optional, /mobileCapture:\s*"mobile-capture-v1\.8\.3\.js\?v=1"/);
  assert.match(optional, /await loadScript\([\s\S]*ASSETS\.mobileCapture[\s\S]*await loadScript\([\s\S]*ASSETS\.photoAi/);
  assert.match(optional, /paperPedigreeCore:\s*"paper-pedigree-import-core-v1\.8\.2\.js\?v=1"/);
  assert.match(optional, /paperPedigreeUi:\s*"paper-pedigree-import-v1\.8\.2\.js\?v=2"/);
  assert.match(optional, /await loadScript\([\s\S]*ASSETS\.paperPedigreeCore[\s\S]*await loadScript\([\s\S]*ASSETS\.paperPedigreeUi/);
  assert.match(optional, /data-quick="voice"/);
  assert.match(optional, /data-quick="photo"/);
  assert.match(optional, /data-pp-read/);
  assert.match(optional, /display:none!important/);
});

test("voice and photo assistance create review drafts rather than owning canonical persistence", () => {
  assert.match(voice, /review/i);
  assert.match(photo, /review/i);
  assert.doesNotMatch(voice, /commitState\s*\(/);
  assert.doesNotMatch(photo, /commitState\s*\(/);
  assert.doesNotMatch(voice, /HerdHarborStateStore\.(?:commit|replaceRaw)/);
  assert.doesNotMatch(photo, /HerdHarborStateStore\.(?:commit|replaceRaw)/);
});

test("paper pedigree extraction requires explicit review before its only canonical commit path", () => {
  assert.match(paperUi, /data-pp-confirm-review/);
  assert.match(paperUi, /I reviewed the extracted draft against the source image/);
  assert.match(paperUi, /commit\.disabled = !subjectReady \|\| !reviewConfirmed/);
  const commits = [...paperUi.matchAll(/commitState\(/g)];
  assert.equal(commits.length, 1);
  const checkAt = paperUi.indexOf("if (!confirm?.checked || reviewConfirmed !== true)");
  const commitAt = paperUi.indexOf("app().commitState");
  assert.ok(checkAt >= 0 && commitAt > checkAt);
});

test("AI image providers remain server-side, authenticated, quota-guarded and non-retentive", () => {
  for (const source of [paperEdge, photoEdge]) {
    assert.match(source, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
    assert.match(source, /admin\.auth\.getUser\(token\)/);
    assert.match(source, /herdharbor_reserve_ai_image_request/);
    assert.match(source, /DEFAULT_DAILY_LIMIT = 10/);
    assert.match(source, /DEFAULT_GLOBAL_DAILY_LIMIT = 50/);
    assert.match(source, /store:\s*false/);
  }
  assert.doesNotMatch(paperUi, /OPENAI_API_KEY|api\.openai\.com/);
  assert.doesNotMatch(photo, /OPENAI_API_KEY|api\.openai\.com/);
});

test("AI provider failures fail closed before canonical farm-state mutation", () => {
  for (const source of [paperEdge, photoEdge]) {
    assert.match(source, /quota_exceeded/);
    assert.match(source, /provider_timeout/);
    assert.match(source, /provider_rate_limit/);
    assert.match(source, /provider_error/);
  }
  assert.match(paperEdge, /malformed_structured_result|schema_validation/);
  assert.doesNotMatch(paperEdge, /commitState|state\.animals/);
  assert.doesNotMatch(photoEdge, /commitState|state\.animals|state\.health/);
});

test("2.0.0 release contract keeps AI availability boundaries explicit without tester-facing terminology", () => {
  assert.match(contract, /Paper Pedigree photo reading[\s\S]*controlled-access/i);
  assert.match(contract, /standard accounts do not gain the hidden AI read action/i);
  assert.match(contract, /Voice-assisted entry[\s\S]*production-deployed, controlled-access/i);
  assert.match(contract, /Photo-assisted entry[\s\S]*production-deployed, controlled-access/i);
  assert.match(contract, /Multi-photo pedigree merging remains deferred/i);
  assert.match(contract, /no direct canonical persistence/i);
});

test("normal member UI does not advertise internal AI engine/model versions", () => {
  const memberSources = [index, paperUi];
  for (const source of memberSources) {
    assert.doesNotMatch(source, /AI\s+(?:Engine|Runtime|Module)\s+v\d/i);
    assert.doesNotMatch(source, /(?:GPT|OpenAI)\s+[A-Za-z0-9._-]+/i);
  }
});
