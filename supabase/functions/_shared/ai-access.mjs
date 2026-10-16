// HerdHarbor 2.0.1 AI access: fail closed until the owner approves a public tier matrix.
// Pure helper shared by existing Supabase Edge Functions; never trusts client metadata.
const TYPES=Object.freeze({
  paper_pedigree:"HERDHARBOR_AI_PAPER_PEDIGREE_ENABLED",
  record_photo:"HERDHARBOR_AI_PHOTO_ENTRY_ENABLED"
});
const str=(v)=>String(v==null?"":v).trim();
const enabled=(v)=>str(v).toLowerCase()==="true";
const csv=(v)=>new Set(str(v).split(",").map(s=>s.trim().toLowerCase()).filter(Boolean));

export async function authorizeAiAction({userId,action,admin,env,consent}={}){
  const flags=env||{};
  const featureFlag=TYPES[action];
  if(!featureFlag||!str(userId))return {allowed:false,code:"access_denied"};
  // Each AI action can be independently disabled even when general AI is enabled.
  if(!enabled(flags.HERDHARBOR_AI_PUBLIC_ENABLED)||!enabled(flags[featureFlag]))
    return {allowed:false,code:"feature_disabled"};
  if(consent!==true)return {allowed:false,code:"consent_required"};
  if(!admin?.from)return {allowed:false,code:"access_unavailable"};
  let record,error;
  try{
    const result=await admin.from("account_access")
      .select("membership_tier,account_status,subscription_status")
      .eq("user_id",str(userId)).maybeSingle();
    record=result?.data;
    error=result?.error;
  }catch{return {allowed:false,code:"access_unavailable"};}
  if(error||!record)return {allowed:false,code:"access_unavailable"};
  if(str(record.account_status).toLowerCase()!=="active")return {allowed:false,code:"access_denied"};
  const tier=str(record.membership_tier).toLowerCase();
  const status=str(record.subscription_status).toLowerCase();
  const pilot=csv(flags.HERDHARBOR_AI_APPROVED_PILOT_USER_IDS).has(str(userId).toLowerCase());
  // No membership tier is allowed by default. Junior has no implicit eligibility.
  const tierApproved=csv(flags.HERDHARBOR_AI_APPROVED_TIERS).has(tier);
  if(!pilot&&!tierApproved)return {allowed:false,code:"tier_not_approved"};
  if(!pilot&&!["active","trialing"].includes(status))
    return {allowed:false,code:"subscription_inactive"};
  return {allowed:true,code:"allowed",tier};
}
export function aiAccessEnvironment(getEnv){
  const keys=["HERDHARBOR_AI_PUBLIC_ENABLED","HERDHARBOR_AI_PAPER_PEDIGREE_ENABLED",
    "HERDHARBOR_AI_PHOTO_ENTRY_ENABLED","HERDHARBOR_AI_APPROVED_TIERS",
    "HERDHARBOR_AI_APPROVED_PILOT_USER_IDS"];
  return Object.fromEntries(keys.map(key=>[key,getEnv(key)||""]));
}
