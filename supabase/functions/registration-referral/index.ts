import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";
const referralCode = (value: unknown) => clean(value, 20).toUpperCase();
const normalizedEmail = (value: unknown) => clean(value, 254).toLowerCase();

async function registrationIntentHash(email: string, serverSecret: string) {
  const normalized = normalizedEmail(email);
  if (!normalized) return "";
  const bytes = new TextEncoder().encode(`${serverSecret}:herdharbor-registration-intent:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Registration service is unavailable." }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action, 32).toLowerCase();

  async function validateCode(code: string) {
    if (!code) return true;
    if (!/^HH-[A-Z0-9]{8}$/.test(code)) return false;
    const { data, error } = await admin
      .from("referral_codes")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.code);
  }

  // Public pre-signup validation intentionally returns only yes/no. It never
  // reveals the referring member's name, email, UUID, plan, or account data.
  if (action === "validate") {
    const code = referralCode(body.referralCode);
    if (!code) return json({ valid: true, blank: true });
    try {
      return json({ valid: await validateCode(code) });
    } catch (error) {
      console.error("registration-referral-validate", error);
      return json({ error: "Referral validation is temporarily unavailable." }, 503);
    }
  }

  // Stage a short-lived server-side signup intent so email confirmation can
  // continue on another device without losing a valid referral. The database
  // stores only a server-derived hash of the normalized email, never the email.
  if (action === "stage") {
    const email = normalizedEmail(body.email);
    const requestedPlan = clean(body.requestedPlan, 20).toLowerCase();
    const code = referralCode(body.referralCode);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email before signup." }, 400);
    if (requestedPlan === "business") return json({ error: "HerdHarbor Business is coming soon." }, 409);
    if (!["junior", "member"].includes(requestedPlan)) return json({ error: "Choose Junior or Member." }, 400);
    if (code && !/^HH-[A-Z0-9]{8}$/.test(code)) return json({ error: "Invalid referral ID. Check the code or remove it to continue." }, 400);
    try {
      if (code && !(await validateCode(code))) return json({ error: "Invalid referral ID. Check the code or remove it to continue." }, 400);
      const emailHash = await registrationIntentHash(email, serviceRoleKey);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const { error } = await admin.from("registration_intents").upsert({
        email_hash: emailHash,
        requested_plan: requestedPlan,
        referral_code: code || null,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
      }, { onConflict: "email_hash" });
      if (error) throw error;
      return json({ staged: true, expiresAt });
    } catch (error) {
      console.error("registration-referral-stage", error);
      return json({ error: "Signup choice could not be staged. Try again or continue without a referral." }, 503);
    }
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication is required." }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) return json({ error: "The authentication session is invalid or expired." }, 401);

  let stagedChoice: { requested_plan?: string; referral_code?: string | null } | null = null;
  let stagedHash = "";
  if (user.email) {
    stagedHash = await registrationIntentHash(user.email, serviceRoleKey);
    const { data: staged, error: stagedError } = await admin
      .from("registration_intents")
      .select("requested_plan,referral_code,expires_at")
      .eq("email_hash", stagedHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (stagedError) throw stagedError;
    stagedChoice = staged || null;
  }

  if (action === "status") {
    const [choiceResult, codeResult] = await Promise.all([
      admin.from("registration_choices").select("requested_plan,referral_code").eq("user_id", user.id).maybeSingle(),
      admin.rpc("ensure_referral_code", { target_user: user.id })
    ]);
    if (choiceResult.error) throw choiceResult.error;
    if (codeResult.error) throw codeResult.error;
    return json({
      complete: Boolean(choiceResult.data),
      requestedPlan: choiceResult.data?.requested_plan || null,
      referredBy: choiceResult.data?.referral_code || null,
      referralCode: codeResult.data || null,
      stagedChoice: !choiceResult.data && stagedChoice ? {
        requestedPlan: stagedChoice.requested_plan || "junior",
        referralCode: stagedChoice.referral_code || null
      } : null
    });
  }

  if (action === "complete") {
    const hasPlanField = Object.prototype.hasOwnProperty.call(body, "requestedPlan");
    const hasReferralField = Object.prototype.hasOwnProperty.call(body, "referralCode");
    const requestedPlan = clean(hasPlanField ? body.requestedPlan : stagedChoice?.requested_plan, 20).toLowerCase();
    const code = referralCode(hasReferralField ? body.referralCode : stagedChoice?.referral_code);
    if (requestedPlan === "business") return json({ error: "HerdHarbor Business is coming soon." }, 409);
    if (!["junior", "member"].includes(requestedPlan)) return json({ error: "Choose Junior or Member." }, 400);
    if (code && !/^HH-[A-Z0-9]{8}$/.test(code)) return json({ error: "Invalid referral ID. Check the code or remove it to continue." }, 400);

    const { data, error } = await admin.rpc("complete_registration_choice", {
      target_user: user.id,
      requested_plan_input: requestedPlan,
      referral_code_input: code || null
    });
    if (error) {
      const message = String(error.message || "The signup choice could not be saved.");
      if (/invalid referral/i.test(message)) return json({ error: "Invalid referral ID. Check the code or remove it to continue." }, 400);
      if (/cannot refer your own/i.test(message)) return json({ error: "You cannot use your own referral ID." }, 400);
      console.error("registration-referral-complete", error);
      return json({ error: message }, 400);
    }

    if (stagedHash) {
      const { error: cleanupError } = await admin.from("registration_intents").delete().eq("email_hash", stagedHash);
      if (cleanupError) console.error("registration-referral-intent-cleanup", cleanupError);
    }
    return json(data || { complete: true });
  }

  return json({ error: "Unsupported registration referral action." }, 400);
});
