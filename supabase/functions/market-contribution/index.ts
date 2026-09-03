import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const CONSENT_VERSION = "2026-09-v2";
const ACTIONS = new Set(["consent", "upsert", "withdraw", "aggregate", "account-deletion"]);
const FILTER_FIELDS = new Set([
  "species", "breed", "sex", "age_bucket", "color_variety", "pedigree_status",
  "registration_status", "region_country", "region_code", "broad_region",
  "sale_month", "sale_year", "currency", "start", "end"
]);

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: CORS_HEADERS
});

const cleanText = (value: unknown, max = 160) => typeof value === "string"
  ? value.trim().slice(0, max)
  : "";

function allowlistedFilters(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const result: Record<string, string> = {};
  for (const key of FILTER_FIELDS) {
    const text = cleanText(source[key], 160);
    if (text) result[key] = text;
  }
  return result;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateAggregateFilters(filters: Record<string, string>) {
  for (const field of ["start", "end"]) {
    if (filters[field] && !isIsoDate(filters[field])) return `Use a valid ISO date for ${field}.`;
  }
  if (filters.start && filters.end && filters.start > filters.end) return "The aggregate start date must not be after the end date.";
  if (filters.sale_month && (!/^\d{1,2}$/.test(filters.sale_month) || Number(filters.sale_month) < 1 || Number(filters.sale_month) > 12)) {
    return "Use a sale month from 1 through 12.";
  }
  if (filters.sale_year && (!/^\d{4}$/.test(filters.sale_year) || Number(filters.sale_year) < 1900 || Number(filters.sale_year) > 2200)) {
    return "Use a sale year from 1900 through 2200.";
  }
  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return response({ error: "Service configuration is unavailable." }, 503);

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return response({ error: "Authentication is required." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    const user = userResult?.user;
    if (userError || !user?.id) return response({ error: "The authentication session is invalid or expired." }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = cleanText(body?.action, 32);
    if (!ACTIONS.has(action)) return response({ error: "Unsupported Market Analytics action." }, 400);

    if (action === "consent") {
      const consent = body?.consent && typeof body.consent === "object"
        ? body.consent as Record<string, unknown>
        : {};
      const consentVersion = cleanText(consent.consentVersion, 64);
      if (consentVersion !== CONSENT_VERSION) return response({ error: "Current consent language must be reviewed." }, 409);
      const enabled = consent.enabled === true;
      const country = cleanText(consent.regionCountry, 2).toUpperCase();
      if (country && !/^[A-Z]{2}$/.test(country)) return response({ error: "Use a two-letter country code." }, 400);
      const { data, error } = await admin.rpc("market_record_consent", {
        p_user_id: user.id,
        p_enabled: enabled,
        p_consent_version: consentVersion,
        p_enabled_at: enabled ? cleanText(consent.enabledAt, 64) || new Date().toISOString() : cleanText(consent.enabledAt, 64) || null,
        p_disabled_at: enabled ? null : cleanText(consent.disabledAt, 64) || new Date().toISOString(),
        p_include_historical: enabled && consent.includeHistorical === true,
        p_region_country: country || null,
        p_region_code: cleanText(consent.regionCode, 32) || null,
        p_broad_region: cleanText(consent.broadRegion, 64) || null
      });
      if (error) throw error;
      return response(data);
    }

    if (action === "upsert" || action === "withdraw") {
      const saleId = cleanText(body?.saleId, 180);
      const itemId = cleanText(body?.itemId, 180);
      const fingerprint = cleanText(body?.fingerprint, 128);
      const consentVersion = cleanText(body?.consentVersion, 64);
      if (!saleId || !itemId || !fingerprint || consentVersion !== CONSENT_VERSION) {
        return response({ error: "Valid contribution identifiers and current consent are required." }, 400);
      }
      const { data, error } = await admin.rpc("market_process_contribution", {
        p_user_id: user.id,
        p_source_sale_id: saleId,
        p_source_item_id: itemId,
        p_action: action,
        p_fingerprint: fingerprint,
        p_consent_version: consentVersion
      });
      if (error) throw error;
      return response(data);
    }

    if (action === "aggregate") {
      const filters = allowlistedFilters(body?.filters);
      const filterError = validateAggregateFilters(filters);
      if (filterError) return response({ error: filterError }, 400);
      const { data, error } = await admin.rpc("market_aggregate", {
        p_user_id: user.id,
        p_filters: filters
      });
      if (error) throw error;
      return response(data);
    }

    const { data, error } = await admin.rpc("market_delete_account_data", { p_user_id: user.id });
    if (error) throw error;
    return response(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Market Analytics request could not be completed.";
    const status = /consent|denied|outside/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500;
    return response({ error: message }, status);
  }
});
