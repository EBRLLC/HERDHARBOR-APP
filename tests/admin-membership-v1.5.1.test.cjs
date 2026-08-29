"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const cloud = read("herdharbor-cloud.js");
const admin = read("herdharbor-admin-v1.5.1.js");
const membership = read("herdharbor-membership-v1.5.1.js");
const html = read("index.html");
const directorySql = read("supabase/v1.5.1-admin-member-directory.sql");

const functionBody = (name, nextName) => cloud.slice(
  cloud.indexOf(`async function ${name}`),
  nextName ? cloud.indexOf(`async function ${nextName}`) : cloud.length
);

assert.match(cloud, /const ACCESS_TABLE = "account_access"/);
assert.match(cloud, /const ADMIN_AUDIT_TABLE = "admin_audit_log"/);
assert.match(cloud, /client\.rpc\("herdharbor_account_role"\)/);
assert.match(cloud, /\["TOKEN_REFRESHED", "USER_UPDATED"\]\.includes\(event\)/);
const roleMutation = functionBody("setMemberRole", "setMemberMembership");
const membershipMutation = functionBody("setMemberMembership", "returnMemberToAutomatic");
const automaticMutation = functionBody("returnMemberToAutomatic", "getSyncDetails");
assert.match(roleMutation, /callAdminRpc\("admin_set_account_role", \{\s*target_user: userId,\s*new_role: role,\s*change_reason: safeReason \|\| null\s*\}\)/);
assert.match(membershipMutation, /callAdminRpc\("admin_set_membership", \{\s*target_user: userId,\s*new_tier: tier,\s*change_reason: safeReason \|\| null,\s*expires_at: expiresAt\s*\}\)/);
assert.match(automaticMutation, /callAdminRpc\("admin_return_to_automatic_membership", \{\s*target_user: userId,\s*change_reason: safeReason \|\| null\s*\}\)/);
assert.doesNotMatch([roleMutation, membershipMutation, automaticMutation].join("\n"), /target_user_id|target_account_id|p_target_user_id|new_membership_tier|parameterVariants/);
assert.doesNotMatch(cloud, /isRpcSignatureError|PGRST202|PGRST203/, "known production RPC signatures are not guessed at runtime");
assert.match(cloud, /const ADMIN_DIRECTORY_RPC = "admin_member_directory"/);
assert.match(cloud, /client\.rpc\(ADMIN_DIRECTORY_RPC\)/);
assert.doesNotMatch(functionBody("listMembers", "listMemberAudit"), /from\(ACCESS_TABLE\)/, "Admin listing comes from the protected directory RPC");
assert.doesNotMatch(cloud, /service[_-]?role/i, "browser source contains no Supabase service-role credential");
assert.doesNotMatch(cloud, /from\(ACCESS_TABLE\)\.update\(/, "account_access cannot be changed directly by the browser");
assert.doesNotMatch(cloud, /from\(ADMIN_AUDIT_TABLE\)\.(?:insert|update|delete)\(/, "audit history is written only by secure RPCs");

assert.match(directorySql, /create or replace function public\.admin_member_directory\(\)/i);
assert.match(directorySql, /security definer/i);
assert.match(directorySql, /set search_path = ''/i);
assert.match(directorySql, /auth\.uid\(\) is null or not exists/i);
assert.match(directorySql, /caller\.account_role in \('owner', 'admin'\)/i);
assert.match(directorySql, /caller\.account_status = 'active'/i);
assert.match(directorySql, /raise exception[\s\S]*errcode = '42501'/i, "ordinary Users are rejected inside the RPC");
assert.match(directorySql, /inner join auth\.users as users on users\.id = access\.user_id/i);
assert.match(directorySql, /revoke all on function public\.admin_member_directory\(\) from public/i);
assert.match(directorySql, /revoke all on function public\.admin_member_directory\(\) from anon/i);
assert.match(directorySql, /grant execute on function public\.admin_member_directory\(\) to authenticated/i);
assert.doesNotMatch(directorySql, /herdharbor_user_data|app_state|encrypted_password|confirmation_token|recovery_token|raw_app_meta_data/i);
assert.doesNotMatch(directorySql, /active_animal_count/i, "directory does not inspect private farm state for usage");
const returnedColumns = directorySql.match(/returns table \(([\s\S]*?)\)\s*language/i)[1]
  .split(",")
  .map((column) => column.trim().split(/\s+/)[0]);
assert.deepEqual(returnedColumns, [
  "user_id",
  "email",
  "display_name",
  "created_at",
  "last_sign_in_at",
  "account_role",
  "membership_tier",
  "membership_source",
  "account_status",
  "override_expires_at",
  "updated_at"
], "directory returns only the reviewed account-administration allowlist");

assert.match(membership, /account_role: "user"/);
assert.match(membership, /membership_tier: "member"/);
assert.match(membership, /membership_source: "default"/);
assert.match(membership, /canAccessAdmin/);
assert.match(membership, /isOwner/);
assert.match(membership, /isAdmin/);

assert.match(html, /data-route="admin"[^>]*hidden[^>]*aria-hidden="true"/);
assert.match(html, /herdharbor-access-cache-v1\.5\.1\.js/);
assert.match(html, /if \(route === "admin" && window\.HerdHarborMembership\?\.canAccessAdmin\?\.\(\) !== true\)/);
assert.match(html, /HerdHarborAdmin\?\.render\?\.\(\)/);
assert.match(admin, /Supabase also enforces this permission through Row Level Security/);
assert.match(admin, /Manage account roles and membership access without opening private farm records/);
assert.match(admin, /Search<input id="hh-admin-search"/);
assert.match(admin, /All tiers/);
assert.match(admin, /All roles/);
assert.match(admin, /Administrative history/);
assert.match(admin, /Changed by/);
assert.match(admin, /acting_admin_id/);
assert.match(admin, /Return to Automatic/);
assert.match(admin, /HerdHarborMembership\?\.resolveProfile/);
assert.match(admin, /Manual override/);
assert.match(admin, /Owner role is protected by Supabase/);
assert.match(admin, /id="hh-admin-next-role"[^\n]*value="user"[^\n]*value="admin"/, "Owner is never offered as an assignable role");
assert.doesNotMatch(admin, /id="hh-admin-next-role"[^\n]*value="owner"/);
assert.match(admin, /Not exposed by the current secure account directory/);
assert.match(admin, /usage !== null && usage !== undefined && usage !== ""/, "unavailable cross-account usage is not mislabeled as zero");
assert.match(admin, /does not grant access to a member's animals, health records, customers, finances, or farm notes/);

assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/, "protected farm-state key is unchanged");
assert.match(html, /const defaultState = \{/);
assert.doesNotMatch(html, /juniorAnimals|juniorPedigrees|juniorSync/, "Junior reuses current farm records and sync");

console.log("Alpha v1.5.1 Owner/Admin membership security and UI contract tests passed");
