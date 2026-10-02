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


function publicMediaUrl(path,customGateway){
 const value=textValue(path,1000);
 if(!value)return "";
 const gw=customGateway||gateway();
 const result=gw.bucket(BUCKETS.publicMedia).getPublicUrl(value);
 return result?.data?.publicUrl||"";
}
function searchArgs(filters){
 const raw=filters&&typeof filters==="object"?filters:{};
 return {
  search_text:textValue(raw.search,200)||null,
  species_filter:textValue(raw.species,120)||null,
  breed_filter:textValue(raw.breed,160)||null,
  sex_filter:textValue(raw.sex,40)||null,
  min_price_cents:raw.minPriceCents===undefined||raw.minPriceCents===""?null:cleanPriceCents(raw.minPriceCents),
  max_price_cents:raw.maxPriceCents===undefined||raw.maxPriceCents===""?null:cleanPriceCents(raw.maxPriceCents),
  pedigree_filter:textValue(raw.pedigreeStatus,80)||null,
  region_filter:textValue(raw.region,120)||null,
  result_limit:Math.min(100,Math.max(1,Number(raw.limit||40))),
  result_offset:Math.max(0,Number(raw.offset||0))
 };
}
async function searchListings(filters,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_search_listings",searchArgs(filters));
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function getListingDetails(listingId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_public_listing",{target_listing_id:String(listingId)});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?(result.data[0]||null):result.data||null;
}
async function saveListing(listingId,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const result=await gw.table(TABLES.favorites).upsert({user_id:user.id,listing_id:String(listingId)},{onConflict:"user_id,listing_id"});
 if(result.error)throw result.error;
 return true;
}
function moneyText(cents,currency){
 if(cents===null||cents===undefined)return "Price not listed";
 try{return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"USD"}).format(Number(cents)/100);}
 catch{return "$"+(Number(cents)/100).toFixed(2);}
}
function escapeMarkup(value){
 return textValue(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function renderListingCard(row,customGateway){
 const photo=row.primary_photo_path?publicMediaUrl(row.primary_photo_path,customGateway):"";
 return '<article class="hh-market-card" data-listing-card="'+escapeMarkup(row.listing_id)+'">'+
  (photo?'<img src="'+escapeMarkup(photo)+'" alt="">':'<div class="hh-market-photo-placeholder">HH</div>')+
  '<div class="hh-market-card-copy"><span class="badge green">'+escapeMarkup(row.state||"available")+'</span><h3>'+escapeMarkup(row.animal_name||"Unnamed animal")+'</h3>'+
  '<p>'+escapeMarkup([row.breed,row.sex,row.variety_color].filter(Boolean).join(" · "))+'</p><strong>'+escapeMarkup(moneyText(row.price_cents,row.currency))+'</strong>'+
  '<small>'+escapeMarkup([row.location_city,row.location_region].filter(Boolean).join(", "))+'</small>'+
  '<button type="button" class="button button-ghost button-small" data-market-open="'+escapeMarkup(row.listing_id)+'">View listing</button></div></article>';
}
async function renderMarketplace(context){
 const ctx=context&&typeof context==="object"?context:{};
 const target=ctx.target;
 if(!target)throw new Error("Marketplace target is required.");
 const toast=typeof ctx.toast==="function"?ctx.toast:function(){};
 const gw=ctx.gateway||gateway();
 target.innerHTML='<div class="page-header"><div><p class="eyebrow">HerdHarbor</p><h2>Marketplace</h2><p>Browse animals published by HerdHarbor members without exposing private herd records.</p></div><div class="header-actions"><button class="button button-primary" type="button" id="hh-market-sell">Sell Animal</button></div></div>'+
  '<form id="hh-market-search" class="panel hh-market-filters"><input name="search" placeholder="Search animals, breeds, descriptions"><input name="species" placeholder="Species"><input name="breed" placeholder="Breed"><select name="sex"><option value="">Any sex</option><option>Female</option><option>Male</option></select><input name="region" placeholder="State / region"><input name="minPrice" type="number" min="0" step="1" placeholder="Min $"><input name="maxPrice" type="number" min="0" step="1" placeholder="Max $"><button class="button button-primary" type="submit">Search</button></form>'+
  '<div id="hh-market-results" class="hh-market-grid"><p class="muted">Loading Marketplace…</p></div><div id="hh-market-detail"></div><dialog id="hh-market-sell-dialog"></dialog>';
 const form=target.querySelector("#hh-market-search");
 const results=target.querySelector("#hh-market-results");
 const detail=target.querySelector("#hh-market-detail");
 async function runSearch(){
  const data=Object.fromEntries(new FormData(form));
  const filters={search:data.search,species:data.species,breed:data.breed,sex:data.sex,region:data.region,
   minPriceCents:data.minPrice===""?null:Math.round(Number(data.minPrice)*100),
   maxPriceCents:data.maxPrice===""?null:Math.round(Number(data.maxPrice)*100)};
  results.innerHTML='<p class="muted">Searching Marketplace…</p>';
  try{
   const rows=await searchListings(filters,gw);
   results.innerHTML=rows.length?rows.map(function(row){return renderListingCard(row,gw);}).join(""):'<div class="empty-state"><strong>No listings found.</strong><span>Try changing the search or filters.</span></div>';
  }catch(error){results.innerHTML='<p class="muted">Marketplace listings could not be loaded.</p>';toast(error?.message||"Marketplace search failed.","error");}
 }
 form.addEventListener("submit",function(event){event.preventDefault();void runSearch();});
 results.addEventListener("click",async function(event){
  const button=event.target.closest("[data-market-open]"); if(!button)return;
  try{
   const row=await getListingDetails(button.dataset.marketOpen,gw); if(!row)return;
   const photos=(row.photo_paths||[]).map(function(path){return publicMediaUrl(path,gw);}).filter(Boolean);
   detail.innerHTML='<section class="panel hh-market-detail"><button type="button" class="button button-ghost button-small" id="hh-market-detail-close">Close</button>'+
    (photos.length?'<div class="hh-market-detail-photos">'+photos.map(function(url){return '<img src="'+escapeMarkup(url)+'" alt="">';}).join("")+'</div>':'')+
    '<h2>'+escapeMarkup(row.animal_name||"Unnamed animal")+'</h2><strong>'+escapeMarkup(moneyText(row.price_cents,row.currency))+'</strong>'+
    '<p>'+escapeMarkup([row.species,row.breed,row.sex,row.variety_color].filter(Boolean).join(" · "))+'</p><p>'+escapeMarkup(row.description||"")+'</p>'+
    '<div class="detail-grid"><div><span>Status</span><strong>'+escapeMarkup(row.state)+'</strong></div><div><span>Pedigree</span><strong>'+escapeMarkup(row.pedigree_status||"Not listed")+'</strong></div><div><span>Registration</span><strong>'+escapeMarkup(row.registration_status||"Not listed")+'</strong></div><div><span>Location</span><strong>'+escapeMarkup([row.location_city,row.location_region].filter(Boolean).join(", "))+'</strong></div></div>'+
    '<div class="hh-market-seller-card"><span>Seller</span><strong>'+escapeMarkup(row.seller_rabbitry_name||row.seller_display_name||"HerdHarbor member")+'</strong><small>'+escapeMarkup([row.seller_city,row.seller_region].filter(Boolean).join(", "))+'</small></div>'+
    '<div class="modal-actions"><button type="button" class="button button-ghost" id="hh-market-save">Save listing</button><button type="button" class="button button-ghost" id="hh-market-report">Report</button><button type="button" class="button button-primary" id="hh-market-message">Message Seller</button></div></section>';
   detail.querySelector("#hh-market-detail-close")?.addEventListener("click",function(){detail.innerHTML="";});
   detail.querySelector("#hh-market-save")?.addEventListener("click",async function(){try{await saveListing(row.listing_id,gw);toast("Listing saved.","success");}catch(error){toast(error?.message||"Sign in to save listings.","error");}});
   detail.querySelector("#hh-market-report")?.addEventListener("click",function(){toast("Marketplace reporting is being enabled with the moderation rollout.","info");});
   detail.querySelector("#hh-market-message")?.addEventListener("click",function(){toast("Marketplace messaging is being enabled in the messaging rollout.","info");});
  }catch(error){toast(error?.message||"Listing could not be loaded.","error");}
 });
 target.querySelector("#hh-market-sell")?.addEventListener("click",function(){openSellAnimalDialog(ctx,gw,target.querySelector("#hh-market-sell-dialog"),toast,runSearch);});
 await runSearch();
 return target;
}
function openSellAnimalDialog(context,gw,dialog,toast,refresh){
 if(!dialog)return;
 const animals=Array.isArray(context?.state?.animals)?context.state.animals:[];
 dialog.innerHTML='<form method="dialog" class="hh-market-sell-form"><div class="panel-header"><div><h3>Sell Animal</h3><small>Choose where the listing starts.</small></div></div><div class="hh-market-create-choices"><button type="button" class="button button-ghost" id="hh-market-from-herd">Select From My Herd</button><button type="button" class="button button-ghost" id="hh-market-manual">Create Manual Listing</button></div><div id="hh-market-create-body"></div><div class="modal-actions"><button type="button" class="button button-ghost" id="hh-market-sell-close">Close</button></div></form>';
 const body=dialog.querySelector("#hh-market-create-body");
 function commonFields(){
  return '<div class="form-grid two"><label>Price $<input name="price" type="number" min="0" step=".01"></label><label>City<input name="city" maxlength="120"></label><label>State / region<input name="region" maxlength="120"></label><label>Listing status<select name="state"><option value="draft">Draft</option><option value="available">Available</option></select></label></div><label>Description<textarea name="description" maxlength="5000"></textarea></label>';
 }
 dialog.querySelector("#hh-market-from-herd")?.addEventListener("click",function(){
  body.innerHTML='<form id="hh-market-herd-form"><label>Animal<select name="animalId" required><option value="">Choose an animal</option>'+animals.map(function(a){return '<option value="'+escapeMarkup(a.id)+'">'+escapeMarkup(a.name||a.tag||"Unnamed animal")+'</option>';}).join("")+'</select></label><fieldset><legend>Publish from private record</legend>'+["animal_name","species","breed","sex","dob","variety_color","pedigree_status","registration_status"].map(function(field){return '<label><input type="checkbox" name="field" value="'+field+'" checked> '+escapeMarkup(field.replaceAll("_"," "))+'</label>';}).join("")+'</fieldset>'+commonFields()+'<button class="button button-primary" type="submit">Create listing</button></form>';
  body.querySelector("#hh-market-herd-form")?.addEventListener("submit",async function(event){
   event.preventDefault();const data=new FormData(event.currentTarget);const animal=animals.find(function(a){return String(a.id)===String(data.get("animalId"));});
   try{await createListingFromHerd(animal,{selectedFields:data.getAll("field").concat(["price_cents","currency","location_city","location_region","description"]),state:data.get("state"),overrides:{price_cents:Math.round(Number(data.get("price")||0)*100),currency:"USD",location_city:data.get("city"),location_region:data.get("region"),description:data.get("description")}},gw);toast("Marketplace listing created.","success");dialog.close();await refresh();}catch(error){toast(error?.message||"Listing could not be created.","error");}
  });
 });
 dialog.querySelector("#hh-market-manual")?.addEventListener("click",function(){
  body.innerHTML='<form id="hh-market-manual-form"><div class="form-grid two"><label>Animal name<input name="animal_name" required maxlength="160"></label><label>Species<input name="species" required maxlength="120"></label><label>Breed<input name="breed" maxlength="160"></label><label>Sex<select name="sex"><option value="">Not listed</option><option>Female</option><option>Male</option></select></label><label>Color / variety<input name="variety_color" maxlength="160"></label></div>'+commonFields()+'<button class="button button-primary" type="submit">Create listing</button></form>';
  body.querySelector("#hh-market-manual-form")?.addEventListener("submit",async function(event){
   event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));data.price_cents=Math.round(Number(data.price||0)*100);data.location_city=data.city;data.location_region=data.region;
   try{await createManualListing(data,gw);toast("Marketplace listing created.","success");dialog.close();await refresh();}catch(error){toast(error?.message||"Listing could not be created.","error");}
  });
 });
 dialog.querySelector("#hh-market-sell-close")?.addEventListener("click",function(){dialog.close();});
 if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
}

return Object.freeze({VERSION,TABLES,BUCKETS,PUBLIC_PROFILE_FIELDS,LISTING_STATES,LISTING_PUBLIC_FIELDS,createGateway,gateway,browserClient,normalizePublicProfileDraft,saveSellerProfile,getPublicSellerProfile,publicProfilePreview,normalizeListingDraft,buildListingSnapshotFromHerd,listingInsertPayload,createListingFromHerd,createManualListing,deleteListing,listingCreationOptions,publicMediaUrl,searchArgs,searchListings,getListingDetails,saveListing,renderListingCard,renderMarketplace,openSellAnimalDialog});
});
