"use strict";

const baseUrl = String(process.env.HERDHARBOR_SUPABASE_URL || "https://okynebbksifqppwicghj.supabase.co").replace(/\/$/, "");
const publishableKey = String(process.env.HERDHARBOR_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09").trim();

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for membership production acceptance.`);
  return value;
}

async function signIn(email, password) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`Acceptance account sign-in failed for ${email} (${response.status}).`);
  const payload = await response.json();
  if (!payload.access_token || !payload.user?.id) throw new Error(`Acceptance account ${email} returned no authenticated session.`);
  return { token: payload.access_token, user: payload.user };
}

async function api(path, session, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function ownAccess(session) {
  const response = await api(`/rest/v1/account_access?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id,account_role,membership_tier,membership_source,account_status,override_expires_at,subscription_status`, session);
  if (!response.ok) throw new Error(`Could not read the authenticated account_access row (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Expected exactly one account_access row for the authenticated account.");
  return rows[0];
}

function assertEqual(actual, expected, label) {
  if (String(actual || "").toLowerCase() !== String(expected || "").toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}.`);
  }
}

const owner = await signIn(required("HH_ACCEPTANCE_OWNER_EMAIL"), required("HH_ACCEPTANCE_OWNER_PASSWORD"));
const ordinary = await signIn(required("HH_ACCEPTANCE_USER_EMAIL"), required("HH_ACCEPTANCE_USER_PASSWORD"));

const ownerAccess = await ownAccess(owner);
assertEqual(ownerAccess.account_role, "owner", "Owner role");
assertEqual(ownerAccess.account_status, "active", "Owner account status");

const userAccess = await ownAccess(ordinary);
assertEqual(userAccess.account_role, "user", "Ordinary account role");
assertEqual(userAccess.account_status, "active", "Ordinary account status");

const ownerDirectory = await api("/rest/v1/rpc/admin_member_directory", owner, { method: "POST", body: "{}" });
if (!ownerDirectory.ok) throw new Error(`Owner/Admin member directory RPC failed (${ownerDirectory.status}).`);
const directoryRows = await ownerDirectory.json();
if (!Array.isArray(directoryRows)) throw new Error("Owner/Admin member directory did not return an array.");

const deniedDirectory = await api("/rest/v1/rpc/admin_member_directory", ordinary, { method: "POST", body: "{}" });
if (deniedDirectory.ok) throw new Error("Ordinary User unexpectedly accessed the protected member directory.");

const newUserEmail = String(process.env.HH_ACCEPTANCE_NEW_USER_EMAIL || "").trim();
const newUserPassword = String(process.env.HH_ACCEPTANCE_NEW_USER_PASSWORD || "").trim();
if (newUserEmail || newUserPassword) {
  if (!newUserEmail || !newUserPassword) throw new Error("Provide both HH_ACCEPTANCE_NEW_USER_EMAIL and HH_ACCEPTANCE_NEW_USER_PASSWORD.");
  const fresh = await signIn(newUserEmail, newUserPassword);
  const freshAccess = await ownAccess(fresh);
  assertEqual(freshAccess.account_role, "user", "New-account role default");
  assertEqual(freshAccess.membership_tier, "member", "New-account tier default");
  assertEqual(freshAccess.membership_source, "default", "New-account membership source");
  assertEqual(freshAccess.account_status, "active", "New-account status default");
}

const juniorEmail = String(process.env.HH_ACCEPTANCE_JUNIOR_EMAIL || "").trim();
const juniorPassword = String(process.env.HH_ACCEPTANCE_JUNIOR_PASSWORD || "").trim();
if (juniorEmail || juniorPassword) {
  if (!juniorEmail || !juniorPassword) throw new Error("Provide both HH_ACCEPTANCE_JUNIOR_EMAIL and HH_ACCEPTANCE_JUNIOR_PASSWORD.");
  const junior = await signIn(juniorEmail, juniorPassword);
  const juniorAccess = await ownAccess(junior);
  assertEqual(juniorAccess.membership_tier, "junior", "Junior acceptance account tier");
  assertEqual(juniorAccess.account_status, "active", "Junior acceptance account status");
}

const auditResponse = await api("/rest/v1/admin_audit_log?select=actor_user_id,target_user_id,action,previous_value,new_value,reason,created_at&order=created_at.desc&limit=1", owner);
if (!auditResponse.ok) throw new Error(`Owner could not read the protected admin audit log (${auditResponse.status}).`);
const auditRows = await auditResponse.json();
if (Array.isArray(auditRows) && auditRows.length) {
  for (const field of ["actor_user_id", "target_user_id", "action", "previous_value", "new_value", "created_at"]) {
    if (!(field in auditRows[0])) throw new Error(`Admin audit row is missing ${field}.`);
  }
}

console.log("Production membership read-only acceptance passed:");
console.log("- Owner can read the protected member directory");
console.log("- Ordinary User is denied the member directory");
console.log("- Authenticated account_access RLS exposes each tested account's own access row");
console.log("- Optional fresh-account and Junior assertions passed when credentials were supplied");
console.log("- Owner can read the allowlisted administrative audit surface");
