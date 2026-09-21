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
const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BYTES = 11_000_000;
const MAX_DATA_URL_LENGTH = 10_500_000;
const LOW_CONFIDENCE_THRESHOLD = 0.72;
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
const METRICS = new Set([
  "extraction_request",
  "structured_draft",
  "correction_required",
  "rejected_output",
  "rate_limit_hit",
  "provider_failure"
]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 240) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const fail = (
  code: string,
  error: string,
  status: number,
  retryable = false,
  extra: Record<string, unknown> = {}
) => json({ error, code, retryable, ...extra }, status);

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
Return only pedigree information that is actually visible. Do not invent missing names, registration numbers, tattoos, tags, breeders, birth dates, colors, varieties, breeds, species, or other facts.

Use these exact lineage roles:
subject = the animal the pedigree belongs to
sire / dam = parents
sireSire / sireDam / damSire / damDam = grandparents
sireSireSire / sireSireDam / sireDamSire / sireDamDam / damSireSire / damSireDam / damDamSire / damDamDam = great-grandparents.

Common rabbit pedigrees may be laid out as vertical ancestry trees, horizontal ancestry trees, grids or columns, or branch/relationship diagrams. Use relationship headers, connecting lines, column order, and generation labels together. Moderate rotation, perspective, glare, or cropping can be tolerated only when the relationship remains clear. A partial document may return the readable portion; leave missing lineage positions absent rather than guessing.

For each animal that is visible, return one node. Omit lineage positions that are completely blank or unreadable. Preserve printed names and identifiers as written. Convert an unambiguous printed birth date to YYYY-MM-DD only when the date can be determined safely; otherwise copy the visible date text into sourceText and leave dob blank.

Handwriting is not assumed reliable. If handwritten or printed text is unclear, leave the field blank or use a low confidence score and explain the uncertainty in warnings. Never infer an unreadable identifier from nearby values.

Sex may be assigned from lineage role when the role itself makes sex unambiguous: sire roles are Male and dam roles are Female. For the subject, use only a visible sex label; otherwise Unknown.

Confidence is a legibility/extraction confidence from 0 to 1 for each field. Use 0 when the field is blank. Use a low score when text is uncertain instead of guessing. Put layout ambiguity, conflicting relationship cues, unreadable text, partial-document limitations, or other uncertainty in warnings. This output is a draft for human review and must never silently invent pedigree facts.`;
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

function configuredProviderTimeoutMs() {
  const value = Number(Deno.env.get("PAPER_PEDIGREE_PROVIDER_TIMEOUT_MS") || DEFAULT_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(value)) return DEFAULT_PROVIDER_TIMEOUT_MS;
  return Math.max(5_000, Math.min(60_000, Math.floor(value)));
}

function validateStructuredResult(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.warnings)) return false;
  if (raw.nodes.length > 15 || raw.warnings.length > 20) return false;
  const seen = new Set<string>();
  for (const candidate of raw.nodes) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const role = clean(candidate.role, 48);
    if (!ROLES.includes(role) || seen.has(role)) return false;
    seen.add(role);
    if (!candidate.confidence || typeof candidate.confidence !== "object" || Array.isArray(candidate.confidence)) return false;
    for (const field of FIELDS) {
      if (typeof candidate[field] !== "string") return false;
      const score = Number(candidate.confidence[field]);
      if (!Number.isFinite(score) || score < 0 || score > 1) return false;
    }
    if (typeof candidate.sourceText !== "string") return false;
  }
  return raw.warnings.every((value: unknown) => typeof value === "string");
}

function normalizeResult(raw: any, fileName: string) {
  const nodes = [];
  for (const candidate of raw.nodes) {
    const confidence: Record<string, number> = {};
    for (const field of FIELDS) {
      const score = Number(candidate.confidence[field]);
      confidence[field] = Math.max(0, Math.min(1, score));
    }
    nodes.push({
      role: clean(candidate.role, 48),
      name: clean(candidate.name, 160),
      registrationNumber: clean(candidate.registrationNumber, 160),
      tattoo: clean(candidate.tattoo, 120),
      tag: clean(candidate.tag, 120),
      earTagNumber: clean(candidate.earTagNumber, 120),
      breeder: clean(candidate.breeder, 160),
      species: clean(candidate.species, 100),
      breed: clean(candidate.breed, 160),
      sex: ["Male", "Female", "Unknown"].includes(candidate.sex) ? candidate.sex : "Unknown",
      dob: clean(candidate.dob, 32),
      color: clean(candidate.color, 160),
      variety: clean(candidate.variety, 160),
      sourceText: clean(candidate.sourceText, 600),
      confidence
    });
  }
  const warnings = raw.warnings.map((value: unknown) => clean(value, 300)).filter(Boolean).slice(0, 20);
  let lowConfidenceFieldCount = 0;
  for (const node of nodes) {
    for (const field of FIELDS) {
      if (clean((node as any)[field], 300) && Number(node.confidence[field]) < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceFieldCount += 1;
      }
    }
  }
  const ambiguousPedigree = warnings.some((warning: string) =>
    /ambiguous|unclear (?:relationship|lineage|layout)|conflicting relationship|cannot determine (?:relationship|lineage)/i.test(warning)
  );
  return {
    sourceType: "paper-pedigree-photo",
    sourceName: clean(fileName, 240),
    extractionId: crypto.randomUUID(),
    nodes,
    warnings,
    diagnostics: {
      correctionRequired: warnings.length > 0 || lowConfidenceFieldCount > 0,
      lowConfidenceFieldCount,
      ambiguousPedigree
    }
  };
}

async function recordMetric(admin: any, metric: string) {
  if (!METRICS.has(metric)) return;
  try {
    const { error } = await admin.rpc("herdharbor_record_paper_pedigree_ai_metric", { p_metric: metric });
    if (error) console.warn("paper_pedigree_metric_unavailable", { metric });
  } catch {
    console.warn("paper_pedigree_metric_unavailable", { metric });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("method_not_allowed", "Method not allowed.", 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return fail("configuration_unavailable", "Pedigree service configuration is unavailable.", 503, true);
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("authentication_required", "Authentication is required.", 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user?.id) {
      return fail("authentication_invalid", "The authentication session is invalid or expired.", 401);
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return fail("image_too_large", "That pedigree photo is too large to read automatically. Resize it and try again.", 413);
    }

    const body = await req.json().catch(() => null);
    const mimeType = clean(body?.mimeType, 80).toLowerCase();
    const fileName = clean(body?.fileName, 240) || "paper-pedigree";
    const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
    if (!ALLOWED_MIME.has(mimeType)) {
      return fail("unsupported_image", "Automatic pedigree reading currently supports JPG and PNG photos.", 415);
    }
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
      return fail("invalid_image_payload", "The pedigree image payload is invalid.", 400);
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      return fail("image_too_large", "That pedigree photo is too large to read automatically. Resize it and try again.", 413);
    }

    await recordMetric(admin, "extraction_request");

    const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const model = Deno.env.get("OPENAI_PEDIGREE_MODEL") || DEFAULT_MODEL;
    if (!openAiKey) {
      await recordMetric(admin, "provider_failure");
      return fail("configuration_unavailable", "Paper pedigree reading is not configured yet.", 503, true);
    }

    const dailyLimit = configuredDailyLimit();
    const { data: reservedCount, error: usageError } = await admin.rpc("herdharbor_reserve_paper_pedigree_ai_request", {
      p_user_id: authData.user.id,
      p_daily_limit: dailyLimit
    });
    if (usageError) {
      console.error("paper_pedigree_usage_reservation_failed");
      return fail("usage_ledger_unavailable", "Paper pedigree reading is temporarily unavailable. Your farm records were not changed.", 503, true);
    }
    if (Number(reservedCount || 0) < 1) {
      await recordMetric(admin, "rate_limit_hit");
      return fail(
        "quota_exceeded",
        "You have reached today's paper pedigree reading limit. Try again tomorrow.",
        429,
        true,
        { retryAfter: "next-utc-day" }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), configuredProviderTimeoutMs());
    let response: Response;
    try {
      response = await fetch(OPENAI_API, {
        method: "POST",
        signal: controller.signal,
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
    } catch (error) {
      await recordMetric(admin, "provider_failure");
      if ((error as Error)?.name === "AbortError") {
        console.error("paper_pedigree_provider_timeout");
        return fail("provider_timeout", "The pedigree reader timed out. Your farm records were not changed. Try again.", 504, true);
      }
      console.error("paper_pedigree_provider_network_failure");
      return fail("provider_error", "The pedigree reader could not be reached. Your farm records were not changed.", 502, true);
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429) {
        await recordMetric(admin, "rate_limit_hit");
        console.error("paper_pedigree_provider_rate_limit", { status: response.status });
        return fail("provider_rate_limit", "The pedigree reader is temporarily busy. Your farm records were not changed. Try again.", 429, true);
      }
      await recordMetric(admin, "provider_failure");
      console.error("paper_pedigree_provider_failure", { status: response.status });
      return fail("provider_error", "HerdHarbor could not read that pedigree photo right now. Your farm records were not changed.", 502, true);
    }
    if (payload?.status && payload.status !== "completed") {
      await recordMetric(admin, "rejected_output");
      return fail("extraction_incomplete", "The pedigree reader did not finish. Your farm records were not changed.", 502, true);
    }

    const outputText = extractResponseText(payload);
    if (!outputText) {
      await recordMetric(admin, "rejected_output");
      return fail("empty_extraction", "The pedigree reader returned no usable result. Your farm records were not changed.", 502, true);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      await recordMetric(admin, "rejected_output");
      console.error("paper_pedigree_malformed_structured_result", { stage: "json_parse" });
      return fail("malformed_structured_result", "The pedigree reader returned an invalid draft. Your farm records were not changed. Try again.", 502, true);
    }
    if (!validateStructuredResult(parsed)) {
      await recordMetric(admin, "rejected_output");
      console.error("paper_pedigree_malformed_structured_result", { stage: "schema_validation" });
      return fail("malformed_structured_result", "The pedigree reader returned an invalid draft. Your farm records were not changed. Try again.", 502, true);
    }

    const normalized = normalizeResult(parsed, fileName);
    if (!normalized.nodes.length) {
      await recordMetric(admin, "rejected_output");
      return fail("no_pedigree_detected", "No pedigree animals could be read from that image. Try a clearer, straighter photo.", 422);
    }

    await recordMetric(admin, "structured_draft");
    if (normalized.diagnostics.correctionRequired) await recordMetric(admin, "correction_required");

    return json({ extraction: normalized, model });
  } catch {
    console.error("paper_pedigree_service_error");
    return fail("service_error", "HerdHarbor could not read that pedigree photo. Your farm records were not changed.", 500, true);
  }
});
