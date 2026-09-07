import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { deliverSubscriptionNotification } from "../_shared/subscription-email.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" }
});

const BACKOFF_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
const MAX_DELIVERY_ATTEMPTS = 8;

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Maintenance configuration is unavailable." }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const suppliedToken = String(req.headers.get("X-HerdHarbor-Maintenance") || "").trim();
  const { data: config, error: configError } = await admin
    .from("subscription_maintenance_config")
    .select("maintenance_token")
    .eq("id", "primary")
    .maybeSingle();
  if (configError) {
    console.error("subscription-maintenance-config", configError);
    return json({ error: "Maintenance authorization is unavailable." }, 503);
  }
  if (!safeEqual(suppliedToken, String(config?.maintenance_token || ""))) {
    return json({ error: "Unauthorized." }, 401);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const staleProcessingBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  const stats = {
    entitlementCandidates: 0,
    entitlementsActivated: 0,
    entitlementFallbacks: 0,
    notificationsRetried: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    staleClaimsReclaimed: 0,
    registrationIntentsRemoved: 0
  };

  try {
    // A worker crash must not strand an email permanently in processing.
    const { data: reclaimed, error: reclaimError } = await admin
      .from("subscription_notification_outbox")
      .update({ status: "failed", last_error: "Recovered stale processing claim.", updated_at: nowIso })
      .eq("status", "processing")
      .lt("updated_at", staleProcessingBefore)
      .select("id");
    if (reclaimError) throw reclaimError;
    stats.staleClaimsReclaimed = reclaimed?.length || 0;

    // Build a bounded candidate set for credit-only Member access. The atomic
    // RPC decides whether Stripe, launch trial, paid-through time, or a protected
    // Founder/Admin/manual entitlement takes priority.
    const [endedSubscriptions, creditAccess, expiringEntitlements] = await Promise.all([
      admin.from("subscriptions")
        .select("user_id,status,current_period_end")
        .in("status", ["canceled", "expired", "unpaid", "incomplete_expired", "not_configured"])
        .limit(500),
      admin.from("account_access")
        .select("user_id")
        .eq("membership_source", "subscription_credit")
        .limit(500),
      admin.from("subscription_credit_entitlements")
        .select("user_id")
        .eq("status", "active")
        .lte("ends_at", nowIso)
        .limit(500)
    ]);
    for (const result of [endedSubscriptions, creditAccess, expiringEntitlements]) {
      if (result.error) throw result.error;
    }

    const candidates = new Set<string>();
    for (const row of endedSubscriptions.data || []) {
      const paidThrough = row.current_period_end ? new Date(String(row.current_period_end)).getTime() : 0;
      if (!paidThrough || paidThrough <= now.getTime()) candidates.add(String(row.user_id));
    }
    for (const row of creditAccess.data || []) candidates.add(String(row.user_id));
    for (const row of expiringEntitlements.data || []) candidates.add(String(row.user_id));
    stats.entitlementCandidates = candidates.size;

    for (const userId of candidates) {
      const { data, error } = await admin.rpc("activate_member_credit_entitlement", {
        target_user: userId,
        requested_start: null
      });
      if (error) {
        console.error("subscription-maintenance-entitlement", userId, error);
        continue;
      }
      if (data?.activated === true) stats.entitlementsActivated += 1;
      if (data?.fallbackPlan === "junior") stats.entitlementFallbacks += 1;
    }

    // Retry due transactional notifications with bounded exponential backoff.
    const { data: due, error: dueError } = await admin
      .from("subscription_notification_outbox")
      .select("id,attempts,status")
      .in("status", ["pending", "failed"])
      .lte("not_before", nowIso)
      .lt("attempts", MAX_DELIVERY_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(100);
    if (dueError) throw dueError;

    for (const row of due || []) {
      stats.notificationsRetried += 1;
      try {
        const result = await deliverSubscriptionNotification(admin, String(row.id));
        if (result?.delivered) stats.notificationsSent += 1;
      } catch (error) {
        stats.notificationsFailed += 1;
        const nextAttemptNumber = Math.max(1, Number(row.attempts || 0) + 1);
        const delay = BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, Math.max(0, nextAttemptNumber - 1))];
        await admin.from("subscription_notification_outbox").update({
          not_before: new Date(Date.now() + delay).toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", row.id).eq("status", "failed");
        console.error("subscription-maintenance-notification", row.id, error);
      }
    }

    const { data: removed, error: cleanupError } = await admin
      .from("registration_intents")
      .delete()
      .lt("expires_at", nowIso)
      .select("email_hash");
    if (cleanupError) throw cleanupError;
    stats.registrationIntentsRemoved = removed?.length || 0;

    return json({ ok: true, ranAt: nowIso, ...stats });
  } catch (error) {
    console.error("subscription-maintenance", error);
    return json({ error: error instanceof Error ? error.message : "Subscription maintenance failed.", ...stats }, 500);
  }
});
