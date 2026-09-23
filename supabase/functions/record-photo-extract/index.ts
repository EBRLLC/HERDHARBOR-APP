import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const OPENAI_API = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_DAILY_LIMIT = 10;
const DEFAULT_GLOBAL_DAILY_LIMIT = 50;
const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BYTES = 11_000_000;
const MAX_DATA_URL_LENGTH = 10_500_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const DOCUMENT_TYPES = new Set(["registration", "veterinary_document", "weight_sheet", "medication_label", "unknown"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 500) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const fail = (code: string, error: string, status: number, retryable = false) => json({ error, code, retryable }, status);

function configuredDailyLimit() {
  const value = Number(Deno.env.get("PHOTO_ENTRY_DAILY_LIMIT") || DEFAULT_DAILY_LIMIT);
  if (!Number.isFinite(value)) return DEFAULT_DAILY_LIMIT;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function configuredGlobalDailyLimit() {
  const value = Number(Deno.env.get("AI_IMAGE_GLOBAL_DAILY_LIMIT") || DEFAULT_GLOBAL_DAILY_LIMIT);
  if (!Number.isFinite(value)) return DEFAULT_GLOBAL_DAILY_LIMIT;
  return Math.max(1, Math.min(100000, Math.floor(value)));
}

function configuredProviderTimeoutMs() {
  const value = Number(Deno.env.get("PHOTO_ENTRY_PROVIDER_TIMEOUT_MS") || DEFAULT_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(value)) return DEFAULT_PROVIDER_TIMEOUT_MS;
  return Math.max(5_000, Math.min(60_000, Math.floor(value)));
}

function adminKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys?.default === "string" && keys.default.trim()) return keys.default.trim();
  } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

const REGISTRATION_PROPERTIES = {
  name: { type: "string", maxLength: 160 },
  registrationNumber: { type: "string", maxLength: 160 },
  tattoo: { type: "string", maxLength: 120 },
  tag: { type: "string", maxLength: 120 },
  earTagNumber: { type: "string", maxLength: 120 },
  breeder: { type: "string", maxLength: 160 },
  species: { type: "string", maxLength: 100 },
  breed: { type: "string", maxLength: 160 },
  sex: { type: "string", enum: ["Male", "Female", "Unknown"] },
  dob: { type: "string", maxLength: 32 },
  color: { type: "string", maxLength: 160 },
  variety: { type: "string", maxLength: 160 }
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    documentType: { type: "string", enum: [...DOCUMENT_TYPES] },
    classificationConfidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
    registration: { type: "object", properties: REGISTRATION_PROPERTIES, required: Object.keys(REGISTRATION_PROPERTIES), additionalProperties: false },
    registrationConfidence: { type: "number", minimum: 0, maximum: 1 },
    veterinaryRecord: {
      type: "object",
      properties: {
        animalName: { type: "string", maxLength: 160 },
        date: { type: "string", maxLength: 32 },
        provider: { type: "string", maxLength: 160 },
        summary: { type: "string", maxLength: 1000 },
        followUpDate: { type: "string", maxLength: 32 }
      },
      required: ["animalName", "date", "provider", "summary", "followUpDate"],
      additionalProperties: false
    },
    veterinaryConfidence: { type: "number", minimum: 0, maximum: 1 },
    medicationLabel: {
      type: "object",
      properties: {
        animalName: { type: "string", maxLength: 160 },
        medicationName: { type: "string", maxLength: 200 },
        strength: { type: "string", maxLength: 120 },
        doseInstructions: { type: "string", maxLength: 500 },
        route: { type: "string", maxLength: 120 },
        frequency: { type: "string", maxLength: 160 },
        expirationDate: { type: "string", maxLength: 32 }
      },
      required: ["animalName", "medicationName", "strength", "doseInstructions", "route", "frequency", "expirationDate"],
      additionalProperties: false
    },
    medicationConfidence: { type: "number", minimum: 0, maximum: 1 },
    weightRows: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        properties: {
          animalName: { type: "string", maxLength: 160 },
          identifier: { type: "string", maxLength: 160 },
          date: { type: "string", maxLength: 32 },
          weight: { type: "string", maxLength: 64 },
          weightUnit: { type: "string", enum: ["lb", "lb+oz", "oz", "kg", "g", ""] },
          weightOunces: { type: "string", maxLength: 32 },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["animalName", "identifier", "date", "weight", "weightUnit", "weightOunces", "confidence"],
        additionalProperties: false
      }
    }
  },
  required: ["documentType","classificationConfidence","warnings","registration","registrationConfidence","veterinaryRecord","veterinaryConfidence","medicationLabel","medicationConfidence","weightRows"],
  additionalProperties: false
};

function instructions() {
  return [
    "You extract a review draft from one livestock record photo for HerdHarbor.",
    "Classify it as registration, veterinary_document, weight_sheet, medication_label, or unknown.",
    "Return only facts actually visible in the image. Never invent missing names, identifiers, dates, weights, medication instructions, diagnoses, or provider details.",
    "Do not provide veterinary advice, diagnosis, dose recommendations, or reinterpretation. Medication fields must reflect only what is printed on the label.",
    "Do not convert units. Preserve the visible unit. For pounds and ounces use weightUnit lb+oz and keep ounces separately.",
    "Normalize an unambiguous printed date to YYYY-MM-DD only when safe; otherwise leave it blank and add a warning.",
    "For sex use Male or Female only when explicitly printed or unambiguous; otherwise Unknown.",
    "A weight sheet may contain multiple rows. Return each readable row separately, up to 25, and leave uncertain row fields blank rather than guessing.",
    "Moderate rotation, perspective, glare, cropping, and handwriting may reduce confidence. Call low-confidence or conflicting text out in warnings.",
    "Fill non-applicable document sections with blank strings/default Unknown values and low confidence.",
    "This result is a draft for explicit human review and never authorizes mutation of farm records."
  ].join("\n");
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== "message") continue;
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

function validScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1;
}

function validateStructuredResult(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (!DOCUMENT_TYPES.has(clean(raw.documentType, 40))) return false;
  if (!validScore(raw.classificationConfidence)) return false;
  if (!Array.isArray(raw.warnings) || raw.warnings.length > 20 || !raw.warnings.every((x: unknown) => typeof x === "string")) return false;
  for (const key of ["registrationConfidence", "veterinaryConfidence", "medicationConfidence"]) if (!validScore(raw[key])) return false;
  if (!raw.registration || typeof raw.registration !== "object" || Array.isArray(raw.registration)) return false;
  for (const field of Object.keys(REGISTRATION_PROPERTIES)) if (typeof raw.registration[field] !== "string") return false;
  if (!["Male", "Female", "Unknown"].includes(raw.registration.sex)) return false;
  if (!raw.veterinaryRecord || typeof raw.veterinaryRecord !== "object" || Array.isArray(raw.veterinaryRecord)) return false;
  for (const field of ["animalName", "date", "provider", "summary", "followUpDate"]) if (typeof raw.veterinaryRecord[field] !== "string") return false;
  if (!raw.medicationLabel || typeof raw.medicationLabel !== "object" || Array.isArray(raw.medicationLabel)) return false;
  for (const field of ["animalName", "medicationName", "strength", "doseInstructions", "route", "frequency", "expirationDate"]) if (typeof raw.medicationLabel[field] !== "string") return false;
  if (!Array.isArray(raw.weightRows) || raw.weightRows.length > 25) return false;
  for (const row of raw.weightRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    for (const field of ["animalName", "identifier", "date", "weight", "weightUnit", "weightOunces"]) if (typeof row[field] !== "string") return false;
    if (!["lb", "lb+oz", "oz", "kg", "g", ""].includes(row.weightUnit)) return false;
    if (!validScore(row.confidence)) return false;
  }
  return true;
}

function normalize(raw: any, fileName: string) {
  const warnings = raw.warnings.map((x: unknown) => clean(x, 300)).filter(Boolean).slice(0, 20);
  if (Number(raw.classificationConfidence) < 0.72) warnings.push("Document classification confidence is low. Verify the document type before using the draft.");
  return {
    sourceType: "record-photo",
    sourceName: clean(fileName, 240),
    extractionId: crypto.randomUUID(),
    documentType: clean(raw.documentType, 40),
    classificationConfidence: Number(raw.classificationConfidence),
    warnings: [...new Set(warnings)],
    registration: Object.fromEntries(Object.keys(REGISTRATION_PROPERTIES).map((field) => [field, clean(raw.registration[field], field === "name" ? 160 : 240)])),
    registrationConfidence: Number(raw.registrationConfidence),
    veterinaryRecord: {
      animalName: clean(raw.veterinaryRecord.animalName, 160),
      date: clean(raw.veterinaryRecord.date, 32),
      provider: clean(raw.veterinaryRecord.provider, 160),
      summary: clean(raw.veterinaryRecord.summary, 1000),
      followUpDate: clean(raw.veterinaryRecord.followUpDate, 32)
    },
    veterinaryConfidence: Number(raw.veterinaryConfidence),
    medicationLabel: {
      animalName: clean(raw.medicationLabel.animalName, 160),
      medicationName: clean(raw.medicationLabel.medicationName, 200),
      strength: clean(raw.medicationLabel.strength, 120),
      doseInstructions: clean(raw.medicationLabel.doseInstructions, 500),
      route: clean(raw.medicationLabel.route, 120),
      frequency: clean(raw.medicationLabel.frequency, 160),
      expirationDate: clean(raw.medicationLabel.expirationDate, 32)
    },
    medicationConfidence: Number(raw.medicationConfidence),
    weightRows: raw.weightRows.map((row: any) => ({
      animalName: clean(row.animalName, 160),
      identifier: clean(row.identifier, 160),
      date: clean(row.date, 32),
      weight: clean(row.weight, 64),
      weightUnit: clean(row.weightUnit, 16),
      weightOunces: clean(row.weightOunces, 32),
      confidence: Number(row.confidence)
    }))
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("method_not_allowed", "Method not allowed.", 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const key = adminKey();
    if (!supabaseUrl || !key) return fail("configuration_unavailable", "Photo entry service configuration is unavailable.", 503, true);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("authentication_required", "Authentication is required.", 401);
    const admin = createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user?.id) return fail("authentication_invalid", "The authentication session is invalid or expired.", 401);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return fail("image_too_large", "That photo is too large to analyze. Resize it and try again.", 413);
    const body = await req.json().catch(() => null);
    const mimeType = clean(body?.mimeType, 80).toLowerCase();
    const fileName = clean(body?.fileName, 240) || "record-photo";
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
    if (!ALLOWED_MIME.has(mimeType)) return fail("unsupported_image", "Photo-assisted entry currently sends JPG or PNG images.", 415);
    if (!dataUrl.startsWith("data:" + mimeType + ";base64,")) return fail("invalid_image_payload", "The image payload is invalid.", 400);
    if (dataUrl.length > MAX_DATA_URL_LENGTH) return fail("image_too_large", "That photo is too large to analyze. Resize it and try again.", 413);
    const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const model = Deno.env.get("OPENAI_PHOTO_ENTRY_MODEL") || DEFAULT_MODEL;
    if (!openAiKey) return fail("configuration_unavailable", "Photo-assisted entry is not configured yet.", 503, true);

    const { data: reservation, error: usageError } = await admin.rpc("herdharbor_reserve_ai_image_request", {
      p_user_id: authData.user.id,
      p_feature: "record_photo",
      p_user_daily_limit: configuredDailyLimit(),
      p_global_daily_limit: configuredGlobalDailyLimit()
    });
    if (usageError) {
      console.error("record_photo_usage_reservation_failed");
      return fail("usage_ledger_unavailable", "Photo-assisted entry is temporarily unavailable. Farm records were not changed.", 503, true);
    }
    if (reservation !== "reserved") {
      const globalLimitReached = reservation === "global_quota";
      return fail(
        globalLimitReached ? "global_quota_exceeded" : "quota_exceeded",
        globalLimitReached
          ? "HerdHarbor has reached today's AI image-reading budget. Try again tomorrow."
          : "You have reached today's photo-reading limit. Try again tomorrow.",
        429,
        true
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), configuredProviderTimeoutMs());
    let response: Response;
    try {
      response = await fetch(OPENAI_API, {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, store: false, reasoning: { effort: "low" }, instructions: instructions(),
          input: [{ role: "user", content: [
            { type: "input_text", text: "Classify and extract a review draft from this livestock record photo (" + fileName + ")." },
            { type: "input_image", image_url: dataUrl, detail: "high" }
          ] }],
          text: { verbosity: "low", format: { type: "json_schema", name: "herdharbor_record_photo_draft", strict: true, schema: OUTPUT_SCHEMA } }
        })
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return fail("provider_timeout", "The photo reader timed out. Farm records were not changed. Try again.", 504, true);
      return fail("provider_error", "The photo reader could not be reached. Farm records were not changed.", 502, true);
    } finally { clearTimeout(timeoutId); }
    if (!response.ok) {
      if (response.status === 429) return fail("provider_rate_limit", "The photo reader is temporarily busy. Farm records were not changed. Try again.", 429, true);
      return fail("provider_error", "HerdHarbor could not analyze that photo right now. Farm records were not changed.", 502, true);
    }
    const payload = await response.json().catch(() => null);
    if (payload?.status && payload.status !== "completed") return fail("extraction_incomplete", "The photo reader did not finish. Farm records were not changed.", 502, true);
    const outputText = extractResponseText(payload);
    if (!outputText) return fail("empty_extraction", "The photo reader returned no usable result. Farm records were not changed.", 502, true);
    let parsed: any;
    try { parsed = JSON.parse(outputText); } catch { return fail("malformed_structured_result", "The photo reader returned an invalid draft. Farm records were not changed.", 502, true); }
    if (!validateStructuredResult(parsed)) return fail("malformed_structured_result", "The photo reader returned an invalid draft. Farm records were not changed.", 502, true);
    const draft = normalize(parsed, fileName);
    if (draft.documentType === "unknown") return fail("unsupported_document", "HerdHarbor could not identify a supported registration, veterinary, weight, or medication document.", 422);
    if (draft.documentType === "weight_sheet" && !draft.weightRows.length) return fail("empty_extraction", "No readable weight rows were found. Farm records were not changed.", 422);
    return json({ draft, model });
  } catch {
    return fail("service_error", "HerdHarbor could not analyze that record photo. Farm records were not changed.", 500, true);
  }
});