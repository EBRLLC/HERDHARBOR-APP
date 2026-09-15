const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('paper pedigree usage ledger is service-role only with an atomic daily reservation RPC', () => {
  const sql = read('supabase/v1.8.2-paper-pedigree-ai-usage.sql');
  assert.match(sql, /create table if not exists public\.herdharbor_paper_pedigree_ai_usage/);
  assert.match(sql, /primary key \(user_id, usage_date\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.herdharbor_paper_pedigree_ai_usage from anon, authenticated/);
  assert.match(sql, /grant all on table public\.herdharbor_paper_pedigree_ai_usage to service_role/);
  assert.match(sql, /create or replace function public\.herdharbor_reserve_paper_pedigree_ai_request/);
  assert.match(sql, /on conflict \(user_id, usage_date\) do update/);
  assert.match(sql, /request_count < p_daily_limit/);
  assert.match(sql, /revoke all on function public\.herdharbor_reserve_paper_pedigree_ai_request\(uuid, integer\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.herdharbor_reserve_paper_pedigree_ai_request\(uuid, integer\)[\s\S]*to service_role/);
});

test('Edge Function validates the image before reserving a bounded daily AI request', () => {
  const edge = read('supabase/functions/paper-pedigree-extract/index.ts');
  assert.match(edge, /DEFAULT_DAILY_LIMIT = 10/);
  assert.match(edge, /PAPER_PEDIGREE_DAILY_LIMIT/);
  assert.match(edge, /MAX_REQUEST_BYTES/);
  const mimeCheck = edge.indexOf('if (!ALLOWED_MIME.has(mimeType))');
  const reserveCall = edge.indexOf('admin.rpc("herdharbor_reserve_paper_pedigree_ai_request"');
  const providerCall = edge.indexOf('fetch(OPENAI_API');
  assert.ok(mimeCheck >= 0 && reserveCall > mimeCheck, 'invalid payloads must not consume a usage reservation');
  assert.ok(providerCall > reserveCall, 'usage reservation must happen before the paid provider call');
  assert.match(edge, /status[^\n]*429|, 429\)/);
  assert.match(edge, /reached today's paper pedigree reading limit/);
});
