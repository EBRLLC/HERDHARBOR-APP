import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const RESEND_API = "https://api.resend.com";
const DEFAULT_FROM = "HerdHarbor <updates@auth.herdharbor.com>";

type AdminClient = ReturnType<typeof createClient>;
type OutboxRow = {
  id: string;
  user_id: string;
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown> | null;
  not_before: string;
  status: string;
  attempts: number;
};

type Message = { subject: string; text: string; html: string };

const htmlEscape = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

function money(cents: unknown, currency: unknown = "usd") {
  const amount = Math.max(0, Number(cents || 0)) / 100;
  const code = String(currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function dateLabel(value: unknown) {
  if (!value) return "your renewal date";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "your renewal date";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function shell(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f7f2e8;color:#18212a;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:620px;margin:0 auto;padding:32px 20px;"><div style="background:#ffffff;border:1px solid #e2ddd2;border-radius:16px;padding:28px;"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2e7d7b;margin-bottom:8px;">HerdHarbor</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 18px;color:#0d2540;">${htmlEscape(title)}</h1>${bodyHtml}<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6a737b;">This is a transactional account or subscription message from HerdHarbor.</p></div></div></body></html>`;
}

function paragraph(value: string) {
  return `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${value}</p>`;
}

function render(eventType: string, payload: Record<string, unknown>, firstName = "") : Message | null {
  const hello = firstName ? `Hi ${firstName},` : "Hello,";
  const renewalDate = dateLabel(payload.renewalDate || payload.accessEndsAt);
  const creditsRemaining = Math.max(0, Number(payload.creditsRemaining ?? payload.creditsRemainingAfterRenewal ?? payload.freeMonthsRemaining ?? 0));

  if (eventType === "referral_reward_earned") {
    const subject = "You earned a free month of HerdHarbor Member";
    const text = `${hello}\n\nFive of your referrals have now completed their qualifying renewal. We added 1 Member subscription month credit to your account.\n\nAvailable Member month credits: ${creditsRemaining}.\n\nYour credit will automatically apply to an eligible future monthly renewal.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph("Five of your referrals have now completed their qualifying renewal. <strong>1 free Member month</strong> has been added to your account.") + paragraph(`Available Member month credits: <strong>${creditsRemaining}</strong>. Your credit will automatically apply to an eligible future monthly renewal.`)) };
  }

  if (eventType === "admin_credit_added") {
    const months = Math.max(1, Number(payload.monthsAdded || 1));
    const subject = `${months} complimentary HerdHarbor Member month${months === 1 ? "" : "s"} added`;
    const reason = String(payload.reason || "A complimentary subscription credit was added to your account.");
    const text = `${hello}\n\n${months} complimentary Member month${months === 1 ? " has" : "s have"} been added to your HerdHarbor account.\n\nReason: ${reason}\nAvailable Member month credits: ${creditsRemaining}.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph(`<strong>${months} complimentary Member month${months === 1 ? "" : "s"}</strong> ${months === 1 ? "has" : "have"} been added to your HerdHarbor account.`) + paragraph(`Reason: ${htmlEscape(reason)}`) + paragraph(`Available Member month credits: <strong>${creditsRemaining}</strong>.`)) };
  }

  if (eventType === "upcoming_free_renewal") {
    const subject = "Your upcoming HerdHarbor renewal is $0.00";
    const reason = String(payload.reason || "Member month credit");
    const text = `${hello}\n\nYour HerdHarbor Member subscription renews on ${renewalDate}. Your upcoming renewal is $0.00 because a ${reason} credit has been reserved for this renewal.\n\nYou will not be charged for this Member month.\nRemaining credits after this renewal: ${creditsRemaining}.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph(`Your HerdHarbor Member subscription renews on <strong>${htmlEscape(renewalDate)}</strong>.`) + paragraph(`Your upcoming renewal is <strong>$0.00</strong> because a <strong>${htmlEscape(reason)}</strong> credit has been reserved for this renewal. You will not be charged for this Member month.`) + paragraph(`Remaining credits after this renewal: <strong>${creditsRemaining}</strong>.`)) };
  }

  if (eventType === "upcoming_paid_renewal") {
    const amount = money(payload.amountCents, payload.currency);
    const subject = `Your HerdHarbor membership renews on ${renewalDate}`;
    const text = `${hello}\n\nYour HerdHarbor Member subscription renews on ${renewalDate}. Your payment method is expected to be charged ${amount}.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph(`Your HerdHarbor Member subscription renews on <strong>${htmlEscape(renewalDate)}</strong>.`) + paragraph(`Your payment method is expected to be charged <strong>${htmlEscape(amount)}</strong>.`)) };
  }

  if (eventType === "free_month_applied") {
    const subject = "Your free HerdHarbor Member month was applied";
    const reason = String(payload.reason || "Member month credit");
    const text = `${hello}\n\nYour ${reason} credit was successfully applied. This renewal was $0.00.\n\nRemaining Member month credits: ${creditsRemaining}.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph(`Your <strong>${htmlEscape(reason)}</strong> credit was successfully applied. This renewal was <strong>$0.00</strong>.`) + paragraph(`Remaining Member month credits: <strong>${creditsRemaining}</strong>.`)) };
  }

  if (eventType === "payment_failed") {
    const amount = money(payload.amountCents, payload.currency);
    const subject = "HerdHarbor subscription payment failed";
    const text = `${hello}\n\nWe could not complete your HerdHarbor subscription payment${Number(payload.amountCents || 0) > 0 ? ` of ${amount}` : ""}. Please review your billing information so your Member access is not interrupted.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph(`We could not complete your HerdHarbor subscription payment${Number(payload.amountCents || 0) > 0 ? ` of <strong>${htmlEscape(amount)}</strong>` : ""}.`) + paragraph("Please review your billing information so your Member access is not interrupted.")) };
  }

  if (eventType === "subscription_canceled") {
    const subject = "Your HerdHarbor subscription is scheduled to end";
    const text = `${hello}\n\nYour HerdHarbor Member subscription is canceled and will remain active through ${renewalDate}. After that date, your account will return to Junior unless another entitlement or Member credit applies.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph(`Your HerdHarbor Member subscription is canceled and will remain active through <strong>${htmlEscape(renewalDate)}</strong>.`) + paragraph("After that date, your account will return to Junior unless another entitlement or Member credit applies.")) };
  }

  if (eventType === "subscription_ended") {
    const subject = "Your HerdHarbor Member subscription has ended";
    const text = `${hello}\n\nYour paid HerdHarbor Member subscription has ended. Your records are preserved. Your account will use Junior access unless another entitlement applies.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph("Your paid HerdHarbor Member subscription has ended. <strong>Your records are preserved.</strong>") + paragraph("Your account will use Junior access unless another entitlement applies.")) };
  }

  if (eventType === "junior_fallback") {
    const subject = "Your HerdHarbor account is now on Junior";
    const text = `${hello}\n\nYour HerdHarbor account is now using Junior access. Existing records remain preserved. Junior currently supports up to 5 active animals.`;
    return { subject, text, html: shell(subject, paragraph(htmlEscape(hello)) + paragraph("Your HerdHarbor account is now using <strong>Junior</strong> access. Existing records remain preserved.") + paragraph("Junior currently supports up to 5 active animals.")) };
  }

  return null;
}

async function recipient(admin: AdminClient, userId: string) {
  const [{ data: authData, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("registration_profiles").select("legal_first_name").eq("user_id", userId).maybeSingle()
  ]);
  if (authError) throw authError;
  if (profileError) throw profileError;
  const email = String(authData?.user?.email || "").trim();
  if (!email) throw new Error("The subscription notification recipient has no email address.");
  return { email, firstName: String(profile?.legal_first_name || "").trim() };
}

export async function deliverSubscriptionNotification(admin: AdminClient, outboxId: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!resendKey) throw new Error("Resend transactional email is not configured.");

  const { data: row, error: rowError } = await admin
    .from("subscription_notification_outbox")
    .select("id,user_id,event_type,dedupe_key,payload,not_before,status,attempts")
    .eq("id", outboxId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row?.id) return { delivered: false, missing: true };
  const outbox = row as OutboxRow;
  if (outbox.status === "sent" || outbox.status === "canceled") return { delivered: false, status: outbox.status };
  if (new Date(outbox.not_before).getTime() > Date.now()) return { delivered: false, status: "scheduled" };

  const { data: claimed, error: claimError } = await admin
    .from("subscription_notification_outbox")
    .update({ status: "processing", attempts: Number(outbox.attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", outbox.id)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed?.id) return { delivered: false, status: "processing" };

  try {
    const message = render(outbox.event_type, outbox.payload || {});
    if (!message) {
      const { error } = await admin.from("subscription_notification_outbox").update({
        status: "canceled",
        last_error: `No transactional email template for ${outbox.event_type}.`,
        updated_at: new Date().toISOString()
      }).eq("id", outbox.id);
      if (error) throw error;
      return { delivered: false, status: "canceled" };
    }

    const to = await recipient(admin, outbox.user_id);
    const response = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `herdharbor:${outbox.dedupe_key}`.slice(0, 256)
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [to.email],
        subject: message.subject,
        text: message.text,
        html: message.html
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : `Resend returned HTTP ${response.status}.`);

    const { error: sentError } = await admin.from("subscription_notification_outbox").update({
      status: "sent",
      provider: "resend",
      provider_message_id: result?.id || null,
      last_error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", outbox.id);
    if (sentError) throw sentError;
    return { delivered: true, provider: "resend", messageId: result?.id || null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription email delivery failed.";
    await admin.from("subscription_notification_outbox").update({
      status: "failed",
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString()
    }).eq("id", outbox.id);
    throw error;
  }
}

export const __subscriptionEmailTest = { render, money, dateLabel };
