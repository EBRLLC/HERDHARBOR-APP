import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import Stripe from "https://esm.sh/stripe@18?target=denonext";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const PRICES: Record<string, Record<string, { priceId: string; cents: number }>> = {
  founder: {
    month: { priceId: "price_1UCOktGlRukEX5RKPo6jm6Vr", cents: 999 },
    year: { priceId: "price_1UCOwAGlRukEX5RK34xr9dQS", cents: 11000 }
  },
  member: {
    month: { priceId: "price_1UCOjrGlRukEX5RK9my06yUP", cents: 1499 },
    year: { priceId: "price_1UCOvPGlRukEX5RKJA05lDmb", cents: 15000 }
  },
  business: {
    month: { priceId: "price_1UCOuYGlRukEX5RKo6LUWZq3", cents: 4999 },
    year: { priceId: "price_1UCOnnGlRukEX5RK36kjzNZ6", cents: 55000 }
  }
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const text = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function buildSnapshot(admin: ReturnType<typeof createClient>, userId: string) {
  const [subscriptionResult, referralResult, creditResult, paymentResult] = await Promise.all([
    admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("subscription_referrals").select("status").eq("referrer_user_id", userId),
    admin.from("subscription_credits").select("credit_type,quantity,status").eq("user_id", userId),
    admin.from("subscription_payments").select("id,occurred_at,amount_cents,currency,status,description").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(25)
  ]);
  for (const result of [subscriptionResult, referralResult, creditResult, paymentResult]) {
    if (result.error) throw result.error;
  }
  const sub = subscriptionResult.data;
  const referrals = referralResult.data || [];
  const credits = creditResult.data || [];
  const payments = paymentResult.data || [];
  const successfulReferrals = referrals.filter((row) => row.status === "active").length;
  const free = credits.filter((row) => row.credit_type === "free_month");
  const sum = (statuses: string[]) => free.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + Number(row.quantity || 0), 0);
  return {
    status: sub?.status || "not_configured",
    plan: sub?.plan_id || null,
    billingInterval: sub?.billing_interval || "month",
    priceCents: sub?.price_cents ?? null,
    currency: sub?.currency || "usd",
    currentPeriodStart: sub?.current_period_start || null,
    currentPeriodEnd: sub?.current_period_end || null,
    trialEndsAt: sub?.trial_ends_at || null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    canceledAt: sub?.canceled_at || null,
    gracePeriodEndsAt: sub?.grace_period_ends_at || null,
    provider: sub?.provider || "stripe",
    providerCustomerId: sub?.provider_customer_id || null,
    providerSubscriptionId: sub?.provider_subscription_id || null,
    referral: {
      successfulReferrals,
      freeMonthsEarned: sum(["available", "reserved", "applied"]),
      freeMonthsUsed: sum(["applied"]),
      freeMonthsRemaining: sum(["available", "reserved"])
    },
    paymentHistory: payments.map((row) => ({
      id: row.id,
      createdAt: row.occurred_at,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      description: row.description || "Subscription payment"
    })),
    refreshedAt: new Date().toISOString(),
    source: "stripe_backend"
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
    const action = text(body.action, 32);

    if (action === "snapshot") return json(await buildSnapshot(admin, user.id));

    const { data: current, error: currentError } = await admin.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    if (currentError) throw currentError;

    if (action === "checkout") {
      const planId = text(body.planId, 20).toLowerCase();
      const billingInterval = text(body.billingInterval, 10).toLowerCase();
      const price = PRICES[planId]?.[billingInterval];
      if (!price) return json({ error: "Choose a valid HerdHarbor subscription plan and billing interval." }, 400);
      if (["active", "trialing", "past_due"].includes(String(current?.status || "")) && current?.provider_customer_id) {
        return json({ error: "This account already has a subscription. Use Manage billing instead." }, 409);
      }
      const origin = text(body.origin, 500);
      if (!/^https:\/\//i.test(origin) && !/^http:\/\/localhost(?::\d+)?$/i.test(origin)) return json({ error: "A valid HerdHarbor return URL is required." }, 400);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: price.priceId, quantity: 1 }],
        success_url: `${origin}?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}?subscription=canceled`,
        customer: current?.provider_customer_id || undefined,
        customer_email: current?.provider_customer_id ? undefined : user.email || undefined,
        client_reference_id: user.id,
        allow_promotion_codes: true,
        automatic_tax: { enabled: true },
        metadata: { herdharbor_user_id: user.id, herdharbor_plan: planId, herdharbor_interval: billingInterval },
        subscription_data: { metadata: { herdharbor_user_id: user.id, herdharbor_plan: planId, herdharbor_interval: billingInterval } }
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
