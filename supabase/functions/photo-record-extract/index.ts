import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const OPENAI_API = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BYTES = 11_000_000;
const MAX_DATA_URL_LENGTH = 10_500_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const CLASSES = ["registration_document", "vet_document", "weight_sheet", "medication_label", "unsupported"] as const;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 400) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const fail = (code: string, error: string, status: number, retryable = false) => json({ code, error, retryable }, status);

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    classification: { type: "string", enum: CLASSES },
    classificationConfidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
    animalHints: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 160 },
        registrationNumber: { type: "string", maxLength: 160 },
        tattoo: { type: "string", maxLength: 120 },
        tag: { type: "string", maxLength: 120 }
      },
      required: ["name", "registrationNumber", "tattoo", "tag"],
      additionalProperties: false
    },
    registration: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 160 },
        registrationNumber: { type: "string", maxLength: 160 },
        tattoo: { type: "string", maxLength: 120 },
        tag: { type: "string", maxLength: 120 },
        breeder: { type: "string", maxLength: 160 },
        species: { type: "string", maxLength: 100 },
        breed: { type: "string", maxLength: 160 },
        sex: { type: "string", enum: ["Male", "Female", "Unknown"] },
        dob: { type: "string", maxLength: 32 },
        color: { type: "string", maxLength: 160 }
      },
      required: ["name","registrationNumber","tattoo","tag","breeder","species","breed","sex","dob","color"],
      additionalProperties: false
    },
    health: {
      type: "object",
      properties: {
        date: { type: "string", maxLength: 32 },
        type: { type: "string", enum: ["Weight", "Medication", "Veterinary visit", "Observation"] },
        details: { type: "string", maxLength: 1200 },
        weight: { type: "string", maxLength: 32 },
        weightUnit: { type: "string", enum: ["lb", "lb+oz", "oz", "kg", "g", ""] },
        weightOunces: { type: "string", maxLength: 32 },
        followUpDate: { type: "string", maxLength: 32 }
      },
      required: ["date","type","details","weight","weightUnit","weightOunces","followUpDate"],
      additionalProperties: false
    },
    confidence: {
      type: "object",
      properties: {
        animal: { type: "number", minimum: 0, maximum: 1 },
        date: { type: "number", minimum: 0, maximum: 1 },
        details: { type: "number", minimum: 0, maximum: 1 },
        measurement: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["animal","date","details","measurement"],
      additionalProperties: false
    }
  },
  required: ["classification","classificationConfidence","warnings","animalHints","registration","health","confidence"],
  additionalProperties: false
};

function instructions() {
  return [
    "You create review-only HerdHarbor record drafts from a single photographed document.",
    "Classify only as registration_document, vet_document, weight_sheet, medication_label, or unsupported.",
    "Never invent missing facts. Blank any unreadable or absent field and add a warning. This output is never permission to modify farm records.",
    "For registration_document, extract only visibly printed subject identity fields. health must remain blank/default.",
    "For vet_document, extract animal hints, visit date, factual treatment/observation summary, and any explicit follow-up date. health.type must be Veterinary visit.",
    "For weight_sheet, extract one clearly attributable animal weight row only. If multiple rows or animals are visible and one cannot be unambiguously selected, leave the measurement blank and warn. health.type must be Weight.",
    "For medication_label, extract the animal hint only if the label visibly identifies the animal. health.type must be Medication. details should contain the medication name plus explicit strength, directions, or dose that are visible. Do not calculate a dose.",
    "For dates, return YYYY-MM-DD only when unambiguous; otherwise leave blank and warn.",
    "For sex, use Male, Female, or Unknown.",
    "Confidence scores describe extraction confidence only.",
    "Do not return diagnosis advice, inferred treatment, hidden text, or facts from general knowledge."
  ].join("\n");
}

function validate(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (!CLASSES.includes(raw.classification)) return false;
  if (!Number.isFinite(Number(raw.classificationConfidence))) return false;
  if (!Array.isArray(raw.warnings)) return false;
  for (const key of ["animalHints","registration","health","confidence"]) {
    if (!raw[key] || typeof raw[key] !== "object" || Array.isArray(raw[key])) return false;
  }
  return true;
}

function normalize(raw: any, fileName: string) {
  const classification = CLASSES.includes(raw.classification) ? raw.classification : "unsupported";
  const warnings = raw.warnings.map((value: unknown) => clean(value, 300)).filter(Boolean).slice(0, 20);
  const hints = {
    name: clean(raw.animalHints?.name, 160),
    registrationNumber: clean(raw.animalHints?.registrationNumber, 160),
    tattoo: clean(raw.animalHints?.tattoo, 120),
    tag: clean(raw.animalHints?.tag, 120)
  };
  const registration = {
    name: clean(raw.registration?.name, 160),
    registrationNumber: clean(raw.registration?.registrationNumber, 160),
    tattoo: clean(raw.registration?.tattoo, 120),
    tag: clean(raw.registration?.tag, 120),
    breeder: clean(raw.registration?.breeder, 160),
    species: clean(raw.registration?.species, 100),
    breed: clean(raw.registration?.breed, 160),
    sex: ["Male","Female","Unknown"].includes(raw.registration?.sex) ? raw.registration.sex : "Unknown",
    dob: clean(raw.registration?.dob, 32),
    color: clean(raw.registration?.color, 160)
  };
  const health = {
    date: clean(raw.health?.date, 32),
    type: ["Weight","Medication","Veterinary visit","Observation"].includes(raw.health?.type) ? raw.health.type : "Observation",
    details: clean(raw.health?.details, 1200),
    weight: clean(raw.health?.weight, 32),
    weightUnit: ["lb","lb+oz","oz","kg","g",""].includes(raw.health?.weightUnit) ? raw.health.weightUnit : "",
    weightOunces: clean(raw.health?.weightOunces, 32),
    followUpDate: clean(raw.health?.followUpDate, 32)
  };
  const confidence = Object.fromEntries(["animal","date","details","measurement"].map((key) => {
    const score = Number(raw.confidence?.[key]);
    return [key, Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0];
  }));
  if (classification === "unsupported") warnings.push("This image is not one of the supported record-photo classes.");
  return {
    version: "1.8.3",
    sourceType: "photo-assisted-record-entry",
    sourceName: clean(fileName, 240),
    extractionId: crypto.randomUUID(),
    classification,
    classificationConfidence: Math.max(0, Math.min(1, Number(raw.classificationConfidence) || 0)),
    warnings: [...new Set(warnings)],
    animalHints: hints,
    registration,
    health,
    confidence,
    reviewRequired: true
  };
}

function responseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== "message") continue;
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("method_not_allowed", "Method not allowed.", 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !openAiKey) return fail("configuration_unavailable", "Photo-assisted entry is not configured.", 503, true);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("authentication_required", "Authentication is required.", 401);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user?.id) return fail("authentication_invalid", "The authentication session is invalid or expired.", 401);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return fail("image_too_large", "That image is too large. Resize it and try again.", 413);
    const body = await req.json().catch(() => null);
    const mimeType = clean(body?.mimeType, 80).toLowerCase();
    const fileName = clean(body?.fileName, 240) || "record-photo";
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
    if (!ALLOWED_MIME.has(mimeType)) return fail("unsupported_image", "Photo-assisted entry currently supports JPG and PNG images.", 415);
    if (!dataUrl.startsWith("data:" + mimeType + ";base64,")) return fail("invalid_image_payload", "The image payload is invalid.", 400);
    if (dataUrl.length > MAX_DATA_URL_LENGTH) return fail("image_too_large", "That image is too large. Resize it and try again.", 413);

    const controller = new AbortController();
    const timeoutMs = Math.max(5_000, Math.min(60_000, Number(Deno.env.get("PHOTO_RECORD_PROVIDER_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS)));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(OPENAI_API, {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": "Bearer " + openAiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("OPENAI_RECORD_PHOTO_MODEL") || DEFAULT_MODEL,
          store: false,
          reasoning: { effort: "low" },
          instructions: instructions(),
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: "Create a review-only HerdHarbor draft from this image (" + fileName + ")." },
              { type: "input_image", image_url: dataUrl, detail: "high" }
            ]
          }],
          text: { verbosity: "low", format: { type: "json_schema", name: "herdharbor_photo_record_draft", strict: true, schema: OUTPUT_SCHEMA } }
        })
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return fail("provider_timeout", "The photo reader timed out. Farm records were not changed.", 504, true);
      return fail("provider_error", "The photo reader could not be reached. Farm records were not changed.", 502, true);
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429) return fail("provider_rate_limit", "The photo reader is temporarily busy. Farm records were not changed.", 429, true);
      return fail("provider_error", "HerdHarbor could not read that image right now. Farm records were not changed.", 502, true);
    }
    const output = responseText(payload);
    if (!output) return fail("empty_extraction", "The photo reader returned no usable draft. Farm records were not changed.", 502, true);
    let parsed: any;
    try { parsed = JSON.parse(output); } catch { return fail("malformed_structured_result", "The photo reader returned an invalid draft. Farm records were not changed.", 502, true); }
    if (!validate(parsed)) return fail("malformed_structured_result", "The photo reader returned an invalid draft. Farm records were not changed.", 502, true);
    return json({ draft: normalize(parsed, fileName), model: Deno.env.get("OPENAI_RECORD_PHOTO_MODEL") || DEFAULT_MODEL });
  } catch {
    return fail("service_error", "HerdHarbor could not read that image. Farm records were not changed.", 500, true);
  }
});
