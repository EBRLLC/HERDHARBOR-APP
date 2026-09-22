"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const edge = read("supabase/functions/paper-pedigree-extract/index.ts");
const ui = read("paper-pedigree-import-v1.8.2.js");
const cloud = read("herdharbor-cloud.js");
const metricsSql = read("supabase/v1.8.3-paper-pedigree-ai-metrics.sql");
const contract = read("PAPER-PEDIGREE-AI-PRODUCTION-v1.8.3.md");
const packageJson = JSON.parse(read("package.json"));

test("Paper Pedigree AI keeps provider configuration and authentication server-side", () => {
  const config = read("supabase/config.toml");
  assert.match(config, /\[functions\.paper-pedigree-extract\][\s\S]*verify_jwt = true/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_PEDIGREE_MODEL"\)/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /store:\s*false/);
  assert.doesNotMatch(ui, /OPENAI_API_KEY|api\.openai\.com|Bearer\s+\$\{openAiKey\}/);
});

test("extractor exposes stable safe diagnostics for required production failure classes", () => {
  for (const code of [
    "configuration_unavailable",
    "authentication_required",
    "authentication_invalid",
    "unsupported_image",
    "invalid_image_payload",
    "image_too_large",
    "usage_ledger_unavailable",
    "quota_exceeded",
    "provider_rate_limit",
    "provider_timeout",
    "provider_error",
    "extraction_incomplete",
    "empty_extraction",
    "malformed_structured_result",
    "no_pedigree_detected",
    "service_error"
  ]) {
    assert.match(edge, new RegExp(`"${code}"`));
  }
  assert.match(edge, /retryable/);
  assert.doesNotMatch(edge, /payload\?\.error\?\.message/);
  assert.doesNotMatch(edge, /console\.error\([^\n]*(?:sourceText|dataUrl|fileName|payload)/);
});

test("provider calls are bounded by an explicit configurable timeout and fail safely", () => {
  assert.match(edge, /DEFAULT_PROVIDER_TIMEOUT_MS = 30_000/);
  assert.match(edge, /PAPER_PEDIGREE_PROVIDER_TIMEOUT_MS/);
  assert.match(edge, /new AbortController\(\)/);
  assert.match(edge, /setTimeout\(\(\) => controller\.abort\(\), configuredProviderTimeoutMs\(\)\)/);
  assert.match(edge, /signal:\s*controller\.signal/);
  assert.match(edge, /error as Error\)\?\.name === "AbortError"/);
  assert.match(edge, /provider_timeout/);
});

test("malformed structured output fails closed instead of entering the import core", () => {
  assert.match(edge, /function validateStructuredResult/);
  assert.match(edge, /seen\.has\(role\)/);
  assert.match(edge, /JSON\.parse\(outputText\)/);
  assert.match(edge, /stage:\s*"json_parse"/);
  assert.match(edge, /stage:\s*"schema_validation"/);
  assert.match(edge, /recordMetric\(admin, "rejected_output"\)/);
  const normalizeIndex = edge.indexOf("const normalized = normalizeResult(parsed, fileName)");
  const validationIndex = edge.indexOf("if (!validateStructuredResult(parsed))");
  assert.ok(validationIndex >= 0 && normalizeIndex > validationIndex);
});

test("layout instructions allow common rabbit layouts and partial images without claiming handwriting reliability", () => {
  assert.match(edge, /vertical ancestry trees/);
  assert.match(edge, /horizontal ancestry trees/);
  assert.match(edge, /grids or columns/);
  assert.match(edge, /branch\/relationship diagrams/);
  assert.match(edge, /Moderate rotation, perspective, glare, or cropping/);
  assert.match(edge, /partial document may return the readable portion/);
  assert.match(edge, /Handwriting is not assumed reliable/);
  assert.match(edge, /leave the field blank or use a low confidence score/);
});

test("review UI preserves per-field confidence provenance and highlights uncertain values", () => {
  assert.match(ui, /extraction confidence/);
  assert.match(ui, /confidenceFor\(node, field\)/);
  assert.doesNotMatch(ui, /node\.confidence\[input\.dataset\.ppField\]\s*=\s*1/);
  for (const field of [
    "name", "registrationNumber", "tattoo", "tag", "earTagNumber",
    "species", "breed", "sex", "color", "variety", "dob", "breeder"
  ]) {
    assert.match(ui, new RegExp(`\\["${field}",`));
  }
});

test("member must explicitly confirm review before the only canonical commit path", () => {
  assert.match(ui, /data-pp-confirm-review/);
  assert.match(ui, /I reviewed the extracted draft against the source image/);
  assert.match(ui, /Confirm that you reviewed the extracted pedigree draft before importing/);
  assert.match(ui, /commit\.disabled = !subjectReady \|\| !reviewConfirmed/);
  assert.match(ui, /target\.oninput/);
  assert.match(ui, /confirm\.checked = false/);
  const commitCalls = [...ui.matchAll(/commitState\(/g)];
  assert.equal(commitCalls.length, 1);
  const confirmCheck = ui.indexOf("if (!confirm?.checked || reviewConfirmed !== true)");
  const commitCall = ui.indexOf("app().commitState");
  assert.ok(confirmCheck >= 0 && commitCall > confirmCheck);
});

test("browser receives only sanitized Edge Function diagnostic fields", () => {
  assert.match(cloud, /async function invokeFunctionWithDiagnostics/);
  assert.match(cloud, /response\.clone\(\)\.json\(\)/);
  assert.match(cloud, /\^\[a-z0-9_\]\{2,64\}\$/);
  assert.match(cloud, /safeMessage/);
  assert.match(cloud, /failure\.code = safeCode/);
  assert.match(cloud, /failure\.retryable = true/);
  assert.doesNotMatch(cloud, /Object\.assign\(failure, diagnostic\)/);
  assert.match(ui, /invokeFunctionWithDiagnostics/);
});

test("production metrics are aggregate-only, service-role-only, and cover the required outcomes", () => {
  assert.match(metricsSql, /create table if not exists public\.herdharbor_paper_pedigree_ai_metrics/);
  assert.match(metricsSql, /usage_date date primary key/);
  assert.doesNotMatch(metricsSql, /user_id\s+uuid/);
  for (const metric of [
    "extraction_requests",
    "structured_drafts",
    "correction_required_drafts",
    "rejected_outputs",
    "rate_limit_hits",
    "provider_failures"
  ]) {
    assert.match(metricsSql, new RegExp(metric));
  }
  assert.match(metricsSql, /revoke all on table public\.herdharbor_paper_pedigree_ai_metrics from public, anon, authenticated/);
  assert.match(metricsSql, /grant all on table public\.herdharbor_paper_pedigree_ai_metrics to service_role/);
  assert.match(metricsSql, /herdharbor_record_paper_pedigree_ai_metric/);
  assert.match(edge, /recordMetric\(admin, "extraction_request"\)/);
  assert.match(edge, /recordMetric\(admin, "structured_draft"\)/);
  assert.match(edge, /recordMetric\(admin, "correction_required"\)/);
  assert.match(edge, /recordMetric\(admin, "rate_limit_hit"\)/);
  assert.match(edge, /recordMetric\(admin, "provider_failure"\)/);
  assert.doesNotMatch(metricsSql, /sourceText|pedigree.*json|farm_state|data_url|image_url/i);
});

test("existing canonical matching and mutation boundaries remain authoritative", () => {
  const core = read("paper-pedigree-import-core-v1.8.2.js");
  assert.match(core, /findExistingAnimal/);
  assert.match(core, /ambiguous-match/);
  assert.match(core, /duplicate-pedigree-conflict/);
  assert.match(core, /sireId/);
  assert.match(core, /damId/);
  assert.match(core, /ANCESTOR_STATUS = "Ancestor Only"/);
  assert.match(core, /if \(\(plan\.conflicts \|\| \[\]\)\.length && options\.allowConflicts !== true\)/);
  assert.doesNotMatch(edge, /commitState|state\.animals|sireId\s*=|damId\s*=/);
});

test("multi-photo merge is explicitly deferred until provenance and conflict contracts exist", () => {
  assert.match(contract, /Multi-photo decision/);
  assert.match(contract, /intentionally \*\*deferred\*\*/);
  assert.match(contract, /deterministic per-image field provenance/);
  assert.match(contract, /conflicting-value presentation/);
  assert.doesNotMatch(ui, /type="file"[^>]*\smultiple(?:\s|>)/);
});

test("changed browser assets remain refreshed under the formal v1.8.3 release", () => {
  const build = read("herdharbor-build.js");
  const index = read("index.html");
  const worker = read("service-worker.js");
  assert.equal(packageJson.version, "1.8.3");
  assert.match(index, /herdharbor-cloud\.js\?v=21/);
  assert.match(worker, /\.\/herdharbor-cloud\.js\?v=21/);
  assert.match(build, /paper-pedigree-import-v1\.8\.2\.js\?v=2/);
  assert.match(worker, /\.\/paper-pedigree-import-v1\.8\.2\.js\?v=2/);
  assert.match(worker, /herdharbor-shell-v1\.8\.3/);
});

test("v1.8.3 development gate includes Paper Pedigree AI production hardening", () => {
  assert.match(packageJson.scripts["test:v1.8.3"], /paper-pedigree-production-hardening-v1\.8\.3\.test\.cjs/);
});
