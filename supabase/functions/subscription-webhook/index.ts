import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import Stripe from "https://esm.sh/stripe@18?target=denonext";
import { deliverSubscriptionNotification } from "../_shared/subscription-email.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" }
});
const ACTIVE = new Set(["active", "trialing"]);
const PAYMENT_EVENTS = new Set(["invoice.payment_succeeded", "invoice.paid"]);
const FREE_MONTH_COUPON_ID = "herdharbor-member-free-month";

const iso = (seconds: unknown) => Number.isFinite(Number(seconds)) && Number(seconds) > 0
  ? new Date(Number(seconds) * 1000).toISOString()
  : null;
const stringId = (value: unknown) => typeof value === "string"
  ? value
  : (value && typeof value === "object" && "id" in value ? String((value as { id?: unknown }).id || "") : "");
const timeValue = (value: unknown) => {
  const parsed = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};
const invoiceRaw = (invoice: Stripe.Invoice) => invoice as unknown as Record<string, any>;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !stripeKey || !webhookSecret) {
    return json({ error: "Webhook configuration is unavailable." }, 503);
  }

  const stripe = new Stripe(stripeKey);
  const signature = req.headers.get("Stripe-Signature") || "";
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (error) {
    console.error("stripe-webhook-signature", error);
    return json({ error: "Invalid Stripe webhook signature." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const eventOccurredAt = iso(event.created) || new Date().toISOString();

  let eventRowId: string | undefined;
  const { data: priorEvent, error: priorError } = await admin
    .from("subscription_events")
    .select("id,event_status")
    .eq("provider", "stripe")
    .eq("provider_event_id", event.id)
    .maybeSingle();
  if (priorError) return json({ error: "Could not inspect webhook event state." }, 500);

  if (priorEvent?.id) {
    if (priorEvent.event_status === "processed") return json({ received: true, duplicate: true });
    if (priorEvent.event_status === "processing") return json({ received: true, duplicate: true, processing: true });
    const { data: reclaimed, error } = await admin.from("subscription_events")
      .update({ event_status: "processing", processed_at: null })
      .eq("id", priorEvent.id).eq("event_status", "failed").select("id").maybeSingle();
    if (error) return json({ error: "Could not reclaim failed webhook event." }, 500);
    if (!reclaimed?.id) return json({ received: true, duplicate: true });
    eventRowId = reclaimed.id;
  } else {
    const { data: claimed, error } = await admin.from("subscription_events").insert({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      event_status: "processing",
      occurred_at: eventOccurredAt,
      payload: { object_id: stringId((event.data.object as { id?: unknown })?.id), livemode: event.livemode }
    }).select("id").maybeSingle();
    if (error) {
      if (error.code === "23505") return json({ received: true, duplicate: true });
      return json({ error: "Could not claim webhook event." }, 500);
    }
    eventRowId = claimed?.id;
  }

  async function lookupPrice(priceId: string) {
    if (!priceId) return null;
    const { data, error } = await admin.from("subscription_plan_prices")
      .select("plan_id,billing_interval,price_cents,currency,provider_price_id")
      .eq("provider_price_id", priceId).eq("active", true).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function queueNotification(input: {
    userId: string;
    subscriptionId?: string | null;
    eventType: string;
    dedupeKey: string;
    payload?: Record<string, unknown>;
    notBefore?: string;
  }) {
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
      const { data: existing, error: existingError } = await admin.from("subscription_notification_outbox")
        .select("id").eq("dedupe_key", input.dedupeKey).maybeSingle();
      if (existingError) throw existingError;
      outboxId = existing?.id || null;
    }
    if (outboxId) await deliverSubscriptionNotification(admin, outboxId);
    return outboxId;
  }

  async function deliverQueuedByDedupe(dedupeKey: string) {
    const { data, error } = await admin.from("subscription_notification_outbox")
      .select("id").eq("dedupe_key", dedupeKey).maybeSingle();
    if (error) throw error;
    if (data?.id) await deliverSubscriptionNotification(admin, data.id);
  }

  async function accessStatus(userId: string, status: string, planId?: string | null) {
    const { data: access, error } = await admin.from("account_access")
      .select("membership_source,membership_tier").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const source = String(access?.membership_source || "").toLowerCase();
    const protectedSource = ["manual_override", "founder"].includes(source);
    const patch: Record<string, unknown> = { subscription_status: status, updated_at: new Date().toISOString() };
    if (!protectedSource && planId && ACTIVE.has(status)) {
      patch.membership_tier = planId;
      patch.membership_source = "subscription";
    }
    const { error: updateError } = await admin.from("account_access").update(patch).eq("user_id", userId);
    if (updateError) throw updateError;
  }

  async function setJuniorFallback(userId: string, status = "expired") {
    const { data: access, error } = await admin.from("account_access")
      .select("account_role,membership_source,membership_tier")
      .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const role = String(access?.account_role || "user").toLowerCase();
    const source = String(access?.membership_source || "default").toLowerCase();
    const tier = String(access?.membership_tier || "member").toLowerCase();
    if (["owner", "admin"].includes(role) || ["founder", "manual_override"].includes(source) || tier === "founder") return false;
    const { error: updateError } = await admin.from("account_access").update({
      membership_tier: "junior",
      membership_source: "default",
      subscription_status: status,
      updated_at: new Date().toISOString()
    }).eq("user_id", userId);
    if (updateError) throw updateError;
    return true;
  }

  async function upsertSubscription(subscription: Stripe.Subscription) {
    const raw = subscription as unknown as Record<string, any>;
    const item = raw.items?.data?.[0];
    const priceId = stringId(item?.price);
    const mapped = await lookupPrice(priceId);
    const userFromMetadata = String(raw.metadata?.herdharbor_user_id || "").trim();
    const existingResult = await admin.from("subscriptions")
      .select("id,user_id,plan_id,status,provider_updated_at")
      .eq("provider", "stripe").eq("provider_subscription_id", subscription.id).maybeSingle();
    if (existingResult.error) throw existingResult.error;
    const userId = userFromMetadata || existingResult.data?.user_id || "";
    if (!userId) throw new Error(`Stripe subscription ${subscription.id} is missing a HerdHarbor user id.`);

    if (existingResult.data?.id && timeValue(existingResult.data.provider_updated_at) > timeValue(eventOccurredAt)) {
      return { userId, subscriptionRowId: existingResult.data.id, planId: existingResult.data.plan_id, status: existingResult.data.status };
    }

    const status = String(raw.status || "incomplete");
    const planId = mapped?.plan_id || String(raw.metadata?.herdharbor_plan || "").trim() || null;
    const billingInterval = mapped?.billing_interval || String(raw.metadata?.herdharbor_interval || "month");
    const payload = {
      user_id: userId,
      plan_id: planId,
      status,
      billing_interval: billingInterval === "year" ? "year" : "month",
      price_cents: mapped?.price_cents ?? item?.price?.unit_amount ?? null,
      currency: mapped?.currency || item?.price?.currency || "usd",
      provider: "stripe",
      provider_customer_id: stringId(raw.customer) || null,
      provider_subscription_id: subscription.id,
      current_period_start: iso(raw.current_period_start ?? item?.current_period_start),
      current_period_end: iso(raw.current_period_end ?? item?.current_period_end),
      trial_ends_at: iso(raw.trial_end),
      cancel_at_period_end: raw.cancel_at_period_end === true,
      canceled_at: iso(raw.canceled_at),
      provider_updated_at: eventOccurredAt,
      updated_at: new Date().toISOString(),
      metadata: { stripe_price_id: priceId, livemode: event.livemode }
    };
    const { data: saved, error } = await admin.from("subscriptions")
      .upsert(payload, { onConflict: "user_id" }).select("id").single();
    if (error) throw error;
    await accessStatus(userId, status, planId);
    return { userId, subscriptionRowId: saved.id, planId, status };
  }

  async function resolveInvoiceContext(invoice: Stripe.Invoice) {
    const raw = invoiceRaw(invoice);
    const subscriptionId = stringId(raw.subscription) || stringId(raw.parent?.subscription_details?.subscription);
    const select = "id,user_id,plan_id,billing_interval,price_cents,currency,current_period_start,current_period_end,provider_subscription_id";
    if (subscriptionId) {
      const { data, error } = await admin.from("subscriptions").select(select)
        .eq("provider", "stripe").eq("provider_subscription_id", subscriptionId).maybeSingle();
      if (error) throw error;
      if (data) return { ...data, subscriptionId };
    }
    const customerId = stringId(raw.customer);
    if (customerId) {
      const { data, error } = await admin.from("subscriptions").select(select)
        .eq("provider", "stripe").eq("provider_customer_id", customerId).maybeSingle();
      if (error) throw error;
      if (data) return { ...data, subscriptionId: data.provider_subscription_id };
    }
    return null;
  }

  function invoicePeriod(invoice: Stripe.Invoice) {
    const raw = invoiceRaw(invoice);
    const line = Array.isArray(raw.lines?.data)
      ? raw.lines.data.find((row: any) => row?.period?.start && row?.period?.end) || raw.lines.data[0]
      : null;
    const startSeconds = raw.period_start ?? line?.period?.start;
    const endSeconds = raw.period_end ?? line?.period?.end;
    return { start: iso(startSeconds), end: iso(endSeconds), startSeconds: Number(startSeconds || 0), endSeconds: Number(endSeconds || 0) };
  }

  function reservationKey(invoice: Stripe.Invoice, subscriptionId: string) {
    const raw = invoiceRaw(invoice);
    const period = invoicePeriod(invoice);
    return `renewal:${subscriptionId}:${period.endSeconds || period.end || raw.id || event.id}`;
  }

  async function creditBalance(userId: string) {
    const { data, error } = await admin.from("subscription_credits")
      .select("quantity,status").eq("user_id", userId).eq("plan_id", "member").eq("credit_type", "free_month");
    if (error) throw error;
    const rows = data || [];
    const sum = (statuses: string[]) => rows.filter((row) => statuses.includes(String(row.status)))
      .reduce((total, row) => total + Math.max(0, Number(row.quantity || 0)), 0);
    return { available: sum(["available"]), reserved: sum(["reserved"]), applied: sum(["applied"]), remaining: sum(["available", "reserved"]) };
  }

  async function reserveMemberCredit(userId: string, subscriptionRowId: string, subscriptionId: string, invoice: Stripe.Invoice) {
    const key = reservationKey(invoice, subscriptionId);
    const period = invoicePeriod(invoice);
    const { data: existing, error: existingError } = await admin.from("subscription_credits")
      .select("id,user_id,source,reason,status,reservation_reference,reserved_for_period_start,reserved_for_period_end")
      .eq("user_id", userId).eq("plan_id", "member").eq("credit_type", "free_month")
      .eq("status", "reserved").eq("reservation_reference", key).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return { ...existing, newlyReserved: false, key };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date().toISOString();
      const { data: candidate, error } = await admin.from("subscription_credits")
        .select("id,source,reason").eq("user_id", userId).eq("plan_id", "member")
        .eq("credit_type", "free_month").eq("status", "available").lte("effective_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`).order("effective_at").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      if (!candidate?.id) return null;
      const { data: reserved, error: reserveError } = await admin.from("subscription_credits").update({
        status: "reserved", reserved_at: now,
        reserved_for_period_start: period.start, reserved_for_period_end: period.end,
        reservation_reference: key,
        metadata: { subscription_id: subscriptionRowId, provider_subscription_id: subscriptionId, reservation_event: event.id },
        updated_at: now
      }).eq("id", candidate.id).eq("status", "available")
        .select("id,user_id,source,reason,status,reservation_reference,reserved_for_period_start,reserved_for_period_end").maybeSingle();
      if (reserveError) throw reserveError;
      if (reserved?.id) return { ...reserved, newlyReserved: true, key };
    }
    return null;
  }

  async function ensureFreeMonthCoupon() {
    try {
      const coupon = await stripe.coupons.retrieve(FREE_MONTH_COUPON_ID);
      if (!(coupon as any)?.deleted) return coupon;
    } catch (error) {
      if (String((error as { code?: unknown })?.code || "") !== "resource_missing") throw error;
    }
    try {
      return await stripe.coupons.create({
        id: FREE_MONTH_COUPON_ID, duration: "once", percent_off: 100,
        name: "HerdHarbor Member reward month", metadata: { herdharbor_system_credit: "member_free_month" }
      });
    } catch (error) {
      const coupon = await stripe.coupons.retrieve(FREE_MONTH_COUPON_ID);
      if (!(coupon as any)?.deleted) return coupon;
      throw error;
    }
  }

  async function applyReservedCreditToInvoice(invoice: Stripe.Invoice, credit: Record<string, any>) {
    if (!credit?.id) return false;
    await ensureFreeMonthCoupon();
    const live = await stripe.invoices.retrieve(invoice.id);
    const raw = invoiceRaw(live as Stripe.Invoice);
    if (String(raw.metadata?.herdharbor_credit_id || "") === String(credit.id)) return true;
    if (String(raw.status || "") !== "draft") throw new Error(`Invoice ${invoice.id} finalized before the HerdHarbor Member credit could be applied.`);
    const existingDiscounts = Array.isArray(raw.discounts)
      ? raw.discounts.map((discount: unknown) => stringId(discount)).filter(Boolean).map((discount: string) => ({ discount }))
      : [];
    await stripe.invoices.update(invoice.id, {
      discounts: [...existingDiscounts, { coupon: FREE_MONTH_COUPON_ID }],
      metadata: {
        ...(raw.metadata || {}),
        herdharbor_credit_id: String(credit.id),
        herdharbor_credit_source: String(credit.source || "credit"),
        herdharbor_credit_reservation: String(credit.reservation_reference || ""),
        herdharbor_member_reward_month: "true"
      }
    } as any);
    return true;
  }

  async function reconcileReferralRewards(referrerUserId: string, reason: string, reference: string) {
    const [{ count, error: countError }, creditsResult, offsetsResult] = await Promise.all([
      admin.from("subscription_referrals").select("id", { count: "exact", head: true })
        .eq("referrer_user_id", referrerUserId).eq("status", "qualified"),
      admin.from("subscription_credits")
        .select("id,status,quantity,source_reference,created_at")
        .eq("user_id", referrerUserId).eq("source", "referral_reward")
        .eq("plan_id", "member").eq("credit_type", "free_month").order("created_at", { ascending: false }),
      admin.from("subscription_referral_reward_offsets")
        .select("id,months,status,created_at")
        .eq("user_id", referrerUserId).eq("status", "pending").order("created_at")
    ]);
    if (countError) throw countError;
    if (creditsResult.error) throw creditsResult.error;
    if (offsetsResult.error) throw offsetsResult.error;

    const qualified = Math.max(0, Number(count || 0));
    const desired = Math.floor(qualified / 5);
    const credits = creditsResult.data || [];
    const activeCredits = credits.filter((row) => ["available", "reserved", "applied"].includes(String(row.status)));
    const pendingOffsets = offsetsResult.data || [];
    let netGranted = activeCredits.reduce((sum, row) => sum + Math.max(0, Number(row.quantity || 0)), 0)
      - pendingOffsets.reduce((sum, row) => sum + Math.max(0, Number(row.months || 0)), 0);
    let adjusted = false;
    let restored = false;
    let earned = 0;

    if (netGranted > desired) {
      let reduction = netGranted - desired;
      for (const row of activeCredits.filter((item) => item.status === "available")) {
        if (reduction <= 0) break;
        const { data: reversed, error } = await admin.from("subscription_credits").update({
          status: "reversed", reversed_at: new Date().toISOString(),
          reversal_reason: reason, reversal_reference: reference, updated_at: new Date().toISOString()
        }).eq("id", row.id).eq("status", "available").select("id").maybeSingle();
        if (error) throw error;
        if (reversed?.id) { reduction -= Math.max(1, Number(row.quantity || 1)); adjusted = true; }
      }
      for (let i = 0; i < reduction; i += 1) {
        const { error } = await admin.from("subscription_referral_reward_offsets").insert({
          user_id: referrerUserId, months: 1, status: "pending",
          source_reference: `${reference}:offset:${i + 1}`,
          reason,
          metadata: { referral_adjustment_reference: reference }
        });
        if (error && error.code !== "23505") throw error;
        adjusted = true;
      }
      netGranted = desired;
    }

    if (netGranted < desired) {
      let increase = desired - netGranted;
      for (const offset of pendingOffsets) {
        if (increase <= 0) break;
        const { data: settled, error } = await admin.from("subscription_referral_reward_offsets").update({
          status: "settled", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq("id", offset.id).eq("status", "pending").select("id").maybeSingle();
        if (error) throw error;
        if (settled?.id) { increase -= Math.max(1, Number(offset.months || 1)); restored = true; }
      }

      for (let slot = 1; increase > 0 && slot <= desired; slot += 1) {
        const sourceReference = `qualified:${slot * 5}`;
        const { data: existing, error: existingError } = await admin.from("subscription_credits")
          .select("id,status").eq("user_id", referrerUserId).eq("source", "referral_reward")
          .eq("source_reference", sourceReference).maybeSingle();
        if (existingError) throw existingError;
        if (existing?.id && ["available", "reserved", "applied"].includes(String(existing.status))) continue;
        if (existing?.id && existing.status === "reversed") {
          const { data: reactivated, error } = await admin.from("subscription_credits").update({
            status: "available", reversed_at: null, reversal_reason: null, reversal_reference: null,
            updated_at: new Date().toISOString()
          }).eq("id", existing.id).eq("status", "reversed").select("id").maybeSingle();
          if (error) throw error;
          if (reactivated?.id) { increase -= 1; restored = true; earned += 1; }
          continue;
        }
        if (!existing?.id) {
          const { data: created, error } = await admin.from("subscription_credits").insert({
            user_id: referrerUserId, plan_id: "member", credit_type: "free_month", quantity: 1,
            source: "referral_reward", source_reference: sourceReference, status: "available",
            reason: `Referral reward — ${slot * 5} qualified referrals`,
            metadata: { qualified_referral_milestone: slot * 5, reward_months: 1 }
          }).select("id").maybeSingle();
          if (error && error.code !== "23505") throw error;
          if (created?.id || error?.code === "23505") { increase -= 1; earned += 1; }
        }
      }
    }

    const balance = await creditBalance(referrerUserId);
    if (adjusted) {
      await queueNotification({
        userId: referrerUserId,
        eventType: "referral_reward_adjusted",
        dedupeKey: `referral-adjusted:${reference}`,
        payload: { reason, qualifiedReferrals: qualified, freeMonthsRemaining: balance.remaining, plan: "member" }
      });
    } else if (restored) {
      await queueNotification({
        userId: referrerUserId,
        eventType: "referral_reward_restored",
        dedupeKey: `referral-restored:${reference}`,
        payload: { qualifiedReferrals: qualified, freeMonthsRemaining: balance.remaining, plan: "member" }
      });
    }
    if (earned > 0) {
      await queueNotification({
        userId: referrerUserId,
        eventType: "referral_reward_earned",
        dedupeKey: `referral-reward:${referrerUserId}:${qualified}:${reference}`,
        payload: { qualifiedReferrals: qualified, rewardMonths: earned, freeMonthsRemaining: balance.remaining, plan: "member" }
      });
    }
  }

  async function recordReferralRenewal(invoice: Stripe.Invoice, userId: string) {
    const raw = invoiceRaw(invoice);
    const billingReason = String(raw.billing_reason || "");
    if (billingReason === "subscription_create") {
      const { error } = await admin.from("subscription_referrals").update({
        status: "subscribed", initial_payment_at: iso(raw.status_transitions?.paid_at) || eventOccurredAt,
        updated_at: new Date().toISOString()
      }).eq("referred_user_id", userId).eq("status", "pending");
      if (error) throw error;
      return;
    }
    if (billingReason !== "subscription_cycle") return;
    const paidAt = iso(raw.status_transitions?.paid_at) || eventOccurredAt;
    const { data: qualified, error } = await admin.from("subscription_referrals").update({
      status: "qualified", first_renewal_paid_at: paidAt, qualifying_invoice_id: invoice.id,
      qualified_at: paidAt, reversed_at: null, reversal_reason: null, reversal_reference: null,
      updated_at: new Date().toISOString()
    }).eq("referred_user_id", userId).in("status", ["pending", "subscribed"])
      .select("id,referrer_user_id");
    if (error) throw error;
    for (const row of qualified || []) await reconcileReferralRewards(String(row.referrer_user_id), "Referral qualified", `qualification:${row.id}:${invoice.id}`);
  }

  async function reverseReferralForInvoice(invoiceId: string, reason: string, reference: string) {
    if (!invoiceId) return [];
    const { data: reversed, error } = await admin.from("subscription_referrals").update({
      status: "reversed", reversed_at: new Date().toISOString(),
      reversal_reason: reason, reversal_reference: reference, updated_at: new Date().toISOString()
    }).eq("qualifying_invoice_id", invoiceId).eq("status", "qualified")
      .select("id,referrer_user_id,referred_user_id");
    if (error) throw error;
    for (const row of reversed || []) await reconcileReferralRewards(String(row.referrer_user_id), reason, `referral-reversal:${row.id}:${reference}`);
    return reversed || [];
  }

  async function restoreReferralForInvoice(invoiceId: string, reference: string) {
    if (!invoiceId) return [];
    const { data: restored, error } = await admin.from("subscription_referrals").update({
      status: "qualified", reversed_at: null, reversal_reason: null, reversal_reference: null,
      updated_at: new Date().toISOString()
    }).eq("qualifying_invoice_id", invoiceId).eq("status", "reversed")
      .eq("reversal_reference", reference).select("id,referrer_user_id,referred_user_id");
    if (error) throw error;
    for (const row of restored || []) await reconcileReferralRewards(String(row.referrer_user_id), "Stripe dispute resolved in the member's favor", `referral-restoration:${row.id}:${reference}`);
    return restored || [];
  }

  async function markCreditApplied(invoice: Stripe.Invoice, userId: string) {
    const raw = invoiceRaw(invoice);
    const creditId = String(raw.metadata?.herdharbor_credit_id || "").trim();
    if (!creditId) return;
    const { data: credit, error } = await admin.from("subscription_credits").update({
      status: "applied", applied_at: iso(raw.status_transitions?.paid_at) || eventOccurredAt,
      applied_reference: invoice.id, updated_at: new Date().toISOString()
    }).eq("id", creditId).eq("user_id", userId).eq("status", "reserved")
      .select("id,source,reason").maybeSingle();
    if (error) throw error;
    if (!credit?.id) return;
    const balance = await creditBalance(userId);
    await queueNotification({
      userId, eventType: "free_month_applied", dedupeKey: `credit-applied:${credit.id}:${invoice.id}`,
      payload: {
        invoiceId: invoice.id, amountCents: 0,
        reason: credit.source === "referral_reward" ? "Referral Reward" : (credit.reason || "Member month credit"),
        creditsRemaining: balance.remaining, plan: "member"
      }
    });
  }

  async function expireUnqualifiedReferral(userId: string) {
    const { error } = await admin.from("subscription_referrals").update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("referred_user_id", userId).in("status", ["pending", "subscribed"]);
    if (error) throw error;
  }

  async function releaseFutureReservedCredits(userId: string) {
    const { error } = await admin.from("subscription_credits").update({
      status: "available", reserved_at: null, reserved_for_period_start: null,
      reserved_for_period_end: null, reservation_reference: null, updated_at: new Date().toISOString()
    }).eq("user_id", userId).eq("plan_id", "member").eq("status", "reserved");
    if (error) throw error;
  }

  async function invoiceIdFromChargeId(chargeId: string) {
    if (!chargeId) return "";
    const charge = await stripe.charges.retrieve(chargeId);
    return stringId((charge as any).invoice);
  }

  try {
    let context: { userId?: string; subscriptionRowId?: string; planId?: string | null; status?: string } | null = null;

    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      context = await upsertSubscription(event.data.object as Stripe.Subscription);
      if (event.type === "customer.subscription.deleted" && context?.userId) {
        await expireUnqualifiedReferral(context.userId);
        await releaseFutureReservedCredits(context.userId);
        const entitlement = await admin.rpc("activate_member_credit_entitlement", { target_user: context.userId, requested_start: null });
        if (entitlement.error) throw entitlement.error;
        const continuingWithCredit = entitlement.data?.active === true || entitlement.data?.activated === true;
        if (entitlement.data?.activated === true && entitlement.data?.entitlementId) {
          await deliverQueuedByDedupe(`credit-entitlement-started:${entitlement.data.entitlementId}`);
        }
        await queueNotification({
          userId: context.userId, subscriptionId: context.subscriptionRowId || null,
          eventType: "subscription_ended",
          dedupeKey: `subscription-ended:${stringId((event.data.object as Stripe.Subscription)?.id)}:${event.id}`,
          payload: { plan: context.planId || "member", fallbackPlan: continuingWithCredit ? null : "junior", continuingWithCredit }
        });
        if (!continuingWithCredit && entitlement.data?.reason !== "launch_trial" && entitlement.data?.reason !== "paid_through" && entitlement.data?.reason !== "protected_entitlement") {
          const downgraded = await setJuniorFallback(context.userId, String(context.status || "canceled"));
          if (downgraded) await queueNotification({
            userId: context.userId, subscriptionId: context.subscriptionRowId || null,
            eventType: "junior_fallback",
            dedupeKey: `junior-fallback:${stringId((event.data.object as Stripe.Subscription)?.id)}:${event.id}`,
            payload: { plan: "junior", reason: "subscription_ended" }
          });
        }
      }
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = stringId(session.subscription);
      if (subscriptionId) context = await upsertSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    } else if (event.type === "invoice.upcoming" || event.type === "invoice.created") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceContext = await resolveInvoiceContext(invoice);
      const raw = invoiceRaw(invoice);
      if (invoiceContext && invoiceContext.plan_id === "member" && invoiceContext.billing_interval === "month" && raw.billing_reason === "subscription_cycle") {
        const credit = await reserveMemberCredit(invoiceContext.user_id, invoiceContext.id, invoiceContext.subscriptionId, invoice);
        const period = invoicePeriod(invoice);
        if (credit) {
          if (event.type === "invoice.created") await applyReservedCreditToInvoice(invoice, credit);
          const balance = await creditBalance(invoiceContext.user_id);
          await queueNotification({
            userId: invoiceContext.user_id, subscriptionId: invoiceContext.id,
            eventType: "upcoming_free_renewal",
            dedupeKey: `upcoming-free:${reservationKey(invoice, invoiceContext.subscriptionId)}`,
            payload: {
              renewalDate: period.end || invoiceContext.current_period_end, amountCents: 0,
              currency: String(raw.currency || invoiceContext.currency || "usd"),
              reason: credit.source === "referral_reward" ? "Referral Reward" : (credit.reason || "Member month credit"),
              creditId: credit.id, creditsRemainingAfterRenewal: balance.available, plan: "member"
            }
          });
        } else if (event.type === "invoice.upcoming") {
          await queueNotification({
            userId: invoiceContext.user_id, subscriptionId: invoiceContext.id,
            eventType: "upcoming_paid_renewal",
            dedupeKey: `upcoming-paid:${reservationKey(invoice, invoiceContext.subscriptionId)}`,
            payload: {
              renewalDate: period.end || invoiceContext.current_period_end,
              amountCents: Math.max(0, Number(raw.amount_due ?? invoiceContext.price_cents ?? 0)),
              currency: String(raw.currency || invoiceContext.currency || "usd"), plan: "member"
            }
          });
        }
        context = { userId: invoiceContext.user_id, subscriptionRowId: invoiceContext.id, planId: invoiceContext.plan_id, status: "active" };
      }
    } else if (PAYMENT_EVENTS.has(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceContext = await resolveInvoiceContext(invoice);
      if (invoiceContext) {
        const raw = invoiceRaw(invoice);
        const { error } = await admin.from("subscription_payments").upsert({
          user_id: invoiceContext.user_id, subscription_id: invoiceContext.id, provider: "stripe",
          provider_payment_id: invoice.id, amount_cents: Math.max(0, Number(raw.amount_paid || 0)),
          currency: String(raw.currency || "usd"), status: "paid",
          description: String(raw.metadata?.herdharbor_credit_id || "") ? "HerdHarbor Member credit renewal" : "HerdHarbor subscription payment",
          invoice_url: raw.hosted_invoice_url || null,
          occurred_at: iso(raw.status_transitions?.paid_at) || eventOccurredAt,
          metadata: { stripe_invoice_id: invoice.id, livemode: event.livemode, billing_reason: raw.billing_reason || null, herdharbor_credit_id: raw.metadata?.herdharbor_credit_id || null }
        }, { onConflict: "provider,provider_payment_id" });
        if (error) throw error;
        await markCreditApplied(invoice, invoiceContext.user_id);
        await recordReferralRenewal(invoice, invoiceContext.user_id);
        context = { userId: invoiceContext.user_id, subscriptionRowId: invoiceContext.id, planId: invoiceContext.plan_id, status: "active" };
      }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceContext = await resolveInvoiceContext(invoice);
      if (invoiceContext) {
        const raw = invoiceRaw(invoice);
        const { error } = await admin.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("id", invoiceContext.id);
        if (error) throw error;
        await accessStatus(invoiceContext.user_id, "past_due", invoiceContext.plan_id);
        await queueNotification({
          userId: invoiceContext.user_id, subscriptionId: invoiceContext.id,
          eventType: "payment_failed", dedupeKey: `payment-failed:${invoice.id}:${event.id}`,
          payload: { invoiceId: invoice.id, amountCents: Math.max(0, Number(raw.amount_due || 0)), currency: String(raw.currency || "usd"), nextPaymentAttempt: iso(raw.next_payment_attempt), plan: invoiceContext.plan_id || "member" }
        });
        context = { userId: invoiceContext.user_id, subscriptionRowId: invoiceContext.id, planId: invoiceContext.plan_id, status: "past_due" };
      }
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const raw = charge as unknown as Record<string, any>;
      const fullyRefunded = Number(raw.amount || 0) > 0 && Number(raw.amount_refunded || 0) >= Number(raw.amount || 0);
      if (fullyRefunded) await reverseReferralForInvoice(stringId(raw.invoice), "A qualifying renewal was fully refunded.", `refund:${charge.id}`);
    } else if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const invoiceId = await invoiceIdFromChargeId(stringId((dispute as any).charge));
      await reverseReferralForInvoice(invoiceId, "A qualifying renewal entered a payment dispute.", `dispute:${dispute.id}`);
    } else if (event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Stripe.Dispute;
      if (String((dispute as any).status || "").toLowerCase() === "won") {
        const invoiceId = await invoiceIdFromChargeId(stringId((dispute as any).charge));
        await restoreReferralForInvoice(invoiceId, `dispute:${dispute.id}`);
      }
    }

    if (eventRowId) {
      const { error } = await admin.from("subscription_events").update({
        user_id: context?.userId || null, subscription_id: context?.subscriptionRowId || null,
        event_status: "processed", processed_at: new Date().toISOString()
      }).eq("id", eventRowId);
      if (error) throw error;
    }
    return json({ received: true });
  } catch (error) {
    console.error("subscription-webhook", event.type, event.id, error);
    if (eventRowId) await admin.from("subscription_events").update({ event_status: "failed", processed_at: new Date().toISOString() }).eq("id", eventRowId);
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, 500);
  }
});
