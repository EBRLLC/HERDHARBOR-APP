import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const GENERAL_SEGMENT_ID = "bc11864d-34f0-46a8-beb9-29e41f6e51d8";
const RESEND_API = "https://api.resend.com";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{0,79}$/u;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,14}[A-Za-z0-9]$/;
const USAGE_TYPES = new Set(["adult_self", "farm_business", "guardian_for_minor"]);

type Policy = {
  enabled: boolean;
  enforcement_started_at: string | null;
  minimum_account_holder_age: number;
};

function validDateOfBirth(value: unknown) {
  const raw = clean(value, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { raw, date, year, month, day };
}

function ageOn(date: { year: number; month: number; day: number }, now = new Date()) {
  let age = now.getUTCFullYear() - date.year;
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (month < date.month || (month === date.month && day < date.day)) age -= 1;
  return age;
}

function normalizePhone(value: unknown) {
  const digits = clean(value, 40).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

async function loadPolicy(admin: ReturnType<typeof createClient>): Promise<Policy> {
  const { data, error } = await admin
    .from("registration_policy")
    .select("enabled,enforcement_started_at,minimum_account_holder_age")
    .eq("singleton", true)
    .single();
  if (error || !data) throw error || new Error("Registration policy is unavailable.");
  return data as Policy;
}

function isRequired(userCreatedAt: string, policy: Policy) {
  if (!policy.enabled || !policy.enforcement_started_at) return false;
  return Date.parse(userCreatedAt) >= Date.parse(policy.enforcement_started_at);
}

async function registrationStatus(admin: ReturnType<typeof createClient>, user: { id: string; created_at: string }, policy: Policy) {
  const required = isRequired(user.created_at, policy);
  if (!required) {
    return {
      required: false,
      complete: true,
      legacy: true,
      minimumAge: policy.minimum_account_holder_age,
      riskStatus: "legacy"
    };
  }

  const { data, error } = await admin
    .from("registration_profiles")
    .select("age_verified_at,risk_status,usage_type")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return {
    required: true,
    complete: Boolean(data?.age_verified_at),
    legacy: false,
    minimumAge: policy.minimum_account_holder_age,
    riskStatus: data?.risk_status || "pending",
    usageType: data?.usage_type || null
  };
}

async function syncResendContact(
  admin: ReturnType<typeof createClient>,
  user: { id: string; email?: string | null },
  registration: { firstName: string; lastName: string; usageType: string }
) {
  const managementKey = Deno.env.get("RESEND_MANAGEMENT_API_KEY") || "";
  const email = String(user.email || "").trim().toLowerCase();
  if (!managementKey || !email) return;

  const { data: access, error: accessError } = await admin
    .from("account_access")
    .select("account_role,membership_tier,account_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (accessError) throw accessError;

  const headers = {
    "Authorization": `Bearer ${managementKey}`,
    "Content-Type": "application/json"
  };
  const properties = {
    membership_tier: access?.membership_tier || "junior",
    account_role: access?.account_role || "user",
    account_status: access?.account_status || "active",
    usage_type: registration.usageType || "adult_self"
  };
  const lookup = await fetch(`${RESEND_API}/contacts/${encodeURIComponent(email)}`, { headers });

  if (lookup.status === 404) {
    const created = await fetch(`${RESEND_API}/contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        first_name: registration.firstName,
        last_name: registration.lastName,
        unsubscribed: false,
        properties,
        segments: [{ id: GENERAL_SEGMENT_ID }]
      })
    });
    if (!created.ok) {
      const detail = await created.text().catch(() => "");
      throw new Error(`Resend contact create failed (${created.status}): ${detail.slice(0, 300)}`);
    }
    return;
  }

  if (!lookup.ok) {
    const detail = await lookup.text().catch(() => "");
    throw new Error(`Resend contact lookup failed (${lookup.status}): ${detail.slice(0, 300)}`);
  }

  const updated = await fetch(`${RESEND_API}/contacts/${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      first_name: registration.firstName,
      last_name: registration.lastName,
      properties
    })
  });
  if (!updated.ok) {
    const detail = await updated.text().catch(() => "");
    throw new Error(`Resend contact update failed (${updated.status}): ${detail.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Registration service configuration is unavailable." }, 503);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication is required." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.created_at) return json({ error: "The authentication session is invalid or expired." }, 401);

    const policy = await loadPolicy(admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 24).toLowerCase();

    if (action === "status") return json(await registrationStatus(admin, user, policy));
    if (action !== "complete") return json({ error: "Unsupported registration action." }, 400);

    if (!isRequired(user.created_at, policy)) return json(await registrationStatus(admin, user, policy));

    const existing = await admin
      .from("registration_profiles")
      .select("age_verified_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.age_verified_at) return json(await registrationStatus(admin, user, policy));

    const profile = (body.profile && typeof body.profile === "object" ? body.profile : {}) as Record<string, unknown>;
    const firstName = clean(profile.firstName, 80);
    const lastName = clean(profile.lastName, 80);
    const dob = validDateOfBirth(profile.dateOfBirth);
    const phone = normalizePhone(profile.phone);
    const countryCode = clean(profile.countryCode, 2).toUpperCase();
    const region = clean(profile.region, 80);
    const postalCode = clean(profile.postalCode, 16).toUpperCase();
    const organizationName = clean(profile.organizationName, 120) || null;
    const usageType = clean(profile.usageType, 32).toLowerCase();
    const guardianAttestation = profile.guardianAttestation === true;
    const accuracyCertified = profile.accuracyCertified === true;
    const adultAccountHolderCertified = profile.adultAccountHolderCertified === true;

    if (!NAME_RE.test(firstName) || !NAME_RE.test(lastName)) return json({ error: "Enter the adult account holder's legal first and last name." }, 400);
    if (!dob) return json({ error: "Enter a valid date of birth." }, 400);
    const age = ageOn(dob);
    if (age < policy.minimum_account_holder_age) {
      return json({
        error: `HerdHarbor accounts must be created and managed by an adult age ${policy.minimum_account_holder_age} or older. Ask a parent or legal guardian to create the account using their own information.`
      }, 403);
    }
    if (age > 120) return json({ error: "Enter a valid date of birth." }, 400);
    if (!phone) return json({ error: "Enter a valid phone number.\" }, 400);
    if (!/^[A-Z]{2}$/.test(countryCode)) return json({ error: "Choose a valid country." }, 400);
    if (!region) return json({ error: "Enter your state, province, or region." }, 400);
    if (!POSTAL_RE.test(postalCode)) return json({ error: "Enter a valid ZIP or postal code." }, 400);
    if (!USAGE_TYPES.has(usageType)) return json({ error: "Choose how this account will be used." }, 400);
    if (usageType === "guardian_for_minor" && !guardianAttestation) {
      return json({ error: "A parent or legal guardian must accept responsibility for a minor's HerdHarbor use." }, 400);
    }
    if (!accuracyCertified || !adultAccountHolderCertified) {
      return json({ error: "Confirm that the account information is accurate and that the account holder is an adult." }, 400);
    }

    const duplicatePhone = await admin
      .from("registration_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("phone_normalized", phone)
      .neq("user_id", user.id);
    if (duplicatePhone.error) throw duplicatePhone.error;
    const riskReasons: string[] = [];
    if ((duplicatePhone.count || 0) >= 2) riskReasons.push("phone_reused_multiple_accounts");
    const riskStatus = riskReasons.length ? "review" : "clear";
    const now = new Date().toISOString();

    const { error: insertError } = await admin.from("registration_profiles").insert({
      user_id: user.id,
      legal_first_name: firstName,
      legal_last_name: lastName,
      age_at_registration: age,
      phone_normalized: phone,
      country_code: countryCode,
      region,
      postal_code: postalCode,
      organization_name: organizationName,
      usage_type: usageType,
      guardian_attestation: usageType === "guardian_for_minor" ? guardianAttestation : false,
      terms_accepted_at: now,
      accuracy_certified_at: now,
      age_verified_at: now,
      risk_status: riskStatus,
      risk_reasons: riskReasons,
      updated_at: now
    });
    if (insertError) throw insertError;

    try {
      await syncResendContact(admin, user, { firstName, lastName, usageType });
    } catch (syncError) {
      console.warn("registration-profile: Resend audience sync failed without blocking registration", syncError);
    }

    return json(await registrationStatus(admin, user, policy));
  } catch (error) {
    console.error("registration-profile", error);
    return json({ error: error instanceof Error ? error.message : "The registration profile could not be completed." }, 500);
  }
});
