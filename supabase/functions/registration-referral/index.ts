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

  // Public pre-signup validation intentionally returns only yes/no. It never
  // reveals the referring member's name, email, UUID, plan, or account data.
  if (action === "validate") {
    const code = referralCode(body.referralCode);
    if (!code) return json({ valid: true, blank: true });
    if (!/^HH-[A-Z0-9]{8}$/.test(code)) return json({ valid: false });
    const { data, error } = await admin
      .from("referral_codes")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (error) {
      console.error("registration-referral-validate", error);
      return json({ error: "Referral validation is temporarily unavailable." }, 503);
    }
    return json({ valid: Boolean(data?.code) });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication is required." }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) return json({ error: "The authentication session is invalid or expired." }, 401);

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
      referralCode: codeResult.data || null
    });
  }

  if (action === "complete") {
    const requestedPlan = clean(body.requestedPlan, 20).toLowerCase();
    const code = referralCode(body.referralCode);
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
    return json(data || { complete: true });
  }

  return json({ error: "Unsupported registration referral action." }, 400);
});
