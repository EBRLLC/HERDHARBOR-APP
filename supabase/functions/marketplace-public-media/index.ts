import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const WEBSITE_ORIGINS = new Set(["https://herdharbor.com", "https://www.herdharbor.com"]);
const BUCKET = "marketplace-public";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const headers: Record<string,string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
  if (WEBSITE_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return reply(req, { error: "Method not allowed." }, 405);

  const origin = req.headers.get("Origin") || "";
  if (!WEBSITE_ORIGINS.has(origin)) return reply(req, { error: "Origin not allowed." }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return reply(req, { error: "Marketplace media is temporarily unavailable." }, 503);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return reply(req, { error: "Invalid request." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  try {
    if (body?.action === "listing") {
      const listingIds = Array.isArray(body.listingIds)
        ? [...new Set(body.listingIds.map((value: unknown) => String(value || "")).filter((value: string) => UUID_RE.test(value)))].slice(0,48)
        : [];
      const maxPerListing = Math.min(Math.max(Number(body.maxPerListing) || 1,1),6);

      if (!listingIds.length) return reply(req, { listings: {} });

      const nowIso = new Date().toISOString();
      const { data: listings, error: listingError } = await admin
        .from("marketplace_listings")
        .select("id,seller_id,state,expires_at")
        .in("id", listingIds)
        .eq("state", "available");
      if (listingError) throw listingError;

      const usableListings = (listings || []).filter((row: any) => !row.expires_at || row.expires_at > nowIso);
      const sellerIds = [...new Set(usableListings.map((row: any) => String(row.seller_id)))];

      const activeSellerIds = new Set<string>();
      if (sellerIds.length) {
        const { data: profiles, error: profileError } = await admin
          .from("marketplace_public_profiles")
          .select("user_id")
          .in("user_id", sellerIds)
          .eq("marketplace_status", "active");
        if (profileError) throw profileError;
        for (const row of profiles || []) activeSellerIds.add(String((row as any).user_id));
      }

      const allowedListingIds = usableListings
        .filter((row: any) => activeSellerIds.has(String(row.seller_id)))
        .map((row: any) => String(row.id));

      const result: Record<string,string[]> = {};
      for (const id of listingIds) result[id] = [];
      if (!allowedListingIds.length) return reply(req, { listings: result });

      const { data: photos, error: photoError } = await admin
        .from("marketplace_listing_photos")
        .select("listing_id,seller_id,storage_path,sort_order,created_at")
        .in("listing_id", allowedListingIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (photoError) throw photoError;

      const listingSeller = new Map<string,string>();
      for (const row of usableListings) {
        if (allowedListingIds.includes(String((row as any).id))) {
          listingSeller.set(String((row as any).id), String((row as any).seller_id));
        }
      }

      const grouped = new Map<string,string[]>();
      for (const row of photos || []) {
        const id = String((row as any).listing_id);
        if (String((row as any).seller_id) !== listingSeller.get(id)) continue;
        if (!grouped.has(id)) grouped.set(id, []);
        if ((grouped.get(id) || []).length < maxPerListing) {
          grouped.get(id)!.push(String((row as any).storage_path || ""));
        }
      }

      for (const id of allowedListingIds) {
        const paths = (grouped.get(id) || []).filter(Boolean);
        if (!paths.length) continue;
        const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrls(paths, 300);
        if (signError) continue;
        result[id] = (signed || []).map((item: any) => String(item.signedUrl || "")).filter(Boolean);
      }

      return reply(req, { listings: result });
    }

    if (body?.action === "seller") {
      const publicId = String(body.publicId || "");
      if (!UUID_RE.test(publicId)) return reply(req, { avatarUrl: "" });

      const { data: profile, error: profileError } = await admin
        .from("marketplace_public_profiles")
        .select("avatar_path,marketplace_status")
        .eq("public_id", publicId)
        .maybeSingle();
      if (profileError) throw profileError;

      const avatarPath = profile?.marketplace_status === "active" ? String(profile?.avatar_path || "") : "";
      if (!avatarPath) return reply(req, { avatarUrl: "" });

      const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(avatarPath, 300);
      return reply(req, { avatarUrl: signError ? "" : String(signed?.signedUrl || "") });
    }

    return reply(req, { error: "Unsupported media action." }, 400);
  } catch {
    console.error("marketplace_public_media_error");
    return reply(req, { error: "Marketplace media could not be loaded." }, 500);
  }
});