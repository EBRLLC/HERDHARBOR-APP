"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const market=require("../herdharbor-marketplace.js");

test("Select From My Herd requires deliberate public field selection",()=>{
 const animal={id:"private-a1",name:"Bluebell",species:"Rabbit",breed:"Holland Lop",sex:"Female",color:"Blue",notes:"PRIVATE NOTE",medicalNotes:"PRIVATE MEDICAL",acquisitionNotes:"PRIVATE ACQUISITION"};
 assert.throws(()=>market.buildListingSnapshotFromHerd(animal,{}),/Select the animal fields/);
 const snapshot=market.buildListingSnapshotFromHerd(animal,{selectedFields:["animal_name","species","breed","sex","variety_color","price_cents","description"],overrides:{price_cents:7500,description:"Available"}});
 assert.equal(snapshot.animal_name,"Bluebell");
 assert.equal(snapshot.price_cents,7500);
 assert.equal(JSON.stringify(snapshot).includes("PRIVATE"),false);
});

test("private animal edits cannot silently change an existing listing snapshot",()=>{
 const animal={id:"a1",name:"Original",species:"Rabbit",breed:"Holland Lop"};
 const snapshot=market.buildListingSnapshotFromHerd(animal,{selectedFields:["animal_name","species","breed"]});
 animal.name="Changed privately";
 animal.notes="new private note";
 assert.equal(snapshot.animal_name,"Original");
 assert.equal(JSON.stringify(snapshot).includes("Changed privately"),false);
});

test("listing insert keeps source_animal_id outside the public snapshot",()=>{
 const payload=market.listingInsertPayload({animal_name:"Rabbit",species:"Rabbit"},"seller","private-id");
 assert.equal(payload.source_animal_id,"private-id");
 assert.equal(Object.prototype.hasOwnProperty.call(payload.public_snapshot,"source_animal_id"),false);
 assert.deepEqual(Object.keys(payload.public_snapshot),market.LISTING_PUBLIC_FIELDS);
});

test("listing deletion API only deletes the Marketplace listing table",async()=>{
 const calls=[];
 const chain={eq(field,value){calls.push(["eq",field,value]);return Promise.resolve({error:null});}};
 const fake={async user(){return {id:"u"};},table(name){return {delete(){calls.push(["delete",name]);return chain;}};}};
 await market.deleteListing("listing-1",fake);
 assert.deepEqual(calls,[["delete","marketplace_listings"],["eq","id","listing-1"]]);
});

test("listing states and creation choices match the Marketplace contract",()=>{
 assert.deepEqual(market.LISTING_STATES,["draft","available","pending","sold","archived","expired","removed"]);
 assert.deepEqual(market.listingCreationOptions().map(x=>x.label),["Select From My Herd","Create Manual Listing"]);
});
