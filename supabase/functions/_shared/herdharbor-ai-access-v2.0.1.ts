/** 2.0.1 server-authoritative AI access policy. No browser state is trusted. */
export type AiFeature = "paper_pedigree" | "record_photo";
export type AiAccount = {
  membership_tier?: string | null;
  account_status?: string | null;
  subscription_status?: string | null;
} | null;
export type AiDecision = { allowed: boolean; reason: "tester"|"public"|"feature_disabled"|"account_ineligible"|"not_entitled" };
export type AiPolicyConfig = {
  userId: string;
  feature: AiFeature;
  account: AiAccount;
  env: (key: string) => string | undefined;
};
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const active = (value: unknown) => normalize(value) === "true";
const enabledSubscription = new Set(["active","trialing"]);
const recognizedTiers = new Set(["member","founder","junior"]);
export function decideAiAccess({userId,feature,account,env}: AiPolicyConfig): AiDecision {
  const disabledKey = feature === "paper_pedigree" ? "HH_AI_PAPER_DISABLED" : "HH_AI_PHOTO_DISABLED";
  if (active(env(disabledKey))) return {allowed:false,reason:"feature_disabled"};
  if (!userId || !account || normalize(account.account_status) !== "active")
    return {allowed:false,reason:"account_ineligible"};
  const tier = normalize(account.membership_tier);
  if (!recognizedTiers.has(tier)) return {allowed:false,reason:"account_ineligible"};
  const testers = (env("HH_AI_TESTER_USER_IDS") || "").split(",").map(s=>s.trim()).filter(Boolean);
  if (testers.includes(userId)) return {allowed:true,reason:"tester"};
  // Public release requires both an explicit server flip and an owner-approved
  // tier matrix, never a version bump, browser localStorage or request payload.
  const publicEnabled = feature === "paper_pedigree" ? env("HH_AI_PAPER_PUBLIC_ENABLED") : env("HH_AI_PHOTO_PUBLIC_ENABLED");
  const tierKey = feature === "paper_pedigree" ? "HH_AI_PAPER_APPROVED_TIERS" : "HH_AI_PHOTO_APPROVED_TIERS";
  if (!active(publicEnabled) || !active(env("HH_AI_ENTITLEMENT_MATRIX_APPROVED")))
    return {allowed:false,reason:"not_entitled"};
  const eligible = (env(tierKey)||"").split(",").map(normalize).filter(Boolean);
  if (!eligible.includes(tier)) return {allowed:false,reason:"not_entitled"};
  if (!enabledSubscription.has(normalize(account.subscription_status)))
    return {allowed:false,reason:"account_ineligible"};
  return {allowed:true,reason:"public"};
}
