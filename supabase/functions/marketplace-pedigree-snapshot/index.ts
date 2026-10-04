import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import "../../../pedigree-engine-v2.0.0.js";
import "../../../marketplace-pedigree-snapshot-v2.0.1.js";

const ALLOWED_ORIGINS = new Set([
  "https://herdharbor.com",
  "https://www.herdharbor.com"
]);

function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://herdharbor.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function fail(req: Request, code: string, message: string, status: number) {
  return json(req, { error: message, code }, status);
}

function projectClientKey() {
  try {
    const map = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const envName = typeof map?.default === "string" ? map.default : "";
    const value = envName ? Deno.env.get(envName) : "";
    if (value) return value;
  } catch {
    // Fall through to the legacy environment key while it remains supported.
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

function validUuid(value: unknown) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return fail(req, "method_not_allowed", "Method not allowed.", 405);

  const origin = req.headers.get("Origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return fail(req, "origin_not_allowed", "Marketplace pedigree preview is unavailable from this origin.", 403);
  }

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail(req, "authentication_required", "Authentication is required.", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = projectClientKey();
  if (!supabaseUrl || !publicKey) {
    return fail(req, "configuration_unavailable", "Marketplace pedigree preview is temporarily unavailable.", 503);
  }

  const body = await req.json().catch(() => null);
  const listingId = body?.listingId;
  if (!validUuid(listingId)) {
    return fail(req, "invalid_listing", "A valid Marketplace listing is required.", 400);
  }

  const client = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  try {
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return fail(req, "authentication_invalid", "The authentication session is invalid or expired.", 401);
    }

    const { data: role, error: roleError } = await client.rpc("herdharbor_account_role");
    if (roleError || String(role || "").toLowerCase() !== "owner") {
      return fail(req, "owner_required", "Marketplace is currently a private Owner-only preview.", 403);
    }

    const { data: source, error: sourceError } = await client.rpc("marketplace_owner_pedigree_source", {
      listing_id_value: listingId
    });
    if (sourceError) {
      console.error("marketplace_pedigree_source_unavailable", { code: sourceError.code || "unknown" });
      return fail(req, "pedigree_source_unavailable", "Pedigree preview is temporarily unavailable.", 409);
    }

    if (!source?.available) {
      return json(req, {
        available: false,
        reason: String(source?.reason || "unavailable"),
        visibility: String(source?.visibility || "hidden")
      });
    }

    const adapter = (globalThis as any).HerdHarborMarketplacePedigreeSnapshot;
    if (!adapter?.buildSnapshot) {
      console.error("marketplace_pedigree_adapter_missing");
      return fail(req, "pedigree_adapter_unavailable", "Pedigree preview is temporarily unavailable.", 503);
    }

    const snapshot = adapter.buildSnapshot({
      animals: Array.isArray(source.animals) ? source.animals : [],
      subjectId: String(source.subjectId || ""),
      visibility: String(source.visibility || "hidden")
    });

    if (!snapshot) {
      return json(req, {
        available: false,
        reason: "unavailable",
        visibility: String(source.visibility || "hidden")
      });
    }

    const { data: saved, error: saveError } = await client.rpc("marketplace_owner_set_pedigree_snapshot", {
      listing_id_value: listingId,
      snapshot_value: snapshot
    });
    if (saveError) {
      console.error("marketplace_pedigree_snapshot_rejected", { code: saveError.code || "unknown" });
      return fail(req, "pedigree_snapshot_rejected", "Pedigree preview could not be prepared.", 409);
    }

    return json(req, {
      available: true,
      visibility: snapshot.visibility,
      snapshot: saved || snapshot
    });
  } catch {
    console.error("marketplace_pedigree_snapshot_service_error");
    return fail(req, "service_error", "Pedigree preview is temporarily unavailable.", 500);
  }
});
