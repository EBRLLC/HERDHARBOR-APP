import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const TYPE = "herdharbor-direct-animal-transfer";
const PAYLOAD_VERSION = 1;
const MAX_SUBJECTS = 25;
const MAX_ANIMALS = 100;
const MAX_BODY_BYTES = 1_500_000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 240) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

type Admin = ReturnType<typeof createClient>;
type Recipient = { recipient_id: string; member_code: string; display_name: string; masked_email: string };

type TransferRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  transfer_id: string;
  source_sale_number: string;
  sale_date: string;
  status: string;
  payload_version: number;
  payload?: Record<string, unknown>;
  subject_count: number;
  subject_names: string[];
  pedigree_record_count: number;
  includes_genetics: boolean;
  sender_display_name: string;
  recipient_display_name: string;
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
  declined_at?: string | null;
  cancelled_at?: string | null;
};

function sanitizeOwnershipHistory(history: unknown) {
  return (Array.isArray(history) ? history : []).slice(-25).map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      type: clean(row.type, 32) || "transfer",
      date: clean(row.date || row.at, 32),
      transferId: clean(row.transferId, 120),
      sourceSaleNumber: clean(row.sourceSaleNumber, 120),
      from: clean(row.from, 160),
      to: clean(row.to, 160)
    };
  }).filter((row) => row.date || row.transferId || row.from || row.to);
}

function sanitizeGenetics(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const genetics = value as Record<string, unknown>;
  const sourceLoci = genetics.loci && typeof genetics.loci === "object" && !Array.isArray(genetics.loci)
    ? genetics.loci as Record<string, unknown>
    : {};
  const loci: Record<string, unknown> = {};
  Object.entries(sourceLoci).slice(0, 80).forEach(([key, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const row = value as Record<string, unknown>;
    loci[clean(key, 32)] = {
      alleles: (Array.isArray(row.alleles) ? row.alleles : []).slice(0, 2).map((allele) => clean(allele, 32) || "_"),
      status: clean(row.status, 40),
      source: clean(row.source, 80),
      confidence: Number.isFinite(Number(row.confidence)) ? Math.max(0, Math.min(1, Number(row.confidence))) : null,
      value: ["string", "number", "boolean"].includes(typeof row.value) ? row.value : "",
      scientificStatus: clean(row.scientificStatus, 80),
      predictionModel: clean(row.predictionModel, 80)
    };
  });
  const phenotype = genetics.phenotype && typeof genetics.phenotype === "object" && !Array.isArray(genetics.phenotype)
    ? genetics.phenotype as Record<string, unknown>
    : {};
  const registry = genetics.registry && typeof genetics.registry === "object" && !Array.isArray(genetics.registry)
    ? genetics.registry as Record<string, unknown>
    : {};
  const additionalTraits = (Array.isArray(genetics.additionalTraits) ? genetics.additionalTraits : []).slice(0, 40).map((value) => {
    if (typeof value === "string") return { label: clean(value, 120), status: "", source: "", value: "" };
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      label: clean(row.label || row.name, 120),
      status: clean(row.status, 40),
      source: clean(row.source, 80),
      value: ["string", "number", "boolean"].includes(typeof row.value) ? row.value : ""
    };
  }).filter((row) => row.label);
  return {
    schemaVersion: Number.isFinite(Number(genetics.schemaVersion)) ? Number(genetics.schemaVersion) : null,
    geneticsContractVersion: clean(genetics.geneticsContractVersion, 40),
    engineVersion: clean(genetics.engineVersion, 40),
    engineBuild: clean(genetics.engineBuild, 40),
    species: clean(genetics.species, 80),
    breedProfileId: clean(genetics.breedProfileId, 120),
    phenotype: {
      recorded: clean(phenotype.recorded || phenotype.recordedColor, 160),
      canonicalId: clean(phenotype.canonicalId, 120),
      canonical: clean(phenotype.canonical, 160),
      family: clean(phenotype.family, 120),
      breedTerm: clean(phenotype.breedTerm, 160),
      confidence: Number.isFinite(Number(phenotype.confidence)) ? Math.max(0, Math.min(1, Number(phenotype.confidence))) : null
    },
    loci,
    additionalTraits,
    registry: { authority: clean(registry.authority, 80), version: clean(registry.version, 80) },
    updatedAt: clean(genetics.updatedAt, 40) || null
  };
}

function sanitizeAnimal(value: unknown) {
  const animal = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    id: clean(animal.id, 160),
    name: clean(animal.name, 160),
    tag: clean(animal.tag, 120),
    earTagNumber: clean(animal.earTagNumber, 120),
    earTagColor: clean(animal.earTagColor, 80),
    tattoo: clean(animal.tattoo, 120),
    registrationNumber: clean(animal.registrationNumber, 160),
    breeder: clean(animal.breeder, 160),
    species: clean(animal.species, 100),
    breed: clean(animal.breed, 160),
    sex: clean(animal.sex, 40) || "Unknown",
    dob: clean(animal.dob, 32),
    color: clean(animal.color, 160),
    variety: clean(animal.variety, 160),
    sireId: clean(animal.sireId, 160),
    damId: clean(animal.damId, 160),
    genetics: sanitizeGenetics(animal.genetics),
    ownershipHistory: sanitizeOwnershipHistory(animal.ownershipHistory)
  };
}

function sanitizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Transfer payload is missing.");
  const payload = value as Record<string, unknown>;
  if (payload.type !== TYPE || Number(payload.payloadVersion) !== PAYLOAD_VERSION) throw new Error("Unsupported transfer payload.");
  const transferId = clean(payload.transferId, 120);
  if (!transferId) throw new Error("Transfer ID is required.");
  const subjectIds = (Array.isArray(payload.subjectIds) ? payload.subjectIds : []).map((id) => clean(id, 160)).filter(Boolean);
  if (!subjectIds.length || subjectIds.length > MAX_SUBJECTS || new Set(subjectIds).size !== subjectIds.length) throw new Error("Invalid subject-animal list.");
  const animals = (Array.isArray(payload.animals) ? payload.animals : []).map(sanitizeAnimal);
  if (!animals.length || animals.length > MAX_ANIMALS) throw new Error("Invalid pedigree-animal list.");
  if (animals.some((animal) => !animal.id) || new Set(animals.map((animal) => animal.id)).size !== animals.length) throw new Error("Animal IDs are invalid or duplicated.");
  const animalIds = new Set(animals.map((animal) => animal.id));
  if (subjectIds.some((id) => !animalIds.has(id))) throw new Error("A subject animal is missing from the pedigree payload.");
  const sender = payload.sender && typeof payload.sender === "object" ? payload.sender as Record<string, unknown> : {};
  const recipient = payload.recipient && typeof payload.recipient === "object" ? payload.recipient as Record<string, unknown> : {};
  const sale = payload.sale && typeof payload.sale === "object" ? payload.sale as Record<string, unknown> : {};
  return {
    app: "HerdHarbor",
    type: TYPE,
    payloadVersion: PAYLOAD_VERSION,
    transferId,
    exportedAt: clean(payload.exportedAt, 40) || new Date().toISOString(),
    sender: { operationName: clean(sender.operationName, 160), ownerName: clean(sender.ownerName, 160), memberCode: clean(sender.memberCode, 64) },
    recipient: { name: clean(recipient.name, 160) },
    sale: { saleNumber: clean(sale.saleNumber, 120), saleDate: clean(sale.saleDate, 32), transferNumber: transferId },
    subjectIds,
    animals
  };
}

async function resolveRecipient(admin: Admin, lookup: string): Promise<Recipient | null> {
  const { data, error } = await admin.rpc("herdharbor_direct_transfer_resolve", { lookup_value: lookup });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.recipient_id) return null;
  return row as Recipient;
}

async function ensureIdentity(admin: Admin, user: { id: string; email?: string | null }): Promise<Recipient> {
  const email = clean(user.email, 320).toLowerCase();
  if (!email) throw new Error("Your HerdHarbor account does not have a usable email address.");
  const identity = await resolveRecipient(admin, email);
  if (!identity || identity.recipient_id !== user.id) throw new Error("Your member transfer identity could not be created.");
  return identity;
}

function metadata(row: TransferRow) {
  return {
    id: row.id,
    transferId: row.transfer_id,
    sourceSaleNumber: row.source_sale_number,
    saleDate: row.sale_date,
    status: row.status,
    subjectCount: row.subject_count,
    subjectNames: row.subject_names || [],
    pedigreeRecordCount: row.pedigree_record_count,
    includesGenetics: Boolean(row.includes_genetics),
    senderDisplayName: row.sender_display_name,
    recipientDisplayName: row.recipient_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at || null,
    declinedAt: row.declined_at || null,
    cancelledAt: row.cancelled_at || null
  };
}

async function audit(admin: Admin, transferId: string, actorId: string, eventType: string) {
  const { error } = await admin.from("herdharbor_direct_transfer_events").insert({
    transfer_row_id: transferId,
    actor_id: actorId,
    event_type: eventType
  });
  if (error) console.warn("HerdHarbor direct transfer audit event was not stored:", error.message);
}

const META_COLUMNS = "id,sender_id,recipient_id,transfer_id,source_sale_number,sale_date,status,payload_version,subject_count,subject_names,pedigree_record_count,includes_genetics,sender_display_name,recipient_display_name,created_at,updated_at,accepted_at,declined_at,cancelled_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Transfer request is too large." }, 413);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Direct transfer service configuration is unavailable." }, 503);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication is required." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id) return json({ error: "The authentication session is invalid or expired." }, 401);

    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) return json({ error: "Transfer request is too large." }, 413);
    const body = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
    const action = clean(body.action, 32).toLowerCase();

    if (action === "identity") {
      const current = await ensureIdentity(admin, user);
      return json({ identity: { memberCode: current.member_code, displayName: current.display_name, maskedEmail: current.masked_email } });
    }

    if (action === "resolve") {
      const lookup = clean(body.recipient, 320);
      if (!lookup) return json({ error: "Enter a HerdHarbor member email or member code." }, 400);
      const recipient = await resolveRecipient(admin, lookup);
      if (!recipient) return json({ recipient: null });
      if (recipient.recipient_id === user.id) return json({ error: "Choose the buyer's HerdHarbor account, not your own account." }, 400);
      return json({ recipient: { memberCode: recipient.member_code, displayName: recipient.display_name, maskedEmail: recipient.masked_email } });
    }

    if (action === "inbox") {
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .select(META_COLUMNS)
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ transfers: (data || []).map((row) => metadata(row as TransferRow)) });
    }

    if (action === "outbox") {
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .select(META_COLUMNS)
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ transfers: (data || []).map((row) => metadata(row as TransferRow)) });
    }

    if (action === "create") {
      const recipientLookup = clean(body.recipient, 320);
      if (!recipientLookup) return json({ error: "Choose the buyer's HerdHarbor account." }, 400);
      const recipient = await resolveRecipient(admin, recipientLookup);
      if (!recipient) return json({ error: "No matching HerdHarbor member was found." }, 404);
      if (recipient.recipient_id === user.id) return json({ error: "You cannot transfer an animal to your own account." }, 400);
      const sender = await ensureIdentity(admin, user);
      const payload = sanitizePayload(body.payload);
      payload.sender = { operationName: sender.display_name, ownerName: "", memberCode: sender.member_code };
      payload.recipient = { name: recipient.display_name };

      const { data: existing, error: existingError } = await admin.from("herdharbor_direct_animal_transfers")
        .select(META_COLUMNS)
        .eq("sender_id", user.id)
        .eq("transfer_id", payload.transferId)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const row = existing as TransferRow;
        if (row.recipient_id !== recipient.recipient_id) return json({ error: "This sale already has a pending or accepted transfer for another member. Cancel the pending transfer before sending it elsewhere." }, 409);
        if (row.status === "accepted") return json({ error: "This sale transfer has already been accepted." }, 409);
        return json({ transfer: metadata(row), existing: true });
      }

      const subjectSet = new Set(payload.subjectIds);
      const subjectAnimals = payload.animals.filter((animal) => subjectSet.has(animal.id));
      const subjectNames = subjectAnimals.map((animal) => animal.name || animal.tag || animal.tattoo || animal.registrationNumber || "Unnamed animal").slice(0, MAX_SUBJECTS);
      const includesGenetics = subjectAnimals.some((animal) => Boolean(animal.genetics));
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers").insert({
        sender_id: user.id,
        recipient_id: recipient.recipient_id,
        transfer_id: payload.transferId,
        source_sale_number: payload.sale.saleNumber,
        sale_date: payload.sale.saleDate,
        status: "pending",
        payload_version: PAYLOAD_VERSION,
        payload,
        subject_count: payload.subjectIds.length,
        subject_names: subjectNames,
        pedigree_record_count: payload.animals.length,
        includes_genetics: includesGenetics,
        sender_display_name: sender.display_name,
        recipient_display_name: recipient.display_name
      }).select(META_COLUMNS).single();
      if (error) throw error;
      await audit(admin, data.id, user.id, "created");
      return json({ transfer: metadata(data as TransferRow) }, 201);
    }

    const transferId = clean(body.transferId, 160);
    if (!transferId) return json({ error: "Transfer record ID is required." }, 400);

    if (action === "preview") {
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .select(META_COLUMNS)
        .eq("id", transferId)
        .eq("recipient_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "That transfer is not available to this account." }, 404);
      if (data.status !== "pending") return json({ error: `This transfer is ${data.status}.` }, 409);
      await audit(admin, data.id, user.id, "previewed");
      return json({ transfer: metadata(data as TransferRow) });
    }

    if (action === "prepare_accept") {
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .select(`${META_COLUMNS},payload`)
        .eq("id", transferId)
        .eq("recipient_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "That transfer is not available to this account." }, 404);
      if (!["pending", "accepted"].includes(data.status)) return json({ error: `This transfer is ${data.status}.` }, 409);
      await audit(admin, data.id, user.id, "prepared");
      return json({ transfer: { ...metadata(data as TransferRow), payload: data.payload } });
    }

    if (action === "complete_accept") {
      const { data: current, error: currentError } = await admin.from("herdharbor_direct_animal_transfers")
        .select(META_COLUMNS)
        .eq("id", transferId)
        .eq("recipient_id", user.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return json({ error: "That transfer is not available to this account." }, 404);
      if (current.status === "accepted") return json({ transfer: metadata(current as TransferRow), existing: true });
      if (current.status !== "pending") return json({ error: `This transfer is ${current.status}.` }, 409);
      const now = new Date().toISOString();
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .update({ status: "accepted", accepted_at: now, updated_at: now })
        .eq("id", transferId)
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .select(META_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "The transfer changed before acceptance completed. Refresh and try again." }, 409);
      await audit(admin, data.id, user.id, "accepted");
      return json({ transfer: metadata(data as TransferRow) });
    }

    if (action === "decline") {
      const now = new Date().toISOString();
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .update({ status: "declined", declined_at: now, updated_at: now })
        .eq("id", transferId)
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .select(META_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Only a pending transfer can be declined." }, 409);
      await audit(admin, data.id, user.id, "declined");
      return json({ transfer: metadata(data as TransferRow) });
    }

    if (action === "cancel") {
      const now = new Date().toISOString();
      const { data, error } = await admin.from("herdharbor_direct_animal_transfers")
        .update({ status: "cancelled", cancelled_at: now, updated_at: now })
        .eq("id", transferId)
        .eq("sender_id", user.id)
        .eq("status", "pending")
        .select(META_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Only a pending transfer can be cancelled by its seller." }, 409);
      await audit(admin, data.id, user.id, "cancelled");
      return json({ transfer: metadata(data as TransferRow) });
    }

    return json({ error: "Unsupported direct transfer action." }, 400);
  } catch (error) {
    console.error("HerdHarbor animal-transfer error:", error);
    const message = error instanceof Error ? error.message : "The direct transfer service could not complete the request.";
    return json({ error: message }, 400);
  }
});
