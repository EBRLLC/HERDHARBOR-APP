import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const GENERAL_SEGMENT_ID = "bc11864d-34f0-46a8-beb9-29e41f6e51d8";
const DEFAULT_FROM = "HerdHarbor <updates@auth.herdharbor.com>";
const RESEND_API = "https://api.resend.com";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const clean = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";

function resendHeaders(key: string) {
  return {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  };
}

async function resendRequest(key: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: { ...resendHeaders(key), ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : `Resend request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

async function callerContext(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Email service configuration is unavailable.");

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Authentication is required.");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id || !user.email) throw new Error("The authentication session is invalid or expired.");
  return { admin, user };
}

async function accessRecord(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from("account_access")
    .select("account_role,membership_tier,account_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || { account_role: "user", membership_tier: "junior", account_status: "active" };
}

async function registrationRecord(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from("registration_profiles")
    .select("legal_first_name,legal_last_name,usage_type")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function requireAdmin(admin: ReturnType<typeof createClient>, userId: string) {
  const access = await accessRecord(admin, userId);
  if (access.account_status !== "active" || !["owner", "admin"].includes(access.account_role)) {
    throw new Error("HerdHarbor Admin email access denied.");
  }
  return access;
}

function contactPayload(email: string, access: any, registration: any) {
  return {
    email,
    first_name: registration?.legal_first_name || undefined,
    last_name: registration?.legal_last_name || undefined,
    properties: {
      membership_tier: access?.membership_tier || "junior",
      account_role: access?.account_role || "user",
      account_status: access?.account_status || "active",
      usage_type: registration?.usage_type || "legacy"
    }
  };
}

async function upsertContact(key: string, payload: Record<string, unknown>) {
  const email = String(payload.email || "");
  const lookup = await fetch(`${RESEND_API}/contacts/${encodeURIComponent(email)}`, {
    headers: resendHeaders(key)
  });

  if (lookup.status === 404) {
    return await resendRequest(key, "/contacts", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        unsubscribed: false,
        segments: [{ id: GENERAL_SEGMENT_ID }]
      })
    });
  }

  if (!lookup.ok) {
    const body = await lookup.json().catch(() => ({}));
    throw new Error(typeof body?.message === "string" ? body.message : `Resend contact lookup failed with HTTP ${lookup.status}.`);
  }

  return await resendRequest(key, `/contacts/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify({
      first_name: payload.first_name,
      last_name: payload.last_name,
      properties: payload.properties
    })
  });
}

function senderAllowed(value: string) {
  const match = /<([^>]+)>$/.exec(value);
  const address = (match ? match[1] : value).trim().toLowerCase();
  return address.endsWith("@auth.herdharbor.com");
}

function ensureUnsubscribe(text: string) {
  if (text.includes("RESEND_UNSUBSCRIBE_URL")) return text;
  return `${text}\n\nManage email preferences: {{{RESEND_UNSUBSCRIBE_URL}}}`;
}

function ensureHtmlUnsubscribe(html: string) {
  if (html.includes("RESEND_UNSUBSCRIBE_URL")) return html;
  return `${html}<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#666666;">You can <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">unsubscribe from broadcast emails</a> at any time.</p>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { admin, user } = await callerContext(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 48).toLowerCase();
    const sendingKey = Deno.env.get("RESEND_API_KEY") || "";
    const managementKey = Deno.env.get("RESEND_MANAGEMENT_API_KEY") || "";

    if (action === "status") {
      const access = await accessRecord(admin, user.id);
      return json({
        connected: Boolean(sendingKey),
        audienceManagementConnected: Boolean(managementKey),
        segment: "General",
        admin: access.account_status === "active" && ["owner", "admin"].includes(access.account_role)
      });
    }

    if (action === "sync_self") {
      if (!managementKey) return json({ error: "Resend audience management is not configured." }, 503);
      const access = await accessRecord(admin, user.id);
      const registration = await registrationRecord(admin, user.id);
      await upsertContact(managementKey, contactPayload(user.email!, access, registration));
      return json({ ok: true });
    }

    if (action === "admin_sync_all") {
      await requireAdmin(admin, user.id);
      if (!managementKey) return json({ error: "Resend audience management is not configured." }, 503);

      const [{ data: accesses, error: accessError }, { data: registrations, error: registrationError }] = await Promise.all([
        admin.from("account_access").select("user_id,account_role,membership_tier,account_status"),
        admin.from("registration_profiles").select("user_id,legal_first_name,legal_last_name,usage_type")
      ]);
      if (accessError) throw accessError;
      if (registrationError) throw registrationError;

      const accessMap = new Map((accesses || []).map((row: any) => [row.user_id, row]));
      const registrationMap = new Map((registrations || []).map((row: any) => [row.user_id, row]));
      let page = 1;
      let synced = 0;
      const failed: string[] = [];

      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        const users = data?.users || [];
        for (const account of users) {
          if (!account.email) continue;
          try {
            await upsertContact(
              managementKey,
              contactPayload(account.email, accessMap.get(account.id), registrationMap.get(account.id))
            );
            synced += 1;
          } catch (error) {
            console.error("email-engine sync", account.id, error);
            failed.push(account.id);
          }
        }
        if (users.length < 100) break;
        page += 1;
      }

      return json({ ok: failed.length === 0, synced, failedCount: failed.length });
    }

    if (action === "admin_create_broadcast_draft") {
      await requireAdmin(admin, user.id);
      if (!managementKey) return json({ error: "Resend audience management is not configured." }, 503);

      const subject = clean(body.subject, 160);
      const name = clean(body.name, 120) || subject;
      const from = clean(body.from, 200) || DEFAULT_FROM;
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 40000) : "";
      const html = typeof body.html === "string" ? body.html.trim().slice(0, 120000) : "";
      if (!subject) return json({ error: "A subject is required." }, 400);
      if (!text && !html) return json({ error: "Email content is required." }, 400);
      if (!senderAllowed(from)) return json({ error: "Broadcast sender must use the verified auth.herdharbor.com domain." }, 400);

      const draft = await resendRequest(managementKey, "/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          name,
          segment_id: GENERAL_SEGMENT_ID,
          from,
          subject,
          text: text ? ensureUnsubscribe(text) : undefined,
          html: html ? ensureHtmlUnsubscribe(html) : undefined,
          send: false
        })
      });

      return json({ ok: true, broadcastId: draft?.id || null, status: "draft" });
    }

    return json({ error: "Unsupported email action." }, 400);
  } catch (error) {
    console.error("email-engine", error);
    const message = error instanceof Error ? error.message : "Email service request failed.";
    const status = /Authentication|invalid or expired/i.test(message) ? 401 : /Admin email access denied/i.test(message) ? 403 : 500;
    return json({ error: message }, status);
  }
});
