"use strict";
const assert=require("node:assert/strict");
const Core=require("../rabbit-genetics-runtime-v1.6.1.js");
const rabbit=(id,name,color,sex)=>({id,name,color,sex,species:"Rabbit",breed:"Holland Lop",status:"Active"});

// Real-world tester case: phenotype exists but the breeder has not filled a full genotype.
const black=rabbit("black","Phenotype Black","Black","Male");
const blue=rabbit("blue","Phenotype Blue","Blue","Female");
const result=Core.analyzePairing(black,blue,{animals:[black,blue]});
assert.equal(result.scenarioTruncated,false,"ordinary phenotype-only Black × Blue must be enumerable");
assert.ok(result.possibleOffspringColors.length>0,"ordinary phenotype-only pairing must return named coat colors");
assert.ok(result.possibleOffspringColors.some(o=>/Black/.test(o.name)),"Black-family outcome remains visible");
assert.ok(result.possibleOffspringColors.some(o=>/Blue/.test(o.name)),"Blue-family conditional outcome remains visible when dilute carrier status is unresolved");

// Phenotype-only pattern records must also remain breeder-readable.
const harl=rabbit("h","Harlequin","Black Harlequin","Male");
const mag=rabbit("m","Magpie","Black Magpie","Female");
const pattern=Core.analyzePairing(harl,mag,{animals:[harl,mag]});
assert.equal(pattern.scenarioTruncated,false,"Harlequin × Magpie phenotype-only pairing should be enumerable");
assert.ok(pattern.possibleOffspringColors.some(o=>/Harlequin|Magpie|Tricolor/.test(o.name)));

console.log("Alpha v1.6.5 phenotype-only Pair Analysis tests passed");
