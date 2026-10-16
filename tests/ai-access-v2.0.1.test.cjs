"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const fs=require("node:fs");
const helper=import("../supabase/functions/_shared/ai-access.mjs");
const approved=()=>({
  HERDHARBOR_AI_PUBLIC_ENABLED:"true",
  HERDHARBOR_AI_PAPER_PEDIGREE_ENABLED:"true",
  HERDHARBOR_AI_PHOTO_ENTRY_ENABLED:"true",
  HERDHARBOR_AI_APPROVED_TIERS:"member,founder",
  HERDHARBOR_AI_APPROVED_PILOT_USER_IDS:""
});
const admin=(tier="member",status="active",subscription="active")=>({
  from:(name)=>{
    assert.equal(name,"account_access");
    return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{membership_tier:tier,account_status:status,subscription_status:subscription},error:null})})})};
  }
});
test("AI access is denied without owner-configured public gate or user consent",async()=>{
 const {authorizeAiAction}=await helper;
 const input={userId:"u1",action:"paper_pedigree",admin:admin(),consent:true};
 assert.equal((await authorizeAiAction({...input,env:{}})).code,"feature_disabled");
 assert.equal((await authorizeAiAction({...input,env:{...approved(),HERDHARBOR_AI_PUBLIC_ENABLED:"false"}})).code,"feature_disabled");
 assert.equal((await authorizeAiAction({...input,env:approved(),consent:false})).code,"consent_required");
 assert.equal((await authorizeAiAction({...input,env:approved(),action:"record_photo",consent:true})).allowed,true);
});
test("Member and Founder require explicit tier approval and active subscription; Junior is not implicit",async()=>{
 const {authorizeAiAction}=await helper;
 const opts={userId:"u1",action:"paper_pedigree",env:approved(),consent:true};
 assert.equal((await authorizeAiAction({...opts,admin:admin("member")})).allowed,true);
 assert.equal((await authorizeAiAction({...opts,admin:admin("founder")})).allowed,true);
 assert.equal((await authorizeAiAction({...opts,admin:admin("junior","active","not_configured")})).code,"tier_not_approved");
 assert.equal((await authorizeAiAction({...opts,admin:admin("member","suspended")})).code,"access_denied");
 assert.equal((await authorizeAiAction({...opts,admin:admin("member","active","canceled")})).code,"subscription_inactive");
 assert.equal((await authorizeAiAction({...opts,admin:admin("member"),env:{...approved(),HERDHARBOR_AI_APPROVED_TIERS:""}})).code,"tier_not_approved");
});
test("AI access denies missing account, invalid action, or unexpected server lookup failures",async()=>{
 const {authorizeAiAction}=await helper;
 const opts={userId:"u1",action:"paper_pedigree",env:approved(),consent:true};
 assert.equal((await authorizeAiAction({...opts,admin:{}})).code,"access_unavailable");
 assert.equal((await authorizeAiAction({...opts,action:"other",admin:admin()})).code,"access_denied");
});
test("Both provider-bearing edge functions require server access before reserving quota/provider call",()=>{
 const root=path.join(__dirname,"..");
 for(const file of ["paper-pedigree-extract","record-photo-extract"]){
   const source=fs.readFileSync(path.join(root,"supabase/functions",file,"index.ts"),"utf8");
   assert.match(source,/authorizeAiAction\(/);
   assert.match(source,/consent: body\?\.aiOptIn === true/);
   assert.ok(source.indexOf("authorizeAiAction(")<source.indexOf('herdharbor_reserve_ai_image_request'));
   assert.ok(source.indexOf("authorizeAiAction(")<source.indexOf('const controller = new AbortController'));
 }
});
