"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const esbuild=require("esbuild");
const root=path.join(__dirname,"..");
const filename=path.join(root,"supabase/functions/_shared/herdharbor-ai-access-v2.0.1.ts");
const source=fs.readFileSync(filename,"utf8");
const transformed=esbuild.transformSync(source,{loader:"ts",format:"cjs",target:"es2022"});
const isolatedModule={exports:{}};
vm.runInNewContext(transformed.code,{module:isolatedModule,exports:isolatedModule.exports});
const decide=isolatedModule.exports.decideAiAccess;
const member={membership_tier:"member",account_status:"active",subscription_status:"active"};
const founder={membership_tier:"founder",account_status:"active",subscription_status:"trialing"};
const junior={membership_tier:"junior",account_status:"active",subscription_status:"not_configured"};
const attempt=(feature,account,settings={})=>decide({userId:"member-1",feature,account,env:key=>settings[key]});
test("all AI modes are denied by default without explicit server entitlement approval",()=>{
  for(const feature of ["paper_pedigree","record_photo"])
    assert.equal(attempt(feature,member).allowed,false,feature);
});
test("server-only tester IDs allow adult pilot, not Junior and not stale accounts",()=>{
  const env={HH_AI_TESTER_USER_IDS:"member-1,other-user"};
  assert.equal(attempt("paper_pedigree",member,env).allowed,true);
  assert.equal(attempt("record_photo",founder,env).allowed,true);
  assert.equal(attempt("paper_pedigree",junior,env).allowed,false);
  assert.equal(attempt("paper_pedigree",{...member,account_status:"suspended"},env).allowed,false);
});
test("independent kill switches override even allowlisted tester",()=>{
  const env={HH_AI_TESTER_USER_IDS:"member-1",HH_AI_PAPER_DISABLED:"true"};
  assert.equal(attempt("paper_pedigree",member,env).reason,"feature_disabled");
  assert.equal(attempt("record_photo",member,env).allowed,true);
  env.HH_AI_PHOTO_DISABLED="true";
  assert.equal(attempt("record_photo",member,env).reason,"feature_disabled");
});
test("public flag is insufficient without explicit approved tier matrix",()=>{
  const env={HH_AI_PAPER_PUBLIC_ENABLED:"true",HH_AI_PAPER_APPROVED_TIERS:"member,founder"};
  assert.equal(attempt("paper_pedigree",member,env).allowed,false);
  env.HH_AI_ENTITLEMENT_MATRIX_APPROVED="true";
  assert.equal(attempt("paper_pedigree",member,env).allowed,true);
  assert.equal(attempt("paper_pedigree",junior,env).allowed,false);
  assert.equal(attempt("record_photo",member,env).allowed,false);
  assert.equal(attempt("paper_pedigree",{...member,subscription_status:"canceled"},env).allowed,false);
});
test("AI Edge Functions validate authorization before reading payload or spending quota",()=>{
  for(const name of ["paper-pedigree-extract","record-photo-extract"]){
    const body=fs.readFileSync(path.join(root,"supabase/functions",name,"index.ts"),"utf8");
    const account=body.indexOf('.from("account_access")');
    const gate=body.indexOf("decideAiAccess(");
    const payload=body.indexOf("req.json()");
    const reservation=body.indexOf("herdharbor_reserve_ai_image_request");
    assert.ok(account>0&&gate>account&&payload>gate&&reservation>payload,name);
    assert.ok(body.includes('access_not_enabled'),name);
    assert.ok(body.includes('account_status, subscription_status'),name);
  }
});