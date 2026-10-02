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
 target.innerHTML='<div class="page-header"><div><p class="eyebrow">HerdHarbor</p><h2>Marketplace</h2><p>Browse animals published by HerdHarbor members without exposing private herd records.</p></div><div class="header-actions"><button class="button button-ghost" type="button" id="hh-market-notifications">Notifications</button><button class="button button-ghost" type="button" id="hh-market-saved-searches">Saved Searches</button><button class="button button-ghost" type="button" id="hh-market-saved">Saved</button><button class="button button-ghost" type="button" id="hh-market-my-listings">My Listings</button><button class="button button-ghost" type="button" id="hh-market-moderation">Moderation</button><button class="button button-ghost" type="button" id="hh-market-messages">Messages</button><button class="button button-primary" type="button" id="hh-market-sell">Sell Animal</button></div></div>'+
  '<form id="hh-market-search" class="panel hh-market-filters"><input name="search" placeholder="Search animals, breeds, descriptions"><input name="species" placeholder="Species"><input name="breed" placeholder="Breed"><select name="sex"><option value="">Any sex</option><option>Female</option><option>Male</option></select><input name="region" placeholder="State / region"><input name="minPrice" type="number" min="0" step="1" placeholder="Min $"><input name="maxPrice" type="number" min="0" step="1" placeholder="Max $"><button class="button button-primary" type="submit">Search</button></form>'+
  '<div id="hh-market-results" class="hh-market-grid"><p class="muted">Loading Marketplace…</p></div><div id="hh-market-detail"></div><dialog id="hh-market-sell-dialog"></dialog>';
 const form=target.querySelector("#hh-market-search");
 const results=target.querySelector("#hh-market-results");
 const detail=target.querySelector("#hh-market-detail");
 async function runSearch(){
  const data=Object.fromEntries(new FormData(form));
  const filters={search:data.search,species:data.species,breed:data.breed,sex:data.sex,region:data.region,
   minPriceCents:data.minPrice===""?null:Math.round(Number(data.minPrice)*100),
   maxPriceCents:data.maxPrice===""?null:Math.round(Number(data.maxPrice)*100),limit:36};
  results.setAttribute("aria-busy","true");
  results.innerHTML='<p class="muted">Searching Marketplace…</p>';
  try{
   const rows=await searchListings(filters,gw);
   results.innerHTML=rows.length?rows.map(function(row){return renderListingCard(row,gw);}).join(""):'<div class="empty-state"><strong>No listings found.</strong><span>Try changing the search or filters.</span></div>';
  }catch(error){results.innerHTML='<div class="empty-state"><strong>Marketplace listings could not be loaded.</strong><span>Try again or check your connection.</span></div>';toast(error?.message||"Marketplace search failed.","error");}
  finally{results.setAttribute("aria-busy","false");}
 }
 form.addEventListener("submit",function(event){event.preventDefault();void runSearch();});
 form.addEventListener("reset",function(){setTimeout(function(){void runSearch();},0);});
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
    '<div class="hh-market-seller-card"><span>Seller</span><strong>'+escapeMarkup(row.seller_rabbitry_name||row.seller_display_name||"HerdHarbor member")+'</strong><small>'+escapeMarkup([row.seller_city,row.seller_region].filter(Boolean).join(", "))+'</small><button type="button" class="button button-ghost button-small" id="hh-market-seller-profile">View seller profile</button></div>'+
    '<div id="hh-market-pedigree-view"></div><div class="modal-actions"><button type="button" class="button button-ghost" id="hh-market-pedigree" hidden>View HerdHarbor Pedigree</button><button type="button" class="button button-ghost" id="hh-market-save">Save listing</button><button type="button" class="button button-ghost" id="hh-market-report">Report listing</button><button type="button" class="button button-ghost" id="hh-market-block">Block seller</button>'+(row.state==="sold"?'<button type="button" class="button button-ghost" id="hh-market-review">Leave seller feedback</button>':"")+'<button type="button" class="button button-primary" id="hh-market-message">Message Seller</button></div></section>';
   detail.querySelector("#hh-market-detail-close")?.addEventListener("click",function(){detail.innerHTML="";});
   let publicPedigree=null;
   try{publicPedigree=await getPublicListingPedigree(row.listing_id,gw);}catch{}
   const pedigreeButton=detail.querySelector("#hh-market-pedigree");
   if(publicPedigree&&pedigreeButton){
    pedigreeButton.hidden=false;
    pedigreeButton.addEventListener("click",function(){
      const host=detail.querySelector("#hh-market-pedigree-view");
      if(!host)return;
      host.innerHTML='<section class="hh-market-pedigree-panel"><div class="panel-header"><div><h3>HerdHarbor Pedigree</h3><small>Seller-controlled public pedigree snapshot</small></div><button type="button" class="button button-ghost button-small" id="hh-market-pedigree-close">Close pedigree</button></div>'+renderPublicPedigree(publicPedigree)+'</section>';
      host.querySelector("#hh-market-pedigree-close")?.addEventListener("click",function(){host.innerHTML="";});
      host.scrollIntoView?.({block:"start",behavior:"smooth"});
    });
   }
   detail.querySelector("#hh-market-seller-profile")?.addEventListener("click",async function(){
    try{
      const [profile,summary,reviews,trust]=await Promise.all([getPublicSellerProfile(row.seller_public_id,gw),sellerFeedbackSummary(row.seller_public_id,gw),sellerFeedback(row.seller_public_id,20,0,gw),trustIndicators(row.seller_public_id,gw)]);
      if(!profile)return;
      const host=detail.querySelector(".hh-market-seller-card");
      if(host&&!host.querySelector(".hh-seller-profile-expanded")){
        host.insertAdjacentHTML("beforeend",'<div class="hh-seller-profile-expanded"><p>'+escapeMarkup(profile.about||"No public seller description.")+'</p><small>Member since '+escapeMarkup(new Date(profile.member_since).toLocaleDateString())+' · '+Number(profile.active_listing_count||0)+' active listing(s)</small>'+trustIndicatorsHtml(trust)+sellerFeedbackHtml(summary,reviews)+'</div>');
        host.querySelector(".hh-seller-profile-expanded")?.addEventListener("click",async function(event){
          const report=event.target.closest("[data-report-review]"); if(!report)return;
          const reason=root?.prompt?.("Reason for reporting this review:")||""; if(!reason)return;
          try{await submitReport("review",report.dataset.reportReview,reason,"",gw);toast("Review report submitted.","success");}
          catch(error){toast(error?.message||"Review could not be reported.","error");}
        });
      }
    }catch(error){toast(error?.message||"Seller profile could not be loaded.","error");}
   });
   detail.querySelector("#hh-market-save")?.addEventListener("click",async function(){try{await saveListing(row.listing_id,gw);toast("Listing saved.","success");}catch(error){toast(error?.message||"Sign in to save listings.","error");}});
   detail.querySelector("#hh-market-report")?.addEventListener("click",async function(){
    const reason=root?.prompt?.("Reason for reporting this listing:")||"";
    if(!reason)return;
    try{await submitReport("listing",row.listing_id,reason,"",gw);toast("Report submitted for review.","success");}
    catch(error){toast(error?.message||"Report could not be submitted.","error");}
   });
   detail.querySelector("#hh-market-block")?.addEventListener("click",async function(){
    if(!row.seller_public_id)return;
    if(root?.confirm&&!root.confirm("Block this Marketplace seller? Existing and future Marketplace messaging will be unavailable."))return;
    try{await blockPublicProfile(row.seller_public_id,gw);toast("Seller blocked in Marketplace.","success");detail.innerHTML="";}
    catch(error){toast(error?.message||"Seller could not be blocked.","error");}
   });
   detail.querySelector("#hh-market-review")?.addEventListener("click",async function(){
    const rawRating=root?.prompt?.("Seller rating from 1 to 5:","5"); if(rawRating===null||rawRating==="")return;
    const rating=Number(rawRating);
    const feedback=root?.prompt?.("Optional feedback:","")||"";
    try{await submitSellerReview(row.listing_id,rating,feedback,gw);toast("Seller feedback submitted.","success");}
    catch(error){toast(error?.message||"Feedback could not be submitted.","error");}
   });
   detail.querySelector("#hh-market-message")?.addEventListener("click",async function(){
    try{
      const conversationId=await openListingConversation(row.listing_id,gw);
      await renderInbox(detail,gw,toast,conversationId);
    }catch(error){toast(error?.message||"Conversation could not be opened.","error");}
   });
  }catch(error){toast(error?.message||"Listing could not be loaded.","error");}
 });
 target.querySelector("#hh-market-notifications")?.addEventListener("click",function(){void renderMarketplaceNotifications(detail,gw,toast);});
 target.querySelector("#hh-market-saved-searches")?.addEventListener("click",function(){void renderSavedSearches(detail,form,runSearch,gw,toast);});
 target.querySelector("#hh-market-save-search")?.addEventListener("click",async function(){const data=Object.fromEntries(new FormData(form));const filters={search:data.search,species:data.species,breed:data.breed,sex:data.sex,region:data.region,minPriceCents:data.minPrice===""?null:Math.round(Number(data.minPrice)*100),maxPriceCents:data.maxPrice===""?null:Math.round(Number(data.maxPrice)*100)};const name=root?.prompt?.("Name this saved search:","Marketplace search")||"";if(!name)return;try{await saveSearch(filters,name,true,null,gw);toast("Search saved with in-app alerts.","success");}catch(error){toast(error?.message||"Search could not be saved.","error");}});
 target.querySelector("#hh-market-saved")?.addEventListener("click",function(){void renderFavorites(detail,gw,toast);});
 target.querySelector("#hh-market-my-listings")?.addEventListener("click",function(){void renderSellerListings(detail,gw,toast);});
 target.querySelector("#hh-market-moderation")?.addEventListener("click",function(){void renderModerationQueue(detail,gw,toast);});
 target.querySelector("#hh-market-messages")?.addEventListener("click",function(){void renderInbox(detail,gw,toast);});
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
  body.innerHTML='<form id="hh-market-herd-form"><label>Animal<select name="animalId" required><option value="">Choose an animal</option>'+animals.map(function(a){return '<option value="'+escapeMarkup(a.id)+'">'+escapeMarkup(a.name||a.tag||"Unnamed animal")+'</option>';}).join("")+'</select></label><fieldset><legend>Publish from private record</legend>'+["animal_name","species","breed","sex","dob","variety_color","pedigree_status","registration_status"].map(function(field){return '<label><input type="checkbox" name="field" value="'+field+'" checked> '+escapeMarkup(field.replaceAll("_"," "))+'</label>';}).join("")+'</fieldset><label>Public pedigree<select name="pedigreeVisibility"><option value="hidden">Hidden</option><option value="parents">Parents only</option><option value="3">3 generations</option><option value="4">4 generations</option><option value="5">5 generations</option></select></label><fieldset><legend>Public ancestor fields</legend>'+PUBLIC_PEDIGREE_FIELDS.filter(function(field){return field!=="photoData";}).map(function(field){return '<label><input type="checkbox" name="pedigreeField" value="'+escapeMarkup(field)+'" checked> '+escapeMarkup(field)+'</label>';}).join("")+'<label><input type="checkbox" name="pedigreeField" value="photoData"> Photos</label></fieldset>'+commonFields()+'<button class="button button-primary" type="submit">Create listing</button></form>';
  body.querySelector("#hh-market-herd-form")?.addEventListener("submit",async function(event){
   event.preventDefault();const data=new FormData(event.currentTarget);const animal=animals.find(function(a){return String(a.id)===String(data.get("animalId"));});
   try{
    const created=await createListingFromHerd(animal,{selectedFields:data.getAll("field").concat(["price_cents","currency","location_city","location_region","description"]),state:data.get("state"),overrides:{price_cents:Math.round(Number(data.get("price")||0)*100),currency:"USD",location_city:data.get("city"),location_region:data.get("region"),description:data.get("description")}},gw);
    const visibility=String(data.get("pedigreeVisibility")||"hidden");
    if(created?.id&&visibility!=="hidden"){
      const snapshot=buildPublicPedigreeSnapshot(animals,animal.id,{visibility,ancestorFields:data.getAll("pedigreeField")});
      await setListingPublicPedigree(created.id,snapshot,gw);
    }
    toast("Marketplace listing created.","success");dialog.close();await refresh();
   }catch(error){toast(error?.message||"Listing could not be created.","error");}
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


const PUBLIC_PEDIGREE_FIELDS=Object.freeze(["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","photoData"]);
function publicPedigreeDepth(visibility){
 const value=String(visibility||"hidden");
 if(value==="parents")return 2;
 const numeric=Number(value);
 return Number.isInteger(numeric)&&numeric>=3&&numeric<=5?numeric:0;
}
function buildPublicPedigreeSnapshot(animals,rootId,options){
 const raw=options&&typeof options==="object"?options:{};
 const visibility=String(raw.visibility||"hidden");
 const depth=publicPedigreeDepth(visibility);
 if(!depth)return {visibility:"hidden",depth:0,pedigree:null};
 const engine=root?.HerdHarborPedigreePlatform;
 if(!engine?.buildPedigreeGraph)throw new Error("Pedigree engine is unavailable.");
 const graph=engine.buildPedigreeGraph({animals:Array.isArray(animals)?animals:[],rootId,generations:depth});
 const requested=new Set(Array.isArray(raw.ancestorFields)?raw.ancestorFields:PUBLIC_PEDIGREE_FIELDS);
 const allowed=PUBLIC_PEDIGREE_FIELDS.filter(function(field){return requested.has(field);});
 const identityAliases=new Map();
 let aliasCounter=0;
 const alias=function(identityId){
  if(!identityId)return "";
  if(!identityAliases.has(identityId)){aliasCounter+=1;identityAliases.set(identityId,"p"+aliasCounter);}
  return identityAliases.get(identityId);
 };
 const nodes=graph.nodes.map(function(node){
  let animal=null;
  if(node.known&&node.animal){
   animal={};
   allowed.forEach(function(field){
    let value=node.animal[field];
    if(field==="variety")value=node.animal.variety||node.animal.color||"";
    if(field==="color")value=node.animal.color||node.animal.variety||"";
    if(value!==""&&value!==null&&value!==undefined)animal[field]=value;
   });
  }
  return {
   path:node.path,generation:node.generation,relation:node.relation,publicKey:alias(node.identityId),
   known:Boolean(node.known),cycle:Boolean(node.cycle),missingReference:Boolean(node.missingReference),animal
  };
 });
 return {visibility,depth,pedigree:{schemaVersion:1,generations:depth,nodes}};
}
async function setListingPublicPedigree(listingId,snapshot,customGateway){
 const gw=customGateway||gateway();
 const safe=snapshot&&typeof snapshot==="object"?snapshot:{visibility:"hidden",depth:0,pedigree:null};
 const result=await gw.table(TABLES.listings).update({
  pedigree_visibility:safe.visibility||"hidden",
  pedigree_depth:Number(safe.depth||0),
  public_pedigree:safe.pedigree||null
 }).eq("id",String(listingId)).select("id,pedigree_visibility,pedigree_depth").single();
 if(result.error)throw result.error;
 return result.data;
}
async function getPublicListingPedigree(listingId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_public_pedigree",{target_listing_id:String(listingId)});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?(result.data[0]||null):result.data||null;
}
function publicSnapshotToGraph(payload){
 const data=payload&&typeof payload==="object"?payload:{};
 const graph=data.public_pedigree||data;
 return {
  version:"public",
  rootId:"",
  generations:Number(graph.generations||data.pedigree_depth||3),
  nodes:Array.isArray(graph.nodes)?graph.nodes.map(function(node){
    return {
      path:String(node.path||""),generation:Number(node.generation||0),relation:String(node.relation||""),
      identityId:String(node.publicKey||""),known:Boolean(node.known),cycle:Boolean(node.cycle),
      missingReference:Boolean(node.missingReference),expectedSex:"",
      animal:node.animal&&typeof node.animal==="object"?Object.assign({},node.animal,{id:String(node.publicKey||"")}):null
    };
  }):[],
  repeatedAncestors:[],coverage:{knownAncestorCount:0,expectedAncestorCount:0,ratio:0,percent:0},problems:[]
 };
}
function renderPublicPedigree(payload){
 const engine=root?.HerdHarborPedigreePlatform;
 if(!engine?.renderPedigree)return "";
 return engine.renderPedigree(publicSnapshotToGraph(payload),{mode:"publicMarketplace",expanded:false});
}


async function openListingConversation(listingId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_open_listing_conversation",{target_listing_id:String(listingId)});
 if(result.error)throw result.error;
 return result.data;
}
async function listConversations(folder,customGateway){
 const gw=customGateway||gateway();
 const value=["all","buying","selling","unread"].includes(String(folder||"").toLowerCase())?String(folder).toLowerCase():"all";
 const result=await gw.rpc("marketplace_inbox",{folder:value});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function listMessages(conversationId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.table(TABLES.messages).select("id,conversation_id,sender_id,body,created_at,edited_at").eq("conversation_id",String(conversationId)).order("created_at",{ascending:true}).order("id",{ascending:true});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function sendMessage(conversationId,body,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const message=textValue(body,5000);
 if(!message)throw new Error("Enter a message before sending.");
 const result=await gw.table(TABLES.messages).insert({conversation_id:String(conversationId),sender_id:user.id,body:message}).select("id,conversation_id,sender_id,body,created_at").single();
 if(result.error)throw result.error;
 return result.data;
}
async function updateConversationMember(conversationId,changes,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const allowed={};
 if(Object.prototype.hasOwnProperty.call(changes||{},"unread_count"))allowed.unread_count=Math.max(0,Number(changes.unread_count||0));
 if(Object.prototype.hasOwnProperty.call(changes||{},"muted_at"))allowed.muted_at=changes.muted_at||null;
 if(Object.prototype.hasOwnProperty.call(changes||{},"archived_at"))allowed.archived_at=changes.archived_at||null;
 const result=await gw.table(TABLES.members).update(allowed).eq("conversation_id",String(conversationId)).eq("user_id",user.id);
 if(result.error)throw result.error;
 return true;
}
function subscribeConversation(conversationId,handler,customGateway){
 const gw=customGateway||gateway();
 const channel=gw.channel("marketplace-conversation-"+String(conversationId));
 channel.on("postgres_changes",{event:"INSERT",schema:"public",table:TABLES.messages,filter:"conversation_id=eq."+String(conversationId)},function(payload){
  if(typeof handler==="function")handler(payload.new||payload);
 });
 channel.subscribe();
 return channel;
}
async function renderInbox(host,customGateway,toast,selectedConversationId){
 if(!host)throw new Error("Marketplace inbox host is required.");
 const gw=customGateway||gateway();
 const notify=typeof toast==="function"?toast:function(){};
 host.innerHTML='<section class="panel hh-market-inbox"><div class="panel-header"><div><h3>Marketplace Messages</h3><small>Private listing-linked conversations</small></div><button type="button" class="button button-ghost button-small" id="hh-inbox-close">Close</button></div><div class="hh-inbox-filters"><button type="button" data-inbox-folder="all">All</button><button type="button" data-inbox-folder="buying">Buying</button><button type="button" data-inbox-folder="selling">Selling</button><button type="button" data-inbox-folder="unread">Unread</button></div><div class="hh-inbox-layout"><div id="hh-inbox-list"></div><div id="hh-inbox-thread"><p class="muted">Choose a conversation.</p></div></div></section>';
 host.querySelector("#hh-inbox-close")?.addEventListener("click",function(){host.innerHTML="";});
 const list=host.querySelector("#hh-inbox-list");
 const thread=host.querySelector("#hh-inbox-thread");
 let folder="all";
 let realtime=null;
 let inboxRows=[];
 async function loadInbox(){
  const rows=await listConversations(folder,gw);
  inboxRows=rows;
  list.innerHTML=rows.length?rows.map(function(row){
   return '<button type="button" class="hh-inbox-row" data-inbox-conversation="'+escapeMarkup(row.conversation_id)+'"><strong>'+escapeMarkup(row.other_rabbitry_name||row.other_display_name||"HerdHarbor member")+'</strong><span>'+escapeMarkup(row.listing_name||"Marketplace listing")+'</span><small>'+escapeMarkup(row.last_message_preview||"No messages yet")+(row.unread_count?' · '+row.unread_count+' unread':'')+'</small></button>';
  }).join(""):'<p class="muted">No conversations in this view.</p>';
  if(selectedConversationId){const id=selectedConversationId;selectedConversationId=null;await openThread(id);}
 }
 async function openThread(conversationId){
  realtime?.unsubscribe?.(); realtime=null;
  const messages=await listMessages(conversationId,gw);
  const user=await gw.user();
  await updateConversationMember(conversationId,{unread_count:0},gw).catch(function(){});
  const conversationRow=inboxRows.find(function(row){return String(row.conversation_id)===String(conversationId);})||{};
  thread.innerHTML='<div class="hh-message-list">'+(messages.length?messages.map(function(message){
   const mine=String(message.sender_id)===String(user.id);
   return '<div class="hh-message '+(mine?'mine':'theirs')+'"><span>'+escapeMarkup(message.body)+'</span><small>'+escapeMarkup(new Date(message.created_at).toLocaleString())+'</small></div>';
  }).join(""):'<p class="muted">No messages yet. Start the conversation.</p>')+'</div><form id="hh-message-form"><textarea name="body" maxlength="5000" required placeholder="Message seller"></textarea><div class="modal-actions"><button type="button" class="button button-ghost" id="hh-message-report">Report conversation</button><button type="button" class="button button-ghost" id="hh-message-block">Block user</button><button type="button" class="button button-ghost" id="hh-message-mute">Mute</button><button type="button" class="button button-ghost" id="hh-message-archive">Archive</button><button type="submit" class="button button-primary">Send</button></div></form>';
  const form=thread.querySelector("#hh-message-form");
  form?.addEventListener("submit",async function(event){event.preventDefault();const data=new FormData(event.currentTarget);try{await sendMessage(conversationId,data.get("body"),gw);event.currentTarget.reset();await openThread(conversationId);}catch(error){notify(error?.message||"Message could not be sent.","error");}});
  thread.querySelector("#hh-message-report")?.addEventListener("click",async function(){const reason=root?.prompt?.("Reason for reporting this conversation:")||"";if(!reason)return;try{await submitReport("conversation",conversationId,reason,"",gw);notify("Conversation reported.","success");}catch(error){notify(error?.message||"Report failed.","error");}});
  thread.querySelector("#hh-message-block")?.addEventListener("click",async function(){if(!conversationRow.other_public_id)return notify("This profile cannot be blocked from this thread.","error");try{await blockPublicProfile(conversationRow.other_public_id,gw);notify("User blocked in Marketplace.","success");await loadInbox();}catch(error){notify(error?.message||"User could not be blocked.","error");}});
  thread.querySelector("#hh-message-mute")?.addEventListener("click",async function(){await updateConversationMember(conversationId,{muted_at:new Date().toISOString()},gw);notify("Conversation muted.","success");});
  thread.querySelector("#hh-message-archive")?.addEventListener("click",async function(){await updateConversationMember(conversationId,{archived_at:new Date().toISOString()},gw);notify("Conversation archived.","success");await loadInbox();});
  realtime=subscribeConversation(conversationId,function(){void openThread(conversationId);},gw);
 }
 host.querySelectorAll("[data-inbox-folder]").forEach(function(button){button.addEventListener("click",function(){folder=button.dataset.inboxFolder||"all";void loadInbox();});});
 list.addEventListener("click",function(event){const button=event.target.closest("[data-inbox-conversation]");if(button)void openThread(button.dataset.inboxConversation);});
 try{await loadInbox();}catch(error){notify(error?.message||"Marketplace messages could not be loaded.","error");}
 return host;
}


async function submitReport(targetType,targetId,reason,details,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_submit_report",{report_target_type:String(targetType),report_target_id:String(targetId),report_reason:textValue(reason,240),report_details:textValue(details,2000)});
 if(result.error)throw result.error;
 return result.data;
}
async function blockPublicProfile(publicId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_block_profile",{target_public_id:String(publicId)});
 if(result.error)throw result.error;
 return true;
}
async function getModerationQueue(status,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_moderation_queue",{queue_status:String(status||"open")});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function moderateReport(reportId,action,reason,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_moderate_report",{target_report_id:String(reportId),moderation_action:String(action),moderation_reason:textValue(reason,1000)});
 if(result.error)throw result.error;
 return true;
}
async function renderModerationQueue(host,customGateway,toast){
 const gw=customGateway||gateway(); const notify=typeof toast==="function"?toast:function(){};
 if(!host)return;
 host.innerHTML='<section class="panel"><div class="panel-header"><div><h3>Marketplace moderation</h3><small>Marketplace-only actions and audit trail</small></div><button type="button" class="button button-ghost button-small" id="hh-moderation-close">Close</button></div><div id="hh-moderation-list"><p class="muted">Loading reports…</p></div></section>';
 host.querySelector("#hh-moderation-close")?.addEventListener("click",function(){host.innerHTML="";});
 const list=host.querySelector("#hh-moderation-list");
 try{
  const reports=await getModerationQueue("open",gw);
  list.innerHTML=reports.length?reports.map(function(row){
    const targetAction=row.target_type==="listing"?'<button type="button" data-moderate-action="hide_listing" data-report-id="'+escapeMarkup(row.report_id)+'">Hide listing</button>':
      row.target_type==="review"?'<button type="button" data-moderate-action="hide_review" data-report-id="'+escapeMarkup(row.report_id)+'">Hide review</button>':
      row.target_type==="user"?'<button type="button" data-moderate-action="suspend_marketplace" data-report-id="'+escapeMarkup(row.report_id)+'">Suspend Marketplace</button>':"";
    return '<article class="list-item"><div class="list-item-main"><strong>'+escapeMarkup(row.target_type)+' report</strong><span>'+escapeMarkup(row.reason)+'</span><small>'+escapeMarkup(row.details||"")+'</small></div><div class="modal-actions"><button type="button" data-moderate-action="warn" data-report-id="'+escapeMarkup(row.report_id)+'">Warn</button>'+targetAction+'<button type="button" data-moderate-action="dismiss" data-report-id="'+escapeMarkup(row.report_id)+'">Dismiss</button></div></article>';
  }).join(""):'<p class="muted">No open Marketplace reports.</p>';
  list.addEventListener("click",async function(event){const button=event.target.closest("[data-moderate-action]");if(!button)return;try{await moderateReport(button.dataset.reportId,button.dataset.moderateAction,"Reviewed in Marketplace moderation queue",gw);notify("Moderation action recorded.","success");await renderModerationQueue(host,gw,notify);}catch(error){notify(error?.message||"Moderation action failed.","error");}});
 }catch(error){list.innerHTML='<p class="muted">Moderation queue unavailable.</p>';notify(error?.message||"Moderation queue unavailable.","error");}
}


async function myListings(status,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_my_listings",{status_filter:status||null});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function updateListingState(listingId,state,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_update_listing_state",{target_listing_id:String(listingId),new_state:String(state)});
 if(result.error)throw result.error;
 return result.data;
}
async function confirmListing(listingId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_confirm_listing",{target_listing_id:String(listingId)});
 if(result.error)throw result.error;
 return result.data;
}
async function refreshSellerNotifications(customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_refresh_seller_notifications",{});
 if(result.error)throw result.error;
 return Number(result.data||0);
}
async function myNotifications(limit,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_my_notifications",{result_limit:Math.min(100,Math.max(1,Number(limit||50)))});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function markNotificationRead(id,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_mark_notification_read",{target_notification_id:String(id)});
 if(result.error)throw result.error;
 return true;
}
async function myFavorites(limit,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_my_favorites",{result_limit:Math.min(100,Math.max(1,Number(limit||60)))});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function removeFavorite(listingId,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const result=await gw.table(TABLES.favorites).delete().eq("user_id",user.id).eq("listing_id",String(listingId));
 if(result.error)throw result.error;
 return true;
}
async function imageFileToUpload(file){
 if(!file)throw new Error("Choose an image first.");
 if(!/^image\/(?:jpeg|png|webp)$/i.test(String(file.type||"")))throw new Error("Marketplace photos must be JPEG, PNG, or WebP.");
 if(Number(file.size||0)>12*1024*1024)throw new Error("Marketplace photos must be 12 MB or smaller before processing.");
 if(typeof document==="undefined"||typeof Image==="undefined"||typeof URL==="undefined")return {blob:file,extension:(file.type||"image/jpeg").split("/")[1]||"jpg"};
 const url=URL.createObjectURL(file);
 try{
  const image=new Image(); image.src=url;
  if(typeof image.decode==="function")await image.decode(); else await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=reject;});
  const maxSide=1600;
  const width=image.naturalWidth||image.width||1, height=image.naturalHeight||image.height||1;
  const scale=Math.min(1,maxSide/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*scale)); canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d"); ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(function(resolve){canvas.toBlob(resolve,"image/webp",0.84);});
  return {blob:blob||file,extension:blob?"webp":((file.type||"image/jpeg").split("/")[1]||"jpg")};
 } finally {URL.revokeObjectURL(url);}
}
async function uploadListingPhotos(listingId,files,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const input=Array.from(files||[]).slice(0,8);
 if(!input.length)return [];
 const existing=await gw.table(TABLES.photos).select("id,sort_order").eq("listing_id",String(listingId)).order("sort_order",{ascending:true});
 if(existing.error)throw existing.error;
 const start=(existing.data||[]).reduce(function(max,row){return Math.max(max,Number(row.sort_order||0)+1);},0);
 const uploaded=[];
 for(let i=0;i<input.length;i+=1){
  const prepared=await imageFileToUpload(input[i]);
  const random=(root?.crypto?.randomUUID?.()||String(Date.now())+"-"+Math.random().toString(36).slice(2));
  const path=user.id+"/"+String(listingId)+"/"+random+"."+prepared.extension;
  const storage=await gw.bucket(BUCKETS.publicMedia).upload(path,prepared.blob,{upsert:false,contentType:prepared.blob.type||input[i].type||"image/webp"});
  if(storage.error)throw storage.error;
  const row=await gw.table(TABLES.photos).insert({listing_id:String(listingId),seller_id:user.id,storage_path:path,sort_order:start+i,alt_text:""}).select("id,storage_path,sort_order").single();
  if(row.error)throw row.error;
  uploaded.push(row.data);
 }
 return uploaded;
}
async function removeListingPhoto(photoId,customGateway){
 const gw=customGateway||gateway();
 const user=await gw.user();
 const lookup=await gw.table(TABLES.photos).select("id,storage_path").eq("id",String(photoId)).eq("seller_id",user.id).single();
 if(lookup.error)throw lookup.error;
 const storage=await gw.bucket(BUCKETS.publicMedia).remove([lookup.data.storage_path]);
 if(storage.error)throw storage.error;
 const result=await gw.table(TABLES.photos).delete().eq("id",String(photoId)).eq("seller_id",user.id);
 if(result.error)throw result.error;
 return true;
}
function stateActionsForListing(state){
 const value=String(state||"draft");
 if(value==="draft")return ["available","archived"];
 if(value==="available")return ["pending","sold","archived"];
 if(value==="pending")return ["available","sold","archived"];
 if(value==="sold")return ["archived"];
 if(value==="expired")return ["available","archived"];
 return [];
}
async function renderSellerListings(host,customGateway,toast){
 const gw=customGateway||gateway(); const notify=typeof toast==="function"?toast:function(){};
 host.innerHTML='<section class="panel"><div class="panel-header"><div><h3>My Listings</h3><small>Drafts, active listings, pending sales, sold animals, and archived listings</small></div><button type="button" class="button button-ghost button-small" id="hh-my-listings-close">Close</button></div><div id="hh-my-listings-body" aria-live="polite"><p class="muted">Loading listings…</p></div></section>';
 host.querySelector("#hh-my-listings-close")?.addEventListener("click",function(){host.innerHTML="";});
 const body=host.querySelector("#hh-my-listings-body");
 async function load(){
  const rows=await myListings(null,gw);
  body.innerHTML=rows.length?rows.map(function(row){
   const actions=stateActionsForListing(row.state).map(function(next){return '<button type="button" class="button button-ghost button-small" data-listing-state="'+escapeMarkup(next)+'" data-listing-id="'+escapeMarkup(row.listing_id)+'">'+escapeMarkup(next[0].toUpperCase()+next.slice(1))+'</button>';}).join("");
   return '<article class="list-item hh-my-listing-row"><div class="list-item-main"><strong>'+escapeMarkup(row.animal_name||"Unnamed animal")+'</strong><span>'+escapeMarkup([row.state,row.breed,moneyText(row.price_cents,row.currency)].filter(Boolean).join(" · "))+'</span><small>'+Number(row.photo_count||0)+' photo(s)'+(row.expires_at?' · expires '+escapeMarkup(new Date(row.expires_at).toLocaleDateString()):'')+'</small></div><div class="modal-actions">'+(row.state==="available"?'<button type="button" class="button button-ghost button-small" data-confirm-listing="'+escapeMarkup(row.listing_id)+'">Still available</button>':'')+actions+'<label class="button button-ghost button-small">Add photos<input type="file" data-listing-photo="'+escapeMarkup(row.listing_id)+'" accept="image/jpeg,image/png,image/webp" multiple hidden></label></div></article>';
  }).join(""):'<div class="empty-state"><strong>No Marketplace listings yet.</strong><span>Use Sell Animal to create a draft or active listing.</span></div>';
 }
 body.addEventListener("click",async function(event){
  const stateButton=event.target.closest("[data-listing-state]");
  const confirmButton=event.target.closest("[data-confirm-listing]");
  try{
   if(stateButton){await updateListingState(stateButton.dataset.listingId,stateButton.dataset.listingState,gw);notify("Listing status updated.","success");await load();}
   if(confirmButton){await confirmListing(confirmButton.dataset.confirmListing,gw);notify("Listing confirmed as still available.","success");await load();}
  }catch(error){notify(error?.message||"Listing could not be updated.","error");}
 });
 body.addEventListener("change",async function(event){
  const input=event.target.closest("[data-listing-photo]"); if(!input)return;
  try{await uploadListingPhotos(input.dataset.listingPhoto,input.files,gw);notify("Listing photo(s) uploaded.","success");await load();}
  catch(error){notify(error?.message||"Photo upload failed.","error");}
 });
 try{await load();}catch(error){body.innerHTML='<p class="muted">Your listings could not be loaded.</p>';notify(error?.message||"Listing management unavailable.","error");}
}
async function renderFavorites(host,customGateway,toast){
 const gw=customGateway||gateway(); const notify=typeof toast==="function"?toast:function(){};
 host.innerHTML='<section class="panel"><div class="panel-header"><div><h3>Saved Listings</h3><small>Your private Marketplace favorites</small></div><button type="button" class="button button-ghost button-small" id="hh-favorites-close">Close</button></div><div id="hh-favorites-body" class="hh-market-grid" aria-live="polite"><p class="muted">Loading saved listings…</p></div></section>';
 host.querySelector("#hh-favorites-close")?.addEventListener("click",function(){host.innerHTML="";});
 const body=host.querySelector("#hh-favorites-body");
 try{
  const rows=await myFavorites(60,gw);
  body.innerHTML=rows.length?rows.map(function(row){return '<article class="hh-market-card"><div class="hh-market-card-copy"><span class="badge">'+escapeMarkup(row.state)+'</span><h3>'+escapeMarkup(row.animal_name||"Unnamed animal")+'</h3><p>'+escapeMarkup([row.breed,row.sex].filter(Boolean).join(" · "))+'</p><strong>'+escapeMarkup(moneyText(row.price_cents,row.currency))+'</strong><button type="button" class="button button-ghost button-small" data-remove-favorite="'+escapeMarkup(row.listing_id)+'">Remove saved listing</button></div></article>';}).join(""):'<div class="empty-state"><strong>No saved listings.</strong><span>Save listings you want to revisit.</span></div>';
  body.addEventListener("click",async function(event){const button=event.target.closest("[data-remove-favorite]");if(!button)return;try{await removeFavorite(button.dataset.removeFavorite,gw);button.closest(".hh-market-card")?.remove();}catch(error){notify(error?.message||"Saved listing could not be removed.","error");}});
 }catch(error){body.innerHTML='<p class="muted">Saved listings could not be loaded.</p>';notify(error?.message||"Saved listings unavailable.","error");}
}
async function renderMarketplaceNotifications(host,customGateway,toast){
 const gw=customGateway||gateway(); const notify=typeof toast==="function"?toast:function(){};
 try{await refreshSellerNotifications(gw);}catch{}
 host.innerHTML='<section class="panel"><div class="panel-header"><div><h3>Marketplace Notifications</h3><small>Listing reminders and Marketplace activity</small></div><button type="button" class="button button-ghost button-small" id="hh-notifications-close">Close</button></div><div id="hh-notifications-body" aria-live="polite"><p class="muted">Loading notifications…</p></div></section>';
 host.querySelector("#hh-notifications-close")?.addEventListener("click",function(){host.innerHTML="";});
 const body=host.querySelector("#hh-notifications-body");
 try{
  const rows=await myNotifications(50,gw);
  body.innerHTML=rows.length?rows.map(function(row){const name=row.payload?.listing_name||"Marketplace update";return '<button type="button" class="hh-notification-row" data-notification-id="'+escapeMarkup(row.notification_id)+'"><strong>'+escapeMarkup(row.kind==="stale_listing"?"Confirm listing availability":row.kind)+'</strong><span>'+escapeMarkup(name)+'</span><small>'+escapeMarkup(new Date(row.created_at).toLocaleString())+(row.read_at?"":" · unread")+'</small></button>';}).join(""):'<div class="empty-state"><strong>No Marketplace notifications.</strong><span>Listing reminders and alerts will appear here.</span></div>';
  body.addEventListener("click",async function(event){const button=event.target.closest("[data-notification-id]");if(!button)return;try{await markNotificationRead(button.dataset.notificationId,gw);button.classList.add("read");}catch(error){notify(error?.message||"Notification could not be updated.","error");}});
 }catch(error){body.innerHTML='<p class="muted">Marketplace notifications could not be loaded.</p>';notify(error?.message||"Notifications unavailable.","error");}
}


function savedSearchPayloadFromFilters(filters,name,alertsEnabled,searchId){
 const args=searchArgs(filters||{});
 return {
  target_search_id:searchId||null,
  search_name:textValue(name||"Saved Marketplace search",120),
  search_text_value:args.search_text||"",
  species_value:args.species_filter||"",
  breed_value:args.breed_filter||"",
  sex_value:args.sex_filter||"",
  min_price_value:args.min_price_cents,
  max_price_value:args.max_price_cents,
  pedigree_value:args.pedigree_filter||"",
  region_value:args.region_filter||"",
  alerts_value:alertsEnabled!==false
 };
}
async function saveSearch(filters,name,alertsEnabled,searchId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_save_search",savedSearchPayloadFromFilters(filters,name,alertsEnabled,searchId));
 if(result.error)throw result.error;
 return result.data;
}
async function listSavedSearches(customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_saved_searches",{});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function deleteSavedSearch(searchId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_delete_saved_search",{target_search_id:String(searchId)});
 if(result.error)throw result.error;
 return true;
}
function filtersFromSavedSearch(row){
 return {
  search:row.search_text||"",species:row.species||"",breed:row.breed||"",sex:row.sex||"",
  minPriceCents:row.min_price_cents,maxPriceCents:row.max_price_cents,pedigreeStatus:row.pedigree_status||"",region:row.region||""
 };
}
function applySavedSearchToForm(form,row){
 if(!form)return;
 const values={
  search:row.search_text||"",species:row.species||"",breed:row.breed||"",sex:row.sex||"",region:row.region||"",
  minPrice:row.min_price_cents===null||row.min_price_cents===undefined?"":(Number(row.min_price_cents)/100).toFixed(2),
  maxPrice:row.max_price_cents===null||row.max_price_cents===undefined?"":(Number(row.max_price_cents)/100).toFixed(2)
 };
 Object.entries(values).forEach(function(entry){const control=form.elements.namedItem(entry[0]);if(control)control.value=entry[1];});
}
async function renderSavedSearches(host,form,runSearch,customGateway,toast){
 const gw=customGateway||gateway(); const notify=typeof toast==="function"?toast:function(){};
 host.innerHTML='<section class="panel"><div class="panel-header"><div><h3>Saved Searches</h3><small>Reusable Marketplace filters with optional in-app alerts</small></div><button type="button" class="button button-ghost button-small" id="hh-saved-searches-close">Close</button></div><div id="hh-saved-searches-body" aria-live="polite"><p class="muted">Loading saved searches…</p></div></section>';
 host.querySelector("#hh-saved-searches-close")?.addEventListener("click",function(){host.innerHTML="";});
 const body=host.querySelector("#hh-saved-searches-body");
 async function load(){
  const rows=await listSavedSearches(gw);
  body.innerHTML=rows.length?rows.map(function(row){
   const summary=[row.species,row.breed,row.sex,row.region,row.min_price_cents!==null&&row.min_price_cents!==undefined?"Min "+moneyText(row.min_price_cents,"USD"):"",row.max_price_cents!==null&&row.max_price_cents!==undefined?"Max "+moneyText(row.max_price_cents,"USD"):""].filter(Boolean).join(" · ");
   return '<article class="list-item"><div class="list-item-main"><strong>'+escapeMarkup(row.name||"Saved search")+'</strong><span>'+escapeMarkup(summary||row.search_text||"All Marketplace listings")+'</span><small>'+(row.alerts_enabled?"In-app alerts on":"Alerts off")+'</small></div><div class="modal-actions"><button type="button" class="button button-ghost button-small" data-run-search="'+escapeMarkup(row.search_id)+'">Run</button><button type="button" class="button button-ghost button-small" data-toggle-search="'+escapeMarkup(row.search_id)+'">'+(row.alerts_enabled?"Turn alerts off":"Turn alerts on")+'</button><button type="button" class="button button-ghost button-small" data-delete-search="'+escapeMarkup(row.search_id)+'">Delete</button></div></article>';
  }).join(""):'<div class="empty-state"><strong>No saved searches.</strong><span>Use Save Search after setting Marketplace filters.</span></div>';
  body.onclick=async function(event){
   const run=event.target.closest("[data-run-search]"),toggle=event.target.closest("[data-toggle-search]"),remove=event.target.closest("[data-delete-search]");
   const id=run?.dataset.runSearch||toggle?.dataset.toggleSearch||remove?.dataset.deleteSearch;
   if(!id)return;
   const row=rows.find(function(item){return String(item.search_id)===String(id);}); if(!row)return;
   try{
    if(run){applySavedSearchToForm(form,row);host.innerHTML="";await runSearch();}
    if(toggle){await saveSearch(filtersFromSavedSearch(row),row.name,!row.alerts_enabled,row.search_id,gw);await load();}
    if(remove){await deleteSavedSearch(row.search_id,gw);await load();}
   }catch(error){notify(error?.message||"Saved search could not be updated.","error");}
  };
 }
 try{await load();}catch(error){body.innerHTML='<p class="muted">Saved searches could not be loaded.</p>';notify(error?.message||"Saved searches unavailable.","error");}
}


async function submitSellerReview(listingId,rating,feedback,customGateway){
 const gw=customGateway||gateway();
 const numeric=Number(rating);
 if(!Number.isInteger(numeric)||numeric<1||numeric>5)throw new Error("Seller rating must be a whole number from 1 to 5.");
 const result=await gw.rpc("marketplace_submit_review",{target_listing_id:String(listingId),review_rating:numeric,review_feedback:textValue(feedback,2500)});
 if(result.error)throw result.error;
 return result.data;
}
async function sellerFeedbackSummary(publicId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_seller_feedback_summary",{target_public_id:String(publicId)});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?(result.data[0]||{review_count:0,average_rating:null,verified_review_count:0}):result.data||{review_count:0,average_rating:null,verified_review_count:0};
}
async function sellerFeedback(publicId,limit,offset,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_seller_feedback",{target_public_id:String(publicId),result_limit:Math.min(50,Math.max(1,Number(limit||20))),result_offset:Math.max(0,Number(offset||0))});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?result.data:[];
}
async function disputeReview(reviewId,reason,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_dispute_review",{target_review_id:String(reviewId),dispute_reason:textValue(reason,2000)});
 if(result.error)throw result.error;
 return result.data;
}
function sellerFeedbackHtml(summary,reviews){
 const count=Number(summary?.review_count||0);
 const average=summary?.average_rating===null||summary?.average_rating===undefined?null:Number(summary.average_rating);
 return '<section class="hh-seller-feedback"><div class="panel-header"><div><h4>Seller feedback</h4><small>'+count+' verified transaction review'+(count===1?"":"s")+'</small></div>'+(average===null?'':'<strong aria-label="Average seller rating '+average.toFixed(2)+' out of 5">'+average.toFixed(1)+' / 5</strong>')+'</div>'+
  (reviews&&reviews.length?'<div class="list">'+reviews.map(function(review){return '<article class="list-item" data-review-id="'+escapeMarkup(review.review_id)+'"><div class="list-item-main"><strong>'+Number(review.rating)+' / 5 · '+escapeMarkup(review.reviewer_label||"Verified buyer")+'</strong><span>'+escapeMarkup(review.feedback||"No written feedback.")+'</span><small>'+(review.verified_transaction?"Verified Marketplace transaction · ":"")+escapeMarkup(new Date(review.created_at).toLocaleDateString())+'</small></div><button type="button" class="button button-ghost button-small" data-report-review="'+escapeMarkup(review.review_id)+'">Report</button></article>';}).join("")+'</div>':'<p class="muted">No verified seller feedback yet.</p>')+
  '</section>';
}


async function trustIndicators(publicId,customGateway){
 const gw=customGateway||gateway();
 const result=await gw.rpc("marketplace_trust_indicators",{target_public_id:String(publicId)});
 if(result.error)throw result.error;
 return Array.isArray(result.data)?(result.data[0]||null):result.data||null;
}
function trustIndicatorsHtml(data){
 if(!data)return '<p class="muted">Trust indicators are unavailable.</p>';
 const verification=String(data.verification_status||"none");
 const verificationLabel=verification==="verified"?"Identity verification: verified":verification==="pending"?"Identity verification: pending":"Identity verification: not verified";
 const sold=Number(data.sold_listing_count||0);
 const transfers=Number(data.accepted_transfer_count||0);
 const repeats=Number(data.repeat_transfer_recipient_count||0);
 const reviews=Number(data.verified_review_count||0);
 const average=data.average_rating===null||data.average_rating===undefined?null:Number(data.average_rating);
 return '<section class="hh-trust-indicators"><h4>Trust indicators</h4><div class="detail-grid">'+
  '<div><span>Marketplace member since</span><strong>'+escapeMarkup(new Date(data.marketplace_member_since).toLocaleDateString())+'</strong></div>'+
  '<div><span>Verification</span><strong>'+escapeMarkup(verificationLabel.replace("Identity verification: ",""))+'</strong></div>'+
  '<div><span>Sold Marketplace listings</span><strong>'+sold+'</strong></div>'+
  '<div><span>Accepted HerdHarbor transfers</span><strong>'+transfers+'</strong></div>'+
  '<div><span>Repeat transfer partners</span><strong>'+repeats+'</strong></div>'+
  '<div><span>Verified transaction reviews</span><strong>'+reviews+(average===null?"":" · "+average.toFixed(1)+" / 5")+'</strong></div>'+
  '</div><p class="task-repeat-note">These are separate activity indicators. HerdHarbor does not combine them into a trust score.</p></section>';
}

return Object.freeze({VERSION,TABLES,BUCKETS,PUBLIC_PROFILE_FIELDS,LISTING_STATES,LISTING_PUBLIC_FIELDS,PUBLIC_PEDIGREE_FIELDS,createGateway,gateway,browserClient,normalizePublicProfileDraft,saveSellerProfile,getPublicSellerProfile,publicProfilePreview,normalizeListingDraft,buildListingSnapshotFromHerd,listingInsertPayload,createListingFromHerd,createManualListing,deleteListing,listingCreationOptions,publicMediaUrl,searchArgs,searchListings,getListingDetails,saveListing,renderListingCard,renderMarketplace,openSellAnimalDialog,publicPedigreeDepth,buildPublicPedigreeSnapshot,setListingPublicPedigree,getPublicListingPedigree,publicSnapshotToGraph,renderPublicPedigree,openListingConversation,listConversations,listMessages,sendMessage,updateConversationMember,subscribeConversation,renderInbox,submitReport,blockPublicProfile,getModerationQueue,moderateReport,renderModerationQueue,myListings,updateListingState,confirmListing,refreshSellerNotifications,myNotifications,markNotificationRead,myFavorites,removeFavorite,imageFileToUpload,uploadListingPhotos,removeListingPhoto,stateActionsForListing,renderSellerListings,renderFavorites,renderMarketplaceNotifications,savedSearchPayloadFromFilters,saveSearch,listSavedSearches,deleteSavedSearch,filtersFromSavedSearch,applySavedSearchToForm,renderSavedSearches,submitSellerReview,sellerFeedbackSummary,sellerFeedback,disputeReview,sellerFeedbackHtml,trustIndicators,trustIndicatorsHtml});
});
