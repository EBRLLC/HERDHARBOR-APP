import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const APP_ORIGIN = "https://app.herdharbor.com";

function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const result: Record<string,string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
  if (origin === APP_ORIGIN) result["Access-Control-Allow-Origin"] = APP_ORIGIN;
  return result;
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const origin = req.headers.get("Origin") || "";
  if (origin !== APP_ORIGIN) return json(req, { error: "Origin not allowed." }, 403);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { error: "Authentication is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, { error: "Marketplace SSO is temporarily unavailable." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.email) {
      return json(req, { error: "The HerdHarbor session is invalid or expired." }, 401);
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email
    });

    const tokenHash = String(linkData?.properties?.hashed_token || "");
    const linkedUserId = String(linkData?.user?.id || "");
    if (linkError || !tokenHash || linkedUserId !== user.id) {
      console.error("marketplace_sso_ticket_generation_failed", {
        hasToken: Boolean(tokenHash),
        sameUser: linkedUserId === user.id
      });
      return json(req, { error: "Marketplace SSO could not create a secure handoff." }, 503);
    }

    return json(req, {
      tokenHash,
      verificationType: "magiclink"
    });
  } catch {
    console.error("marketplace_sso_ticket_service_error");
    return json(req, { error: "Marketplace SSO is temporarily unavailable." }, 500);
  }
});