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

assert.match(cloud, /const ACCESS_TABLE = "account_access"/);
assert.match(cloud, /const ADMIN_AUDIT_TABLE = "admin_audit_log"/);
assert.match(cloud, /client\.rpc\("herdharbor_account_role"\)/);
assert.match(cloud, /\["TOKEN_REFRESHED", "USER_UPDATED"\]\.includes\(event\)/);
assert.match(cloud, /callAdminRpc\("admin_set_account_role"/);
assert.match(cloud, /callAdminRpc\("admin_set_membership"/);
assert.match(cloud, /callAdminRpc\("admin_return_to_automatic_membership"/);
assert.doesNotMatch(cloud, /service[_-]?role/i, "browser source contains no Supabase service-role credential");
assert.doesNotMatch(cloud, /from\(ACCESS_TABLE\)\.update\(/, "account_access cannot be changed directly by the browser");
assert.doesNotMatch(cloud, /from\(ADMIN_AUDIT_TABLE\)\.(?:insert|update|delete)\(/, "audit history is written only by secure RPCs");

assert.match(membership, /account_role: "user"/);
assert.match(membership, /membership_tier: "member"/);
assert.match(membership, /membership_source: "default"/);
assert.match(membership, /canAccessAdmin/);
assert.match(membership, /isOwner/);
assert.match(membership, /isAdmin/);

assert.match(html, /data-route="admin"[^>]*hidden[^>]*aria-hidden="true"/);
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
