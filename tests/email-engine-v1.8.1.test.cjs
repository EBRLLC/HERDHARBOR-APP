const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/email-engine/index.ts'), 'utf8');
const registrationSource = fs.readFileSync(path.join(root, 'supabase/functions/registration-profile/index.ts'), 'utf8');

test('email engine keeps Resend credentials server-side', () => {
  assert.match(source, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(source, /Deno\.env\.get\("RESEND_MANAGEMENT_API_KEY"\)/);
  assert.doesNotMatch(source, /re_[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(registrationSource, /re_[A-Za-z0-9_-]{10,}/);
});

test('mass-email actions require HerdHarbor owner/admin authorization', () => {
  assert.match(source, /requireAdmin\(admin, user\.id\)/);
  assert.match(source, /\["owner", "admin"\]\.includes\(access\.account_role\)/);
  assert.match(source, /account_status !== "active"/);
});

test('broadcast creation is draft-only and includes unsubscribe handling', () => {
  assert.match(source, /action === "admin_create_broadcast_draft"/);
  assert.match(source, /send:\s*false/);
  assert.doesNotMatch(source, /send:\s*true/);
  assert.match(source, /RESEND_UNSUBSCRIBE_URL/);
});

test('audience sync is isolated from transactional sending credentials', () => {
  assert.match(source, /action === "sync_self"/);
  assert.match(source, /action === "admin_sync_all"/);
  assert.match(source, /managementKey/);
  assert.match(source, /GENERAL_SEGMENT_ID/);
});

test('completed registrations sync to Resend without making signup depend on Resend', () => {
  assert.match(registrationSource, /syncResendContact/);
  assert.match(registrationSource, /RESEND_MANAGEMENT_API_KEY/);
  assert.match(registrationSource, /Resend audience sync failed without blocking registration/);
  assert.match(registrationSource, /try\s*\{\s*await syncResendContact[\s\S]*?\}\s*catch/);
});

test('broadcast sender is restricted to the verified HerdHarbor domain', () => {
  assert.match(source, /@auth\.herdharbor\.com/);
  assert.match(source, /senderAllowed\(from\)/);
});
