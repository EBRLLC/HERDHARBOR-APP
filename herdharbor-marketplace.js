(function(root,factory){
"use strict";
const api=factory(root);
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborMarketplace=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
"use strict";
const VERSION="1.0.0";
const TABLES=Object.freeze({
 profiles:"marketplace_public_profiles",listings:"marketplace_listings",photos:"marketplace_listing_photos",
 attributes:"marketplace_listing_attributes",favorites:"marketplace_favorites",conversations:"marketplace_conversations",
 members:"marketplace_conversation_members",messages:"marketplace_messages",attachments:"marketplace_message_attachments",
 blocks:"marketplace_blocks",reports:"marketplace_reports",moderation:"marketplace_moderation_actions",notifications:"marketplace_notifications"
});
const BUCKETS=Object.freeze({publicMedia:"marketplace-public",messageAttachments:"marketplace-message-attachments"});
const TABLE_SET=new Set(Object.values(TABLES));
const BUCKET_SET=new Set(Object.values(BUCKETS));

function requireClient(client){
 if(!client||typeof client.from!=="function")throw new Error("Marketplace Supabase client is unavailable.");
 return client;
}
function browserClient(){
 const client=root?.HerdHarborCloud?.getClient?.();
 return requireClient(client);
}
function createGateway(client){
 const db=requireClient(client);
 return Object.freeze({
  table(name){if(!TABLE_SET.has(name))throw new Error("Unknown Marketplace table.");return db.from(name);},
  rpc(name,args){if(typeof db.rpc!=="function")throw new Error("Marketplace RPC support is unavailable.");return db.rpc(name,args||{});},
  channel(name){if(typeof db.channel!=="function")throw new Error("Marketplace realtime support is unavailable.");return db.channel(name);},
  bucket(name){if(!BUCKET_SET.has(name))throw new Error("Unknown Marketplace storage bucket.");return db.storage.from(name);},
  async user(){
   const result=await db.auth.getUser();
   const user=result?.data?.user||null;
   if(!user)throw new Error("Sign in to use Marketplace member actions.");
   return user;
  }
 });
}
function gateway(){return createGateway(browserClient());}

const PUBLIC_PROFILE_FIELDS=Object.freeze(["display_name","rabbitry_name","avatar_path","city","region","about","species_breeds"]);
function textValue(value,max){
 const text=String(value===null||value===undefined?"":value).trim();
 return Number.isFinite(max)?text.slice(0,max):text;
}
function normalizePublicProfileDraft(input){
 const raw=input&&typeof input==="object"?input:{};
 return {
  display_name:textValue(raw.display_name||raw.displayName,120),
  rabbitry_name:textValue(raw.rabbitry_name||raw.rabbitryName,160),
  avatar_path:textValue(raw.avatar_path||raw.avatarPath,500),
  city:textValue(raw.city,120),
  region:textValue(raw.region||raw.state,120),
  about:textValue(raw.about,1500),
  species_breeds:Array.isArray(raw.species_breeds||raw.speciesBreeds)?(raw.species_breeds||raw.speciesBreeds).slice(0,100).map(function(item){return textValue(item,120);}).filter(Boolean):[]
 };
}
async function saveSellerProfile(input,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const draft=normalizePublicProfileDraft(input);
 const result=await gw.table(TABLES.profiles).upsert(Object.assign({user_id:user.id},draft),{onConflict:"user_id"}).select("public_id,display_name,rabbitry_name,avatar_path,city,region,about,species_breeds,member_since,verification_status").single();
 if(result.error)throw result.error;
 return result.data;
}
async function getPublicSellerProfile(publicId,customGateway){
 const id=textValue(publicId,80);
 if(!id)throw new Error("A public Marketplace profile id is required.");
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_public_profile",{target_public_id:id});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?(result.data[0]||null):result.data||null;
}
function publicProfilePreview(input){
 const draft=normalizePublicProfileDraft(input);
 return Object.freeze({
  display_name:draft.display_name,
  rabbitry_name:draft.rabbitry_name,
  avatar_path:draft.avatar_path,
  city:draft.city,
  region:draft.region,
  about:draft.about,
  species_breeds:draft.species_breeds.slice()
 });
}


const LISTING_STATES=Object.freeze(["draft","available","pending","sold","archived","expired","removed"]);
const LISTING_PUBLIC_FIELDS=Object.freeze(["animal_name","species","breed","sex","dob","variety_color","price_cents","currency","location_city","location_region","description","pedigree_status","registration_status"]);
const HERD_FIELD_MAP=Object.freeze({
 animal_name:"name",species:"species",breed:"breed",sex:"sex",dob:"dob",variety_color:"color",
 pedigree_status:"pedigreeStatus",registration_status:"registrationStatus"
});
function cleanPriceCents(value){
 if(value===null||value===undefined||value==="")return null;
 const number=Number(value);
 if(!Number.isFinite(number)||number<0)throw new Error("Listing price must be zero or more.");
 return Math.round(number);
}
function normalizeListingDraft(input){
 const raw=input&&typeof input==="object"?input:{};
 const state=LISTING_STATES.includes(String(raw.state||"").toLowerCase())?String(raw.state).toLowerCase():"draft";
 return {
  state,
  animal_name:textValue(raw.animal_name||raw.animalName,160),
  species:textValue(raw.species,120),
  breed:textValue(raw.breed,160),
  sex:textValue(raw.sex,40),
  dob:textValue(raw.dob,20)||null,
  variety_color:textValue(raw.variety_color||raw.varietyColor||raw.color,160),
  price_cents:cleanPriceCents(raw.price_cents===undefined?raw.priceCents:raw.price_cents),
  currency:textValue(raw.currency||"USD",8).toUpperCase()||"USD",
  location_city:textValue(raw.location_city||raw.locationCity,120),
  location_region:textValue(raw.location_region||raw.locationRegion||raw.stateRegion,120),
  description:textValue(raw.description,5000),
  pedigree_status:textValue(raw.pedigree_status||raw.pedigreeStatus||"none",80),
  registration_status:textValue(raw.registration_status||raw.registrationStatus,120)
 };
}
function buildListingSnapshotFromHerd(animal,options){
 if(!animal||typeof animal!=="object"||!animal.id)throw new Error("A private herd animal is required.");
 const raw=options&&typeof options==="object"?options:{};
 const selected=new Set(Array.isArray(raw.selectedFields)?raw.selectedFields:[]);
 if(!selected.size)throw new Error("Select the animal fields to publish before creating a Marketplace listing.");
 const copied={};
 LISTING_PUBLIC_FIELDS.forEach(function(field){
   if(!selected.has(field))return;
   const source=HERD_FIELD_MAP[field];
   if(source)copied[field]=animal[source];
 });
 const overrides=normalizeListingDraft(raw.overrides||raw);
 const merged={};
 LISTING_PUBLIC_FIELDS.forEach(function(field){
   if(selected.has(field)&&copied[field]!==undefined)merged[field]=copied[field];
   if(raw.overrides&&Object.prototype.hasOwnProperty.call(raw.overrides,field))merged[field]=overrides[field];
 });
 if(selected.has("price_cents"))merged.price_cents=overrides.price_cents;
 if(selected.has("currency"))merged.currency=overrides.currency;
 if(selected.has("location_city"))merged.location_city=overrides.location_city;
 if(selected.has("location_region"))merged.location_region=overrides.location_region;
 if(selected.has("description"))merged.description=overrides.description;
 return normalizeListingDraft(Object.assign({state:raw.state||"draft"},merged));
}
function listingInsertPayload(snapshot,userId,sourceAnimalId){
 const normalized=normalizeListingDraft(snapshot);
 return Object.assign({},normalized,{
   seller_id:String(userId),
   source_animal_id:sourceAnimalId?String(sourceAnimalId):null,
   public_snapshot:Object.fromEntries(LISTING_PUBLIC_FIELDS.map(function(field){return [field,normalized[field]];}))
 });
}
async function createListingFromHerd(animal,options,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const snapshot=buildListingSnapshotFromHerd(animal,options);
 const payload=listingInsertPayload(snapshot,user.id,animal.id);
 const result=await gw.table(TABLES.listings).insert(payload).select("id,state,created_at").single();
 if(result.error)throw result.error;
 return result.data;
}
async function createManualListing(input,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const payload=listingInsertPayload(input,user.id,null);
 const result=await gw.table(TABLES.listings).insert(payload).select("id,state,created_at").single();
 if(result.error)throw result.error;
 return result.data;
}
async function deleteListing(listingId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.table(TABLES.listings).delete().eq("id",String(listingId));
 if(result.error)throw result.error;
 return true;
}
function listingCreationOptions(){
 return Object.freeze([{id:"herd",label:"Select From My Herd"},{id:"manual",label:"Create Manual Listing"}]);
}

return Object.freeze({VERSION,TABLES,BUCKETS,PUBLIC_PROFILE_FIELDS,LISTING_STATES,LISTING_PUBLIC_FIELDS,createGateway,gateway,browserClient,normalizePublicProfileDraft,saveSellerProfile,getPublicSellerProfile,publicProfilePreview,normalizeListingDraft,buildListingSnapshotFromHerd,listingInsertPayload,createListingFromHerd,createManualListing,deleteListing,listingCreationOptions});
});
