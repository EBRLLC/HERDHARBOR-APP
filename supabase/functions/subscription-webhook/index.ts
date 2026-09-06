import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import Stripe from "https://esm.sh/stripe@18?target=denonext";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" }
});
const ACTIVE = new Set(["active", "trialing"]);
const PAYMENT_EVENTS = new Set(["invoice.payment_succeeded", "invoice.paid"]);

const iso = (seconds: unknown) => Number.isFinite(Number(seconds)) && Number(seconds) > 0
  ? new Date(Number(seconds) * 1000).toISOString()
  : null;
const stringId = (value: unknown) => typeof value === "string" ? value : (value && typeof value === "object" && "id" in value ? String((value as { id?: unknown }).id || "") : "");
const timeValue = (value: unknown) => {
  const parsed = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const eventOccurredAt = iso(event.created) || new Date().toISOString();

  // Stripe retries deliveries and can deliver events out of order. A processed
  // event is final, a currently-processing duplicate is ignored, and a failed
  // event is explicitly reclaimed so a transient database/network error cannot
  // leave subscription state stale forever.
  let eventRowId: string | undefined;
  const { data: priorEvent, error: priorError } = await admin
    .from("subscription_events")
    .select("id,event_status")
    .eq("provider", "stripe")
    .eq("provider_event_id", event.id)
    .maybeSingle();
  if (priorError) {
    console.error("stripe-webhook-prior-event", priorError);
    return json({ error: "Could not inspect webhook event state." }, 500);
  }

  if (priorEvent?.id) {
    if (priorEvent.event_status === "processed") return json({ received: true, duplicate: true });
    if (priorEvent.event_status === "processing") return json({ received: true, duplicate: true, processing: true });
    const { data: reclaimed, error: reclaimError } = await admin
      .from("subscription_events")
      .update({ event_status: "processing", processed_at: null })
      .eq("id", priorEvent.id)
      .eq("event_status", "failed")
      .select("id")
      .maybeSingle();
    if (reclaimError) {
      console.error("stripe-webhook-reclaim", reclaimError);
      return json({ error: "Could not reclaim failed webhook event." }, 500);
    }
    if (!reclaimed?.id) return json({ received: true, duplicate: true });
    eventRowId = reclaimed.id;
  } else {
    const { data: claimed, error: claimError } = await admin
      .from("subscription_events")
      .insert({
        provider: "stripe",
        provider_event_id: event.id,
        event_type: event.type,
        event_status: "processing",
        occurred_at: eventOccurredAt,
        payload: { object_id: stringId((event.data.object as { id?: unknown })?.id), livemode: event.livemode }
      })
      .select("id")
      .maybeSingle();

    if (claimError) {
      // A concurrent delivery may have won the unique-key race after our prior
      // lookup. Treat only that race as a duplicate; all other failures retry.
      if (claimError.code === "23505") return json({ received: true, duplicate: true });
      console.error("stripe-webhook-claim", claimError);
      return json({ error: "Could not claim webhook event." }, 500);
    }
    eventRowId = claimed?.id;
  }

  async function lookupPrice(priceId: string) {
    if (!priceId) return null;
    const { data, error } = await admin
      .from("subscription_plan_prices")
      .select("plan_id,billing_interval,price_cents,currency,provider_price_id")
      .eq("provider_price_id", priceId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function accessStatus(userId: string, status: string, planId?: string | null) {
    const { data: access, error } = await admin
      .from("account_access")
      .select("membership_source,membership_tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const protectedSource = ["manual_override", "founder"].includes(String(access?.membership_source || "").toLowerCase());
    const patch: Record<string, unknown> = { subscription_status: status, updated_at: new Date().toISOString() };
    if (!protectedSource && planId && ACTIVE.has(status)) {
      patch.membership_tier = planId;
      patch.membership_source = "subscription";
    }
    const { error: updateError } = await admin.from("account_access").update(patch).eq("user_id", userId);
    if (updateError) throw updateError;
  }

  async function upsertSubscription(subscription: Stripe.Subscription) {
    const raw = subscription as unknown as Record<string, any>;
    const item = raw.items?.data?.[0];
    const priceId = stringId(item?.price);
    const mapped = await lookupPrice(priceId);
    const userFromMetadata = String(raw.metadata?.herdharbor_user_id || "").trim();
    const existingResult = await admin
      .from("subscriptions")
      .select("id,user_id,plan_id,status,provider_updated_at")
      .eq("provider", "stripe")
      .eq("provider_subscription_id", subscription.id)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;
    const userId = userFromMetadata || existingResult.data?.user_id || "";
    if (!userId) throw new Error(`Stripe subscription ${subscription.id} is missing a HerdHarbor user id.`);

    const eventTime = timeValue(eventOccurredAt);
    const storedTime = timeValue(existingResult.data?.provider_updated_at);
    if (existingResult.data?.id && storedTime > eventTime) {
      // A newer Stripe event was already applied. Mark this event processed but
      // never roll the account back to older subscription data.
      return {
        userId,
        subscriptionRowId: existingResult.data.id,
        planId: existingResult.data.plan_id,
        status: existingResult.data.status
      };
    }

    const customerId = stringId(raw.customer);
    const status = String(raw.status || "incomplete");
    const planId = mapped?.plan_id || String(raw.metadata?.herdharbor_plan || "").trim() || null;
    const billingInterval = mapped?.billing_interval || String(raw.metadata?.herdharbor_interval || "month");
    const periodStart = raw.current_period_start ?? item?.current_period_start;
    const periodEnd = raw.current_period_end ?? item?.current_period_end;
    const payload = {
      user_id: userId,
      plan_id: planId,
      status,
      billing_interval: billingInterval === "year" ? "year" : "month",
      price_cents: mapped?.price_cents ?? item?.price?.unit_amount ?? null,
      currency: mapped?.currency || item?.price?.currency || "usd",
      provider: "stripe",
      provider_customer_id: customerId || null,
      provider_subscription_id: subscription.id,
      current_period_start: iso(periodStart),
      current_period_end: iso(periodEnd),
      trial_ends_at: iso(raw.trial_end),
      cancel_at_period_end: raw.cancel_at_period_end === true,
      canceled_at: iso(raw.canceled_at),
      provider_updated_at: eventOccurredAt,
      updated_at: new Date().toISOString(),
      metadata: { stripe_price_id: priceId, livemode: event.livemode }
    };
    const { data: saved, error } = await admin
      .from("subscriptions")
      .upsert(payload, { onConflict: "user_id" })
      .select("id")
      .single();
    if (error) throw error;
    await accessStatus(userId, status, planId);
    return { userId, subscriptionRowId: saved.id, planId, status };
  }

  async function resolveInvoiceContext(invoice: Stripe.Invoice) {
    const raw = invoice as unknown as Record<string, any>;
    const subscriptionId = stringId(raw.subscription) || stringId(raw.parent?.subscription_details?.subscription);
    if (subscriptionId) {
      const { data, error } = await admin
        .from("subscriptions")
        .select("id,user_id,plan_id")
        .eq("provider", "stripe")
        .eq("provider_subscription_id", subscriptionId)
        .maybeSingle();
      if (error) throw error;
      if (data) return { ...data, subscriptionId };
    }
    const customerId = stringId(raw.customer);
    if (customerId) {
      const { data, error } = await admin
        .from("subscriptions")
        .select("id,user_id,plan_id,provider_subscription_id")
        .eq("provider", "stripe")
        .eq("provider_customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      if (data) return { id: data.id, user_id: data.user_id, plan_id: data.plan_id, subscriptionId: data.provider_subscription_id };
    }
    return null;
  }

  try {
    let context: { userId?: string; subscriptionRowId?: string; planId?: string | null; status?: string } | null = null;

    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      context = await upsertSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = stringId(session.subscription);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        context = await upsertSubscription(subscription);
      }
    } else if (PAYMENT_EVENTS.has(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceContext = await resolveInvoiceContext(invoice);
      if (invoiceContext) {
        const raw = invoice as unknown as Record<string, any>;
        const { error } = await admin.from("subscription_payments").upsert({
          user_id: invoiceContext.user_id,
          subscription_id: invoiceContext.id,
          provider: "stripe",
          provider_payment_id: invoice.id,
          amount_cents: Math.max(0, Number(raw.amount_paid || 0)),
          currency: String(raw.currency || "usd"),
          status: "paid",
          description: "HerdHarbor subscription payment",
          invoice_url: raw.hosted_invoice_url || null,
          occurred_at: iso(raw.status_transitions?.paid_at) || eventOccurredAt,
          metadata: { stripe_invoice_id: invoice.id, livemode: event.livemode }
        }, { onConflict: "provider,provider_payment_id" });
        if (error) throw error;
        context = { userId: invoiceContext.user_id, subscriptionRowId: invoiceContext.id, planId: invoiceContext.plan_id, status: "active" };
      }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceContext = await resolveInvoiceContext(invoice);
      if (invoiceContext) {
        const { error: updateError } = await admin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("id", invoiceContext.id);
        if (updateError) throw updateError;
        await accessStatus(invoiceContext.user_id, "past_due", invoiceContext.plan_id);
        context = { userId: invoiceContext.user_id, subscriptionRowId: invoiceContext.id, planId: invoiceContext.plan_id, status: "past_due" };
      }
    }

    if (eventRowId) {
      const { error } = await admin.from("subscription_events").update({
        user_id: context?.userId || null,
        subscription_id: context?.subscriptionRowId || null,
        event_status: "processed",
        processed_at: new Date().toISOString()
      }).eq("id", eventRowId);
      if (error) throw error;
    }
    return json({ received: true });
  } catch (error) {
    console.error("subscription-webhook", event.type, event.id, error);
    if (eventRowId) {
      await admin.from("subscription_events").update({ event_status: "failed", processed_at: new Date().toISOString() }).eq("id", eventRowId);
    }
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, 500);
  }
});
