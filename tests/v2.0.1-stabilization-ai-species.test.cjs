"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const base=path.join(__dirname,"..");
const server=fs.readFileSync(path.join(base,"supabase/functions/paper-pedigree-extract/index.ts"),"utf8");
const client=fs.readFileSync(path.join(base,"paper-pedigree-import-v1.8.2.js"),"utf8");
test("AI paper reader requires explicit Rabbit request context, not an implicit fallback",()=>{
 assert.match(server,/const expectedSpecies = clean\(body\?\.species, 80\)\.toLowerCase\(\)/);
 assert.doesNotMatch(server,/body\?\.species \|\| "Rabbit"/);
 assert.match(server,/if \(expectedSpecies !== "rabbit"\)/);
 assert.match(client,/species: "Rabbit"/);
});
test("non-rabbit or unclassified model output cannot pass the server species filter",()=>{
 assert.match(server,/normalized\.nodes\.some\(\(node\) => node\.species\.toLowerCase\(\) !== "rabbit"\)/);
 assert.doesNotMatch(server,/node\.species && node\.species\.toLowerCase/);
 assert.match(server,/otherwise output an empty string/);
 assert.match(server,/unsupported_species/);
});
test("server authorization still precedes image payload, quota and model work",()=>{
 const auth=server.indexOf("decideAiAccess(");
 const body=server.indexOf("req.json()");
 const quota=server.indexOf("herdharbor_reserve_ai_image_request");
 assert.ok(auth>0&&body>auth&&quota>body);
});
