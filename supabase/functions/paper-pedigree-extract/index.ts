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
const MAX_REQUEST_BYTES = 11_000_000;
const MAX_DATA_URL_LENGTH = 10_500_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const ROLES = [
  "subject", "sire", "dam",
  "sireSire", "sireDam", "damSire", "damDam",
  "sireSireSire", "sireSireDam", "sireDamSire", "sireDamDam",
  "damSireSire", "damSireDam", "damDamSire", "damDamDam"
];
const FIELDS = [
  "name", "registrationNumber", "tattoo", "tag", "earTagNumber", "breeder",
  "species", "breed", "sex", "dob", "color", "variety"
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 240) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

const confidenceProperties = Object.fromEntries(FIELDS.map((field) => [field, { type: "number", minimum: 0, maximum: 1 }]));
const nodeProperties = {
  role: { type: "string", enum: ROLES },
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
  variety: { type: "string", maxLength: 160 },
  sourceText: { type: "string", maxLength: 600 },
  confidence: {
    type: "object",
    properties: confidenceProperties,
    required: FIELDS,
    additionalProperties: false
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        properties: nodeProperties,
        required: ["role", ...FIELDS, "sourceText", "confidence"],
        additionalProperties: false
      }
    },
    warnings: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 300 }
    }
  },
  required: ["nodes", "warnings"],
  additionalProperties: false
};

function extractionInstructions() {
  return `You extract livestock pedigree information from a photographed paper pedigree for HerdHarbor.
Return only the pedigree information that is actually visible in the image. Do not invent missing names, registration numbers, tattoos, breeders, birth dates, colors, varieties, or breeds.

Use these exact lineage roles:
subject = the animal the pedigree belongs to
sire / dam = parents
sireSire / sireDam / damSire / damDam = grandparents
sireSireSire / sireSireDam / sireDamSire / sireDamDam / damSireSire / damSireDam / damDamSire / damDamDam = great-grandparents.

For each animal that is visible, return one node. Omit lineage positions that are completely blank or unreadable. Preserve printed names and identifiers as written. Convert an unambiguous printed birth date to YYYY-MM-DD only when the date can be determined safely; otherwise copy the visible date text into sourceText and leave dob blank.

Sex may be assigned from lineage role when the role itself makes sex unambiguous: sire roles are Male and dam roles are Female. For the subject, use only a visible sex label; otherwise Unknown.

Confidence is a legibility/extraction confidence from 0 to 1 for each field. Use 0 when the field is blank. Use a low score when text is uncertain instead of guessing. Put any layout ambiguity, unreadable text, or uncertainty in warnings. This output is a draft for human review and must never silently invent pedigree facts.`;
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

function configuredDailyLimit() {
  const value = Number(Deno.env.get("PAPER_PEDIGREE_DAILY_LIMIT") || DEFAULT_DAILY_LIMIT);
  if (!Number.isFinite(value)) return DEFAULT_DAILY_LIMIT;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function normalizeResult(raw: any, fileName: string) {
  const seen = new Set<string>();
  const nodes = [];
  for (const candidate of Array.isArray(raw?.nodes) ? raw.nodes : []) {
    const role = clean(candidate?.role, 48);
    if (!ROLES.includes(role) || seen.has(role)) continue;
    seen.add(role);
    const confidence: Record<string, number> = {};
    for (const field of FIELDS) {
      const score = Number(candidate?.confidence?.[field]);
      confidence[field] = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
    }
    nodes.push({
      role,
      name: clean(candidate?.name, 160),
      registrationNumber: clean(candidate?.registrationNumber, 160),
      tattoo: clean(candidate?.tattoo, 120),
      tag: clean(candidate?.tag, 120),
      earTagNumber: clean(candidate?.earTagNumber, 120),
      breeder: clean(candidate?.breeder, 160),
      species: clean(candidate?.species, 100) || "Rabbit",
      breed: clean(candidate?.breed, 160),
      sex: ["Male", "Female", "Unknown"].includes(candidate?.sex) ? candidate.sex : "Unknown",
      dob: clean(candidate?.dob, 32),
      color: clean(candidate?.color, 160),
      variety: clean(candidate?.variety, 160),
      sourceText: clean(candidate?.sourceText, 600),
      confidence
    });
  }
  return {
    sourceType: "paper-pedigree-photo",
    sourceName: clean(fileName, 240),
    extractionId: crypto.randomUUID(),
    nodes,
    warnings: (Array.isArray(raw?.warnings) ? raw.warnings : []).map((value: unknown) => clean(value, 300)).filter(Boolean).slice(0, 20)
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Pedigree service configuration is unavailable." }, 503);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication is required." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user?.id) return json({ error: "The authentication session is invalid or expired." }, 401);

    const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const model = Deno.env.get("OPENAI_PEDIGREE_MODEL") || DEFAULT_MODEL;
    if (!openAiKey) return json({ error: "Paper pedigree reading is not configured yet." }, 503);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return json({ error: "That pedigree photo is too large to read automatically. Resize it and try again." }, 413);
    }

    const body = await req.json().catch(() => null);
    const mimeType = clean(body?.mimeType, 80).toLowerCase();
    const fileName = clean(body?.fileName, 240) || "paper-pedigree";
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
    if (!ALLOWED_MIME.has(mimeType)) return json({ error: "Automatic pedigree reading currently supports JPG and PNG photos." }, 400);
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return json({ error: "The pedigree image payload is invalid." }, 400);
    if (dataUrl.length > MAX_DATA_URL_LENGTH) return json({ error: "That pedigree photo is too large to read automatically. Resize it and try again." }, 413);

    const dailyLimit = configuredDailyLimit();
    const { data: reservedCount, error: usageError } = await admin.rpc("herdharbor_reserve_paper_pedigree_ai_request", {
      p_user_id: authData.user.id,
      p_daily_limit: dailyLimit
    });
    if (usageError) {
      console.error("Paper pedigree usage reservation failed:", usageError.message);
      return json({ error: "Paper pedigree reading is temporarily unavailable. Your farm records were not changed." }, 503);
    }
    if (Number(reservedCount || 0) < 1) {
      return json({ error: "You have reached today's paper pedigree reading limit. Try again tomorrow.", retryAfter: "next-utc-day" }, 429);
    }

    const response = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        instructions: extractionInstructions(),
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `Read this paper pedigree image (${fileName}) and return a reviewable pedigree draft.` },
            { type: "input_image", image_url: dataUrl, detail: "high" }
          ]
        }],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "herdharbor_paper_pedigree",
            strict: true,
            schema: OUTPUT_SCHEMA
          }
        }
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = clean(payload?.error?.message, 300) || `Pedigree reading failed (${response.status}).`;
      console.error("Paper pedigree extraction failed:", response.status, message);
      return json({ error: "HerdHarbor could not read that pedigree photo right now. Your farm records were not changed." }, 502);
    }
    if (payload?.status && payload.status !== "completed") {
      return json({ error: "The pedigree reader did not finish. Your farm records were not changed." }, 502);
    }

    const text = extractResponseText(payload);
    if (!text) return json({ error: "The pedigree reader returned no usable result. Your farm records were not changed." }, 502);
    const parsed = JSON.parse(text);
    const normalized = normalizeResult(parsed, fileName);
    if (!normalized.nodes.length) return json({ error: "No pedigree animals could be read from that image. Try a clearer, straighter photo." }, 422);

    return json({ extraction: normalized, model });
  } catch (error) {
    console.error("Paper pedigree service error:", error);
    return json({ error: "HerdHarbor could not read that pedigree photo. Your farm records were not changed." }, 500);
  }
});
