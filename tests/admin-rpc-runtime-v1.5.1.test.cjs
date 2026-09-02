"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const start = cloud.indexOf("  async function callAdminRpc");
const end = cloud.indexOf("  function getSyncDetails", start);
assert.ok(start >= 0 && end > start, "Admin cloud methods are present");

const source = cloud.slice(start, end);
const calls = [];
let forcedError = null;
const directoryRows = [
  {
    user_id: "00000000-0000-4000-8000-000000000010",
    email: "junior@example.com",
    display_name: "Junior Tester",
    account_role: "user",
    membership_tier: "junior",
    membership_source: "manual_override",
    account_status: "active",
    created_at: "2026-08-01T12:00:00.000Z",
    last_sign_in_at: "2026-08-29T12:00:00.000Z"
  }
];
let auditRows = [];
const client = {
  async rpc(name, parameters) {
    calls.push({ name, parameters });
    if (forcedError) return { data: null, error: forcedError };
    if (name === "admin_member_directory") return { data: directoryRows, error: null };
    return { data: { ok: true }, error: null };
  },
  from(table) {
    assert.equal(table, "admin_audit_log");
    return {
      select(columns) {
        assert.equal(columns, "*");
        return {
          eq(column, value) {
            calls.push({ name: "admin_audit_query", parameters: { column, value } });
            return {
              order(orderColumn, options) {
                assert.equal(orderColumn, "created_at");
                assert.deepEqual(options, { ascending: false });
                return {
                  async limit(limit) {
                    assert.equal(limit, 250);
                    return { data: auditRows.filter((row) => row.target_user_id === value), error: null };
                  }
                };
              }
            };
          }
        };
      }
    };
  }
};
const session = { user: { id: "00000000-0000-4000-8000-000000000099" } };
const window = {
  HerdHarborMembership: {
    resolveProfile(row) { return { tier: row.membership_tier }; }
  }
};
const failures = [];
const reportAccountOperationFailure = (operation) => failures.push(operation);
const loadAccessProfile = async () => undefined;
const originalGetItem = { call() { return null; } };
const localStorage = {};
const safeParse = (value) => {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
};
const STORAGE_KEY = "herdharbor_pre_alpha_v1";
const ADMIN_DIRECTORY_RPC = "admin_member_directory";

const build = new Function(
  "client",
  "session",
  "window",
  "reportAccountOperationFailure",
  "loadAccessProfile",
  "originalGetItem",
  "localStorage",
  "safeParse",
  "STORAGE_KEY",
  "ADMIN_DIRECTORY_RPC",
  "ADMIN_AUDIT_TABLE",
  `${source}
  return { listMembers, getMemberDetail, setMemberRole, setMemberMembership, returnMemberToAutomatic };`
);
const api = build(
  client,
  session,
  window,
  reportAccountOperationFailure,
  loadAccessProfile,
  originalGetItem,
  localStorage,
  safeParse,
  STORAGE_KEY,
  ADMIN_DIRECTORY_RPC,
  "admin_audit_log"
);

async function main() {
  const target = "00000000-0000-4000-8000-000000000010";

  await api.setMemberRole({ userId: target, accountRole: "admin", reason: "Make Admin" });
  await api.setMemberRole({ userId: target, accountRole: "user", reason: "Remove Admin" });
  await api.setMemberMembership({ userId: target, membershipTier: "junior", reason: "Junior" });
  await api.setMemberMembership({ userId: target, membershipTier: "member", reason: "Member" });
  await api.setMemberMembership({
    userId: target,
    membershipTier: "founder",
    reason: "Founder",
    expiresAt: "2027-01-01T00:00:00.000Z"
  });
  await api.returnMemberToAutomatic(target, "Automatic");

  assert.deepEqual(calls.slice(0, 6), [
    { name: "admin_set_account_role", parameters: { target_user: target, new_role: "admin", change_reason: "Make Admin" } },
    { name: "admin_set_account_role", parameters: { target_user: target, new_role: "user", change_reason: "Remove Admin" } },
    { name: "admin_set_membership", parameters: { target_user: target, new_tier: "junior", change_reason: "Junior", expires_at: null } },
    { name: "admin_set_membership", parameters: { target_user: target, new_tier: "member", change_reason: "Member", expires_at: null } },
    { name: "admin_set_membership", parameters: { target_user: target, new_tier: "founder", change_reason: "Founder", expires_at: "2027-01-01T00:00:00.000Z" } },
    { name: "admin_return_to_automatic_membership", parameters: { target_user: target, change_reason: "Automatic" } }
  ], "the running Admin methods send the exact installed Supabase contracts");

  const directory = await api.listMembers({ search: "junior tester", role: "user", tier: "junior", status: "active", limit: 250 });
  assert.equal(calls[6].name, "admin_member_directory");
  assert.equal(calls[6].parameters, undefined, "the protected directory RPC has no guessed parameters");
  assert.equal(directory.length, 1);
  assert.equal(directory[0].email, "junior@example.com");
  assert.equal(directory[0].display_name, "Junior Tester");
  assert.equal(directory[0].last_sign_in_at, "2026-08-29T12:00:00.000Z");
  assert.equal(directory[0].active_animal_count, null, "cross-account farm usage is not opened by the directory");

  const olderTarget = "00000000-0000-4000-8000-000000000999";
  directoryRows.splice(0, directoryRows.length,
    ...Array.from({ length: 251 }, (_, index) => ({
      user_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      account_role: "user",
      membership_tier: "member",
      membership_source: "default",
      account_status: "active"
    })),
    {
      user_id: olderTarget,
      email: "older@example.com",
      display_name: "Older Account",
      account_role: "user",
      membership_tier: "member",
      membership_source: "default",
      account_status: "active"
    }
  );
  auditRows = [{ id: "audit-1", target_user_id: olderTarget, action: "membership_override_created" }];
  const detail = await api.getMemberDetail(olderTarget);
  assert.equal(detail.member.user_id, olderTarget, "member detail resolves an account beyond the first 250 unfiltered rows");
  assert.equal(detail.audit.length, 1, "member audit history is filtered before applying the 250-row limit");
  assert.deepEqual(calls.at(-1), {
    name: "admin_audit_query",
    parameters: { column: "target_user_id", value: olderTarget }
  });

  forcedError = { message: "denied", code: "42501" };
  const beforeFailure = calls.length;
  await assert.rejects(
    api.setMemberRole({ userId: target, accountRole: "admin" }),
    /denied/
  );
  assert.equal(calls.length, beforeFailure + 1, "a failed mutation is not retried with guessed signatures");
  assert.equal(failures.at(-1), "admin_set_account_role");

  console.log("Alpha v1.6.5 runtime Admin RPC contract tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
