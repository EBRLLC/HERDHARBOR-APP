import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import Stripe from "https://esm.sh/stripe@18?target=denonext";
import { deliverSubscriptionNotification } from "../_shared/subscription-email.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const MEMBER_MONTH = { priceId: "price_1UCOjrGlRukEX5RK9my06yUP", cents: 1499 };
const ACTIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const text = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asInt = (value: unknown) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;

async function queueNotification(
  admin: ReturnType<typeof createClient>,
  input: { userId: string; subscriptionId?: string | null; eventType: string; dedupeKey: string; payload?: Record<string, unknown>; notBefore?: string }
) {
  const { data: inserted, error } = await admin.from("subscription_notification_outbox").insert({
    user_id: input.userId,
    subscription_id: input.subscriptionId || null,
    event_type: input.eventType,
    dedupe_key: input.dedupeKey,
    payload: input.payload || {},
    not_before: input.notBefore || new Date().toISOString()
  }).select("id").maybeSingle();
  if (error && error.code !== "23505") throw error;

  let outboxId = inserted?.id || null;
  if (!outboxId && error?.code === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("subscription_notification_outbox").select("id")
      .eq("dedupe_key", input.dedupeKey).maybeSingle();
    if (existingError) throw existingError;
    outboxId = existing?.id || null;
  }

  if (outboxId) {
    try { await deliverSubscriptionNotification(admin, outboxId); }
    catch (deliveryError) { console.error("subscription-notification-delivery", input.eventType, outboxId, deliveryError); }
  }
  return outboxId;
}

async function deliverCreditEntitlementNotice(admin: ReturnType<typeof createClient>, entitlementId: string) {
  if (!entitlementId) return;
  const { data, error } = await admin.from("subscription_notification_outbox")
    .select("id").eq("dedupe_key", `credit-entitlement-started:${entitlementId}`).maybeSingle();
  if (error) throw error;
  if (data?.id) {
    try { await deliverSubscriptionNotification(admin, data.id); }
    catch (deliveryError) { console.error("credit-entitlement-email", data.id, deliveryError); }
  }
}

async function reconcileCreditEntitlement(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin.rpc("activate_member_credit_entitlement", {
    target_user: userId,
    requested_start: null
  });
  if (error) throw error;
  if (data?.activated === true && data?.entitlementId) await deliverCreditEntitlementNotice(admin, String(data.entitlementId));
  return data || null;
}

async function creditSummary(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin.from("subscription_credits")
    .select("quantity,status,credit_type,plan_id")
    .eq("user_id", userId).eq("plan_id", "member");
  if (error) throw error;
  const rows = (data || []).filter((row) => row.credit_type === "free_month");
  const sum = (statuses: string[]) => rows.filter((row) => statuses.includes(String(row.status)))
    .reduce((total, row) => total + Math.max(0, Number(row.quantity || 0)), 0);
  return {
    available: sum(["available"]), reserved: sum(["reserved"]), applied: sum(["applied"]),
    reversed: sum(["reversed"]), remaining: sum(["available", "reserved"]),
    earned: sum(["available", "reserved", "applied"])
  };
}

async function buildSnapshot(admin: ReturnType<typeof createClient>, userId: string) {
  const [subscriptionResult, referralResult, creditResult, paymentResult, codeResult, choiceResult, entitlementResult, accessResult] = await Promise.all([
    admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("subscription_referrals").select("status").eq("referrer_user_id", userId),
    admin.from("subscription_credits")
      .select("id,credit_type,quantity,status,source,reason,reserved_for_period_start,reserved_for_period_end")
      .eq("user_id", userId).eq("plan_id", "member"),
    admin.from("subscription_payments").select("id,occurred_at,amount_cents,currency,status,description")
      .eq("user_id", userId).order("occurred_at", { ascending: false }).limit(25),
    admin.from("referral_codes").select("code").eq("user_id", userId).maybeSingle(),
    admin.from("registration_choices").select("requested_plan").eq("user_id", userId).maybeSingle(),
    admin.from("subscription_credit_entitlements")
      .select("id,credit_id,status,starts_at,ends_at,source,source_reference")
      .eq("user_id", userId).eq("status", "active").gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("account_access").select("membership_tier,membership_source,subscription_status")
      .eq("user_id", userId).maybeSingle()
  ]);
  for (const result of [subscriptionResult, referralResult, creditResult, paymentResult, codeResult, choiceResult, entitlementResult, accessResult]) {
    if (result.error) throw result.error;
  }

  let code = codeResult.data?.code || null;
  if (!code) {
    const ensured = await admin.rpc("ensure_referral_code", { target_user: userId });
    if (ensured.error) throw ensured.error;
    code = ensured.data || null;
  }

  const sub = subscriptionResult.data;
  const entitlement = entitlementResult.data;
  const referrals = referralResult.data || [];
  const credits = creditResult.data || [];
  const payments = paymentResult.data || [];
  const qualifiedReferrals = referrals.filter((row) => row.status === "qualified").length;
  const pendingReferrals = referrals.filter((row) => ["pending", "subscribed"].includes(String(row.status))).length;
  const reversedReferrals = referrals.filter((row) => row.status === "reversed").length;
  const free = credits.filter((row) => row.credit_type === "free_month");
  const sum = (statuses: string[]) => free.filter((row) => statuses.includes(String(row.status)))
    .reduce((total, row) => total + Number(row.quantity || 0), 0);
  const reserved = free.filter((row) => row.status === "reserved")
    .sort((a, b) => String(a.reserved_for_period_start || "").localeCompare(String(b.reserved_for_period_start || "")))[0] || null;

  const creditActive = Boolean(entitlement?.id);
  const nextInvoice = !creditActive && sub?.current_period_end ? {
    date: sub.current_period_end,
    amountCents: reserved ? 0 : sub.price_cents,
    currency: sub.currency || "usd",
    reason: reserved ? (reserved.source === "referral_reward" ? "Referral Reward" : (reserved.reason || "Member month credit")) : null,
    creditId: reserved?.id || null
  } : null;

  return {
    status: creditActive ? "credit_active" : (sub?.status || "not_configured"),
    plan: creditActive ? "member" : (sub?.plan_id || null),
    billingInterval: sub?.billing_interval || "month",
    priceCents: creditActive ? 0 : (sub?.price_cents ?? null),
    currency: sub?.currency || "usd",
    currentPeriodStart: creditActive ? entitlement.starts_at : (sub?.current_period_start || null),
    currentPeriodEnd: creditActive ? entitlement.ends_at : (sub?.current_period_end || null),
    trialEndsAt: sub?.trial_ends_at || null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    canceledAt: sub?.canceled_at || null,
    gracePeriodEndsAt: sub?.grace_period_ends_at || null,
    provider: sub?.provider || "stripe",
    providerCustomerId: sub?.provider_customer_id || null,
    providerSubscriptionId: sub?.provider_subscription_id || null,
    membershipSource: accessResult.data?.membership_source || null,
    requestedPlan: choiceResult.data?.requested_plan || null,
    creditEntitlement: entitlement ? {
      id: entitlement.id, creditId: entitlement.credit_id, status: entitlement.status,
      startsAt: entitlement.starts_at, endsAt: entitlement.ends_at,
      source: entitlement.source, sourceReference: entitlement.source_reference
    } : null,
    nextInvoice,
    referral: {
      code,
      successfulReferrals: qualifiedReferrals,
      qualifiedReferrals,
      pendingReferrals,
      reversedReferrals,
      progressToNextReward: qualifiedReferrals % 5,
      rewardEvery: 5,
      freeMonthsEarned: sum(["available", "reserved", "applied"]),
      freeMonthsUsed: sum(["applied"]),
      freeMonthsRemaining: sum(["available", "reserved"])
    },
    paymentHistory: payments.map((row) => ({
      id: row.id, createdAt: row.occurred_at, amountCents: row.amount_cents,
      currency: row.currency, status: row.status, description: row.description || "Subscription payment"
    })),
    refreshedAt: new Date().toISOString(),
    source: "stripe_backend"
  };
}

async function requireAdmin(admin: ReturnType<typeof createClient>, actorUserId: string) {
  const { data, error } = await admin.from("account_access")
    .select("account_role,account_status").eq("user_id", actorUserId).maybeSingle();
  if (error) throw error;
  const role = String(data?.account_role || "user").toLowerCase();
  if (!data || data.account_status !== "active" || !["owner", "admin"].includes(role)) {
    throw new Error("Owner or Admin access is required for subscription administration.");
  }
  return role;
}

async function buildAdminHealth(admin: ReturnType<typeof createClient>, userId: string) {
  const [sub, access, credits, entitlement, referrals, outbox, events] = await Promise.all([
    admin.from("subscriptions").select("id,plan_id,status,billing_interval,current_period_end,cancel_at_period_end,provider,provider_customer_id,provider_subscription_id,updated_at").eq("user_id", userId).maybeSingle(),
    admin.from("account_access").select("account_role,account_status,membership_tier,membership_source,subscription_status,updated_at").eq("user_id", userId).maybeSingle(),
    creditSummary(admin, userId),
    admin.from("subscription_credit_entitlements").select("id,credit_id,status,starts_at,ends_at,source").eq("user_id", userId).eq("status", "active").order("ends_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("subscription_referrals").select("status").eq("referrer_user_id", userId),
    admin.from("subscription_notification_outbox").select("id,status,event_type,attempts,last_error,updated_at").eq("user_id", userId).in("status", ["pending", "processing", "failed"]).order("updated_at", { ascending: false }).limit(50),
    admin.from("subscription_events").select("id,event_type,event_status,provider_event_id,processed_at,created_at").eq("user_id", userId).in("event_status", ["processing", "failed"]).order("created_at", { ascending: false }).limit(25)
  ]);
  for (const result of [sub, access, entitlement, referrals, outbox, events]) if (result.error) throw result.error;

  const referralRows = referrals.data || [];
  const outboxRows = outbox.data || [];
  const eventRows = events.data || [];
  const activeCredit = entitlement.data && new Date(entitlement.data.ends_at).getTime() > Date.now() ? entitlement.data : null;
  const stripeActive = ["active", "trialing"].includes(String(sub.data?.status || ""));
  const flags: string[] = [];
  if (stripeActive && access.data?.membership_source !== "subscription") flags.push("Stripe is active but account_access is not using subscription access.");
  if (activeCredit && access.data?.membership_source !== "subscription_credit") flags.push("A Member credit entitlement is active but account_access is not using subscription_credit.");
  if (!stripeActive && !activeCredit && access.data?.membership_source === "subscription") flags.push("account_access still reports subscription access after Stripe stopped providing active access.");
  if (outboxRows.some((row) => row.status === "failed")) flags.push("One or more transactional subscription emails need retry attention.");
  if (eventRows.some((row) => row.event_status === "failed")) flags.push("One or more Stripe webhook events are in failed state.");

  return {
    userId,
    healthy: flags.length === 0,
    flags,
    account: access.data || null,
    subscription: sub.data || null,
    credits,
    creditEntitlement: activeCredit,
    referrals: {
      qualified: referralRows.filter((row) => row.status === "qualified").length,
      pending: referralRows.filter((row) => ["pending", "subscribed"].includes(String(row.status))).length,
      reversed: referralRows.filter((row) => row.status === "reversed").length,
      expired: referralRows.filter((row) => row.status === "expired").length
    },
    notifications: {
      pending: outboxRows.filter((row) => row.status === "pending").length,
      processing: outboxRows.filter((row) => row.status === "processing").length,
      failed: outboxRows.filter((row) => row.status === "failed").length,
      rows: outboxRows.slice(0, 10)
    },
    webhook: {
      failed: eventRows.filter((row) => row.event_status === "failed").length,
      processing: eventRows.filter((row) => row.event_status === "processing").length,
      rows: eventRows.slice(0, 10)
    },
    checkedAt: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service configuration is unavailable." }, 503);
    if (!stripeKey) return json({ error: "Stripe is not activated yet." }, 503);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication is required." }, 401);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id) return json({ error: "The authentication session is invalid or expired." }, 401);

    const stripe = new Stripe(stripeKey);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action, 40).toLowerCase();

    if (action === "snapshot") {
      await reconcileCreditEntitlement(admin, user.id);
      return json(await buildSnapshot(admin, user.id));
    }

    if (action === "admin_credit_snapshot") {
      await requireAdmin(admin, user.id);
      const targetUserId = text(body.userId, 64);
      if (!targetUserId) return json({ error: "Choose a member account." }, 400);
      const { data: target, error } = await admin.from("account_access").select("user_id").eq("user_id", targetUserId).maybeSingle();
      if (error) throw error;
      if (!target?.user_id) return json({ error: "That member account was not found." }, 404);
      const entitlement = await admin.from("subscription_credit_entitlements")
        .select("id,starts_at,ends_at,status,source").eq("user_id", targetUserId).eq("status", "active")
        .order("ends_at", { ascending: false }).limit(1).maybeSingle();
      if (entitlement.error) throw entitlement.error;
      return json({ userId: targetUserId, ...(await creditSummary(admin, targetUserId)), creditEntitlement: entitlement.data || null });
    }

    if (action === "admin_subscription_health") {
      await requireAdmin(admin, user.id);
      const targetUserId = text(body.userId, 64);
      if (!targetUserId) return json({ error: "Choose a member account." }, 400);
      return json(await buildAdminHealth(admin, targetUserId));
    }

    if (action === "admin_retry_notifications") {
      await requireAdmin(admin, user.id);
      const targetUserId = text(body.userId, 64);
      if (!targetUserId) return json({ error: "Choose a member account." }, 400);
      const { data: failed, error } = await admin.from("subscription_notification_outbox")
        .select("id").eq("user_id", targetUserId).eq("status", "failed").order("created_at").limit(50);
      if (error) throw error;
      let sent = 0;
      let remainingFailed = 0;
      for (const row of failed || []) {
        await admin.from("subscription_notification_outbox").update({ not_before: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "failed");
        try {
          const result = await deliverSubscriptionNotification(admin, row.id);
          if (result?.delivered) sent += 1;
        } catch { remainingFailed += 1; }
      }
      return json({ ok: remainingFailed === 0, attempted: failed?.length || 0, sent, remainingFailed });
    }

    if (action === "admin_credit") {
      const actorRole = await requireAdmin(admin, user.id);
      const targetUserId = text(body.userId, 64);
      const months = asInt(body.months);
      const reason = text(body.reason, 500);
      if (!targetUserId) return json({ error: "Choose a member account." }, 400);
      if (months < 1 || months > 60) return json({ error: "Add between 1 and 60 Member months at a time." }, 400);
      if (reason.length < 3) return json({ error: "Enter a short reason for this subscription credit." }, 400);
      const { data: target, error: targetError } = await admin.from("account_access").select("user_id").eq("user_id", targetUserId).maybeSingle();
      if (targetError) throw targetError;
      if (!target?.user_id) return json({ error: "That member account was not found." }, 404);

      const grantId = crypto.randomUUID();
      const rows = Array.from({ length: months }, (_, index) => ({
        user_id: targetUserId, plan_id: "member", credit_type: "free_month", quantity: 1,
        source: "admin", source_reference: `admin:${grantId}:${index + 1}`, status: "available",
        created_by: user.id, reason,
        metadata: { grant_id: grantId, grant_month: index + 1, grant_months: months, actor_role: actorRole }
      }));
      const { error: insertError } = await admin.from("subscription_credits").insert(rows);
      if (insertError) throw insertError;
      const { error: auditError } = await admin.from("admin_audit_log").insert({
        actor_user_id: user.id, target_user_id: targetUserId, action: "subscription_credit_added",
        reason: `${reason} · ${months} Member month${months === 1 ? "" : "s"} added`
      });
      if (auditError) throw auditError;

      const entitlement = await reconcileCreditEntitlement(admin, targetUserId);
      const summary = await creditSummary(admin, targetUserId);
      await queueNotification(admin, {
        userId: targetUserId, eventType: "admin_credit_added", dedupeKey: `admin-credit:${grantId}`,
        payload: { monthsAdded: months, reason, freeMonthsRemaining: summary.remaining, plan: "member" }
      });
      return json({ ok: true, monthsAdded: months, ...summary, creditEntitlement: entitlement });
    }

    const { data: current, error: currentError } = await admin.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    if (currentError) throw currentError;

    if (action === "checkout") {
      const planId = text(body.planId, 20).toLowerCase();
      const billingInterval = text(body.billingInterval, 10).toLowerCase();
      if (planId === "founder") return json({ error: "Founder access is assigned internally and is not available for public signup." }, 403);
      if (planId === "business") return json({ error: "HerdHarbor Business is coming soon." }, 409);
      if (planId === "junior") return json({ error: "HerdHarbor Junior is free and does not use Stripe checkout." }, 400);
      if (planId !== "member" || billingInterval !== "month") return json({ error: "HerdHarbor Member is currently offered month-to-month at $14.99 per month." }, 400);
      if (ACTIVE_SUBSCRIPTION.has(String(current?.status || "")) && current?.provider_customer_id) return json({ error: "This account already has a subscription. Use Manage billing instead." }, 409);
      const { data: activeCredit, error: creditError } = await admin.from("subscription_credit_entitlements")
        .select("ends_at").eq("user_id", user.id).eq("status", "active").gt("ends_at", new Date().toISOString()).maybeSingle();
      if (creditError) throw creditError;
      if (activeCredit?.ends_at) return json({ error: `A complimentary Member month is active through ${new Date(activeCredit.ends_at).toLocaleDateString("en-US")}. Paid checkout can begin after that access period ends.` }, 409);

      const origin = text(body.origin, 500);
      if (!/^https:\/\//i.test(origin) && !/^http:\/\/localhost(?::\d+)?$/i.test(origin)) return json({ error: "A valid HerdHarbor return URL is required." }, 400);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription", line_items: [{ price: MEMBER_MONTH.priceId, quantity: 1 }],
        success_url: `${origin}?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}?subscription=canceled`,
        customer: current?.provider_customer_id || undefined,
        customer_email: current?.provider_customer_id ? undefined : user.email || undefined,
        client_reference_id: user.id, allow_promotion_codes: true, automatic_tax: { enabled: true },
        metadata: { herdharbor_user_id: user.id, herdharbor_plan: "member", herdharbor_interval: "month" },
        subscription_data: { metadata: { herdharbor_user_id: user.id, herdharbor_plan: "member", herdharbor_interval: "month" } }
      });
      return json({ url: session.url });
    }

    if (!current?.provider_subscription_id && action !== "portal") return json({ error: "No Stripe subscription is connected to this account." }, 409);

    if (action === "portal") {
      if (!current?.provider_customer_id) return json({ error: "No Stripe customer is connected to this account." }, 409);
      const origin = text(body.origin, 500);
      if (!/^https:\/\//i.test(origin) && !/^http:\/\/localhost(?::\d+)?$/i.test(origin)) return json({ error: "A valid HerdHarbor return URL is required." }, 400);
      const portal = await stripe.billingPortal.sessions.create({ customer: current.provider_customer_id, return_url: origin });
      return json({ url: portal.url });
    }

    if (action === "cancel") {
      const sub = await stripe.subscriptions.update(current.provider_subscription_id, { cancel_at_period_end: true });
      await queueNotification(admin, {
        userId: user.id, subscriptionId: current.id, eventType: "subscription_canceled",
        dedupeKey: `cancel:${sub.id}:${sub.current_period_end}`,
        payload: { plan: current.plan_id || "member", accessEndsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : current.current_period_end, cancelAtPeriodEnd: true }
      });
      return json({ ok: true, cancelAtPeriodEnd: sub.cancel_at_period_end });
    }
    if (action === "reactivate") {
      const sub = await stripe.subscriptions.update(current.provider_subscription_id, { cancel_at_period_end: false });
      return json({ ok: true, cancelAtPeriodEnd: sub.cancel_at_period_end });
    }

    return json({ error: "Unsupported billing action." }, 400);
  } catch (error) {
    console.error("subscription-billing", error);
    return json({ error: error instanceof Error ? error.message : "The billing request could not be completed." }, 500);
  }
});
