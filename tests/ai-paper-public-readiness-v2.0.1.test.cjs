"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const client=fs.readFileSync(path.join(root,"paper-pedigree-import-v1.8.2.js"),"utf8");
const server=fs.readFileSync(path.join(root,"supabase/functions/paper-pedigree-extract/index.ts"),"utf8");
const core=require("../paper-pedigree-import-core-v1.8.2.js");
test("paper AI requests consent before upload while canonical import still owns writes",()=>{
 assert.match(client,/data-pp-ai-optin/);
 assert.match(client,/checked\) return setStatus\("Opt in to sending/);
 assert.match(client,/expectedSpecies: "Rabbit", aiOptIn: true/);
 assert.ok(client.indexOf("data-pp-ai-optin")<client.indexOf('cloud().invokeFunctionWithDiagnostics("paper-pedigree-extract"'));
 assert.match(client,/core\(\)\.buildImportPlan\(current, asCoreExtraction\(reviewed\)\)/);
 assert.match(client,/app\(\)\.commitState\(applied\.state/);
});
test("Dog and unidentified species cannot silently default to Rabbit",()=>{
 assert.match(client,/non-rabbit pedigree/);
 assert.match(client,/if \(!clean\(source\?\.species\)\) node\.species = ""/);
 assert.match(client,/reviewedNodes\.some\(node => clean\(node\.species\)\.toLowerCase\(\) !== "rabbit"\)/);
 assert.match(server,/body\?\.expectedSpecies/);
 assert.match(server,/normalized\.nodes\.some\(\(node: any\) => node\.species && node\.species\.toLowerCase\(\) !== "rabbit"\)/);
 assert.equal(core.normalizeNode({}).species,"Rabbit");
});
test("Provider quotas and server account eligibility stay mandatory",()=>{
 assert.match(server,/authorizeAiAction/);
 assert.match(server,/aiOptIn === true/);
 assert.match(server,/herdharbor_reserve_ai_image_request/);
 assert.match(server,/AbortController/);
 assert.ok(server.indexOf("aiOptIn === true")<server.indexOf("herdharbor_reserve_ai_image_request"));
});
test("User review remains mandatory; cancel does not save",()=>{
 assert.match(client,/data-pp-confirm-review/);
 assert.match(client,/confirm\?\.checked \|\| reviewConfirmed !== true/);
 assert.match(client,/renderPlanProblems\(plan\) \|\| !plan\.canCommit/);
 assert.match(client,/data-pp-close/);
 assert.match(client,/Nothing has been added to your records yet/);
});
